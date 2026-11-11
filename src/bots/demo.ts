// デモプレイ AI（仕様書 5.1 節）。わざと下手に遊ぶ。上から順に判定し、最初に当てはまった規則に従う。
import type { Lane } from '../core/balance.ts';
import type { GameState } from '../core/state.ts';
import { makeBot, type Bot } from './bot.ts';

export const DEMO = {
  interval: 0.3,
  /** 規則 1: ブロックがないとき、埋まり度の割合がこれ未満なら強化レーンで空撃ちする */
  idleFill: 0.2,
  /** 規則 5: 先頭ブロックの残り HP がこの割合を切ったら離れる */
  quitRatio: 0.12,
  /** 規則 6: 埋まり度の割合がこれを超えたら右往左往する */
  panicFill: 0.75,
  panicBlockChance: 0.5,
  /** 規則 7 */
  normalFill: 0.45,
} as const;

export interface DemoBot extends Bot {
  /** 直近の判断で当てはまった規則の番号（1〜7）。字幕を出すのに使う */
  readonly rule: number;
}

export function createDemoBot(seed: number): DemoBot {
  let rule = 0;
  const pick = (n: number, lane: Lane): Lane => {
    rule = n;
    return lane;
  };
  const bot = makeBot(seed, DEMO.interval, 0, (s: GameState, _prev, rnd): Lane => {
    const f = s.fill / s.capacity;
    const b = s.blocks[0];
    if (!b) return pick(1, f < DEMO.idleFill ? 'block' : 'enemy');
    if (s.player.rank === 0 && b.kind === 'rank' && s.missed.rank === 0) return pick(2, 'block');
    if (b.kind === 'trap' || b.kind === 'hat') return pick(3, 'block');
    if (b.kind === 'bomb') return pick(4, 'enemy');
    if (b.hp / b.maxHp < DEMO.quitRatio) return pick(5, 'enemy');
    if (f > DEMO.panicFill) return pick(6, rnd() < DEMO.panicBlockChance ? 'block' : 'enemy');
    return pick(7, f < DEMO.normalFill ? 'block' : 'enemy');
  });
  return {
    act: bot.act,
    get rule() {
      return rule;
    },
  };
}
