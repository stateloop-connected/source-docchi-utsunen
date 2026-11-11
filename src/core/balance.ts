// 仕様書 3 章・4 章の全数値と表。ロジックに数値を直書きせず、ここを参照する。
// 変えるときは reference/balance_sim.py の同じ値も変えて、npm run sim の結果を添えて依頼者に提案する。

/** 道のどの帯か。中央が敵の帯、左右の端が強化の帯 */
export type Lane = 'enemy' | 'block';
export type EnemyKind = 'notice' | 'spam' | 'deadline' | 'revolving';
export type BlockKind = 'rank' | 'gold' | 'buddy' | 'bomb' | 'vacation' | 'expand' | 'trap' | 'hat';

/** 1 秒あたりの刻み数 */
export const TPS = 60;
/** 刻み幅（秒） */
export const DT = 1 / TPS;

/** 3.4 節の確定パラメータ */
export const B = {
  d0: 40,
  g: 1.2,
  /** 基準のランク供給（ランク/秒）。ランクアップ 4 個/30 秒 + 金（+2）1 個/150 秒 */
  rRef: 0.44 / 3,
  phi0: 0.3,
  kappa: 0.0045,
  sizeBase: 3,
  sizeSlope: 0.02,
  sizeMax: 8,
  capacity: 100,
  waveLength: 20,
  rushLength: 5,
  rushMult: 2,
  /** ウェーブ内でこの秒数に達したら警告を出す（ラッシュの 2 秒前） */
  warnAt: 13,
  bossEvery: 5,
  bossCoef: 7,
  bossSize: 20,
  blockFirst: 3,
  blockInterval: 5,
  blockTravel: 10,
  goldRanks: 2,
  buddyDps: 0.1,
  buddyMax: 3,
  bombSize: 35,
  bombBossRatio: 0.15,
  vacation: 6,
  expand: 10,
  expandMax: 3,
  trapCount: 8,
  revolvingRate: 0.1,
  revolvingTime: 20,
  /** 埋まり度とボムの比較に使う許容誤差。増減で保つ合計の丸め誤差を吸収する（参照シミュレータと同じ値） */
  epsilon: 1e-9,
} as const;

/**
 * 位置取りの決まり（仕様書 2.1 節・2.2 節）。横位置 u は −1（道の左端）〜+1（右端）。
 * プレイヤーは左右に動き、正面の列だけを撃つ。
 */
export const AIM = {
  /** プレイヤーが動ける範囲と速さ（u/秒） */
  minX: -0.9,
  maxX: 0.9,
  moveSpeed: 3,
  /** 弾の列の半分の幅。標的の半分の幅にこれを足した範囲に入っていれば当たる */
  beamHalf: 0.06,
  /** 会心: 弾の列と敵の弱点との差がこれ以下なら、与えるダメージが critMult 倍になる。ふつうの敵の弱点は真ん中 */
  critHalf: 0.05,
  critMult: 2,
  /** ボスの弱点は、真ん中から左右に bossWeakSwing の幅で、bossWeakPeriod 秒かけて往復する */
  bossWeakSwing: 0.3,
  bossWeakPeriod: 4,
  /** 敵が並ぶ範囲（道の中央） */
  enemyMin: -0.5,
  enemyMax: 0.5,
  /** 迷惑メールなど、まとめて出る敵が中心から散らばる幅 */
  groupSpread: 0.3,
  /** 横位置の絶対値がこれ未満なら敵の帯、以上なら強化の帯を撃つ */
  border: 0.55,
  /** ボスの横位置と半分の幅（敵の帯を覆い、後ろの敵の盾になる） */
  bossU: 0,
  bossHalf: 0.5,
  /** 強化ブロックの列（左端、右端）と、ブロックの半分の幅 */
  blockCols: [-0.76, 0.76],
  blockHalf: 0.156,
} as const;

/** 凪の出現倍率。ウェーブ平均がちょうど 1 倍になるように決まる（= 2/3） */
export const CALM_MULT = (B.waveLength - B.rushLength * B.rushMult) / (B.waveLength - B.rushLength);
/** ラッシュが始まるウェーブ内の秒数 */
export const RUSH_START = B.waveLength - B.rushLength;

export interface EnemyDef {
  readonly id: EnemyKind;
  readonly name: string;
  /** 初めて出たときに、名前に添えるひとこと（どんな敵か） */
  readonly intro: string;
  /** 倒したときに、ときどき出すひとこと */
  readonly defeat: string;
  readonly hpMult: number;
  readonly size: number;
  readonly count: number;
  readonly unlockWave: number;
  readonly weight: number;
  /** 当たり判定の半分の幅（u） */
  readonly halfWidth: number;
}

