// 画面なしでゲームを 1 回遊ばせる。バランス検証と単体テストで使う。
import { createBot, type BotName } from '../bots/index.ts';
import { waveOf } from '../core/formulas.ts';
import { createGame, type GameState } from '../core/state.ts';
import { step } from '../core/step.ts';

/** 1 回の上限（秒）。仕様書 9.2 節 */
export const MAX_SECONDS = 1500;

export interface RunResult {
  t: number;
  rank: number;
  wave: number;
  score: number;
  state: GameState;
}

export function runBot(name: BotName, seed: number, maxSeconds = MAX_SECONDS): RunResult {
  const s = createGame(seed);
  const bot = createBot(name, seed);
  while (!s.over && s.t < maxSeconds) step(s, bot.act(s));
  return { t: s.t, rank: s.player.rank, wave: waveOf(s.t), score: s.score, state: s };
}
