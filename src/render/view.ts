// 見た目だけの状態（敵の位置、弾、ダメージの数字、破片、演出のタイマー）。
// ロジックの状態を読むだけで、ロジックには影響を与えない（仕様書 6 章・7 章）。
import { B, type BlockKind, type EnemyKind, type Lane } from '../core/balance.ts';
import { bossName, dpsOf, fireRate, weaponName, weaponStage } from '../core/formulas.ts';
import { mulberry32 } from '../core/rng.ts';
import type { Enemy, GameEvent, GameState } from '../core/state.ts';
import { clamp } from './draw.ts';
import { formatNumber } from './format.ts';
import { BLOCK_LANE, ENEMY_LANE, HALF_ROAD, kOf, xOf, yOf } from './projection.ts';
import { BLOCK_COLORS, ENEMY_COLORS, NOTICE_VARIANTS, WEAPON_SPRITE, sprite } from './sprites.ts';

/** 効果音の出口。デモ中は null を渡して鳴らさない */
export interface Sfx {
  shot(stage: number): void;
  blockHit(): void;
  kill(): void;
  blockBreak(): void;
  rankUp(stageChanged: boolean): void;
  miss(): void;
  trap(): void;
  bomb(): void;
  rushWarning(): void;
  bossWarning(): void;
  bossKill(): void;
  gameOver(): void;
}

/** 見た目の決まりごと（仕様書 6.2 節・7 章の数値） */
export const LOOK = {
  /** 敵の目標 z = front + span × (前にいる敵のサイズ合計 + 自分の半分) ÷ 容量 */
  enemyFront: 0.03,
  enemySpan: 0.94,
  /** 敵が目標の z に近づく速さ（毎秒） */
  enemySpeed: 0.35,
  /** リボ払いが育ち切ったときの大きさ */
  revolvingMaxScale: 1.4,
  bulletTime: 0.12,
  maxBullets: 100,
  maxNumbers: 60,
  maxParticles: 400,
  numberLife: 0.6,
  /** 画面が白く光る時間と、次に光るまでの最短間隔（1 秒に 3 回を超えない） */
  flashTime: 0.1,
  flashGap: 0.34,
  flashAlpha: 0.45,
  shakeMax: 6,
  bossShakeTime: 0.3,
  warningTime: 2,
  bossIntroTime: 1.6,
  bombWaveTime: 0.45,
  /** プレイヤーの足元の y */
  playerBottom: 904,
} as const;

export interface EnemyVis {
  u: number;
  z: number;
  variant: number;
  phase: number;
  /** 直近の描画位置（下端の中央）と倍率。破片と弾の狙いに使う */
  x: number;
  y: number;
  scale: number;
  spriteId: string;
}

export interface Bullet {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 着弾点での縮小率 */
  k1: number;
  age: number;
  stage: number;
  lane: Lane;
  /** 着弾時に出す表示ダメージ。0 なら数字を出さない */
  damage: number;
  spin: number;
}

export interface FloatNumber {
  x: number;
  y: number;
  age: number;
  label: string;
  color: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  age: number;
  life: number;
  size: number;
  color: string;
}

export interface Toast {
  key: string;
  label: string;
  x: number;
  y: number;
  size: number;
  color: string;
  start: number;
  life: number;
}

export interface Aim {
  x: number;
  y: number;
  k: number;
  /** 標的がある（数字を出す）か、何もない地平線か */
  hit: boolean;
}

const EFFECT_LABEL: Readonly<Record<BlockKind, string>> = {
  rank: 'ランクアップ！',
  gold: 'ランク +2！！',
  buddy: '相棒 参上！',
  bomb: '一斉削除！',
  vacation: '有給休暇！',
  expand: '増築！',
  trap: '罠だ！！',
  hat: '帽子ゲット…',
};

export function laneX(lane: Lane): number {
  return xOf(lane === 'enemy' ? ENEMY_LANE.center : BLOCK_LANE.center, 0);
}

/** プレイヤーの今の x。切り替え中は 2 つのレーンの間を滑る */
export function playerX(s: GameState): number {
  const p = s.player;
  const to = laneX(p.lane);
  if (p.switchLeft <= 0) return to;
  const from = laneX(p.lane === 'enemy' ? 'block' : 'enemy');
  const t = clamp(1 - p.switchLeft / B.switchTime, 0, 1);
  return from + (to - from) * t * (2 - t);
}

