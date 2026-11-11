// 背景・道・敵・ブロック・プレイヤー・弾・エフェクトの描画（仕様書 6 章）。状態を読むだけで書き換えない。
import { B } from '../core/balance.ts';
import { bossName, dpsOf, weaponStage } from '../core/formulas.ts';
import type { GameState } from '../core/state.ts';
import { INK, circle, clamp, ellipse, fancyText, fillRoundRect, gradV, lerp, poly, text, type Ctx } from './draw.ts';
import { formatHp } from './format.ts';
import { BLOCK_LANE, CENTER_X, ENEMY_LANE, FRONT_Y, H, HALF_ROAD, HORIZON_Y, W, kOf, xOf, yOf } from './projection.ts';
import { BLOCK_NUMBER, BLOCK_TOP, HAT_COLORS, drawSprite, drawSpriteCentered, sprite } from './sprites.ts';
import { LOOK, TONE, type Bullet, type View } from './view.ts';

/** 帽子は 12 個まで積んで描き、それ以上は「×N」と数字で出す（仕様書 6.7 節） */
const MAX_HATS_DRAWN = 12;
/** 残り HP がこの割合を切ったブロックは赤く震える（7 章） */
const BLOCK_DANGER = 0.15;
/** 相棒を置く x。3 台目は真ん中 */
const BUDDY_X = [62, 238, 150] as const;
const BUDDY_BOTTOM = 884;
/** 橋の縁（道の外側の壁）の外端。u の値 */
const WALL = 1.1;
/** 銃口が光る武器の段階（火薬で撃つもの） */
const MUZZLE_STAGES = new Set([3, 4, 5, 6, 7, 8]);
/** 埋まり度がこの割合以上で、画面の縁を赤くし、防衛線の警告灯を回す */
const DANGER_RATIO = 0.7;

let background: HTMLCanvasElement | null = null;
let vignette: HTMLCanvasElement | null = null;

function offscreen(w: number, h: number, scale: number, draw: (c: Ctx) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const c = canvas.getContext('2d')!;
  c.scale(scale, scale);
  draw(c);
  return canvas;
}

/** 道の上の帯（u の範囲 × z の範囲）を塗る */
function band(c: Ctx, u0: number, u1: number, z0: number, z1: number, color: string | CanvasGradient): void {
  c.beginPath();
  c.moveTo(xOf(u0, z0), yOf(z0));
  c.lineTo(xOf(u1, z0), yOf(z0));
  c.lineTo(xOf(u1, z1), yOf(z1));
  c.lineTo(xOf(u0, z1), yOf(z1));
  c.closePath();
  c.fillStyle = color;
  c.fill();
}

/** 画面の y から、その高さでの縮小率を逆算する */
function kAtY(y: number): number {
  return 0.25 + ((y - HORIZON_Y) * 0.75) / (FRONT_Y - HORIZON_Y);
}

/** 番号から決まる 0〜1 の擬似乱数。見た目を毎回同じにするために使う */
function hash(i: number): number {
  const v = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
  return v - Math.floor(v);
}

// ---------------------------------------------------------------- 背景（起動時に 1 枚の絵にする）

function drawSky(c: Ctx): void {
  const sky = c.createLinearGradient(0, 0, 0, HORIZON_Y);
  sky.addColorStop(0, '#1877e6');
  sky.addColorStop(0.55, '#58bbff');
  sky.addColorStop(1, '#dff6ff');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, HORIZON_Y);
  const sun = c.createRadialGradient(430, 86, 0, 430, 86, 170);
  sun.addColorStop(0, 'rgba(255,255,240,0.95)');
  sun.addColorStop(0.12, 'rgba(255,250,210,0.75)');
  sun.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sun;
  c.fillRect(0, 0, W, HORIZON_Y);
}

