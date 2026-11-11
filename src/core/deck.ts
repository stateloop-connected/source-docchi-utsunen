// ブロックの段を作る袋と山（仕様書 4.3 節）。乱数はブロック専用の列だけを使う。
import { B, PILE_BASE, RANK_ROWS, ROWS_PER_BAG, SUPPORT_PER_PILE, type BlockKind } from './balance.ts';
import { nextRandom, seedRng, shuffle, type RngState } from './rng.ts';

export interface DeckState {
  rng: RngState;
  /** まだ最初の段を出していない */
  first: boolean;
  /** 袋の中身。true はランクアップの段、false は山から 2 枚の段 */
  bag: boolean[];
  pile: BlockKind[];
  /** サポート枠をゲームを通して配った枚数 */
  supportGiven: number;
}

export function createDeck(seed: number): DeckState {
  return { rng: seedRng(seed), first: true, bag: [], pile: [], supportGiven: 0 };
}

function supportKind(given: number): BlockKind {
  if (given < B.buddyMax) return 'buddy';
  if (given < B.buddyMax + B.expandMax) return 'expand';
  return 'vacation';
}

function drawFromPile(d: DeckState): BlockKind {
  if (d.pile.length === 0) {
    for (const [kind, count] of PILE_BASE) for (let i = 0; i < count; i++) d.pile.push(kind);
    for (let i = 0; i < SUPPORT_PER_PILE; i++) d.pile.push(supportKind(d.supportGiven++));
    shuffle(d.pile, d.rng);
  }
  return d.pile.pop()!;
}

/**
 * 次の段を返す。並びは [左の列, 右の列]。
 * ゲーム最初の段だけは、左の列にランクアップが 1 個だけ出る（乱数は使わない）。
 */
export function drawRow(d: DeckState): BlockKind[] {
  if (d.first) {
    d.first = false;
    return ['rank'];
  }
  if (d.bag.length === 0) {
    for (let i = 0; i < ROWS_PER_BAG; i++) d.bag.push(i < RANK_ROWS);
    shuffle(d.bag, d.rng);
  }
  const rankRow = d.bag.pop()!;
  const first = rankRow ? 'rank' : drawFromPile(d);
  const second = drawFromPile(d);
  // どちらを左に置くかは半々
  return nextRandom(d.rng) < 0.5 ? [first, second] : [second, first];
}
