// ゲーム状態の型（仕様書 2.8 節）と、step が返す出来事（8.3 節）。
import { AIM, B, BLOCK_KINDS, type BlockKind, type EnemyKind, type Lane } from './balance.ts';
import { createDeck, type DeckState } from './deck.ts';
import { POSITION_SALT, SPAWN_SALT, seedRng, type RngState } from './rng.ts';

export interface Enemy {
  /** 出現順の通し番号。描画側が見た目の状態をひも付けるのに使う */
  id: number;
  kind: EnemyKind | 'boss';
  hp: number;
  /** 出現時の HP */
  hp0: number;
  size: number;
  /** 出現時刻 */
  born: number;
  /** ボスだけ: 何体目のボスか（1 始まり）。ほかは 0 */
  bossIndex: number;
  /** 横位置と、当たり判定の半分の幅 */
  u: number;
  halfWidth: number;
}

export interface Block {
  id: number;
  kind: BlockKind;
  hp: number;
  maxHp: number;
  /** 通過時刻 */
  passAt: number;
  /** 何番目の段か、どちらの列か（0 が左、1 が右）、横位置 */
  row: number;
  col: number;
  u: number;
}

export interface Player {
  /** 横位置。弾はこの列をまっすぐ飛ぶ */
  x: number;
  rank: number;
  buddies: number;
  hats: number;
}

export interface GameState {
  seed: number;
  tick: number;
  t: number;
  over: boolean;
  player: Player;
  /** 敵の列。先頭が最も古く、最も手前にいる */
  enemies: Enemy[];
  /** 成長中のリボ払い（enemies の要素と同じオブジェクト） */
  growing: Enemy[];
  /** ブロックの列。通過時刻の早い順 */
  blocks: Block[];
  fill: number;
  capacity: number;
  expands: number;
  /** 出現予算 */
  budget: number;
  nextRowAt: number;
  rowsSpawned: number;
  /** 2 個のうち片方だけ壊した段の番号（もう片方も壊せば「両取り」） */
  halfRows: number[];
  vacationUntil: number;
  /** ボスを出し終えた WAVE 番号 */
  bossWave: number;
  /** 警告を出し終えた WAVE 番号 */
  warnedWave: number;
  bossesSpawned: number;
  bossesKilled: number;
  deck: DeckState;
  spawnRng: RngState;
  positionRng: RngState;
  score: number;
  got: Record<BlockKind, number>;
  missed: Record<BlockKind, number>;
  /** 両取りした段の数 */
  doubles: number;
  nextId: number;
}

export type GameEvent =
  | { type: 'enemySpawn'; kind: EnemyKind; count: number }
  | { type: 'enemyKill'; kind: EnemyKind | 'boss'; size: number; byBomb: boolean; id: number }
  | { type: 'blockSpawn'; kind: BlockKind; hp: number }
  | { type: 'blockBreak'; kind: BlockKind; id: number; double: boolean }
  | { type: 'blockPass'; kind: BlockKind; damaged: boolean; /** 残り HP の割合（0〜1） */ left: number; id: number }
  | { type: 'rankUp'; rank: number; stageChanged: boolean }
  | { type: 'bossSpawn'; index: number }
  | { type: 'bossKill'; index: number }
  | { type: 'rushWarning'; wave: number }
  | { type: 'bossWarning'; wave: number; index: number }
  | { type: 'gameOver' };

/** 横位置がどの帯か */
export function sideOf(x: number): Lane {
  return Math.abs(x) < AIM.border ? 'enemy' : 'block';
}

function zeroCounts(): Record<BlockKind, number> {
  const c = {} as Record<BlockKind, number>;
  for (const k of BLOCK_KINDS) c[k] = 0;
  return c;
}

/** 種は 32 ビット符号なし整数に丸める。開始位置は道の中央 */
export function createGame(seed: number): GameState {
  const s = seed >>> 0;
  return {
    seed: s,
    tick: 0,
    t: 0,
    over: false,
    player: { x: 0, rank: 0, buddies: 0, hats: 0 },
    enemies: [],
    growing: [],
    blocks: [],
    fill: 0,
    capacity: B.capacity,
    expands: 0,
    budget: 0,
    nextRowAt: B.blockFirst,
    rowsSpawned: 0,
    halfRows: [],
    vacationUntil: -1,
    bossWave: 0,
    warnedWave: 0,
    bossesSpawned: 0,
    bossesKilled: 0,
    deck: createDeck(s),
    spawnRng: seedRng(s + SPAWN_SALT),
    positionRng: seedRng(s + POSITION_SALT),
    score: 0,
    got: zeroCounts(),
    missed: zeroCounts(),
    doubles: 0,
    nextId: 1,
  };
}
