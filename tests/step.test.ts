import { describe, expect, it } from 'vitest';
import { B, DT, type BlockKind, type EnemyKind, type Lane } from '../src/core/balance.ts';
import { baseHp, bossHp, dpsOf } from '../src/core/formulas.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { createGame, type GameEvent, type GameState } from '../src/core/state.ts';
import { step } from '../src/core/step.ts';

/** 敵もブロックも自然には出てこない、効果の確認用の状態 */
function quietGame(): GameState {
  const s = createGame(1);
  s.vacationUntil = 1e9;
  s.nextBlockAt = 1e9;
  return s;
}

function putEnemy(s: GameState, kind: EnemyKind | 'boss', size: number, hp = 1e9): void {
  s.enemies.push({ id: s.nextId++, kind, hp, hp0: hp, size, born: s.t, bossIndex: kind === 'boss' ? 1 : 0 });
  s.fill += size;
}

/** 次の 1 刻みで壊れるブロックを先頭に置き、強化レーンに立たせる */
function putBlock(s: GameState, kind: BlockKind): void {
  s.blocks.unshift({ id: s.nextId++, kind, hp: 1e-6, maxHp: 100, passAt: s.t + 5 });
  s.player.lane = 'block';
  s.player.switchLeft = 0;
}

const live = (s: GameState) => s.enemies.slice(s.head);
const types = (ev: GameEvent[]) => ev.map((e) => e.type);

describe('再現性', () => {
  it('同じ種・同じ入力列なら状態が完全に一致する', () => {
    const play = () => {
      const s = createGame(20261111);
      const rnd = mulberry32(99);
      let want: Lane = 'enemy';
      const log: GameEvent[] = [];
      for (let i = 0; i < 60 * 150 && !s.over; i++) {
        if (i % 20 === 0) want = rnd() < 0.55 ? 'block' : 'enemy';
        log.push(...step(s, want));
      }
      return JSON.stringify({ s, log });
    };
    const a = play();
    expect(play()).toBe(a);
    expect(a.length).toBeGreaterThan(10000);
  });

  it('種が違えば展開が変わる', () => {
    const play = (seed: number) => {
      const s = createGame(seed);
      // 敵の種類が 2 つ以上になる WAVE 3 以降まで進める（それまでは未読通知しか出ず、種で変わらない）
      for (let i = 0; i < 60 * 80; i++) step(s, 'enemy');
      return JSON.stringify(s.enemies);
    };
    expect(play(1)).not.toBe(play(2));
  });

  it('経過時間は刻み数 ÷ 60 で求める', () => {
    const s = createGame(0);
    for (let i = 0; i < 60 * 20; i++) step(s, 'enemy');
    expect(s.tick).toBe(1200);
    expect(s.t).toBe(20);
  });
});

describe('入力なし（常に敵レーン）', () => {
  it('ランク 0 のまま、およそ 95 秒で終わる', () => {
    const s = createGame(0);
    while (!s.over && s.t < 300) step(s, 'enemy');
    expect(s.over).toBe(true);
    expect(s.player.rank).toBe(0);
    expect(s.t).toBeGreaterThan(90);
    expect(s.t).toBeLessThan(100);
  });
});

describe('プレイヤーと射撃', () => {
  it('レーンの切り替えには 0.15 秒かかり、その間は撃てず、希望の変更も反映しない', () => {
    const s = quietGame();
    putEnemy(s, 'notice', 1, 1000);
    step(s, 'block');
    expect(s.player.lane).toBe('block');
    step(s, 'enemy');
    expect(s.player.lane).toBe('block');
    let ticks = 1;
    while (s.player.lane === 'block') {
      step(s, 'enemy');
      ticks++;
    }
    // 0.15 秒 = 9 刻み（丸め誤差で 1 刻み延びうる）
    expect(ticks).toBeGreaterThanOrEqual(10);
    expect(ticks).toBeLessThanOrEqual(11);
    // 戻ってきた直後も切り替え中なので、まだ無傷
    for (let i = 0; i < 5; i++) step(s, 'enemy');
    expect(live(s)[0]!.hp).toBe(1000);
    for (let i = 0; i < 20; i++) step(s, 'enemy');
    expect(live(s)[0]!.hp).toBeLessThan(1000);
  });

  it('敵レーンでは余ったダメージが次の敵へ持ち越される', () => {
    const s = quietGame();
    const dmg = dpsOf(0) * DT;
    putEnemy(s, 'notice', 1, dmg * 0.25);
    putEnemy(s, 'notice', 1, dmg * 0.25);
    putEnemy(s, 'notice', 1, dmg);
    const ev = step(s, 'enemy');
    expect(ev.filter((e) => e.type === 'enemyKill')).toHaveLength(2);
    expect(live(s)).toHaveLength(1);
    expect(live(s)[0]!.hp).toBeCloseTo(dmg * 0.5, 9);
    expect(s.fill).toBe(1);
    // サイズ 1 × WAVE 1 × 10 が 2 体分
    expect(s.score).toBe(20);
  });

  it('強化レーンでは先頭のブロックだけを撃ち、余りは持ち越さない', () => {
    const s = quietGame();
    putBlock(s, 'hat');
    s.blocks.push({ id: s.nextId++, kind: 'rank', hp: 50, maxHp: 50, passAt: s.t + 9 });
    step(s, 'block');
    expect(s.player.hats).toBe(1);
    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0]!.hp).toBe(50);
  });

  it('相棒はレーンに関係なく、プレイヤーの 10% × 台数の火力で敵を撃つ', () => {
    const s = quietGame();
    s.player.buddies = 2;
    s.player.lane = 'block';
    putEnemy(s, 'notice', 1, 1000);
    step(s, 'block');
    expect(live(s)[0]!.hp).toBeCloseTo(1000 - dpsOf(0) * 0.1 * 2 * DT, 9);
  });
});

