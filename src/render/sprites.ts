// スプライト（仕様書 6.4 節）。起動時にオフスクリーンキャンバスへ描いておき、拡大縮小して使う。
// 絵はすべてこのファイルに閉じ込めてある。あとで画像に差し替えるときは、ID からスプライトを引く
// sprite() の中身だけを変えればよい。
import { BLOCKS, BLOCK_KINDS, WEAPONS, type BlockKind } from '../core/balance.ts';
import { circle, ellipse, fillRoundRect, poly, roundRect, text, type Ctx } from './draw.ts';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** 論理解像度での大きさ（手前での基準サイズ） */
  w: number;
  h: number;
}

/** 拡大しても粗くならないよう、基準サイズの何倍で描いておくか */
const SUPERSAMPLE = 2;

/** 未読通知のバッジの数字。見た目を散らすための変種 */
export const NOTICE_VARIANTS = ['1', '3', '7', '12', '48', '99'] as const;
export const HAT_COLORS = ['#ff7eb6', '#ffd23f', '#5ad1ff', '#8be36b'] as const;

export const BLOCK_COLORS: Readonly<Record<BlockKind, string>> = {
  rank: '#2f7bff',
  gold: '#f5b800',
  buddy: '#2fbf5f',
  bomb: '#ff8a1f',
  vacation: '#39c8e8',
  expand: '#9b59d0',
  trap: '#ffe600',
  hat: '#ff7eb6',
};

/** 敵を倒したときの破片の色 */
export const ENEMY_COLORS = {
  notice: '#ff3b30',
  spam: '#f2f4f8',
  deadline: '#e03131',
  revolving: '#8e44ad',
  boss: '#ffd23f',
} as const;

const registry = new Map<string, Sprite>();

function make(id: string, w: number, h: number, draw: (c: Ctx) => void): void {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * SUPERSAMPLE);
  canvas.height = Math.ceil(h * SUPERSAMPLE);
  const c = canvas.getContext('2d')!;
  c.scale(SUPERSAMPLE, SUPERSAMPLE);
  draw(c);
  registry.set(id, { canvas, w, h });
}

export function sprite(id: string): Sprite {
  const s = registry.get(id);
  if (!s) throw new Error(`スプライトがありません: ${id}`);
  return s;
}

/** 下端の中央を (cx, bottom) に合わせて描く */
export function drawSprite(ctx: Ctx, id: string, cx: number, bottom: number, scale = 1): void {
  const s = sprite(id);
  const w = s.w * scale;
  const h = s.h * scale;
  ctx.drawImage(s.canvas, cx - w / 2, bottom - h, w, h);
}

function shade(c: Ctx, y: number, h: number, top: string, bottom: string): CanvasGradient {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}

// ---------------------------------------------------------------- 敵

function drawNotice(c: Ctx, label: string): void {
  circle(c, 22, 23, 21, 'rgba(0,0,0,0.25)');
  c.beginPath();
  c.arc(22, 21, 20, 0, Math.PI * 2);
  c.fillStyle = shade(c, 0, 44, '#ff5a4f', '#e0241a');
  c.fill();
  c.lineWidth = 2.5;
  c.strokeStyle = '#fff';
  c.stroke();
  ellipse(c, 16, 12, 8, 4, 'rgba(255,255,255,0.35)');
  text(c, label, 22, 22, { size: label.length > 1 ? 19 : 23, weight: 900 });
}

function drawSpam(c: Ctx): void {
  fillRoundRect(c, 1, 5, 28, 20, 3, 'rgba(0,0,0,0.25)');
  fillRoundRect(c, 1, 3, 28, 20, 3, '#f7f8fb');
  c.strokeStyle = '#9aa3b5';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(2, 5);
  c.lineTo(15, 15);
  c.lineTo(28, 5);
  c.stroke();
  circle(c, 24, 7, 6.5, '#ff3b30');
  text(c, '!', 24, 7.5, { size: 11, weight: 900 });
}

