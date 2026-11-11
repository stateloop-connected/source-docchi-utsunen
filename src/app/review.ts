// リザルトに出す「称号」と「ひとこと」（仕様書 6.6 節）。遊び方の傾向から、負けた原因を言葉にして返す。
// スコアやルールには影響しない。
import type { GameState } from '../core/state.ts';

export interface Review {
  /** 遊び方に付ける称号 */
  title: string;
  /** 次に生かせるひとこと */
  hint: string;
  /** 壊したランクアップ（金を含む）の数と、流れてきた数 */
  taken: number;
  offered: number;
}

/** 判定に使うしきい値 */
export const REVIEW = {
  /** 強化レーンにいた時間の割合。これ以上なら寄せすぎ、これ以下なら慎重すぎ */
  greedy: 0.72,
  timid: 0.35,
  traps: 3,
  hats: 3,
  bosses: 3,
  /** 強化の鬼: 流れてきたランクアップがこの数以上で、取った割合がこれ以上 */
  collectorOffered: 8,
  collectorRatio: 0.85,
  /** ひとことで触れる下限 */
  nearMisses: 3,
  trapHint: 2,
  bombsMissed: 3,
} as const;

/**
 * blockShare は強化レーンにいた時間の割合（0〜1）、nearMisses は削ったのに壊し切れず通過させたブロックの数。
 */
export function reviewPlay(s: GameState, blockShare: number, nearMisses: number): Review {
  const taken = s.got.rank + s.got.gold;
  const offered = taken + s.missed.rank + s.missed.gold;

  let title = 'バランス型';
  if (s.got.trap >= REVIEW.traps) title = '激安ハンター';
  else if (s.player.hats >= REVIEW.hats) title = '帽子コレクター';
  else if (s.bossesKilled >= REVIEW.bosses) title = 'ボスキラー';
  else if (blockShare >= REVIEW.greedy) title = '欲張りさん';
  else if (blockShare <= REVIEW.timid) title = '慎重派';
  else if (offered >= REVIEW.collectorOffered && taken / offered >= REVIEW.collectorRatio) title = '強化の鬼';

  let hint = 'いい勝負。ラッシュの前に敵レーンへ戻れると、さらに伸びる';
  if (blockShare >= REVIEW.greedy) hint = '強化に寄せすぎて敵があふれた。埋まり度が半分を超えたら戻ろう';
  else if (blockShare <= REVIEW.timid) hint = '敵ばかり撃って火力が伸びなかった。凪のうちに強化を取ろう';
  else if (nearMisses >= REVIEW.nearMisses) hint = `あと少しで逃した強化が ${nearMisses} 個。数字が赤いブロックは見送ろう`;
  else if (s.got.trap >= REVIEW.trapHint) hint = `「激安！」を ${s.got.trap} 回壊した。あれは罠`;
  else if (s.missed.bomb >= REVIEW.bombsMissed) hint = `一斉削除を ${s.missed.bomb} 個見送った。埋まってきたら頼ろう`;

  return { title, hint, taken, offered };
}
