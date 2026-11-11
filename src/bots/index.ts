// バランス検証で使うボットの一覧（仕様書 9.1 節）。
import type { Bot } from './bot.ts';
import { createDemoBot } from './demo.ts';
import { SKILL_BOTS, createBlockOnlyBot, createEnemyOnlyBot, createSkillBot } from './skill.ts';

export const BOT_NAMES = ['demo', 'enemy_only', 'block_only', 'timid', 'casual', 'good', 'expert'] as const;
export type BotName = (typeof BOT_NAMES)[number];

export function createBot(name: BotName, seed: number): Bot {
  switch (name) {
    case 'demo':
      return createDemoBot(seed);
    case 'enemy_only':
      return createEnemyOnlyBot(seed);
    case 'block_only':
      return createBlockOnlyBot();
    default:
      return createSkillBot(seed, SKILL_BOTS[name]);
  }
}
