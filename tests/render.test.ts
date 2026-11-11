import { describe, expect, it } from 'vitest';
import { formatComma, formatHp, formatNumber, formatPower } from '../src/render/format.ts';
import { AIM } from '../src/core/balance.ts';
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

describe('社会人力の表示', () => {
  it('1 万未満は 3 桁区切りの整数', () => {
    expect(formatPower(5)).toBe('5');
    expect(formatPower(9999.9)).toBe('9,999');
  });

  it('1 万以上は万・億・兆・京・垓を付けて有効数字 3 桁。端数は切り捨てる', () => {
    expect(formatPower(10000)).toBe('1.00万');
    expect(formatPower(262345)).toBe('26.2万');
    expect(formatPower(5300000)).toBe('530万');
    expect(formatPower(99999999)).toBe('9,999万');
    expect(formatPower(721000000)).toBe('7.21億');
    expect(formatPower(1.65e10)).toBe('165億');
    expect(formatPower(5.02e16)).toBe('5.02京');
    expect(formatPower(3e20)).toBe('3.00垓');
  });

  it('垓でも足りなければ「測定不能」', () => {
    expect(formatPower(9.9e23)).toBe('9,900垓');
    expect(formatPower(1e24)).toBe('測定不能');
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

describe('ブロックの「間に合う」表示', () => {
  const RIGHT = AIM.blockCols[1];
  const game = (x: number, secondsOfDamage: number, secondsLeft: number) => {
    const s = createGame(1);
    s.player.x = x;
    s.blocks.push({ id: 1, kind: 'rank', hp: dpsOf(0) * secondsOfDamage, maxHp: 140, passAt: s.t + secondsLeft, row: 1, col: 1, u: RIGHT });
    return s;
  };

  it('その列に立っていれば、撃つ時間が残り秒数以下なら間に合う', () => {
    const ok = game(RIGHT, 3, 3.1);
    expect(canBreakInTime(ok, ok.blocks[0]!)).toBe(true);
    const late = game(RIGHT, 3, 2.9);
    expect(canBreakInTime(late, late.blocks[0]!)).toBe(false);
  });

  it('離れているときは、そこまで移動する時間を足して判定する', () => {
    // 真ん中から右の列まで 0.76 ÷ 3 = 約 0.25 秒
    const late = game(0, 3, 3.2);
    expect(canBreakInTime(late, late.blocks[0]!)).toBe(false);
    const ok = game(0, 3, 3.3);
    expect(canBreakInTime(ok, ok.blocks[0]!)).toBe(true);
  });
});
