import { describe, expect, it } from 'vitest';
import golden from '../reference/golden.json';
import { baseHp, bossHp, bossName, dRef, dpsOf, estimatedIq, fireRate, phi, sizeRate, waveOf, weaponName, weaponStage } from '../src/core/formulas.ts';

/** 相対誤差 1e-9 以内 */
function close(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * 1e-9);
}

describe('数式が golden.json と一致する', () => {
  for (const f of golden.formulas) {
    it(`t = ${f.t}`, () => {
      expect(waveOf(f.t)).toBe(f.wave);
      close(phi(f.t), f.phi);
      close(dRef(f.t), f.d_ref);
      close(sizeRate(f.t), f.size_rate);
      close(baseHp(f.t), f.base_hp);
    });
  }

  for (const b of golden.boss) {
    it(`WAVE ${b.wave} のボスの HP`, () => {
      expect(waveOf(b.t)).toBe(b.wave);
      close(bossHp(b.t), b.hp);
    });
  }

  for (const d of golden.dps) {
    it(`ランク ${d.rank} の DPS`, () => close(dpsOf(d.rank), d.dps));
  }
});

describe('武器と表示', () => {
  it('4 ランクごとに段階が上がり、段階 15 で止まる', () => {
    expect(weaponStage(0)).toBe(0);
    expect(weaponStage(3)).toBe(0);
    expect(weaponStage(4)).toBe(1);
    expect(weaponStage(59)).toBe(14);
    expect(weaponStage(60)).toBe(15);
    expect(weaponStage(100)).toBe(15);
  });

  it('ランク 61 以上は「ねこ +N」', () => {
    expect(weaponName(0)).toBe('水鉄砲');
    expect(weaponName(29)).toBe('ガトリング砲');
    expect(weaponName(60)).toBe('ねこ');
    expect(weaponName(63)).toBe('ねこ +3');
  });

  it('発射数は秒間 8 発から始まり 20 発で頭打ち', () => {
    expect(fireRate(0)).toBe(8);
    expect(fireRate(10)).toBe(10);
    expect(fireRate(100)).toBe(20);
  });

  it('ボスの名前は出現順で、5 体目から「真・」が付く', () => {
    expect(bossName(1)).toBe('月曜日');
    expect(bossName(4)).toBe('親戚の集まり');
    expect(bossName(5)).toBe('真・月曜日');
    expect(bossName(8)).toBe('真・親戚の集まり');
  });

  it('推定 IQ は 60 + スコア ÷ 2,500 の切り捨てで、上限 200', () => {
    expect(estimatedIq(0)).toBe(60);
    expect(estimatedIq(5760)).toBe(62);
    expect(estimatedIq(151365)).toBe(120);
    expect(estimatedIq(1e9)).toBe(200);
  });
});
