// 道・敵・ブロック・プレイヤー・弾・エフェクトの描画（仕様書 6 章）。状態を読むだけで書き換えない。
import { B, type Lane } from '../core/balance.ts';
import { bossName, dpsOf, weaponStage } from '../core/formulas.ts';
import type { GameState } from '../core/state.ts';
import { clamp, ellipse, fillRoundRect, lerp, poly, text, type Ctx } from './draw.ts';
import { formatHp } from './format.ts';
import { BLOCK_LANE, CENTER_X, ENEMY_LANE, FRONT_Y, H, HORIZON_Y, W, kOf, xOf, yOf } from './projection.ts';
import { BLOCK_TOP, HAT_COLORS, drawSprite, sprite } from './sprites.ts';
import { LOOK, laneX, playerX, type Bullet, type View } from './view.ts';

/** 帽子は 12 個まで積んで描き、それ以上は「×N」と数字で出す（仕様書 6.7 節） */
const MAX_HATS_DRAWN = 12;
/** 残り HP がこの割合を切ったブロックは赤く震える（7 章） */
const BLOCK_DANGER = 0.15;
/** 相棒を置く x。3 台目は真ん中 */
const BUDDY_X = [62, 238, 150] as const;
const BUDDY_BOTTOM = 880;

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

/** レーンの床（u の範囲）を z0〜z1 の帯で塗る */
function laneBand(c: Ctx, u0: number, u1: number, z0: number, z1: number, color: string): void {
  poly(c, [xOf(u0, z0), yOf(z0), xOf(u1, z0), yOf(z0), xOf(u1, z1), yOf(z1), xOf(u0, z1), yOf(z1)], color);
}

function drawBackground(c: Ctx): void {
  // 空
  const sky = c.createLinearGradient(0, 0, 0, HORIZON_Y);
  sky.addColorStop(0, '#1f8fe8');
  sky.addColorStop(1, '#c9eeff');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, HORIZON_Y);
  for (const [x, y, r] of [[90, 150, 34], [130, 158, 26], [400, 120, 38], [450, 130, 28], [300, 196, 22]] as const) {
    ellipse(c, x, y, r * 1.5, r * 0.55, 'rgba(255,255,255,0.75)');
  }
  // 遠くの街並み
  const heights = [26, 44, 18, 58, 34, 22, 50, 30, 64, 24, 40, 20, 54, 32, 46, 28, 38, 60];
  heights.forEach((h, i) => {
    c.fillStyle = i % 2 ? '#8dbfe0' : '#9fcdea';
    c.fillRect(i * 30, HORIZON_Y - h, 31, h);
  });
  // 地面
  const ground = c.createLinearGradient(0, HORIZON_Y, 0, H);
  ground.addColorStop(0, '#8fdc79');
  ground.addColorStop(1, '#3f9f4a');
  c.fillStyle = ground;
  c.fillRect(0, HORIZON_Y, W, H - HORIZON_Y);
  for (let i = 0; i < 12; i += 2) {
    c.fillStyle = 'rgba(0,0,0,0.05)';
    c.fillRect(0, yOf((i + 1) / 12), W, yOf(i / 12) - yOf((i + 1) / 12));
  }
  // 道
  laneBand(c, -1.06, 1.06, 0, 1, '#e9edf2');
  laneBand(c, -1, 1, 0, 1, '#596072');
  laneBand(c, ENEMY_LANE.min, ENEMY_LANE.max, 0, 1, 'rgba(255,90,90,0.13)');
  laneBand(c, BLOCK_LANE.min, BLOCK_LANE.max, 0, 1, 'rgba(90,170,255,0.16)');
  for (let i = 1; i < 10; i++) {
    const z = i / 10;
    c.fillStyle = 'rgba(255,255,255,0.07)';
    c.fillRect(xOf(-1, z), yOf(z), xOf(1, z) - xOf(-1, z), Math.max(1, 3 * kOf(z)));
  }
  // 中央の破線
  for (let i = 0; i < 24; i += 2) {
    const z0 = i / 24;
    const z1 = (i + 1) / 24;
    const w0 = 0.022;
    poly(c, [xOf(-w0, z0), yOf(z0), xOf(w0, z0), yOf(z0), xOf(w0, z1), yOf(z1), xOf(-w0, z1), yOf(z1)], '#f4f6fa');
  }
  // 手前の足場と、強化レーンの通過線
  c.fillStyle = '#343a48';
  c.fillRect(0, FRONT_Y, W, H - FRONT_Y);
  c.fillStyle = '#454c5d';
  c.fillRect(0, FRONT_Y, W, 6);
  for (let i = 0; i < 12; i++) {
    c.fillStyle = i % 2 ? '#f4f6fa' : '#2a2f3a';
    c.fillRect(xOf(BLOCK_LANE.min, 0) + i * 16.8, FRONT_Y - 8, 16.8, 8);
  }
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