function drawDeadline(c: Ctx): void {
  fillRoundRect(c, 3, 11, 76, 77, 7, 'rgba(0,0,0,0.25)');
  fillRoundRect(c, 2, 8, 76, 77, 7, '#fbfbf7');
  roundRect(c, 2, 8, 76, 26, 7);
  c.fillStyle = '#e03131';
  c.fill();
  c.fillRect(2, 24, 76, 10);
  for (const x of [22, 58]) {
    fillRoundRect(c, x - 3.5, 0, 7, 17, 3.5, '#4a4f5c');
  }
  text(c, '締切', 40, 22, { size: 17, weight: 900 });
  text(c, '〆', 40, 60, { size: 46, weight: 900, color: '#1d1f26' });
}

function drawRevolving(c: Ctx): void {
  fillRoundRect(c, 2, 6, 50, 35, 6, 'rgba(0,0,0,0.25)');
  roundRect(c, 1, 3, 50, 35, 6);
  c.fillStyle = shade(c, 3, 35, '#b06ae0', '#6d2aa3');
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(1, 9, 50, 6);
  fillRoundRect(c, 6, 21, 10, 8, 2, '#ffd86b');
  text(c, '％', 34, 26, { size: 22, weight: 900 });
}

// ---------------------------------------------------------------- ボス（基準サイズ 200）

function angryEyes(c: Ctx, cx: number, y: number, gap: number, r: number): void {
  for (const dir of [-1, 1]) {
    const x = cx + dir * gap;
    circle(c, x, y, r, '#fff');
    circle(c, x - dir * r * 0.2, y + r * 0.15, r * 0.5, '#1d1f26');
    c.strokeStyle = '#1d1f26';
    c.lineWidth = r * 0.7;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x + dir * r * 1.3, y - r * 1.5);
    c.lineTo(x - dir * r * 1.1, y - r * 0.6);
    c.stroke();
  }
}

function drawBossMonday(c: Ctx): void {
  fillRoundRect(c, 20, 20, 168, 178, 12, 'rgba(0,0,0,0.3)');
  fillRoundRect(c, 14, 14, 172, 180, 12, '#fbfbf7');
  roundRect(c, 14, 14, 172, 46, 12);
  c.fillStyle = '#c92a2a';
  c.fill();
  c.fillRect(14, 44, 172, 16);
  for (const x of [56, 144]) fillRoundRect(c, x - 6, 0, 12, 30, 6, '#4a4f5c');
  text(c, 'MONDAY', 100, 38, { size: 26, weight: 900 });
  text(c, '月', 100, 138, { size: 118, weight: 900, color: '#1d1f26' });
  angryEyes(c, 100, 82, 34, 10);
}

function drawBossTax(c: Ctx): void {
  for (let i = 5; i >= 0; i--) {
    const x = 26 + (i % 2 ? 6 : -4);
    fillRoundRect(c, x, 46 + i * 24, 152, 30, 3, i % 2 ? '#e9e4d4' : '#f7f3e6');
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(x, 72 + i * 24, 152, 4);
  }
  fillRoundRect(c, 22, 14, 156, 104, 4, '#fffdf5');
  c.strokeStyle = '#b9b29b';
  c.lineWidth = 2;
  c.strokeRect(22, 14, 156, 104);
  text(c, '確定申告', 100, 40, { size: 30, weight: 900, color: '#1d1f26' });
  c.fillStyle = '#c8c2ad';
  for (let i = 0; i < 4; i++) c.fillRect(34, 62 + i * 13, i === 3 ? 70 : 132, 5);
  c.save();
  c.translate(146, 96);
  c.rotate(-0.25);
  c.strokeStyle = '#d6336c';
  c.lineWidth = 4;
  c.beginPath();
  c.arc(0, 0, 24, 0, Math.PI * 2);
  c.stroke();
  text(c, '期限', 0, 1, { size: 20, weight: 900, color: '#d6336c' });
  c.restore();
  angryEyes(c, 100, 150, 30, 9);
}

