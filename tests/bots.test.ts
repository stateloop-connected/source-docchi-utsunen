import { describe, expect, it } from 'vitest';
import golden from '../reference/golden.json';
import { createDemoBot } from '../src/bots/demo.ts';
import { THRESHOLD_BOTS, createThresholdBot } from '../src/bots/threshold.ts';
import type { BlockKind } from '../src/core/balance.ts';
import { createGame, type GameState } from '../src/core/state.ts';
import { runBot } from '../src/sim/run.ts';

function withBlock(kind: BlockKind, hpRatio = 1, fillRatio = 0): GameState {
  const s = createGame(1);
  s.blocks.push({ id: 1, kind, hp: 100 * hpRatio, maxHp: 100, passAt: 8 });
  s.fill = s.capacity * fillRatio;
  return s;
}

describe('デモ AI の 7 つの規則', () => {
  const decide = (s: GameState) => {
    const bot = createDemoBot(7);
    return { lane: bot.act(s), rule: bot.rule };
  };

  it('1: ブロックがなければ、埋まり度 20% 未満で強化レーンを空撃ちする', () => {
    const s = createGame(1);
    expect(decide(s)).toEqual({ lane: 'block', rule: 1 });
    s.fill = 20;
    expect(decide(s)).toEqual({ lane: 'enemy', rule: 1 });
  });

  it('2: 最初のランクアップだけは、埋まっていても取りに行く', () => {
    expect(decide(withBlock('rank', 0.05, 0.9))).toEqual({ lane: 'block', rule: 2 });
  });

  it('3: 罠と帽子は必ず壊す', () => {
    expect(decide(withBlock('trap', 1, 0.9))).toEqual({ lane: 'block', rule: 3 });
    expect(decide(withBlock('hat', 0.05, 0.9))).toEqual({ lane: 'block', rule: 3 });
  });

  it('4: ボムは無視する', () => {
    expect(decide(withBlock('bomb', 1, 0.9))).toEqual({ lane: 'enemy', rule: 4 });
  });

  it('5: 残り 12% 未満になるとやめる（2 個目以降の強化すべて）', () => {
    for (const kind of ['rank', 'gold', 'buddy', 'vacation', 'expand'] as const) {
      const s = withBlock(kind, 0.11);
      s.player.rank = 1;
      expect(decide(s)).toEqual({ lane: 'enemy', rule: 5 });
    }
  });

  it('6: 埋まり度 75% 超で右往左往する', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const s = withBlock('gold', 1, 0.8);
      const bot = createDemoBot(seed);
      seen.add(bot.act(s));
      expect(bot.rule).toBe(6);
    }
    expect(seen).toEqual(new Set(['enemy', 'block']));
  });

  it('7: それ以外は埋まり度 45% を境に決める', () => {
    const s = withBlock('gold', 1, 0.3);
    expect(decide(s)).toEqual({ lane: 'block', rule: 7 });
    s.fill = 50;
    expect(decide(s)).toEqual({ lane: 'enemy', rule: 7 });
  });

  it('0.3 秒ごとにしか決め直さない', () => {
    const s = createGame(1);
    const bot = createDemoBot(7);
    expect(bot.act(s)).toBe('block');
    s.fill = 50;
    s.t = 0.2;
    expect(bot.act(s)).toBe('block');
    s.t = 0.3;
    expect(bot.act(s)).toBe('enemy');
  });
});

describe('しきい値ボット', () => {
  it('最初の希望は敵レーン。lo 未満で強化へ行き、hi を超えるまで戻らない', () => {
    const p = { ...THRESHOLD_BOTS.casual, lapse: 0, avoid: 1 };
    const bot = createThresholdBot(1, p);
    const s = withBlock('rank', 1, 0.4);
    expect(bot.act(s)).toBe('enemy');
    s.t = 1;
    s.fill = 20;
    expect(bot.act(s)).toBe('block');
    s.t = 2;
    s.fill = 55;
    expect(bot.act(s)).toBe('block');
    s.t = 3;
    s.fill = 65;
    expect(bot.act(s)).toBe('enemy');
  });

  it('check ありのボットは、壊し切れないブロックと、空いているときのボムを取りに行かない', () => {
    const p = { ...THRESHOLD_BOTS.expert };
    const far = withBlock('rank');
    far.blocks[0]!.hp = 40 * 10;
    expect(createThresholdBot(1, p).act(far)).toBe('enemy');
    const near = withBlock('rank');
    near.blocks[0]!.hp = 40 * 3;
    expect(createThresholdBot(1, p).act(near)).toBe('block');
    expect(createThresholdBot(1, p).act(withBlock('bomb', 0.1, 0.2))).toBe('enemy');
    expect(createThresholdBot(1, p).act(withBlock('bomb', 0.1, 0.3))).toBe('block');
  });
});

describe('参照シミュレータとの一致', () => {
  // 浮動小数点の違いで個々の試行はずれうるので、完全一致までは求めない（仕様書 11.4 節）
  it('demo は種 0〜9 で 55〜100 秒、ランク 1 で負ける', () => {
    const ref = golden.sim_reference.demo.first10_seeds;
    for (let seed = 0; seed < 10; seed++) {
      const r = runBot('demo', seed);
      expect(r.rank).toBe(1);
      expect(r.t).toBeGreaterThan(55);
      expect(r.t).toBeLessThan(100);
      expect(Math.abs(r.t - ref[seed]!)).toBeLessThan(20);
    }
  });

  it('enemy_only は種 0〜9 で参照と同じ時刻に負ける', () => {
    const ref = golden.sim_reference.enemy_only.first10_seeds;
    for (let seed = 0; seed < 10; seed++) expect(runBot('enemy_only', seed).t).toBeCloseTo(ref[seed]!, 1);
  });
});
