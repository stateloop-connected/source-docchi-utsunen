// 仕様書 3 章・4 章の全数値と表。ロジックに数値を直書きせず、ここを参照する。
// 変えるときは reference/balance_sim.py の同じ値も変えて、npm run sim の結果を添えて依頼者に提案する。

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
  kappa: 0.0034,
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
  switchTime: 0.15,
  goldRanks: 2,
  buddyDps: 0.1,
  buddyMax: 3,
  bombSize: 35,
  bombBossRatio: 0.15,
  vacation: 6,
  expand: 10,
  expandMax: 3,
  trapCount: 20,
  revolvingRate: 0.1,
  revolvingTime: 20,
  /** 埋まり度とボムの比較に使う許容誤差。増減で保つ合計の丸め誤差を吸収する（参照シミュレータと同じ値） */
  epsilon: 1e-9,
} as const;

/** 凪の出現倍率。ウェーブ平均がちょうど 1 倍になるように決まる（= 2/3） */
export const CALM_MULT = (B.waveLength - B.rushLength * B.rushMult) / (B.waveLength - B.rushLength);
/** ラッシュが始まるウェーブ内の秒数 */
export const RUSH_START = B.waveLength - B.rushLength;

export interface EnemyDef {
  readonly id: EnemyKind;
  readonly name: string;
  readonly hpMult: number;
  readonly size: number;
  readonly count: number;
  readonly unlockWave: number;
  readonly weight: number;
}

/** 4.1 節。並び順は種類選びで使うので変えない（解禁 WAVE の昇順でもある） */
export const ENEMIES: readonly EnemyDef[] = [
  { id: 'notice', name: '未読通知', hpMult: 1.0, size: 1.0, count: 1, unlockWave: 1, weight: 10 },
  { id: 'spam', name: '迷惑メール', hpMult: 0.35, size: 0.5, count: 8, unlockWave: 3, weight: 2 },
  { id: 'deadline', name: '締切', hpMult: 5.0, size: 3.0, count: 1, unlockWave: 6, weight: 1.5 },
  { id: 'revolving', name: 'リボ払い', hpMult: 1.5, size: 1.5, count: 1, unlockWave: 9, weight: 1.5 },
];

/** 罠で湧く敵（未読通知） */
export const TRAP_ENEMY: EnemyDef = ENEMIES[0]!;

/** ボスの名前。出現順に使い、一巡したら頭に BOSS_PREFIX を付けて繰り返す */
export const BOSS_NAMES: readonly string[] = ['月曜日', '確定申告', 'スキップできない広告', '親戚の集まり'];
export const BOSS_PREFIX = '真・';

export interface BlockDef {
  readonly name: string;
  /** 硬さ（自分秒） */
  readonly cost: number;
}

/** 4.2 節 */
export const BLOCKS: Readonly<Record<BlockKind, BlockDef>> = {
  rank: { name: 'ランクアップ', cost: 3.5 },
  gold: { name: '金のランクアップ', cost: 7.0 },
  buddy: { name: '相棒', cost: 4.0 },
  bomb: { name: '一斉削除', cost: 1.5 },
  vacation: { name: '有給休暇', cost: 2.0 },
  expand: { name: '増築', cost: 2.5 },
  trap: { name: '激安！', cost: 0.7 },
  hat: { name: '帽子', cost: 1.5 },
};

export const BLOCK_KINDS = Object.keys(BLOCKS) as BlockKind[];

/** 4.3 節。袋 1 つに入るランクアップの数 */
export const BAG_RANKS = 4;
/** 4.3 節。山の中身（このあとにサポート枠を SUPPORT_PER_PILE 枚足す） */
export const PILE_BASE: readonly BlockKind[] = ['gold', 'bomb', 'bomb', 'bomb', 'trap', 'trap', 'hat', 'vacation'];
export const SUPPORT_PER_PILE = 2;
/** 山から袋へ移す枚数 */
export const PILE_PER_BAG = 2;

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
