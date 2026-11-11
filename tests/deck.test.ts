import { describe, expect, it } from 'vitest';
import golden from '../reference/golden.json';
import { createDeck, drawRow } from '../src/core/deck.ts';

function rows(seed: number, n: number): string[][] {
  const d = createDeck(seed);
  return Array.from({ length: n }, () => drawRow(d));
}

describe('ブロックの段の並び', () => {
  for (const [seed, expected] of Object.entries(golden.rows)) {
    it(`種 ${seed} の最初の 31 段が golden.json と完全に一致する`, () => {
      expect(rows(Number(seed), expected.length)).toEqual(expected);
    });
  }

  it('最初の段はランクアップ 1 個だけ。以後は 2 個 1 組', () => {
    const all = rows(7, 20);
    expect(all[0]).toEqual(['rank']);
    expect(all.slice(1).every((r) => r.length === 2)).toBe(true);
  });

  it('袋 1 つ（6 段）のうち 4 段にランクアップが入る', () => {
    for (const seed of [3, 99, 123456789]) {
      const all = rows(seed, 31).slice(1);
      for (let bag = 0; bag < 5; bag++) {
        const six = all.slice(bag * 6, bag * 6 + 6);
        expect(six.filter((r) => r.includes('rank'))).toHaveLength(4);
      }
    }
  });

  it('山 1 つ（袋 5 つ = 30 段）の内訳はどの種でも同じ', () => {
    for (const seed of [3, 99, 123456789]) {
      const counts: Record<string, number> = {};
      for (const kind of rows(seed, 31).slice(1).flat()) counts[kind] = (counts[kind] ?? 0) + 1;
      expect(counts).toEqual({ rank: 20, gold: 1, bomb: 7, vacation: 5, trap: 11, hat: 10, buddy: 3, expand: 3 });
    }
  });

  it('サポート枠は buddy 3 枚、expand 3 枚、以降は vacation', () => {
    const second = rows(5, 61).slice(31).flat();
    const count = (k: string) => second.filter((x) => x === k).length;
    expect(count('buddy')).toBe(0);
    expect(count('expand')).toBe(0);
    // 山ごとの vacation 5 枚 + サポート枠 6 枚
    expect(count('vacation')).toBe(11);
  });
});