function drawBarricade(ctx: Ctx): void {
  const x0 = xOf(-0.98, 0);
  const x1 = xOf(-0.02, 0);
  const y = FRONT_Y - 16;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y, x1 - x0, 16);
  ctx.clip();
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(x0, y, x1 - x0, 16);
  ctx.fillStyle = '#22252c';
  for (let x = x0 - 16; x < x1; x += 28) poly(ctx, [x, y + 16, x + 14, y + 16, x + 30, y, x + 16, y], '#22252c');
  ctx.restore();
  ctx.fillStyle = '#22252c';
  ctx.fillRect(x0, y - 2, x1 - x0, 2);
  for (const x of [x0 + 4, (x0 + x1) / 2 - 3, x1 - 10]) ctx.fillRect(x, y, 6, 22);
}

function drawEnemies(ctx: Ctx, s: GameState, v: View): void {
  // 列の後ろほど奥にいるので、後ろから描けば奥から手前の順になる
  for (let i = s.enemies.length - 1; i >= s.head; i--) {
    const e = s.enemies[i]!;
    const vis = v.enemies.get(e.id);
    if (!vis) continue;
    const bob = Math.sin(v.time * 7 + vis.phase) * 2.5 * vis.scale;
    if (e.kind === 'boss') {
      const sp = sprite(vis.spriteId);
      const top = vis.y - sp.h * vis.scale;
      if (e.bossIndex > 4) ellipse(ctx, vis.x, vis.y - (sp.h * vis.scale) / 2, 120 * vis.scale, 120 * vis.scale, 'rgba(170,60,255,0.35)');
      drawSprite(ctx, vis.spriteId, vis.x, vis.y + bob, vis.scale);
      const bw = 170 * vis.scale;
      const bh = Math.max(4, 12 * vis.scale);
      const by = top - bh - 6 * vis.scale;
      fillRoundRect(ctx, vis.x - bw / 2, by, bw, bh, bh / 2, 'rgba(0,0,0,0.6)');
      fillRoundRect(ctx, vis.x - bw / 2, by, bw * clamp(e.hp / e.hp0, 0, 1), bh, bh / 2, '#ff4d4d');
      text(ctx, bossName(e.bossIndex), vis.x, by - 12 * vis.scale - 2, { size: Math.max(11, 22 * vis.scale), stroke: '#1d1f26', maxWidth: 230 });
    } else {
      drawSprite(ctx, vis.spriteId, vis.x, vis.y + bob, vis.scale);
    }
  }
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
    const bottom = yOf(z) + Math.cos(v.time * 83 + i) * amp * 0.5 * k;
    ellipse(ctx, cx, bottom, 78 * k, 9 * k, 'rgba(0,0,0,0.25)');
    drawSprite(ctx, `block.${b.kind}`, cx, bottom, k);
    if (danger) {
      ctx.fillStyle = `rgba(255,40,40,${0.25 + 0.2 * Math.sin(v.time * 30)})`;
      ctx.fillRect(cx - 75 * k, bottom - (110 - BLOCK_TOP) * k, 150 * k, (110 - BLOCK_TOP) * k);
    }
    // 残り HP の数字。先頭だけ、間に合うなら白、間に合わないなら赤。先頭以外は灰色
    const color = front ? (canBreakInTime(s) ? '#ffffff' : '#ff5c5c') : '#c9ced8';
    text(ctx, formatHp(b.hp), cx, bottom - 44 * k, { size: 34 * k, weight: 900, color, stroke: 'rgba(0,0,0,0.75)', maxWidth: 136 * k });
    const bw = 124 * k;
    const bh = 10 * k;
    const bx = cx - bw / 2;
    const by = bottom - 21 * k;
    fillRoundRect(ctx, bx, by, bw, bh, bh / 2, 'rgba(0,0,0,0.55)');
    if (ratio > 0) fillRoundRect(ctx, bx, by, bw * ratio, bh, bh / 2, danger ? '#ff5c5c' : '#ffffff');
  }
}