function drawBossAd(c: Ctx): void {
  fillRoundRect(c, 10, 30, 186, 144, 10, 'rgba(0,0,0,0.3)');
  fillRoundRect(c, 6, 24, 188, 144, 10, '#15171f');
  roundRect(c, 12, 30, 176, 112, 6);
  c.fillStyle = shade(c, 30, 112, '#3d1f6e', '#11204d');
  c.fill();
  circle(c, 100, 84, 30, 'rgba(255,255,255,0.92)');
  poly(c, [90, 66, 90, 102, 120, 84], '#15171f');
  fillRoundRect(c, 18, 36, 46, 22, 4, '#ffd23f');
  text(c, '広告', 41, 48, { size: 16, weight: 900, color: '#15171f' });
  fillRoundRect(c, 86, 112, 98, 24, 3, 'rgba(0,0,0,0.7)');
  c.strokeStyle = '#aaa';
  c.lineWidth = 1;
  c.strokeRect(86, 112, 98, 24);
  text(c, '広告をスキップ ▶ 5', 135, 124.5, { size: 11, weight: 700, maxWidth: 90 });
  c.fillStyle = '#555';
  c.fillRect(12, 148, 176, 6);
  c.fillStyle = '#ffd23f';
  c.fillRect(12, 148, 58, 6);
  angryEyes(c, 100, 178, 26, 8);
}

