// ブロックの袋と山（仕様書 4.3 節）。乱数はブロック専用の列だけを使う。
import { B, BAG_RANKS, PILE_BASE, PILE_PER_BAG, SUPPORT_PER_PILE, type BlockKind } from './balance.ts';
import { seedRng, shuffle, type RngState } from './rng.ts';

export interface DeckState {
  rng: RngState;
  /** まだ最初の 1 個を出していない */
  first: boolean;
  bag: BlockKind[];
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

export function drawBlock(d: DeckState): BlockKind {
  if (d.first) {
    d.first = false;
    return 'rank';
  }
  if (d.bag.length === 0) {
    if (d.pile.length < PILE_PER_BAG) {
      d.pile = [...PILE_BASE];
      for (let i = 0; i < SUPPORT_PER_PILE; i++) d.pile.push(supportKind(d.supportGiven++));
      shuffle(d.pile, d.rng);
    }
    for (let i = 0; i < BAG_RANKS; i++) d.bag.push('rank');
    for (let i = 0; i < PILE_PER_BAG; i++) d.bag.push(d.pile.pop()!);
    shuffle(d.bag, d.rng);
  }
  return d.bag.pop()!;
}
