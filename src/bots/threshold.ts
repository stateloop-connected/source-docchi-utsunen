// しきい値ボット（仕様書 9.1 節）。人の腕前を 5 つの数字で表した自動プレイヤー。
import { B, type Lane } from '../core/balance.ts';
import { dpsOf, sizeRate } from '../core/formulas.ts';
import type { GameState } from '../core/state.ts';
import { makeBot, type Bot } from './bot.ts';

export interface ThresholdParams {
  /** 敵レーンにいるとき、埋まり度の割合がこれ未満なら強化レーンへ行く */
  readonly lo: number;
  /** 強化レーンにいるとき、埋まり度の割合がこれを超えたら敵レーンへ戻る */
  readonly hi: number;
  /** 決め直す間隔（秒） */
  readonly interval: number;
  /** 罠と帽子を避ける確率 */
  readonly avoid: number;
  /** 何も考えず前回の希望を維持する確率 */
  readonly lapse: number;
  /** 壊し切れるか・溢れないかを先読みする */
  readonly check: boolean;
}

export const THRESHOLD_BOTS = {
  timid: { lo: 0.1, hi: 0.35, interval: 0.8, avoid: 0.5, lapse: 0.15, check: false },
  casual: { lo: 0.3, hi: 0.6, interval: 0.6, avoid: 0.8, lapse: 0.08, check: false },
  good: { lo: 0.5, hi: 0.75, interval: 0.35, avoid: 1.0, lapse: 0.03, check: true },
  expert: { lo: 0.8, hi: 0.95, interval: 0.15, avoid: 1.0, lapse: 0, check: true },
} as const satisfies Record<string, ThresholdParams>;

/** check が有効なボットの先読みで使う値 */
const CHECK = {
  /** ボムは埋まり度（サイズ）がこれ未満なら取らない */
  bombMinFill: 25,
  /** 通過までの残り秒数から引く余裕 */
  passMargin: 0.1,
  /** 壊している間に溜まる敵を見込んで、容量のこの割合を超えるなら取らない */
  maxFillRatio: 0.92,
} as const;

function wanted(s: GameState, p: ThresholdParams, rnd: () => number): boolean {
  const b = s.blocks[0];
  if (!b) return false;
  if ((b.kind === 'trap' || b.kind === 'hat') && rnd() < p.avoid) return false;
  if (p.check) {
    if (b.kind === 'bomb' && s.fill < CHECK.bombMinFill) return false;
    const need = b.hp / dpsOf(s.player.rank) + (s.player.lane === 'enemy' ? B.switchTime : 0);
    if (need > b.passAt - s.t - CHECK.passMargin) return false;
    if (s.fill + sizeRate(s.t) * need > CHECK.maxFillRatio * s.capacity) return false;
  }
  return true;
}

export function createThresholdBot(seed: number, p: ThresholdParams): Bot {
  return makeBot(seed, p.interval, p.lapse, (s, prevWant, rnd): Lane => {
    const f = s.fill / s.capacity;
    if (!wanted(s, p, rnd)) return 'enemy';
    if (prevWant === 'block') return f > p.hi ? 'enemy' : 'block';
    return f < p.lo ? 'block' : 'enemy';
  });
}

/** 常に同じレーンにいるボット（enemy_only / block_only） */
export function createFixedBot(seed: number, lane: Lane): Bot {
  return makeBot(seed, 0.5, 0, () => lane);
}