function drawSkyline(c: Ctx): void {
  // 奥の列は淡く、手前の列は少し濃く。窓を点で入れる
  for (let layer = 0; layer < 2; layer++) {
    const tint = layer === 0 ? '#a9d6f3' : '#7fb9e2';
    const win = layer === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.5)';
    let x = layer === 0 ? -10 : -24;
    let i = layer * 31;
    while (x < W) {
      const w = 22 + hash(i) * 26;
      const h = (layer === 0 ? 34 : 18) + hash(i + 7) * (layer === 0 ? 54 : 44);
      c.fillStyle = tint;
      c.fillRect(x, HORIZON_Y - h, w, h);
      c.fillStyle = win;
      for (let wy = HORIZON_Y - h + 5; wy < HORIZON_Y - 5; wy += 7) {
        for (let wx = x + 4; wx < x + w - 4; wx += 6) if (hash(wx * 3 + wy) > 0.45) c.fillRect(wx, wy, 2.5, 3);
      }
      x += w + (hash(i + 3) > 0.6 ? 6 : 0);
      i++;
    }
  }
  // 塔と観覧車
  poly(c, [356, HORIZON_Y, 368, HORIZON_Y - 104, 372, HORIZON_Y - 104, 384, HORIZON_Y], '#f08a7a');
  c.fillStyle = '#ffffff';
  c.fillRect(361, HORIZON_Y - 62, 18, 4);
  c.fillRect(364, HORIZON_Y - 36, 12, 3);
  c.strokeStyle = '#c9a0e8';
  c.lineWidth = 2.5;
  c.beginPath();
  c.arc(96, HORIZON_Y - 40, 32, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.beginPath();
    c.moveTo(96, HORIZON_Y - 40);
    c.lineTo(96 + Math.cos(a) * 32, HORIZON_Y - 40 + Math.sin(a) * 32);
    c.stroke();
    circle(c, 96 + Math.cos(a) * 32, HORIZON_Y - 40 + Math.sin(a) * 32, 3, '#ffd23f');
  }
  poly(c, [90, HORIZON_Y, 96, HORIZON_Y - 40, 102, HORIZON_Y], '#b88fd8');
}

function drawSea(c: Ctx): void {
  const sea = c.createLinearGradient(0, HORIZON_Y, 0, H);
  sea.addColorStop(0, '#b6f0f5');
  sea.addColorStop(0.25, '#4fcfe0');
  sea.addColorStop(1, '#127fb0');
  c.fillStyle = sea;
  c.fillRect(0, HORIZON_Y, W, H - HORIZON_Y);
  // 波の筋。奥ほど細かく
  for (let i = 1; i < 40; i++) {
    const z = 1 - i / 40;
    const y = yOf(z * z);
    c.fillStyle = `rgba(255,255,255,${0.05 + 0.1 * hash(i)})`;
    c.fillRect(0, y, W, Math.max(1, 2.5 * kAtY(y)));
  }
}

function drawBridge(c: Ctx): void {
  // 橋の側面の影、縁の壁、路面
  band(c, -WALL - 0.05, WALL + 0.05, 0, 1, 'rgba(8,60,90,0.35)');
  band(c, -WALL, WALL, 0, 1, '#c5ccd9');
  band(c, -WALL + 0.035, WALL - 0.035, 0, 1, '#eef1f6');
  band(c, -1, 1, 0, 1, gradV(c, HORIZON_Y, FRONT_Y, '#7b8296', '#454a5c'));
  band(c, ENEMY_LANE.min, ENEMY_LANE.max, 0, 1, 'rgba(255,70,70,0.17)');
  band(c, BLOCK_LANE.min, BLOCK_LANE.max, 0, 1, 'rgba(70,160,255,0.2)');
  // 路面の継ぎ目
  for (let i = 1; i < 12; i++) {
    const z = i / 12;
    c.fillStyle = 'rgba(0,0,0,0.1)';
    c.fillRect(xOf(-1, z), yOf(z), xOf(1, z) - xOf(-1, z), Math.max(1, 2.5 * kOf(z)));
  }
  // 路肩の白線と、中央の分離帯
  for (const u of [-0.965, 0.965]) band(c, u - 0.012, u + 0.012, 0, 1, 'rgba(255,255,255,0.85)');
  band(c, -0.05, 0.05, 0, 1, '#3a3f4f');
  band(c, -0.034, 0.034, 0, 1, '#ffd23f');
  for (let i = 0; i < 30; i += 2) band(c, -0.034, 0.034, i / 30, (i + 1) / 30, '#2b2f3b');
  // 手すり。支柱を立て、上端を横木でつなぐ
  for (const side of [-1, 1]) {
    const u = side * (WALL - 0.02);
    c.strokeStyle = '#f7f9fc';
    c.lineCap = 'round';
    let px = 0;
    let py = 0;
    for (let i = 0; i <= 16; i++) {
      const z = (i / 16) ** 1.5;
      const k = kOf(z);
      const x = xOf(u, z);
      const y = yOf(z);
      const top = y - 34 * k;
      c.lineWidth = Math.max(1, 4 * k);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, top);
      c.stroke();
      if (i > 0) {
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(x, top);
        c.moveTo(px, py + (yOf(((i - 1) / 16) ** 1.5) - py) * 0.5);
        c.lineTo(x, top + (y - top) * 0.5);
        c.stroke();
      }
      px = x;
      py = top;
    }
  }
}

