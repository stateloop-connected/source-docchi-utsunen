// バランス検証で使うボットの一覧（仕様書 9.1 節）。
import type { Bot } from './bot.ts';
import { createDemoBot } from './demo.ts';
import { THRESHOLD_BOTS, createFixedBot, createThresholdBot } from './threshold.ts';

export const BOT_NAMES = ['demo', 'enemy_only', 'block_only', 'timid', 'casual', 'good', 'expert'] as const;
export type BotName = (typeof BOT_NAMES)[number];

export function createBot(name: BotName, seed: number): Bot {
  switch (name) {
    case 'demo':
      return createDemoBot(seed);
    case 'enemy_only':
      return createFixedBot(seed, 'enemy');
    case 'block_only':
      return createFixedBot(seed, 'block');
    default:
      return createThresholdBot(seed, THRESHOLD_BOTS[name]);
  }
}