describe('ブロック', () => {
  it('開始 3 秒後に最初の rank が出て、以後 5 秒おきに出る。HP は出現時のランクで決まる', () => {
    const s = createGame(0);
    const spawned: { t: number; hp: number; kind: string }[] = [];
    while (s.t < 14) {
      const t = s.t;
      for (const e of step(s, 'enemy')) if (e.type === 'blockSpawn') spawned.push({ t, hp: e.hp, kind: e.kind });
    }
    expect(spawned.map((b) => b.t)).toEqual([3, 8, 13]);
    expect(spawned[0]).toMatchObject({ kind: 'rank', hp: 3.5 * 40 });
    // 画面には常に 2 個見える
    expect(s.blocks).toHaveLength(2);
    expect(s.blocks[0]!.passAt).toBe(18);
  });

  it('通過時刻になっても壊れていなければ消え、取り逃した数に入る', () => {
    const s = createGame(0);
    let passed: GameEvent | undefined;
    while (s.t < 13.1) for (const e of step(s, 'enemy')) if (e.type === 'blockPass') passed = e;
    expect(passed).toMatchObject({ kind: 'rank', damaged: false });
    expect(s.missed.rank).toBe(1);
    expect(s.player.rank).toBe(0);
  });

  it('rank は +1、gold は +2。壊すと 100 × WAVE のスコア', () => {
    const s = quietGame();
    putBlock(s, 'rank');
    expect(types(step(s, 'block'))).toEqual(['blockBreak', 'rankUp']);
    expect(s.player.rank).toBe(1);
    expect(s.score).toBe(100);
    putBlock(s, 'gold');
    step(s, 'block');
    expect(s.player.rank).toBe(3);
    expect(s.got).toMatchObject({ rank: 1, gold: 1 });
  });

  it('武器の段階が変わるランクアップには印が付く', () => {
    const s = quietGame();
    s.player.rank = 3;
    putBlock(s, 'rank');
    expect(step(s, 'block')).toContainEqual({ type: 'rankUp', rank: 4, stageChanged: true });
  });

  it('相棒は 3 台まで', () => {
    const s = quietGame();
    for (let i = 0; i < 5; i++) {
      putBlock(s, 'buddy');
      step(s, 'block');
    }
    expect(s.player.buddies).toBe(3);
  });

  it('増築は容量 +10 を 3 回まで', () => {
    const s = quietGame();
    for (let i = 0; i < 5; i++) {
      putBlock(s, 'expand');
      step(s, 'block');
    }
    expect(s.capacity).toBe(130);
    expect(s.expands).toBe(3);
  });

  it('罠は未読通知 20 体をその時点の h(t) で最後尾に出す', () => {
    const s = quietGame();
    putEnemy(s, 'deadline', 3);
    putBlock(s, 'trap');
    const t = s.t;
    step(s, 'block');
    const es = live(s);
    expect(es).toHaveLength(21);
    expect(es[0]!.kind).toBe('deadline');
    expect(es.slice(1).every((e) => e.kind === 'notice' && e.size === 1 && e.hp === baseHp(t))).toBe(true);
    expect(s.fill).toBe(23);
  });

  it('有給休暇は 6 秒間敵を止め、効果中に重ねると 6 秒延びる', () => {
    const s = createGame(3);
    s.nextBlockAt = 1e9;
    for (let i = 0; i < 60; i++) step(s, 'enemy');
    putBlock(s, 'vacation');
    const t0 = s.t;
    step(s, 'block');
    expect(s.vacationUntil).toBe(t0 + 6);
    putBlock(s, 'vacation');
    step(s, 'block');
    expect(s.vacationUntil).toBe(t0 + 12);
    // 効果中は出現しない（予算も貯めない）
    const budget = s.budget;
    let spawns = 0;
    while (s.t < t0 + 12) spawns += step(s, 'enemy').filter((e) => e.type === 'enemySpawn').length;
    expect(spawns).toBe(0);
    expect(s.budget).toBe(budget);
    while (s.t < t0 + 13) spawns += step(s, 'enemy').filter((e) => e.type === 'enemySpawn').length;
    expect(spawns).toBeGreaterThan(0);
  });

  it('有給休暇が切れたあとに取ると、その時刻から 6 秒', () => {
    const s = quietGame();
    s.vacationUntil = -1;
    s.tick = 600;
    s.t = 10;
    s.budget = -1e9;
    putBlock(s, 'vacation');
    step(s, 'block');
    expect(s.vacationUntil).toBe(16);
  });
});