/** 4.1 節。並び順は種類選びで使うので変えない（解禁 WAVE の昇順でもある） */
export const ENEMIES: readonly EnemyDef[] = [
  { id: 'notice', name: '未読通知', intro: '放っておくと、どんどん溜まる', defeat: '既読', hpMult: 2.5, size: 2.5, count: 1, unlockWave: 1, weight: 10, halfWidth: 0.13 },
  { id: 'spam', name: '迷惑メール', intro: '8 通まとめて届く。まとめて倒そう', defeat: 'ゴミ箱へ', hpMult: 0.35, size: 0.5, count: 8, unlockWave: 3, weight: 2.5, halfWidth: 0.075 },
  { id: 'deadline', name: '締切', intro: '硬いうえに、後ろの敵の盾になる', defeat: '提出！', hpMult: 10, size: 6, count: 1, unlockWave: 6, weight: 1.5, halfWidth: 0.21 },
  { id: 'revolving', name: 'リボ払い', intro: '放っておくと、利息で育つ', defeat: '完済！', hpMult: 3, size: 3, count: 1, unlockWave: 9, weight: 1.5, halfWidth: 0.145 },
];

/** 罠で湧く敵（未読通知） */
export const TRAP_ENEMY: EnemyDef = ENEMIES[0]!;

/** ボスの名前。出現順に使い、一巡したら頭に BOSS_PREFIX を付けて繰り返す */
export const BOSS_NAMES: readonly string[] = ['月曜日', '確定申告', 'スキップできない広告', '親戚の集まり'];
export const BOSS_PREFIX = '真・';
/** ボスが出たときと、倒したときのひとこと。BOSS_NAMES と同じ並び */
export const BOSS_LINES: readonly { readonly intro: string; readonly defeat: string }[] = [
  { intro: 'もう来たの…？', defeat: '…でも明日は火曜日' },
  { intro: '領収書、どこ…？', defeat: '還付金は来月' },
  { intro: 'あと 5 秒…', defeat: 'スキップ成功' },
  { intro: '「最近、仕事はどうなの？」', defeat: '「また正月にね」' },
];
/** ラッシュの警告に添えるひとこと。ウェーブごとに順に使う */
export const RUSH_LINES: readonly string[] = ['定時前の駆け込み', '「至急」と書いてある', '全員に返信', '月末の追い込み', '会議のあとの会議', '金曜 17 時の依頼'];
/** 有給休暇の効果が切れたときのひとこと */
export const VACATION_OVER = '休暇明け…';

export interface BlockDef {
  readonly name: string;
  /** 硬さ（自分秒） */
  readonly cost: number;
}

/** 4.2 節 */
export const BLOCKS: Readonly<Record<BlockKind, BlockDef>> = {
  rank: { name: 'ランクアップ', cost: 3.5 },
  gold: { name: 'エナドリ', cost: 7.0 },
  buddy: { name: '相棒', cost: 4.0 },
  bomb: { name: '一斉削除', cost: 1.5 },
  vacation: { name: '有給休暇', cost: 2.0 },
  expand: { name: '増築', cost: 2.5 },
  trap: { name: '激安！', cost: 0.7 },
  hat: { name: '帽子', cost: 1.5 },
};

export const BLOCK_KINDS = Object.keys(BLOCKS) as BlockKind[];

/**
 * 4.3 節。ブロックは 2 個 1 組の「段」で流れてくる。
 * 袋 1 つ = 6 段。そのうち RANK_ROWS 段は「ランクアップ + 山から 1 枚」、残りは「山から 2 枚」。
 */
export const ROWS_PER_BAG = 6;
export const RANK_ROWS = 4;
/** 山の中身（このあとにサポート枠を SUPPORT_PER_PILE 枚足す）。1 山で袋 5 つ分 = 150 秒 */
export const PILE_BASE: readonly (readonly [BlockKind, number])[] = [
  ['gold', 1],
  ['bomb', 7],
  ['vacation', 5],
  ['trap', 11],
  ['hat', 10],
];
export const SUPPORT_PER_PILE = 6;

/** 4.4 節。ランクを WEAPON_STEP で割った商が武器の段階 */
export const WEAPON_STEP = 4;
export const WEAPONS: readonly string[] = [
  '水鉄砲',
  '輪ゴム鉄砲',
  '節分の豆',
  'エアガン',
  'ピストル',
  'ショットガン',
  'マシンガン',
  'ガトリング砲',
  'バズーカ',
  'レーザー',
  '波動砲',
  '回転寿司レーン砲',
  '課金砲',
  '既読スルー光線',
  '定時退社ビーム',
  'ねこ',
];

/** 4.4 節。弾は見た目だけ。発射数 = 秒間 base + ランク × perRank、上限 max */
export const FIRE_RATE = { base: 8, perRank: 0.2, max: 20 } as const;

/** 2.6 節のスコアと推定 IQ */
export const SCORE = {
  enemyPerSize: 10,
  block: 100,
  boss: 5000,
  iqBase: 60,
  iqPerScore: 2500,
  iqMax: 200,
} as const;