function drawBuddies(ctx: Ctx, s: GameState, v: View): void {
  // 相棒はレーンに関係なく、いつも敵レーンの先頭を撃っている
  const front = !s.over && s.head < s.enemies.length ? v.enemies.get(s.enemies[s.head]!.id) : undefined;
  for (let i = 0; i < s.player.buddies; i++) {
    const x = BUDDY_X[i]! + Math.sin(v.time * 3 + i * 2.1) * 3;
    if (front) {
      ctx.strokeStyle = `rgba(105,240,138,${0.35 + 0.3 * Math.sin(v.time * 40 + i * 2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, BUDDY_BOTTOM - 18);
      ctx.lineTo(front.x, front.y - 12 * front.scale);
      ctx.stroke();
    }
    drawSprite(ctx, 'buddy', x, BUDDY_BOTTOM);
  }
}

function drawPlayer(ctx: Ctx, s: GameState, v: View): void {
  const x = playerX(s);
  const bottom = LOOK.playerBottom;
  const stage = weaponStage(s.player.rank);
  drawSprite(ctx, 'player', x, bottom);
  const hats = Math.min(s.player.hats, MAX_HATS_DRAWN);
  for (let i = 0; i < hats; i++) drawSprite(ctx, `hat.${i % HAT_COLORS.length}`, x, bottom - 76 - i * 8);
  if (s.player.hats > MAX_HATS_DRAWN) {
    text(ctx, `×${s.player.hats}`, x - 38, bottom - 82 - hats * 8, { size: 18, stroke: '#1d1f26' });
  }
  const recoil = v.shooting ? clamp(1 - (v.time - v.shotAt) / 0.06, 0, 1) * 3 : 0;
  drawSprite(ctx, `weapon.${stage}`, x + 27, bottom - 40 + recoil);
}

function drawBeam(ctx: Ctx, s: GameState, v: View): void {
  const stage = weaponStage(s.player.rank);
  if (!v.shooting || (stage !== 9 && stage !== 10)) return;
  const x0 = playerX(s) + 27;
  const y0 = LOOK.playerBottom - 106;
  const flicker = 0.75 + 0.25 * Math.sin(v.time * 90);
  const wide = stage === 10;
  ctx.lineCap = 'round';
  const pass = (width: number, color: string): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(v.aim.x, v.aim.y);
    ctx.stroke();
  };
  pass((wide ? 26 : 10) * flicker, wide ? 'rgba(120,200,255,0.35)' : 'rgba(255,60,60,0.35)');
  pass((wide ? 14 : 4) * flicker, wide ? 'rgba(190,235,255,0.9)' : '#ff3b30');
  pass(wide ? 5 : 1.5, '#ffffff');
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
  const dot = (r: number, color: string): void => ellipse(ctx, x, y, r * k, r * k, color);
  switch (b.stage) {
    case 0:
      tracer(12, 4, 'rgba(111,216,255,0.6)');
      dot(5.5, '#8be3ff');
      break;
    case 1:
      ctx.strokeStyle = '#a8703a';
      ctx.lineWidth = 3 * k;
      ctx.beginPath();
      ctx.ellipse(x, y, 8 * k, 5 * k, b.spin + t * 6, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 2:
      dot(4.5, '#e0bd62');
      break;
    case 3:
      dot(3.5, '#ffffff');
      break;
    case 4:
      tracer(8, 5, '#ffd23f');
      break;
    case 5:
      dot(3.5, '#ffe066');
      break;
    case 6:
      tracer(30, 2.2, '#fff3a0');
      break;
    case 7:
      tracer(34, 5, '#ffb347');
      tracer(14, 2, '#ffffff');
      break;
    case 8:
      for (let i = 1; i <= 4; i++) ellipse(ctx, x - nx * i * 11 * k, y - ny * i * 11 * k, (5 + i * 1.6) * k, (5 + i * 1.6) * k, `rgba(230,230,230,${0.5 - i * 0.1})`);
      tracer(10, 8, '#ff7a1a');
      tracer(14, 7, '#5d7a3a');
      break;
    case 11:
      ellipse(ctx, x, y + 3 * k, 12 * k, 6 * k, '#ffffff');
      fillRoundRect(ctx, x - 8 * k, y - 5 * k, 16 * k, 7 * k, 3 * k, '#e8452f');
      break;
    case 12:
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(b.spin + t * 8);
      fillRoundRect(ctx, -11 * k, -7 * k, 22 * k, 14 * k, 2.5 * k, '#f5b800');
      ctx.fillStyle = '#7a4b00';
      ctx.fillRect(-11 * k, -3 * k, 22 * k, 3 * k);
      ctx.restore();
      break;
    case 13:
      text(ctx, '既読', x, y, { size: 20 * k, color: '#d7f5d9', stroke: '#1f6f3a' });
      break;
    case 14:
      text(ctx, 'お先に失礼します', x, y, { size: 15 * k, color: '#fff3bf', stroke: '#8a5a00' });
      break;
  }
}

function drawEffects(ctx: Ctx, v: View): void {
  for (const b of v.bullets) drawBullet(ctx, b);
  for (const p of v.particles) {
    ctx.globalAlpha = clamp(1 - p.age / p.life, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  for (const n of v.numbers) {
    const t = n.age / LOOK.numberLife;
    ctx.globalAlpha = clamp(1.6 - t * 1.6, 0, 1);
    text(ctx, n.label, n.x, n.y - t * 34, { size: 17, weight: 900, color: n.color, stroke: 'rgba(0,0,0,0.7)', strokeWidth: 3 });
  }
  ctx.globalAlpha = 1;
}

/** ゲームオーバー: 敵が防衛線を越えて画面を覆う */
function drawFlood(ctx: Ctx, v: View): void {
  const t = v.time - v.overAt;
  const ids = ['enemy.notice.0', 'enemy.notice.3', 'enemy.spam', 'enemy.deadline', 'enemy.notice.5', 'enemy.revolving'];
  for (let i = 0; i < 64; i++) {
    // 見た目を毎回同じにするため、番号から決まる擬似乱数を使う
    const r1 = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const r2 = (Math.sin(i * 78.233) * 12543.123) % 1;
    const p = clamp((t - Math.abs(r2) * 0.6) / 0.9, 0, 1);
    if (p <= 0) continue;
    const x = CENTER_X + r1 * 300;
    const y = 800 + p * p * 420 + Math.abs(r1) * 60;
    drawSprite(ctx, ids[i % ids.length]!, x, y, 1.2 + p * 3.2);
  }
  ctx.fillStyle = `rgba(120,0,0,${clamp(t / 1.5, 0, 1) * 0.5})`;
  ctx.fillRect(0, 0, W, H);
}

function drawLaneOverlays(ctx: Ctx, s: GameState, v: View): void {
  if (s.t < s.vacationUntil) {
    laneBand(ctx, ENEMY_LANE.min, ENEMY_LANE.max, 0, 1, 'rgba(120,220,255,0.22)');
    const left = s.vacationUntil - s.t;
    text(ctx, `有給休暇中 あと ${left.toFixed(1)} 秒`, laneX('enemy'), 610, { size: 19, color: '#e6fbff', stroke: '#0b5e78' });
  }
  if (v.bombWaveAt >= 0) {
    const p = (v.time - v.bombWaveAt) / LOOK.bombWaveTime;
    if (p < 1) {
      const z = p * 1.0;
      laneBand(ctx, ENEMY_LANE.min, ENEMY_LANE.max, Math.max(0, z - 0.12), Math.min(1, z + 0.04), `rgba(255,255,255,${0.9 * (1 - p * 0.5)})`);
    }
  }
}

/** 今いるレーンの足元を光らせて、どちらを撃っているか分かるようにする */
function drawLaneMarker(ctx: Ctx, lane: Lane, v: View): void {
  const u = lane === 'enemy' ? ENEMY_LANE : BLOCK_LANE;
  const a = 0.1 + 0.05 * Math.sin(v.time * 6);
  laneBand(ctx, u.min, u.max, 0, 0.05, `rgba(255,255,255,${a})`);
}

export function drawScene(ctx: Ctx, s: GameState, v: View): void {
  ctx.save();
  if (v.shakeLeft > 0) {
    const amp = LOOK.shakeMax * clamp(v.shakeLeft / LOOK.bossShakeTime, 0, 1);
    ctx.translate(Math.sin(v.time * 97) * amp, Math.cos(v.time * 113) * amp);
  }
  ctx.drawImage(background!, 0, 0, W, H);
  drawLaneOverlays(ctx, s, v);
  if (!s.over) drawLaneMarker(ctx, s.player.lane, v);
  drawBlocks(ctx, s, v);
  drawEnemies(ctx, s, v);
  drawBarricade(ctx);
  drawBuddies(ctx, s, v);
  drawPlayer(ctx, s, v);
  drawBeam(ctx, s, v);
  drawEffects(ctx, v);
  if (v.overAt >= 0) drawFlood(ctx, v);
  ctx.restore();

  const ratio = s.fill / s.capacity;
  if (ratio >= 0.7 && v.overAt < 0) {
    // 割合が上がるほど濃く、速く脈打つ
    const danger = clamp((ratio - 0.7) / 0.3, 0, 1);
    ctx.globalAlpha = (0.35 + 0.45 * danger) * (0.6 + 0.4 * Math.sin(v.time * (5 + danger * 7)));
    ctx.drawImage(vignette!, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  if (v.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${v.flash})`;
    ctx.fillRect(0, 0, W, H);
  }
}