describe('一斉削除', () => {
  it('先頭からサイズ 35 まで消す。収まらない敵は飛ばして次を見る。スコアは入らない', () => {
    const s = quietGame();
    putEnemy(s, 'deadline', 3);
    putEnemy(s, 'boss', B.bossSize, 100);
    for (let i = 0; i < 30; i++) putEnemy(s, 'notice', 1);
    putEnemy(s, 'deadline', 3);
    putEnemy(s, 'deadline', 3);
    putEnemy(s, 'notice', 1);
    putEnemy(s, 'notice', 1);
    putEnemy(s, 'notice', 1);
    putBlock(s, 'bomb');
    const ev = step(s, 'block');
    // 3 + 30 = 33 を消し、残り 2 に収まらない締切 2 体を飛ばして、未読通知 2 体を消す
    expect(live(s).map((e) => e.kind)).toEqual(['boss', 'deadline', 'deadline', 'notice']);
    expect(live(s)[0]!.hp).toBe(85);
    expect(s.fill).toBe(B.bossSize + 3 + 3 + 1);
    expect(s.score).toBe(100);
    expect(ev.filter((e) => e.type === 'enemyKill' && e.byBomb)).toHaveLength(33);
  });

  it('ボスには最大 HP の 15% のダメージ。それで倒れたらボス撃破として扱う', () => {
    const s = quietGame();
    putEnemy(s, 'boss', B.bossSize, 100);
    live(s)[0]!.hp = 10;
    putBlock(s, 'bomb');
    const ev = step(s, 'block');
    expect(live(s)).toHaveLength(0);
    expect(s.bossesKilled).toBe(1);
    expect(types(ev)).toContain('bossKill');
    // ブロック 100 + サイズ 20 × WAVE 1 × 10 + ボス 1 体目 5,000
    expect(s.score).toBe(100 + 200 + 5000);
  });
});

describe('敵', () => {
  it('リボ払いは 20 秒間、毎秒「出現時 HP の 10%」ずつ増え、最大で 3 倍になる', () => {
    const s = quietGame();
    s.player.lane = 'block';
    putEnemy(s, 'revolving', 1.5, 100);
    s.growing.push(live(s)[0]!);
    for (let i = 0; i < 60 * 10; i++) step(s, 'block');
    expect(live(s)[0]!.hp).toBeCloseTo(200, 6);
    for (let i = 0; i < 60 * 30; i++) step(s, 'block');
    expect(live(s)[0]!.hp).toBeCloseTo(300, 6);
  });

  it('WAVE 5 の τ = 15 でボスが 1 体だけ出て、ラッシュ中は通常の敵が出ない', () => {
    const s = createGame(0);
    s.capacity = 1e9;
    const log: { t: number; e: GameEvent }[] = [];
    while (s.t < 100) {
      const t = s.t;
      for (const e of step(s, 'enemy')) log.push({ t, e });
    }
    const bosses = log.filter((x) => x.e.type === 'bossSpawn');
    expect(bosses).toHaveLength(1);
    expect(bosses[0]!.t).toBe(95);
    const boss = live(s).find((e) => e.kind === 'boss')!;
    expect(boss.hp0).toBe(bossHp(95));
    expect(boss.size).toBe(B.bossSize);
    expect(log.filter((x) => x.e.type === 'enemySpawn' && x.t >= 95)).toHaveLength(0);
  });

  it('τ = 13 で警告が出る。通常はラッシュ警告、ボス戦のウェーブではボス警告', () => {
    const s = createGame(0);
    s.capacity = 1e9;
    const warns: { t: number; type: string }[] = [];
    while (s.t < 100) {
      const t = s.t;
      for (const e of step(s, 'enemy')) if (e.type === 'rushWarning' || e.type === 'bossWarning') warns.push({ t, type: e.type });
    }
    expect(warns).toEqual([
      { t: 13, type: 'rushWarning' },
      { t: 33, type: 'rushWarning' },
      { t: 53, type: 'rushWarning' },
      { t: 73, type: 'rushWarning' },
      { t: 93, type: 'bossWarning' },
    ]);
  });

  it('ボスを倒すと 5,000 × 倒した数のボーナスが入る', () => {
    const s = quietGame();
    s.bossesKilled = 2;
    putEnemy(s, 'boss', B.bossSize, 1e-6);
    step(s, 'enemy');
    expect(s.score).toBe(B.bossSize * 1 * 10 + 5000 * 3);
  });

  it('埋まり度が容量に達したらゲームオーバーになり、以後は進まない', () => {
    const s = quietGame();
    putEnemy(s, 'boss', 99.5);
    expect(types(step(s, 'block'))).not.toContain('gameOver');
    putEnemy(s, 'spam', 0.5);
    expect(types(step(s, 'block'))).toContain('gameOver');
    expect(s.over).toBe(true);
    const tick = s.tick;
    expect(step(s, 'block')).toEqual([]);
    expect(s.tick).toBe(tick);
  });
});
