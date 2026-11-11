// 自動プレイヤーの共通部分（仕様書 5.1 節・9.1 節）。
// 「どちら側へ行くか・どのブロックを狙うか」は interval 秒ごとに、「どの敵を狙うか」は aimInterval 秒ごとに決め直す。
import { AIM, type BlockKind } from '../core/balance.ts';
import { dpsOf } from '../core/formulas.ts';
import { BOT_SALT, nextRandom, seedRng } from '../core/rng.ts';
import { weakPointOf, type Block, type Enemy, type GameState } from '../core/state.ts';

export interface Bot {
  /** 今の刻みで立ちたい横位置を返す。毎刻み 1 回だけ呼ぶ */
  act(s: GameState): number;
}

/** 決め直しの時刻の比較に使う許容誤差（参照シミュレータと同じ値） */
export const TIME_EPSILON = 1e-9;

/** 道の真ん中。狙う敵がいないときの立ち位置 */
export const ENEMY_HOME = 0;

export function botRandom(seed: number): () => number {
  const rng = seedRng((seed >>> 0) + BOT_SALT);
  return () => nextRandom(rng);
}

/** そのブロックを壊し切るのに必要な秒数（今いる位置からの移動を含む） */
export function timeToBreak(s: GameState, b: Block): number {
  return b.hp / dpsOf(s.player.rank) + Math.abs(b.u - s.player.x) / AIM.moveSpeed;
}

/** 列 u に立ったとき、敵 e より手前に、同じ列をふさぐ敵がいるか */
function shielded(s: GameState, index: number): boolean {
  const e = s.enemies[index]!;
  for (let j = 0; j < index; j++) {
    const f = s.enemies[j]!;
    if (Math.abs(f.u - e.u) <= f.halfWidth + AIM.beamHalf) return true;
  }
  return false;
}

/** 狙いを決めるときに見る、列の先頭からの数 */
const LOOKAHEAD = 16;

/** いちばん古い敵の弱点を狙う（単純な狙い方） */
export function aimOldest(s: GameState): number {
  return s.enemies.length > 0 ? weakPointOf(s.enemies[0]!, s.t) : ENEMY_HOME;
}

/**
 * 時間あたりに減らせるサイズが最も大きい敵を狙う（うまい狙い方）。
 * 手前の敵にふさがれている敵は選ばない。移動にかかる時間も勘定に入れる。
 */
export function aimBest(s: GameState): number {
  const dps = dpsOf(s.player.rank);
  let best: Enemy | undefined;
  let bestValue = -1;
  const n = Math.min(LOOKAHEAD, s.enemies.length);
  for (let i = 0; i < n; i++) {
    if (shielded(s, i)) continue;
    const e = s.enemies[i]!;
    const value = e.size / (e.hp / dps + Math.abs(e.u - s.player.x) / AIM.moveSpeed + 0.05);
    if (value > bestValue) {
      bestValue = value;
      best = e;
    }
  }
  return best ? weakPointOf(best, s.t) : ENEMY_HOME;
}

/** 壊したいブロックの優先順（左ほど優先） */
export const BLOCK_PRIORITY: readonly BlockKind[] = ['rank', 'gold', 'buddy', 'expand', 'vacation', 'bomb', 'trap', 'hat'];

