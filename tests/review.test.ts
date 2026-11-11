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

  it('強化レーンに寄せすぎると「欲張りさん」、敵ばかりだと「慎重派」', () => {
    const s = createGame(1);
    expect(reviewPlay(s, 0.8, 0).title).toBe('欲張りさん');
    expect(reviewPlay(s, 0.8, 0).hint).toContain('寄せすぎ');
    expect(reviewPlay(s, 0.2, 0).title).toBe('慎重派');
    expect(reviewPlay(s, 0.2, 0).hint).toContain('凪');
  });

  it('罠・帽子・ボスの称号は、レーンの偏りより優先する', () => {
    const trap = createGame(1);
    trap.got.trap = 3;
    expect(reviewPlay(trap, 0.8, 0).title).toBe('激安ハンター');
    const hat = createGame(1);
    hat.player.hats = 3;
    expect(reviewPlay(hat, 0.5, 0).title).toBe('帽子コレクター');
    const boss = createGame(1);
    boss.bossesKilled = 3;
    expect(reviewPlay(boss, 0.5, 0).title).toBe('ボスキラー');
    const pair = createGame(1);
    pair.doubles = 10;
    expect(reviewPlay(pair, 0.8, 0).title).toBe('両取り名人');
  });

  it('ランクアップをほぼ取り切ると「強化の鬼」、どれでもなければ「バランス型」', () => {
    const s = createGame(1);
    s.got.rank = 9;
    s.missed.rank = 1;
    expect(reviewPlay(s, 0.5, 0).title).toBe('強化の鬼');
    s.missed.rank = 6;
    expect(reviewPlay(s, 0.5, 0).title).toBe('バランス型');
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
