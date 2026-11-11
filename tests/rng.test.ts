import { describe, expect, it } from 'vitest';
import golden from '../reference/golden.json';
import { mulberry32, seedRng, shuffle } from '../src/core/rng.ts';

describe('mulberry32', () => {
  for (const [seed, expected] of Object.entries(golden.mulberry32)) {
    it(`種 ${seed} の最初の 5 個が golden.json と完全に一致する`, () => {
      const rnd = mulberry32(Number(seed));
      expect(expected.map(() => rnd())).toEqual(expected);
    });
  }

  it('種は 32 ビット符号なし整数に丸める', () => {
    const a = mulberry32(2 ** 32 + 5);
    const b = mulberry32(5);
    expect(a()).toBe(b());
  });
});

describe('shuffle', () => {
  it('中身を変えずに並べ替え、同じ種なら同じ順になる', () => {
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = [...base];
    const b = [...base];
    shuffle(a, seedRng(7));
    shuffle(b, seedRng(7));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(base);
    expect(a).not.toEqual(base);
  });
});