function drawPlatform(c: Ctx): void {
  c.fillStyle = gradV(c, FRONT_Y, H, '#444b5e', '#222631');
  c.fillRect(0, FRONT_Y, W, H - FRONT_Y);
  c.fillStyle = '#6b7388';
  c.fillRect(0, FRONT_Y, W, 4);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(0, FRONT_Y + 4, W, 3);
  for (let x = 24; x < W; x += 70) circle(c, x, FRONT_Y + 18, 2.5, 'rgba(255,255,255,0.18)');
  // 強化レーンの通過線
  const x0 = xOf(BLOCK_LANE.min, 0);
  const cell = (xOf(BLOCK_LANE.max, 0) - x0) / 12;
  for (let i = 0; i < 12; i++) {
    c.fillStyle = i % 2 ? '#f4f6fa' : '#2a2f3a';
    c.fillRect(x0 + i * cell, FRONT_Y - 9, cell + 0.5, 9);
  }
}

function drawBackground(c: Ctx): void {
  drawSky(c);
  drawSkyline(c);
  drawSea(c);
  drawBridge(c);
  // 遠くをかすませて奥行きを出す
  const haze = c.createLinearGradient(0, HORIZON_Y, 0, HORIZON_Y + 210);
  haze.addColorStop(0, 'rgba(225,246,255,0.62)');
  haze.addColorStop(1, 'rgba(225,246,255,0)');
  c.fillStyle = haze;
  c.fillRect(0, HORIZON_Y, W, 210);
  drawPlatform(c);
}

/** 画面の縁を赤くする枠。四辺それぞれ、縁から内側へ薄くなる */
function drawVignette(c: Ctx): void {
  const depth = 110;
  const edge = (x0: number, y0: number, x1: number, y1: number): void => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(255,0,0,0.8)');
    g.addColorStop(1, 'rgba(255,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  };
  edge(0, 0, depth, 0);
  edge(W, 0, W - depth, 0);
  edge(0, 0, 0, depth);
  edge(0, H, 0, H - depth);
}

export function initScene(): void {
  background = offscreen(W, H, 2, drawBackground);
  vignette = offscreen(W, H, 0.5, drawVignette);
}

// ---------------------------------------------------------------- 動く背景

function drawClouds(ctx: Ctx, time: number): void {
  for (let i = 0; i < 5; i++) {
    const span = W + 260;
    const x = ((hash(i) * span + time * (5 + i * 2.2)) % span) - 130;
    const scale = 0.55 + hash(i + 9) * 0.6;
    drawSpriteCentered(ctx, `cloud.${i % 3}`, x, 62 + hash(i + 4) * 120, scale);
  }
}

function drawSparkles(ctx: Ctx, time: number): void {
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 30; i++) {
    const a = Math.sin(time * (1.2 + hash(i) * 1.6) + i * 2.3);
    if (a <= 0) continue;
    const y = HORIZON_Y + 14 + hash(i + 50) ** 1.6 * (FRONT_Y - HORIZON_Y - 20);
    const k = kAtY(y);
    const edge = HALF_ROAD * (WALL + 0.08) * k;
    const room = CENTER_X - edge;
    const x = i % 2 ? hash(i + 20) * room : CENTER_X + edge + hash(i + 20) * room;
    ctx.globalAlpha = a * 0.8;
    ctx.fillRect(x - 9 * k, y, 18 * k, Math.max(1, 2.5 * k));
  }
  ctx.globalAlpha = 1;
}

