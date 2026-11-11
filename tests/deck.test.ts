import { describe, expect, it } from 'vitest';
import golden from '../reference/golden.json';
import { createDeck, drawBlock } from '../src/core/deck.ts';

function draw(seed: number, n: number): string[] {
  const d = createDeck(seed);
  return Array.from({ length: n }, () => drawBlock(d));
}

describe('ブロックの出る順番', () => {
  for (const [seed, expected] of Object.entries(golden.deck)) {
    it(`種 ${seed} の最初の 61 個が golden.json と完全に一致する`, () => {
      expect(draw(Number(seed), expected.length)).toEqual(expected);
    });
  }

  it('最初の 61 個の内訳はどの種でも同じ', () => {
    for (const seed of [3, 99, 123456789]) {
      const counts: Record<string, number> = {};
      for (const k of draw(seed, 61)) counts[k] = (counts[k] ?? 0) + 1;
      expect(counts).toEqual({ rank: 41, bomb: 6, trap: 4, buddy: 3, gold: 2, vacation: 2, hat: 2, expand: 1 });
    }
  });

  it('サポート枠は buddy 3 枚、expand 3 枚、以降は vacation', () => {
    // 山 1 つ（10 枚）は袋 5 つ（30 個）で使い切る。最初の 1 個を除いて山 4 つ分を引く
    const all = draw(5, 1 + 30 * 4);
    const count = (k: string) => all.filter((x) => x === k).length;
    expect(count('buddy')).toBe(3);
    expect(count('expand')).toBe(3);
    // 山ごとの vacation 1 枚 × 4 + サポート枠の残り 2 枚
    expect(count('vacation')).toBe(6);
  });
});