function drawBossRelatives(c: Ctx): void {
  fillRoundRect(c, 12, 6, 176, 68, 18, '#fff');
  poly(c, [84, 70, 116, 70, 96, 92], '#fff');
  c.strokeStyle = '#1d1f26';
  c.lineWidth = 3;
  roundRect(c, 12, 6, 176, 68, 18);
  c.stroke();
  text(c, 'いい人', 100, 28, { size: 26, weight: 900, color: '#1d1f26' });
  text(c, 'いないの？', 100, 54, { size: 22, weight: 900, color: '#d6336c' });
  const heads: [number, number, string, string][] = [
    [46, 150, '#7b5b3a', '#6c8ebf'],
    [154, 150, '#b9b9c4', '#bf6c8e'],
    [100, 142, '#3b3027', '#7fae6c'],
  ];
  for (const [x, y, hair, cloth] of heads) {
    fillRoundRect(c, x - 36, y + 22, 72, 40, 16, cloth);
    circle(c, x, y, 30, '#ffd9b8');
    c.beginPath();
    c.arc(x, y - 4, 31, Math.PI * 1.05, Math.PI * 1.95);
    c.fillStyle = hair;
    c.fill();
    // にこにこ顔。目は弧、口は大きく開ける
    c.strokeStyle = '#1d1f26';
    c.lineWidth = 3;
    c.lineCap = 'round';
    for (const d of [-11, 11]) {
      c.beginPath();
      c.arc(x + d, y + 2, 5, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke();
    }
    c.beginPath();
    c.arc(x, y + 10, 9, 0, Math.PI);
    c.fillStyle = '#c92a2a';
    c.fill();
  }
}

// ---------------------------------------------------------------- ブロック（幅 150 × 高さ 110）

/** 箱の上面の高さ。数字と HP バーは描画のたびに正面へ重ねる */
export const BLOCK_TOP = 14;

function drawBlock(c: Ctx, kind: BlockKind): void {
  const color = BLOCK_COLORS[kind];
  poly(c, [12, 0, 138, 0, 150, BLOCK_TOP, 0, BLOCK_TOP], color);
  poly(c, [12, 0, 138, 0, 150, BLOCK_TOP, 0, BLOCK_TOP], 'rgba(255,255,255,0.35)');
  fillRoundRect(c, 0, BLOCK_TOP, 150, 110 - BLOCK_TOP, 6, color);
  c.fillStyle = shade(c, BLOCK_TOP, 96, 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.28)');
  roundRect(c, 0, BLOCK_TOP, 150, 110 - BLOCK_TOP, 6);
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  roundRect(c, 1.5, BLOCK_TOP + 1.5, 147, 110 - BLOCK_TOP - 3, 6);
  c.stroke();
  if (kind === 'trap') {
    text(c, BLOCKS.trap.name, 75, 37, { size: 27, weight: 900, color: '#e3101f', stroke: '#fff', strokeWidth: 5 });
  } else {
    text(c, BLOCKS[kind].name, 75, 35, { size: 21, weight: 900, stroke: 'rgba(0,0,0,0.55)', strokeWidth: 4, maxWidth: 136 });
  }
}

// ---------------------------------------------------------------- プレイヤーまわり

function drawPlayer(c: Ctx): void {
  // 奥を向いて立っている後ろ姿
  ellipse(c, 35, 87, 26, 5, 'rgba(0,0,0,0.3)');
  fillRoundRect(c, 21, 62, 11, 24, 4, '#2b3a67');
  fillRoundRect(c, 38, 62, 11, 24, 4, '#2b3a67');
  fillRoundRect(c, 19, 81, 14, 7, 3, '#f1f3f5');
  fillRoundRect(c, 37, 81, 14, 7, 3, '#f1f3f5');
  // 右腕は横に伸ばして武器を構える
  c.strokeStyle = '#ff6b3d';
  c.lineWidth = 9;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(48, 40);
  c.lineTo(61, 46);
  c.stroke();
  c.beginPath();
  c.moveTo(22, 40);
  c.lineTo(13, 54);
  c.stroke();
  fillRoundRect(c, 17, 32, 36, 36, 11, '#ff6b3d');
  c.fillStyle = 'rgba(0,0,0,0.12)';
  c.fillRect(17, 58, 36, 5);
  circle(c, 62, 46, 5, '#ffd9b8');
  circle(c, 12.5, 55, 5, '#ffd9b8');
  fillRoundRect(c, 30, 26, 10, 9, 3, '#ffd9b8');
  circle(c, 35, 18, 15, '#4a2f1b');
  ellipse(c, 30, 12, 6, 3.5, 'rgba(255,255,255,0.18)');
}

function drawHat(c: Ctx, color: string): void {
  ellipse(c, 18, 12, 18, 4.5, color);
  roundRect(c, 7, 1, 22, 12, 7);
  c.fillStyle = color;
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.fillRect(7, 8, 22, 3);
  ellipse(c, 18, 12, 18, 4.5, 'rgba(0,0,0,0.08)');
}

function drawBuddy(c: Ctx): void {
  ellipse(c, 25, 21, 24, 9, 'rgba(0,0,0,0.3)');
  ellipse(c, 25, 17, 24, 11, '#2d323d');
  ellipse(c, 25, 14, 24, 11, '#4a5160');
  ellipse(c, 25, 13, 17, 7, '#5d6577');
  circle(c, 25, 12, 3.5, '#69f08a');
  c.strokeStyle = '#1e222b';
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(25, 14, 24, 11, 0, Math.PI * 1.1, Math.PI * 1.9);
  c.stroke();
}

/** 武器（幅 44 × 高さ 70）。上が銃口 */
const WEAPON_DRAWERS: ((c: Ctx) => void)[] = [
  // 0 水鉄砲
  (c) => {
    fillRoundRect(c, 19, 4, 6, 16, 2, '#ff9f1a');
    fillRoundRect(c, 14, 16, 16, 40, 6, '#35c9ff');
    circle(c, 26, 46, 10, '#ff9f1a');
    circle(c, 24, 43, 3, 'rgba(255,255,255,0.6)');
    fillRoundRect(c, 15, 52, 9, 16, 3, '#1c9fd6');
  },
  // 1 輪ゴム鉄砲
  (c) => {
    fillRoundRect(c, 18, 6, 9, 56, 2, '#a8703a');
    fillRoundRect(c, 10, 46, 25, 8, 2, '#8a5a2c');
    fillRoundRect(c, 14, 52, 9, 16, 2, '#8a5a2c');
    c.strokeStyle = '#e8c27a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(20, 7);
    c.lineTo(20, 46);
    c.moveTo(25, 7);
    c.lineTo(25, 46);
    c.stroke();
  },
  // 2 節分の豆
  (c) => {
    poly(c, [5, 38, 39, 38, 35, 66, 9, 66], '#d9a55b');
    poly(c, [5, 38, 39, 38, 37, 44, 7, 44], '#b98338');
    for (const [x, y] of [[13, 36], [22, 33], [31, 36], [17, 30], [27, 30], [22, 26]] as const) circle(c, x, y, 4.5, '#e6c36a');
    text(c, '福', 22, 55, { size: 15, weight: 900, color: '#7a4b12' });
  },
  // 3 エアガン
  (c) => {
    fillRoundRect(c, 17, 4, 10, 6, 1, '#ff7a1a');
    fillRoundRect(c, 17, 9, 10, 36, 2, '#2a2d34');
    fillRoundRect(c, 13, 36, 18, 14, 3, '#3a3e47');
    fillRoundRect(c, 14, 48, 11, 20, 3, '#2a2d34');
  },
  // 4 ピストル
  (c) => {
    fillRoundRect(c, 16, 4, 12, 40, 2, '#c3cad6');
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(16, 20, 12, 3);
    fillRoundRect(c, 13, 38, 18, 12, 3, '#9aa3b2');
    fillRoundRect(c, 14, 48, 12, 20, 3, '#4b3a2a');
  },
  // 5 ショットガン
  (c) => {
    fillRoundRect(c, 12, 0, 9, 50, 3, '#3a3e47');
    fillRoundRect(c, 23, 0, 9, 50, 3, '#3a3e47');
    fillRoundRect(c, 11, 30, 22, 10, 2, '#8a5a2c');
    fillRoundRect(c, 13, 46, 18, 22, 4, '#6e4621');
  },
  // 6 マシンガン
  (c) => {
    fillRoundRect(c, 19, 0, 6, 12, 1, '#1e2026');
    fillRoundRect(c, 15, 8, 14, 50, 3, '#343842');
    fillRoundRect(c, 28, 34, 10, 20, 2, '#23262d');
    fillRoundRect(c, 15, 54, 10, 14, 3, '#23262d');
    c.fillStyle = '#555b69';
    for (let y = 14; y < 34; y += 5) c.fillRect(17, y, 10, 2);
  },
  // 7 ガトリング砲
  (c) => {
    fillRoundRect(c, 7, 2, 30, 46, 5, '#8a92a3');
    c.fillStyle = '#4c5261';
    for (const x of [10, 17, 24, 31]) c.fillRect(x, 2, 3, 46);
    fillRoundRect(c, 7, 6, 30, 5, 2, '#5c6373');
    fillRoundRect(c, 7, 36, 30, 5, 2, '#5c6373');
    fillRoundRect(c, 12, 46, 20, 22, 4, '#3a3e47');
  },
  // 8 バズーカ
  (c) => {
    fillRoundRect(c, 5, 0, 34, 9, 3, '#44602a');
    fillRoundRect(c, 10, 4, 24, 62, 5, '#5d7a3a');
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.fillRect(10, 30, 24, 5);
    fillRoundRect(c, 32, 22, 7, 14, 2, '#2f3d1d');
    fillRoundRect(c, 14, 60, 16, 9, 3, '#44602a');
  },
  // 9 レーザー
  (c) => {
    fillRoundRect(c, 13, 14, 18, 52, 5, '#eef1f6');
    c.fillStyle = '#ff3b30';
    c.fillRect(13, 30, 18, 4);
    c.fillRect(13, 40, 18, 4);
    circle(c, 22, 11, 10, '#30343d');
    circle(c, 22, 11, 6, '#ff3b30');
    circle(c, 20, 9, 2, '#ffd0cc');
  },
  // 10 波動砲
  (c) => {
    fillRoundRect(c, 8, 12, 28, 54, 6, '#22357a');
    fillRoundRect(c, 4, 26, 36, 8, 3, '#3c56b8');
    circle(c, 22, 13, 13, '#0f1a44');
    circle(c, 22, 13, 9, '#7fe3ff');
    circle(c, 22, 13, 4, '#fff');
  },
  // 11 回転寿司レーン砲
  (c) => {
    fillRoundRect(c, 5, 6, 34, 60, 6, '#9aa3b2');
    fillRoundRect(c, 9, 10, 26, 52, 4, '#3a3e47');
    for (const [y, top] of [[24, '#e8452f'], [48, '#ffb347']] as const) {
      ellipse(c, 22, y + 3, 11, 7, '#fff');
      fillRoundRect(c, 15, y - 3, 14, 7, 3, '#fafafa');
      fillRoundRect(c, 14, y - 6, 16, 6, 3, top);
    }
  },
  // 12 課金砲
  (c) => {
    fillRoundRect(c, 9, 4, 26, 62, 6, '#f5b800');
    c.fillStyle = shade(c, 4, 62, 'rgba(255,255,255,0.4)', 'rgba(0,0,0,0.2)');
    roundRect(c, 9, 4, 26, 62, 6);
    c.fill();
    fillRoundRect(c, 6, 0, 32, 9, 3, '#c98f00');
    text(c, '¥', 22, 38, { size: 26, weight: 900, color: '#7a4b00' });
  },
  // 13 既読スルー光線
  (c) => {
    fillRoundRect(c, 9, 4, 26, 62, 5, '#22252c');
    fillRoundRect(c, 12, 9, 20, 50, 2, '#8fd694');
    fillRoundRect(c, 14, 14, 16, 12, 4, '#fff');
    text(c, '既読', 22, 20.5, { size: 7, weight: 900, color: '#22252c' });
    fillRoundRect(c, 14, 30, 12, 8, 3, '#e7f7e8');
    fillRoundRect(c, 14, 42, 9, 8, 3, '#e7f7e8');
  },
  // 14 定時退社ビーム
  (c) => {
    fillRoundRect(c, 18, 42, 8, 26, 3, '#4a5160');
    circle(c, 22, 24, 20, '#30343d');
    circle(c, 22, 24, 16, '#fff');
    c.strokeStyle = '#1d1f26';
    c.lineWidth = 3;
    c.lineCap = 'round';
    // 17 時を指す
    c.beginPath();
    c.moveTo(22, 24);
    c.lineTo(22, 11);
    c.moveTo(22, 24);
    c.lineTo(27, 32);
    c.stroke();
    circle(c, 22, 24, 2.5, '#e03131');
  },
  // 15 ねこ
  (c) => {
    ellipse(c, 22, 66, 18, 4, 'rgba(0,0,0,0.25)');
    c.strokeStyle = '#e8943a';
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(34, 60);
    c.quadraticCurveTo(46, 54, 38, 42);
    c.stroke();
    ellipse(c, 22, 50, 15, 17, '#f4a94e');
    circle(c, 22, 26, 13, '#f4a94e');
    poly(c, [10, 22, 12, 7, 20, 16], '#f4a94e');
    poly(c, [34, 22, 32, 7, 24, 16], '#f4a94e');
    c.fillStyle = '#d9822b';
    for (const y of [44, 51, 58]) c.fillRect(13, y, 18, 3);
    c.fillRect(19, 15, 2.5, 8);
    c.fillRect(23.5, 15, 2.5, 8);
  },
];

export const WEAPON_SPRITE = { w: 44, h: 70 } as const;

/** 全スプライトを作る。起動時に 1 回だけ呼ぶ */
export function initSprites(): void {
  NOTICE_VARIANTS.forEach((label, i) => make(`enemy.notice.${i}`, 44, 44, (c) => drawNotice(c, label)));
  make('enemy.spam', 30, 26, drawSpam);
  make('enemy.deadline', 80, 88, drawDeadline);
  make('enemy.revolving', 52, 41, drawRevolving);
  [drawBossMonday, drawBossTax, drawBossAd, drawBossRelatives].forEach((draw, i) => make(`boss.${i}`, 200, 200, draw));
  for (const kind of BLOCK_KINDS) make(`block.${kind}`, 150, 110, (c) => drawBlock(c, kind));
  make('player', 70, 90, drawPlayer);
  make('buddy', 50, 30, drawBuddy);
  HAT_COLORS.forEach((color, i) => make(`hat.${i}`, 36, 17, (c) => drawHat(c, color)));
  WEAPONS.forEach((_, i) => make(`weapon.${i}`, WEAPON_SPRITE.w, WEAPON_SPRITE.h, WEAPON_DRAWERS[i]!));
}