/** レーンを手前へ流れる矢羽根。敵と強化が「流れてくる」向きを見せる */
function drawChevrons(ctx: Ctx, time: number): void {
  const count = 9;
  const phase = (time / B.blockTravel) % (1 / count);
  for (const lane of [ENEMY_LANE, BLOCK_LANE]) {
    const half = (lane.max - lane.min) * 0.3;
    for (let i = 0; i <= count; i++) {
      const z = (i + 1) / count - phase;
      if (z <= 0.04 || z >= 1) continue;
      const alpha = Math.min(1, z * 6, (1 - z) * 4) * 0.085;
      const z1 = z + 0.02 + z * 0.035;
      const tip = z - 0.045 - z * 0.06;
      ctx.beginPath();
      ctx.moveTo(xOf(lane.center - half, z), yOf(z));
      ctx.lineTo(xOf(lane.center, tip), yOf(tip));
      ctx.lineTo(xOf(lane.center + half, z), yOf(z));
      ctx.lineTo(xOf(lane.center + half, z1), yOf(z1));
      ctx.lineTo(xOf(lane.center, tip + (z1 - z)), yOf(tip + (z1 - z)));
      ctx.lineTo(xOf(lane.center - half, z1), yOf(z1));
      ctx.closePath();
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- 道の上のもの

function drawBarricade(ctx: Ctx, time: number, danger: boolean): void {
  const x0 = xOf(-0.99, 0);
  const x1 = xOf(-0.01, 0);
  const w = x1 - x0;
  const y = FRONT_Y - 24;
  fillRoundRect(ctx, x0 - 2, y - 2, w + 4, 28, 6, INK);
  ctx.fillStyle = gradV(ctx, y, y + 24, '#f4f6fa', '#aab2c2');
  ctx.fillRect(x0, y, w, 24);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y + 4, w, 12);
  ctx.clip();
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(x0, y + 4, w, 12);
  for (let x = x0 - 14; x < x1; x += 26) poly(ctx, [x, y + 16, x + 12, y + 16, x + 24, y + 4, x + 12, y + 4], '#22252c');
  ctx.restore();
  // 警告灯。埋まり度が上がると赤く回る
  for (const x of [x0 + 10, x1 - 10]) {
    const on = danger ? 0.55 + 0.45 * Math.sin(time * 14 + x) : 0.35;
    fillRoundRect(ctx, x - 6, y - 12, 12, 12, 4, INK);
    circle(ctx, x, y - 6, 4.2, danger ? `rgba(255,60,60,${on})` : `rgba(255,190,60,${on})`);
    if (danger) circle(ctx, x, y - 6, 12, `rgba(255,60,60,${on * 0.25})`);
  }
}

function drawEnemies(ctx: Ctx, s: GameState, v: View): void {
  const frontId = s.head < s.enemies.length ? s.enemies[s.head]!.id : -1;
  const hit = v.time - v.enemyHitAt < 0.07;
  // 列の後ろほど奥にいるので、後ろから描けば奥から手前の順になる
  for (let i = s.enemies.length - 1; i >= s.head; i--) {
    const e = s.enemies[i]!;
    const vis = v.enemies.get(e.id);
    if (!vis) continue;
    // 現れた瞬間は小さく、すぐ元の大きさへふくらむ
    const pop = vis.age < 0.18 ? 0.4 + (vis.age / 0.18) * 0.6 : 1;
    const scale = vis.scale * pop;
    const bob = Math.abs(Math.sin(v.time * 6 + vis.phase)) * 4 * scale;
    const front = e.id === frontId;
    const push = front && hit ? -3 * scale : 0;
    if (e.kind === 'boss') {
      const sp = sprite(vis.spriteId);
      const top = vis.y - sp.h * scale;
      if (e.bossIndex > 4) ellipse(ctx, vis.x, vis.y - (sp.h * scale) / 2, 120 * scale, 120 * scale, 'rgba(170,60,255,0.35)');
      drawSprite(ctx, vis.spriteId, vis.x, vis.y - bob * 0.5 + push, scale);
      if (front && hit) flashOver(ctx, vis.spriteId, vis.x, vis.y - bob * 0.5 + push, scale, 0.4);
      const bw = 170 * scale;
      const bh = Math.max(5, 13 * scale);
      const by = top - bh - 8 * scale;
      fillRoundRect(ctx, vis.x - bw / 2 - 2, by - 2, bw + 4, bh + 4, bh / 2 + 2, INK);
      const ratio = clamp(e.hp / e.hp0, 0, 1);
      if (ratio > 0) {
        ctx.fillStyle = gradV(ctx, by, by + bh, '#ff8f8f', '#e01f1f');
        fillRoundRectPath(ctx, vis.x - bw / 2, by, bw * ratio, bh, bh / 2);
      }
      fancyText(ctx, bossName(e.bossIndex), vis.x, by - 13 * scale - 3, { size: Math.max(12, 23 * scale), top: '#ffffff', bottom: '#ffd0d0', maxWidth: 240 });
    } else {
      drawSprite(ctx, vis.spriteId, vis.x, vis.y - bob + push, scale);
      if (front && hit) flashOver(ctx, vis.spriteId, vis.x, vis.y - bob + push, scale, 0.55);
    }
  }
}

/** 今の塗り（fillStyle）で角丸の四角を塗る */
function fillRoundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

/** 撃たれた瞬間に、白い版を重ねて光らせる */
function flashOver(ctx: Ctx, id: string, cx: number, bottom: number, scale: number, alpha: number): void {
  ctx.globalAlpha = alpha;
  drawSprite(ctx, `${id}#flash`, cx, bottom, scale);
  ctx.globalAlpha = 1;
}

/** 先頭のブロックを、今から撃ち続けて壊し切れるか（仕様書 6.5 節） */
export function canBreakInTime(s: GameState): boolean {
  const b = s.blocks[0];
  if (!b) return false;
  const need = b.hp / dpsOf(s.player.rank) + (s.player.lane === 'enemy' ? B.switchTime : 0);
  return need <= b.passAt - s.t;
}

function drawBlocks(ctx: Ctx, s: GameState, v: View): void {
  for (let i = s.blocks.length - 1; i >= 0; i--) {
    const b = s.blocks[i]!;
    const z = clamp((b.passAt - s.t) / B.blockTravel, 0, 1);
    const k = kOf(z);
    const ratio = clamp(b.hp / b.maxHp, 0, 1);
    const front = i === 0;
    const danger = ratio < BLOCK_DANGER;
    const beingHit = front && v.time - v.blockHitAt < 0.1;
    const amp = (beingHit ? 2.5 : 0) + (danger ? 3 : 0);
    const cx = xOf(BLOCK_LANE.center, z) + Math.sin(v.time * 71 + i) * amp * k;
    // 少し浮かせて、ゆっくり上下させる
    const hover = (5 + Math.sin(v.time * 2.4 + b.id) * 3) * k;
    const bottom = yOf(z) - hover + Math.cos(v.time * 83 + i) * amp * 0.5 * k;
    // 足元の光と影
    const glow = sprite(`glow.${b.kind}`).canvas;
    ctx.globalAlpha = 0.55 + 0.15 * Math.sin(v.time * 3 + b.id);
    ctx.drawImage(glow, cx - 115 * k, yOf(z) - 20 * k, 230 * k, 44 * k);
    ctx.globalAlpha = 1;
    ellipse(ctx, cx, yOf(z) + 2 * k, 70 * k, 8 * k, 'rgba(10,14,30,0.35)');
    drawSprite(ctx, `block.${b.kind}`, cx, bottom, k);
    if (beingHit && v.time - v.blockHitAt < 0.05) flashOver(ctx, `block.${b.kind}`, cx, bottom, k, 0.3);
    if (danger) {
      ctx.fillStyle = `rgba(255,40,40,${0.25 + 0.2 * Math.sin(v.time * 30)})`;
      ctx.fillRect(cx - 75 * k, bottom - (110 - BLOCK_TOP) * k, 150 * k, (110 - BLOCK_TOP) * k);
    }
    // 残り HP の数字。先頭だけ、間に合うなら白、間に合わないなら赤。先頭以外は灰色
    const color = front ? (canBreakInTime(s) ? '#ffffff' : '#ff5c5c') : '#c9ced8';
    const nx = b.kind === 'trap' ? cx : cx + BLOCK_NUMBER.dx * k;
    const size = (b.kind === 'trap' ? 30 : 36) * k;
    text(ctx, formatHp(b.hp), nx, bottom - (b.kind === 'trap' ? 40 : BLOCK_NUMBER.up) * k, {
      size,
      weight: 900,
      color,
      stroke: INK,
      strokeWidth: Math.max(2, size * 0.22),
      maxWidth: BLOCK_NUMBER.maxWidth * k,
    });
    const bw = 126 * k;
    const bh = 9 * k;
    const bx = cx - bw / 2;
    const by = bottom - 19 * k;
    fillRoundRect(ctx, bx - 1.5 * k, by - 1.5 * k, bw + 3 * k, bh + 3 * k, bh, INK);
    if (ratio > 0) fillRoundRect(ctx, bx, by, bw * ratio, bh, bh / 2, danger ? '#ff5c5c' : '#ffffff');
  }
}

function drawBuddies(ctx: Ctx, s: GameState, v: View): void {
  // 相棒はレーンに関係なく、いつも敵レーンの先頭を撃っている
  const front = !s.over && s.head < s.enemies.length ? v.enemies.get(s.enemies[s.head]!.id) : undefined;
  for (let i = 0; i < s.player.buddies; i++) {
    const x = BUDDY_X[i]! + Math.sin(v.time * 3 + i * 2.1) * 3;
    if (front) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(105,240,138,${0.35 + 0.3 * Math.sin(v.time * 40 + i * 2)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, BUDDY_BOTTOM - 20);
      ctx.lineTo(front.x, front.y - 12 * front.scale);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    drawSprite(ctx, 'buddy', x, BUDDY_BOTTOM);
  }
}

function drawPlayer(ctx: Ctx, s: GameState, v: View): void {
  const m = v.muzzle();
  const x = m.x - LOOK.weaponDx;
  const stage = weaponStage(s.player.rank);
  const bottom = LOOK.playerBottom + Math.sin(v.time * 4) * 1.2;
  // ランクが上がった直後は足元から光る
  const glowAge = v.time - v.rankUpAt;
  if (glowAge < 0.5) {
    ctx.globalAlpha = 1 - glowAge / 0.5;
    drawSpriteCentered(ctx, 'glow.gold', x, bottom - 48, 1.6 + glowAge * 2);
    ctx.globalAlpha = 1;
  }
  drawSprite(ctx, 'player', x, bottom);
  const hats = Math.min(s.player.hats, MAX_HATS_DRAWN);
  for (let i = 0; i < hats; i++) drawSprite(ctx, `hat.${i % HAT_COLORS.length}`, x, bottom - 89 - i * 8);
  if (s.player.hats > MAX_HATS_DRAWN) {
    text(ctx, `×${s.player.hats}`, x - 40, bottom - 95 - hats * 8, { size: 18, stroke: INK });
  }
  const sinceShot = v.time - v.shotAt;
  const recoil = v.shooting ? clamp(1 - sinceShot / 0.06, 0, 1) * 3.5 : 0;
  drawSprite(ctx, `weapon.${stage}`, x + LOOK.weaponDx, bottom - LOOK.weaponUp + recoil);
  if (v.shooting && sinceShot < 0.05 && MUZZLE_STAGES.has(stage)) {
    ctx.globalCompositeOperation = 'lighter';
    drawSpriteCentered(ctx, 'muzzle', m.x, m.y - 6, 0.5 + (stage - 3) * 0.07, v.time * 40);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawBeam(ctx: Ctx, s: GameState, v: View): void {
  const stage = weaponStage(s.player.rank);
  if (!v.shooting || (stage !== 9 && stage !== 10)) return;
  const m = v.muzzle();
  const flicker = 0.75 + 0.25 * Math.sin(v.time * 90);
  const wide = stage === 10;
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  const pass = (width: number, color: string): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(v.aim.x, v.aim.y);
    ctx.stroke();
  };
  pass((wide ? 30 : 12) * flicker, wide ? 'rgba(90,170,255,0.35)' : 'rgba(255,40,40,0.35)');
  pass((wide ? 15 : 5) * flicker, wide ? 'rgba(170,225,255,0.85)' : 'rgba(255,90,80,0.95)');
  ctx.globalCompositeOperation = 'source-over';
  pass(wide ? 5 : 1.8, '#ffffff');
  circle(ctx, v.aim.x, v.aim.y, (wide ? 16 : 9) * flicker * Math.max(0.5, v.aim.k), wide ? 'rgba(200,235,255,0.8)' : 'rgba(255,200,190,0.8)');
}

function drawBullet(ctx: Ctx, b: Bullet): void {
  const t = clamp(b.age / LOOK.bulletTime, 0, 1);
  const x = lerp(b.x0, b.x1, t);
  const y = lerp(b.y0, b.y1, t);
  const k = lerp(1, b.k1, t);
  const dx = b.x1 - b.x0;
  const dy = b.y1 - b.y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;
  const tracer = (length: number, width: number, color: string): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - nx * length * k, y - ny * length * k);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const dot = (r: number, color: string): void => circle(ctx, x, y, r * k, color);
  switch (b.stage) {
    case 0:
      tracer(16, 5, 'rgba(111,216,255,0.55)');
      dot(6, '#9be8ff');
      dot(2.5, '#ffffff');
      break;
    case 1:
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5 * k;
      ctx.beginPath();
      ctx.ellipse(x, y, 9 * k, 5.5 * k, b.spin + t * 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#d99a52';
      ctx.lineWidth = 2.6 * k;
      ctx.stroke();
      break;
    case 2:
      dot(5.5, INK);
      dot(4, '#ecc973');
      break;
    case 3:
      tracer(10, 3, 'rgba(255,255,255,0.4)');
      dot(4, '#ffffff');
      break;
    case 4:
      tracer(18, 6, 'rgba(255,190,60,0.45)');
      tracer(8, 5, '#ffe066');
      break;
    case 5:
      tracer(10, 3, 'rgba(255,220,100,0.5)');
      dot(3.8, '#fff3a0');
      break;
    case 6:
      tracer(34, 5, 'rgba(255,200,80,0.35)');
      tracer(30, 2.2, '#fff8c4');
      break;
    case 7:
      tracer(40, 9, 'rgba(255,150,60,0.35)');
      tracer(34, 5, '#ffb347');
      tracer(14, 2, '#ffffff');
      break;
    case 8:
      for (let i = 1; i <= 4; i++) circle(ctx, x - nx * i * 11 * k, y - ny * i * 11 * k, (5 + i * 1.8) * k, `rgba(235,235,235,${0.55 - i * 0.11})`);
      tracer(12, 10, '#ff7a1a');
      tracer(16, 8, '#5d7a3a');
      break;
    case 11:
      ellipse(ctx, x, y + 3 * k, 13 * k, 6.5 * k, INK);
      ellipse(ctx, x, y + 3 * k, 11.5 * k, 5.5 * k, '#ffffff');
      fillRoundRect(ctx, x - 8 * k, y - 5 * k, 16 * k, 7 * k, 3 * k, '#e8452f');
      break;
    case 12:
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(b.spin + t * 8);
      fillRoundRect(ctx, -12.5 * k, -8.5 * k, 25 * k, 17 * k, 3 * k, INK);
      fillRoundRect(ctx, -11 * k, -7 * k, 22 * k, 14 * k, 2.5 * k, '#f5b800');
      ctx.fillStyle = '#7a4b00';
      ctx.fillRect(-11 * k, -3 * k, 22 * k, 3 * k);
      ctx.restore();
      break;
    case 13:
      text(ctx, '既読', x, y, { size: 21 * k, color: '#d7f5d9', stroke: '#1f6f3a' });
      break;
    case 14:
      text(ctx, 'お先に失礼します', x, y, { size: 16 * k, color: '#fff3bf', stroke: '#8a5a00' });
      break;
  }
}

function drawEffects(ctx: Ctx, v: View): void {
  ctx.globalCompositeOperation = 'lighter';
  for (const b of v.bullets) if (b.stage >= 3 && b.stage <= 7) drawBullet(ctx, b);
  ctx.globalCompositeOperation = 'source-over';
  for (const b of v.bullets) if (b.stage < 3 || b.stage > 7) drawBullet(ctx, b);
  for (const r of v.rings) {
    const t = r.age / LOOK.ringLife;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = Math.max(1, 5 * (1 - t));
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius * (0.25 + 0.75 * t * (2 - t)), 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const p of v.particles) {
    ctx.globalAlpha = clamp(1 - p.age / p.life, 0, 1);
    ctx.fillStyle = p.color;
    if (p.size < 5) {
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const n of v.numbers) {
    const t = n.age / LOOK.numberLife;
    const pop = n.age < 0.07 ? 1.5 - (n.age / 0.07) * 0.5 : 1;
    const tone = n.block ? TONE.gold : TONE.white;
    ctx.globalAlpha = clamp(1.7 - t * 1.7, 0, 1);
    ctx.save();
    ctx.translate(n.x, n.y - t * 38);
    ctx.rotate(n.tilt);
    fancyText(ctx, n.label, 0, 0, { size: 19 * pop, top: tone[0], bottom: tone[1], strokeWidth: 4, shadow: 1.5 });
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** ゲームオーバー: 敵が防衛線を越えて画面を覆う */
function drawFlood(ctx: Ctx, v: View): void {
  const t = v.time - v.overAt;
  const ids = ['enemy.notice.0', 'enemy.notice.3', 'enemy.spam', 'enemy.deadline', 'enemy.notice.5', 'enemy.revolving'];
  for (let i = 0; i < 64; i++) {
    const p = clamp((t - hash(i + 100) * 0.6) / 0.9, 0, 1);
    if (p <= 0) continue;
    const x = CENTER_X + (hash(i) - 0.5) * 600;
    const y = 800 + p * p * 420 + hash(i + 200) * 60;
    drawSprite(ctx, ids[i % ids.length]!, x, y, 1.2 + p * 3.2);
  }
  ctx.fillStyle = `rgba(120,0,0,${clamp(t / 1.5, 0, 1) * 0.5})`;
  ctx.fillRect(0, 0, W, H);
}

function drawLaneOverlays(ctx: Ctx, s: GameState, v: View): void {
  if (s.t < s.vacationUntil) {
    band(ctx, ENEMY_LANE.min, ENEMY_LANE.max, 0, 1, 'rgba(120,220,255,0.22)');
    const left = s.vacationUntil - s.t;
    fancyText(ctx, `有給休暇中 あと ${left.toFixed(1)} 秒`, xOf(ENEMY_LANE.center, 0), 610, { size: 19, top: '#ffffff', bottom: '#bff4ff', stroke: '#0b5e78' });
  }
  // 今いるレーンの足元を光らせて、どちらを撃っているか分かるようにする
  if (!s.over) {
    const lane = s.player.lane === 'enemy' ? ENEMY_LANE : BLOCK_LANE;
    band(ctx, lane.min, lane.max, 0, 0.06, `rgba(255,255,255,${0.14 + 0.06 * Math.sin(v.time * 6)})`);
  }
  if (v.bombWaveAt >= 0) {
    const p = (v.time - v.bombWaveAt) / LOOK.bombWaveTime;
    if (p < 1) band(ctx, ENEMY_LANE.min, ENEMY_LANE.max, Math.max(0, p - 0.12), Math.min(1, p + 0.04), `rgba(255,255,255,${0.9 * (1 - p * 0.5)})`);
  }
}

export function drawScene(ctx: Ctx, s: GameState, v: View): void {
  const ratio = s.fill / s.capacity;
  const danger = ratio >= DANGER_RATIO && v.overAt < 0;
  ctx.save();
  if (v.shakeLeft > 0) {
    const amp = LOOK.shakeMax * clamp(v.shakeLeft / LOOK.bossShakeTime, 0, 1);
    ctx.translate(Math.sin(v.time * 97) * amp, Math.cos(v.time * 113) * amp);
  }
  ctx.drawImage(background!, 0, 0, W, H);
  drawClouds(ctx, v.time);
  drawSparkles(ctx, v.time);
  drawChevrons(ctx, v.time);
  drawLaneOverlays(ctx, s, v);
  drawBlocks(ctx, s, v);
  drawEnemies(ctx, s, v);
  drawBarricade(ctx, v.time, danger);
  drawBuddies(ctx, s, v);
  drawPlayer(ctx, s, v);
  drawBeam(ctx, s, v);
  drawEffects(ctx, v);
  if (v.overAt >= 0) drawFlood(ctx, v);
  ctx.restore();

  if (danger) {
    // 割合が上がるほど濃く、速く脈打つ
    const d = clamp((ratio - DANGER_RATIO) / (1 - DANGER_RATIO), 0, 1);
    ctx.globalAlpha = (0.35 + 0.45 * d) * (0.6 + 0.4 * Math.sin(v.time * (5 + d * 7)));
    ctx.drawImage(vignette!, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  if (v.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${v.flash})`;
    ctx.fillRect(0, 0, W, H);
  }
}
