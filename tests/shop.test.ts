import { describe, expect, it } from 'vitest';
import { CONTINUE_COST, PACKS, shopButtons } from '../src/app/shop.ts';

describe('ネタのショップ', () => {
  it('パックは 4 つで、高いパックほどジェムが多い', () => {
    expect(PACKS).toHaveLength(4);
    for (let i = 1; i < PACKS.length; i++) {
      expect(PACKS[i]!.yen).toBeGreaterThan(PACKS[i - 1]!.yen);
      expect(PACKS[i]!.gems).toBeGreaterThan(PACKS[i - 1]!.gems);
    }
  });

  it('いちばん安いパックでも、コンティニュー 1 回ぶんのジェムは買える', () => {
    expect(PACKS[0]!.gems).toBeGreaterThanOrEqual(CONTINUE_COST);
  });

  it('一覧では、パックごとの値段のボタンと「閉じる」「返金する」が出る', () => {
    const ids = shopButtons({ at: 'list', notice: '' }).map((b) => b.id);
    expect(ids).toEqual(['buy0', 'buy1', 'buy2', 'buy3', 'shopClose', 'refund']);
  });

  it('確認の画面では「購入する」「やめる」だけ、決済中は何も押せず、完了では「OK」だけ', () => {
    expect(shopButtons({ at: 'confirm', pack: 1 }).map((b) => b.id)).toEqual(['pay', 'cancel']);
    expect(shopButtons({ at: 'paying', pack: 1, since: 0 })).toEqual([]);
    expect(shopButtons({ at: 'done', pack: 1 }).map((b) => b.id)).toEqual(['ok']);
  });
});
