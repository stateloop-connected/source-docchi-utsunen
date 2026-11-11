// 自動プレイヤーの共通部分。一定間隔ごとに希望レーンを決め直す（仕様書 5.1 節・9.1 節）。
import type { Lane } from '../core/balance.ts';
import { BOT_SALT, nextRandom, seedRng } from '../core/rng.ts';
import type { GameState } from '../core/state.ts';

export interface Bot {
  /** 今の刻みの希望レーンを返す。毎刻み 1 回だけ呼ぶ */
  act(s: GameState): Lane;
}

/** 決め直しの時刻の比較に使う許容誤差（参照シミュレータと同じ値） */
const TIME_EPSILON = 1e-9;

/**
 * decide は「前回の希望」と乱数を受け取り、新しい希望を返す。
 * lapse の確率で、何も考えず前回の希望を維持する。最初の希望は敵レーン。
 */
export function makeBot(
  seed: number,
  interval: number,
  lapse: number,
  decide: (s: GameState, prevWant: Lane, rnd: () => number) => Lane,
): Bot {
  const rng = seedRng((seed >>> 0) + BOT_SALT);
  const rnd = () => nextRandom(rng);
  let next = 0;
  let want: Lane = 'enemy';
  return {
    act(s) {
      if (s.t >= next - TIME_EPSILON) {
        next += interval;
        if (rnd() >= lapse) want = decide(s, want, rnd);
      }
      return want;
    },
  };
}