export function enemySpriteId(kind: EnemyKind | 'boss', variant: number, bossIndex: number): string {
  if (kind === 'boss') return `boss.${(bossIndex - 1) % 4}`;
  return kind === 'notice' ? `enemy.notice.${variant}` : `enemy.${kind}`;
}

export class View {
  time = 0;
  readonly enemies = new Map<number, EnemyVis>();
  bullets: Bullet[] = [];
  numbers: FloatNumber[] = [];
  particles: Particle[] = [];
  toasts: Toast[] = [];
  flash = 0;
  shakeLeft = 0;
  /** 一斉削除の白い帯が走り始めた時刻。なければ負 */
  bombWaveAt = -1;
  warning: { boss: boolean; name: string; until: number } | null = null;
  bossIntro: { name: string; start: number } | null = null;
  /** ゲームオーバーになった時刻。なければ負 */
  overAt = -1;
  /** 先頭のブロックに最後に弾が当たった時刻 */
  blockHitAt = -1;
  /** 最後に発射した時刻（武器の反動用） */
  shotAt = -1;
  /** 今撃っているか（切り替え中・ゲームオーバー後は偽） */
  shooting = false;
  aim: Aim = { x: 0, y: 0, k: 1, hit: false };
  /** 先頭のブロックの直近の位置（壊れたときの破片用） */
  private frontBlock = { x: laneX('block'), y: yOf(0.5), k: kOf(0.5) };
  private fireAcc = 0;
  private lastFlashAt = -1;
  private readonly rnd: () => number;
  private readonly sfx: Sfx | null;

  constructor(seed: number, sfx: Sfx | null) {
    this.rnd = mulberry32(seed ^ 0x5eed);
    this.sfx = sfx;
  }

  // ---------------------------------------------------------------- 毎フレームの更新

  update(dt: number, s: GameState): void {
    this.time += dt;
    this.updateEnemies(dt, s);
    this.updateAim(s);
    this.updateShooting(dt, s);
    this.updateBullets(dt);
    this.numbers = this.numbers.filter((n) => (n.age += dt) < LOOK.numberLife);
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    this.toasts = this.toasts.filter((t) => this.time - t.start < t.life);
    this.flash = Math.max(0, this.flash - (LOOK.flashAlpha / LOOK.flashTime) * dt);
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    if (this.warning && this.time >= this.warning.until) this.warning = null;
    if (this.bossIntro && this.time - this.bossIntro.start >= LOOK.bossIntroTime) this.bossIntro = null;
  }

  private newEnemyVis(e: Enemy): EnemyVis {
    const variant = Math.floor(this.rnd() * NOTICE_VARIANTS.length);
    const spriteId = enemySpriteId(e.kind, variant, e.bossIndex);
    // スプライトが道からはみ出さないよう、幅の半分だけ内側に寄せる
    const margin = Math.min(0.4, sprite(spriteId).w / 2 / HALF_ROAD);
    const lo = ENEMY_LANE.min + margin;
    const hi = ENEMY_LANE.max - margin;
    const u = e.kind === 'boss' ? ENEMY_LANE.center : lo + (hi - lo) * this.rnd();
    return { u, z: 1, variant, phase: this.rnd() * Math.PI * 2, x: xOf(u, 1), y: yOf(1), scale: kOf(1), spriteId };
  }

  private updateEnemies(dt: number, s: GameState): void {
    let ahead = 0;
    const move = LOOK.enemySpeed * dt;
    for (let i = s.head; i < s.enemies.length; i++) {
      const e = s.enemies[i]!;
      let v = this.enemies.get(e.id);
      if (!v) {
        v = this.newEnemyVis(e);
        this.enemies.set(e.id, v);
      }
      const target = Math.min(1, LOOK.enemyFront + (LOOK.enemySpan * (ahead + e.size / 2)) / s.capacity);
      v.z = v.z > target ? Math.max(target, v.z - move) : Math.min(target, v.z + move);
      ahead += e.size;
      const grow = e.kind === 'revolving' ? 1 + (LOOK.revolvingMaxScale - 1) * clamp((s.t - e.born) / B.revolvingTime, 0, 1) : 1;
      v.scale = kOf(v.z) * grow;
      v.x = xOf(v.u, v.z);
      v.y = yOf(v.z);
    }
  }

