import { describe, expect, it } from 'vitest';
import { reviewPlay } from '../src/app/review.ts';
import { createGame } from '../src/core/state.ts';

describe('リザルトの称号とひとこと', () => {
  it('取ったランクアップ（金を含む）と、流れてきた数を数える', () => {
    const s = createGame(1);
    s.got.rank = 10;
    s.got.gold = 1;
    s.missed.rank = 3;
    s.missed.gold = 1;
    s.missed.bomb = 9;
    s.doubles = 4;
    expect(reviewPlay(s, 0.5, 0)).toMatchObject({ taken: 11, offered: 15, doubles: 4 });
  });

  it('強化の帯に寄せすぎると「意識高い系」、敵ばかりだと「自転車操業」', () => {
    const s = createGame(1);
    expect(reviewPlay(s, 0.8, 0).title).toBe('意識高い系');
    expect(reviewPlay(s, 0.8, 0).hint).toContain('寄せすぎ');
    expect(reviewPlay(s, 0.2, 0).title).toBe('自転車操業');
    expect(reviewPlay(s, 0.2, 0).hint).toContain('凪');
  });

  it('罠・帽子・ボス・両取りの称号は、立ち位置の偏りより優先する', () => {
    const trap = createGame(1);
    trap.got.trap = 3;
    expect(reviewPlay(trap, 0.8, 0).title).toBe('無料に弱い人');
    const hat = createGame(1);
    hat.player.hats = 3;
    expect(reviewPlay(hat, 0.5, 0).title).toBe('形から入るタイプ');
    const boss = createGame(1);
    boss.bossesKilled = 3;
    expect(reviewPlay(boss, 0.5, 0).title).toBe('ボスキラー');
    const pair = createGame(1);
    pair.doubles = 10;
    expect(reviewPlay(pair, 0.8, 0).title).toBe('両取り名人');
  });

  it('ランクアップをほぼ取り切ると「資格マニア」、どれでもなければ「頼れる中堅」', () => {
    const s = createGame(1);
    s.got.rank = 9;
    s.missed.rank = 1;
    expect(reviewPlay(s, 0.5, 0).title).toBe('資格マニア');
    s.missed.rank = 6;
    expect(reviewPlay(s, 0.5, 0).title).toBe('頼れる中堅');
  });

  it('ひとことは、惜しい取り逃し・罠・ボムの見送りの順に触れる', () => {
    const s = createGame(1);
    expect(reviewPlay(s, 0.5, 4).hint).toContain('4 個');
    s.got.trap = 2;
    expect(reviewPlay(s, 0.5, 4).hint).toContain('4 個');
    expect(reviewPlay(s, 0.5, 0).hint).toContain('罠');
    s.got.trap = 0;
    s.missed.bomb = 3;
    expect(reviewPlay(s, 0.5, 0).hint).toContain('一斉削除');
    s.missed.bomb = 0;
    expect(reviewPlay(s, 0.5, 0).hint).toContain('いい勝負');
  });
});

describe('会心の振り返り', () => {
  it('会心の割合は、敵に当てていた時間のうち会心だった割合。当てていなければ 0', () => {
    const s = createGame(1);
    expect(reviewPlay(s, 0.5, 0).critRate).toBe(0);
    s.hitTicks = 200;
    s.critTicks = 50;
    expect(reviewPlay(s, 0.5, 0).critRate).toBe(0.25);
  });

  it('20 秒以上当てて、会心が 6 割以上なら「狙撃手」', () => {
    const s = createGame(1);
    s.hitTicks = 60 * 20;
    s.critTicks = 60 * 12;
    expect(reviewPlay(s, 0.5, 0).title).toBe('狙撃手');
    s.critTicks = 60 * 12 - 1;
    expect(reviewPlay(s, 0.5, 0).title).toBe('頼れる中堅');
    // 当てた時間が短いうちは、たまたまの会心で称号を出さない
    s.hitTicks = 60 * 20 - 1;
    s.critTicks = s.hitTicks;
    expect(reviewPlay(s, 0.5, 0).title).toBe('頼れる中堅');
  });

  it('会心が 3 割以下なら、ひとことで会心を教える', () => {
    const s = createGame(1);
    s.hitTicks = 60 * 30;
    s.critTicks = 60 * 6;
    expect(reviewPlay(s, 0.5, 0).hint).toContain('会心は 20%');
    s.critTicks = 60 * 15;
    expect(reviewPlay(s, 0.5, 0).hint).toContain('いい勝負');
  });
});
