// ゲーム状態の型（仕様書 2.8 節）と、step が返す出来事（8.3 節）。
import { B, BLOCK_KINDS, type BlockKind, type EnemyKind, type Lane } from './balance.ts';
import { createDeck, type DeckState } from './deck.ts';
import { SPAWN_SALT, seedRng, type RngState } from './rng.ts';

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
}

export interface Block {
  id: number;
  kind: BlockKind;
  hp: number;
  maxHp: number;
  /** 通過時刻 */
  passAt: number;
}

export interface Player {
  lane: Lane;
  /** 切り替え残り時間 */
  switchLeft: number;
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
  /** 敵の列。enemies[head] が先頭（最も古い）。head より前は倒した敵の抜け殻 */
  enemies: Enemy[];
  head: number;
  /** 成長中のリボ払い（enemies の要素と同じオブジェクト） */
  growing: Enemy[];
  /** ブロックの列。先頭が最も手前 */
  blocks: Block[];
  fill: number;
  capacity: number;
  expands: number;
  /** 出現予算 */
  budget: number;
  nextBlockAt: number;
  vacationUntil: number;
  /** ボスを出し終えた WAVE 番号 */
  bossWave: number;
  /** 警告を出し終えた WAVE 番号 */
  warnedWave: number;
  bossesSpawned: number;
  bossesKilled: number;
  deck: DeckState;
  spawnRng: RngState;
  score: number;
  got: Record<BlockKind, number>;
  missed: Record<BlockKind, number>;
  nextId: number;
}

export type GameEvent =
  | { type: 'enemySpawn'; kind: EnemyKind; count: number }
  | { type: 'enemyKill'; kind: EnemyKind | 'boss'; size: number; byBomb: boolean; id: number }
  | { type: 'blockSpawn'; kind: BlockKind; hp: number }
  | { type: 'blockBreak'; kind: BlockKind; id: number }
  | { type: 'blockPass'; kind: BlockKind; damaged: boolean; id: number }
  | { type: 'rankUp'; rank: number; stageChanged: boolean }
  | { type: 'bossSpawn'; index: number }
  | { type: 'bossKill'; index: number }
  | { type: 'rushWarning'; wave: number }
  | { type: 'bossWarning'; wave: number; index: number }
  | { type: 'gameOver' };

function zeroCounts(): Record<BlockKind, number> {
  const c = {} as Record<BlockKind, number>;
  for (const k of BLOCK_KINDS) c[k] = 0;
  return c;
}

/** 種は 32 ビット符号なし整数に丸める */
export function createGame(seed: number): GameState {
  const s = seed >>> 0;
  return {
    seed: s,
    tick: 0,
    t: 0,
    over: false,
    player: { lane: 'enemy', switchLeft: 0, rank: 0, buddies: 0, hats: 0 },
    enemies: [],
    head: 0,
    growing: [],
    blocks: [],
    fill: 0,
    capacity: B.capacity,
    expands: 0,
    budget: 0,
    nextBlockAt: B.blockFirst,
    vacationUntil: -1,
    bossWave: 0,
    warnedWave: 0,
    bossesSpawned: 0,
    bossesKilled: 0,
    deck: createDeck(s),
    spawnRng: seedRng(s + SPAWN_SALT),
    score: 0,
    got: zeroCounts(),
    missed: zeroCounts(),
    nextId: 1,
  };
}
