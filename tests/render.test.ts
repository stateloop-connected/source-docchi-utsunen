import { describe, expect, it } from 'vitest';
import { formatComma, formatHp, formatNumber } from '../src/render/format.ts';
import { dpsOf } from '../src/core/formulas.ts';
import { createGame } from '../src/core/state.ts';
import { FRONT_Y, HORIZON_Y, kOf, xOf, yOf } from '../src/render/projection.ts';
import { canBreakInTime } from '../src/render/scene.ts';

describe('数字の表示', () => {
  it('1,000 未満は整数', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(5.9)).toBe('5');
    expect(formatNumber(999.9)).toBe('999');
  });

  it('1,000 以上は K・M・B・T を付けて有効数字 3 桁', () => {
    expect(formatNumber(1000)).toBe('1.00K');
    expect(formatNumber(24504)).toBe('24.5K');
    expect(formatNumber(151365)).toBe('151K');
    expect(formatNumber(3017343)).toBe('3.01M');
    expect(formatNumber(3.02e6)).toBe('3.02M');
    expect(formatNumber(2.5e9)).toBe('2.50B');
    expect(formatNumber(7.25e12)).toBe('7.25T');
  });

  it('桁が繰り上がる手前でも 4 桁にならない', () => {
    expect(formatNumber(999999)).toBe('999K');
    expect(formatNumber(9999)).toBe('9.99K');
  });

  it('残り HP は切り上げる（生きているのに 0 と出さない）', () => {
    expect(formatHp(0.2)).toBe('1');
    expect(formatHp(139.1)).toBe('140');
  });

  it('スコアは 3 桁区切りで、小数点以下を切り捨てる', () => {
    expect(formatComma(0)).toBe('0');
    expect(formatComma(999)).toBe('999');
    expect(formatComma(151365.9)).toBe('151,365');
    expect(formatComma(12438565)).toBe('12,438,565');
  });
});

describe('遠近法', () => {
  it('手前で 1 倍、地平線で 1/4 倍', () => {
    expect(kOf(0)).toBe(1);
    expect(kOf(1)).toBe(0.25);
  });

  it('道は手前（y = 860）で幅 480、奥（y = 250）で幅 120 の台形になる', () => {
    expect(yOf(0)).toBe(FRONT_Y);
    expect(yOf(1)).toBe(HORIZON_Y);
    expect(xOf(1, 0) - xOf(-1, 0)).toBe(480);
    expect(xOf(1, 1) - xOf(-1, 1)).toBe(120);
  });

  it('奥へ行くほど画面の上に寄る', () => {
    expect(yOf(0.5)).toBeLessThan(yOf(0.2));
    expect(yOf(0.5)).toBeGreaterThan(yOf(0.9));
  });
});

describe('先頭ブロックの「間に合う」表示', () => {
  const game = (lane: 'enemy' | 'block', secondsOfDamage: number, secondsLeft: number) => {
    const s = createGame(1);
    s.player.lane = lane;
    s.blocks.push({ id: 1, kind: 'rank', hp: dpsOf(0) * secondsOfDamage, maxHp: 140, passAt: s.t + secondsLeft });
    return s;
  };

  it('必要な秒数が残り秒数以下なら間に合う', () => {
    expect(canBreakInTime(game('block', 3, 3.1))).toBe(true);
    expect(canBreakInTime(game('block', 3, 2.9))).toBe(false);
  });

  it('敵レーンにいるときは、切り替えの 0.15 秒を足して判定する', () => {
    expect(canBreakInTime(game('enemy', 3, 3.1))).toBe(false);
    expect(canBreakInTime(game('enemy', 3, 3.2))).toBe(true);
  });

  it('ブロックがなければ偽', () => {
    expect(canBreakInTime(createGame(1))).toBe(false);
  });
});
