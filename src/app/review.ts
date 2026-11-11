// リザルトに出す「称号」と「ひとこと」（仕様書 6.6 節）。遊び方の傾向から、負けた原因を言葉にして返す。
// スコアやルールには影響しない。
import { AIM, DT } from '../core/balance.ts';
import type { GameState } from '../core/state.ts';

export interface Review {
  /** 遊び方に付ける称号 */
  title: string;
  /** 次に生かせるひとこと */
  hint: string;
  /** 壊したランクアップ（金を含む）の数と、流れてきた数 */
  taken: number;
  offered: number;
  /** 同じ段の 2 個を両方壊した回数 */
  doubles: number;
  /** 敵に当てていた時間のうち、会心だった割合（0〜1） */
  critRate: number;
}

/** 判定に使うしきい値 */
export const REVIEW = {
  /** 強化の帯にいた時間の割合。これ以上なら寄せすぎ、これ以下なら慎重すぎ */
  greedy: 0.72,
  timid: 0.35,
  traps: 3,
  hats: 3,
  bosses: 3,
  /** 両取り名人: 同じ段の 2 個を両方壊した回数 */
  doubles: 10,
  /** 強化の鬼: 流れてきたランクアップがこの数以上で、取った割合がこれ以上 */
  collectorOffered: 8,
  collectorRatio: 0.85,
  /** ひとことで触れる下限 */
  nearMisses: 3,
  trapHint: 2,
  bombsMissed: 3,
  /** 狙撃手: 敵に当てていた時間がこの秒数以上で、会心の割合がこれ以上 */
  sniperSeconds: 20,
  sniperRate: 0.6,
  /** 会心の割合がこれ以下なら、ひとことで会心を教える */
  critHint: 0.3,
} as const;

/**
 * blockShare は強化の帯にいた時間の割合（0〜1）、nearMisses は半分以上削ったのに通過させた、役に立つブロックの数。
 */
export function reviewPlay(s: GameState, blockShare: number, nearMisses: number): Review {
  const taken = s.got.rank + s.got.gold;
  const offered = taken + s.missed.rank + s.missed.gold;

  const critRate = s.hitTicks > 0 ? s.critTicks / s.hitTicks : 0;
  const aimed = s.hitTicks * DT >= REVIEW.sniperSeconds;

  let title = '頼れる中堅';
  if (s.got.trap >= REVIEW.traps) title = '無料に弱い人';
  else if (s.player.hats >= REVIEW.hats) title = '形から入るタイプ';
  else if (s.bossesKilled >= REVIEW.bosses) title = 'ボスキラー';
  else if (s.doubles >= REVIEW.doubles) title = '両取り名人';
  else if (aimed && critRate >= REVIEW.sniperRate) title = '狙撃手';
  else if (blockShare >= REVIEW.greedy) title = '意識高い系';
  else if (blockShare <= REVIEW.timid) title = '自転車操業';
  else if (offered >= REVIEW.collectorOffered && taken / offered >= REVIEW.collectorRatio) title = '資格マニア';

  let hint = 'いい勝負。ラッシュの前に真ん中へ戻れると、さらに伸びる';
  if (blockShare >= REVIEW.greedy) hint = '強化に寄せすぎて敵があふれた。埋まり度が半分を超えたら戻ろう';
  else if (blockShare <= REVIEW.timid) hint = '敵ばかり撃って火力が伸びなかった。凪のうちに強化を取ろう';
  else if (nearMisses >= REVIEW.nearMisses) hint = `あと少しで逃した強化が ${nearMisses} 個。数字が赤いブロックは見送ろう`;
  else if (s.got.trap >= REVIEW.trapHint) hint = `「無料登録」は罠。${s.got.trap} 回壊して、届いたのは通知だけ`;
  else if (s.missed.bomb >= REVIEW.bombsMissed) hint = `一斉削除を ${s.missed.bomb} 個見送った。埋まってきたら頼ろう`;
  else if (aimed && critRate <= REVIEW.critHint) hint = `会心は ${Math.round(critRate * 100)}%。敵の真ん中を捉えるとダメージ ${AIM.critMult} 倍`;

  return { title, hint, taken, offered, doubles: s.doubles, critRate };
}