  private updateAim(s: GameState): void {
    const lane = s.player.lane;
    if (lane === 'enemy') {
      const front = s.head < s.enemies.length ? this.enemies.get(s.enemies[s.head]!.id) : undefined;
      if (front) {
        const h = sprite(front.spriteId).h * front.scale;
        this.aim = { x: front.x, y: front.y - h / 2, k: front.scale, hit: true };
        return;
      }
    } else {
      const b = s.blocks[0];
      if (b) {
        const z = clamp((b.passAt - s.t) / B.blockTravel, 0, 1);
        const k = kOf(z);
        this.frontBlock = { x: xOf(BLOCK_LANE.center, z), y: yOf(z) - 48 * k, k };
        this.aim = { ...this.frontBlock, hit: true };
        return;
      }
    }
    // 標的がなければ、弾は地平線まで飛んで消える
    const u = lane === 'enemy' ? ENEMY_LANE.center : BLOCK_LANE.center;
    this.aim = { x: xOf(u, 1), y: yOf(1), k: kOf(1), hit: false };
  }

  private muzzle(s: GameState): { x: number; y: number } {
    return { x: playerX(s) + 27, y: LOOK.playerBottom - 40 - WEAPON_SPRITE.h + 4 };
  }

  private updateShooting(dt: number, s: GameState): void {
    this.shooting = !s.over && s.player.switchLeft <= 0;
    if (!this.shooting) {
      this.fireAcc = 0;
      return;
    }
    const rate = fireRate(s.player.rank);
    this.fireAcc += rate * dt;
    const damage = dpsOf(s.player.rank) / rate;
    while (this.fireAcc >= 1) {
      this.fireAcc -= 1;
      this.fire(s, damage);
    }
  }

  private fire(s: GameState, damage: number): void {
    const stage = weaponStage(s.player.rank);
    const lane = s.player.lane;
    const { x, y } = this.muzzle(s);
    const a = this.aim;
    this.shotAt = this.time;
    this.sfx?.shot(stage);
    // ねこ・レーザー・波動砲は弾を飛ばさず、その場で当たる
    if (stage === 15 || stage === 9 || stage === 10) {
      if (a.hit) this.impact(a.x, a.y, damage, lane, stage === 15);
      return;
    }
    const add = (dx: number, dmg: number): void => {
      if (this.bullets.length >= LOOK.maxBullets) this.bullets.shift();
      this.bullets.push({ x0: x, y0: y, x1: a.x + dx, y1: a.y, k1: a.k, age: 0, stage, lane, damage: a.hit ? dmg : 0, spin: this.rnd() * 6.28 });
    };
    if (stage === 5) {
      // ショットガンは扇状に 5 発。数字は真ん中の 1 発だけが出す
      for (let i = -2; i <= 2; i++) add(i * 16 * a.k, i === 0 ? damage : 0);
    } else if (stage === 2) {
      add((this.rnd() - 0.5) * 60 * a.k, damage);
    } else {
      add((this.rnd() - 0.5) * 14 * a.k, damage);
    }
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      b.age += dt;
      if (b.age >= LOOK.bulletTime && b.damage > 0) this.impact(b.x1, b.y1, b.damage, b.lane, false);
    }
    this.bullets = this.bullets.filter((b) => b.age < LOOK.bulletTime);
  }

  private impact(x: number, y: number, damage: number, lane: Lane, sparkle: boolean): void {
    if (this.numbers.length >= LOOK.maxNumbers) this.numbers.shift();
    this.numbers.push({
      x: x + (this.rnd() - 0.5) * 30,
      y: y - 6 + (this.rnd() - 0.5) * 10,
      age: 0,
      label: formatNumber(damage),
      color: lane === 'block' ? '#ffe066' : '#ffffff',
    });
    this.burst(x, y, 1, sparkle ? '#ffb3d9' : '#fff7c2', 60, 0.25, 3);
    if (lane === 'block') {
      this.blockHitAt = this.time;
      this.sfx?.blockHit();
    }
  }

  /** 破片を散らす */
  burst(x: number, y: number, count: number, color: string, speed: number, life: number, size: number, gravity = 500): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= LOOK.maxParticles) this.particles.shift();
      const a = this.rnd() * Math.PI * 2;
      const v = speed * (0.4 + this.rnd() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.5,
        gravity,
        age: 0,
        life: life * (0.7 + this.rnd() * 0.6),
        size: size * (0.6 + this.rnd() * 0.8),
        color,
      });
    }
  }

  private toast(key: string, label: string, x: number, y: number, size: number, color: string, life: number): void {
    this.toasts = this.toasts.filter((t) => t.key !== key);
    this.toasts.push({ key, label, x, y, size, color, start: this.time, life });
  }

  private flashScreen(): void {
    if (this.time - this.lastFlashAt < LOOK.flashGap) return;
    this.lastFlashAt = this.time;
    this.flash = LOOK.flashAlpha;
  }

  // ---------------------------------------------------------------- 出来事への反応

  handle(events: readonly GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'enemyKill': {
          const v = this.enemies.get(e.id);
          this.enemies.delete(e.id);
          if (!v) break;
          const h = sprite(v.spriteId).h * v.scale;
          if (e.kind === 'boss') {
            this.burst(v.x, v.y - h / 2, 70, ENEMY_COLORS.boss, 420, 0.9, 12 * v.scale + 4);
            this.burst(v.x, v.y - h / 2, 40, '#ff6b3d', 300, 0.7, 10 * v.scale + 3);
            this.shakeLeft = LOOK.bossShakeTime;
            this.flashScreen();
          } else {
            this.burst(v.x, v.y - h / 2, e.byBomb ? 2 : 4, e.byBomb ? '#ffffff' : ENEMY_COLORS[e.kind], 140 * v.scale + 40, 0.4, 7 * v.scale + 1.5);
            if (!e.byBomb) this.sfx?.kill();
          }
          break;
        }
        case 'blockBreak': {
          const f = this.frontBlock;
          this.burst(f.x, f.y, 16, BLOCK_COLORS[e.kind], 260 * f.k + 60, 0.6, 12 * f.k + 2);
          const bad = e.kind === 'trap';
          this.toast('effect', EFFECT_LABEL[e.kind], 270, 352, bad ? 46 : 38, bad ? '#ff4d4d' : e.kind === 'hat' ? '#ffb3d9' : '#ffffff', 0.9);
          this.sfx?.blockBreak();
          if (e.kind === 'trap') {
            this.burst(f.x, f.y, 14, 'rgba(220,40,40,0.8)', 120, 0.9, 16, -60);
            this.burst(xOf(ENEMY_LANE.center, 1), yOf(1), 14, 'rgba(220,40,40,0.8)', 70, 1.0, 10, -40);
            this.sfx?.trap();
          } else if (e.kind === 'bomb') {
            this.bombWaveAt = this.time;
            this.sfx?.bomb();
          }
          break;
        }
        case 'rankUp':
          this.flashScreen();
          if (e.stageChanged) this.toast('weapon', weaponName(e.rank), 270, 440, 54, '#ffe066', 1.0);
          this.sfx?.rankUp(e.stageChanged);
          break;
        case 'blockPass':
          if (e.damaged) {
            this.toast('miss', '惜しい！', laneX('block'), 790, 36, '#ff8787', 0.8);
            this.sfx?.miss();
          }
          break;
        case 'rushWarning':
          this.warning = { boss: false, name: '', until: this.time + LOOK.warningTime };
          this.sfx?.rushWarning();
          break;
        case 'bossWarning':
          this.warning = { boss: true, name: bossName(e.index), until: this.time + LOOK.warningTime };
          this.sfx?.bossWarning();
          break;
        case 'bossSpawn':
          this.bossIntro = { name: bossName(e.index), start: this.time };
          break;
        case 'bossKill':
          this.toast('effect', `${bossName(e.index)} 撃破！`, 270, 352, 40, '#ffe066', 1.4);
          this.sfx?.bossKill();
          break;
        case 'gameOver':
          this.overAt = this.time;
          this.sfx?.gameOver();
          break;
        case 'enemySpawn':
        case 'blockSpawn':
          break;
      }
    }
  }
}

