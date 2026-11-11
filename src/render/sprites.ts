// スプライト（仕様書 6.4 節）。起動時にオフスクリーンキャンバスへ描いておき、拡大縮小して使う。
// 絵はすべてこのファイルに閉じ込めてある。あとで画像に差し替えるときは、ID からスプライトを引く
// sprite() の中身だけを変えればよい。
//
// 絵柄の決まり: 光は左上から。形はグラデーションで丸みを出し、make() が全体に同じ太さの輪郭を付ける。
// 足元の影も make() が敷く。描く側は輪郭と影を気にしなくてよい。
import { BLOCKS, BLOCK_KINDS, WEAPONS, type BlockKind } from '../core/balance.ts';
import { INK, circle, ellipse, fillRoundRect, gradV, poly, roundRect, text, type Ctx } from './draw.ts';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** 論理解像度での大きさ（手前での基準サイズ）。輪郭のための余白は含まない */
  w: number;
  h: number;
}

/** 拡大しても粗くならないよう、基準サイズの何倍で描いておくか */
const SUPERSAMPLE = 2;
/** 輪郭がはみ出さないよう、絵の四方に取る余白 */
const PAD = 5;
/** 輪郭の太さ */
const OUTLINE = 2.4;

/** 未読通知の変種（アプリの絵柄と、バッジの数字）。見た目を散らすために使い回す */
export const NOTICE_VARIANTS = [
  ['chat', '1'],
  ['work', '3'],
  ['mail', '7'],
  ['chat', '12'],
  ['work', '48'],
  ['mail', '99'],
] as const;
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
  notice: '#ff5346',
  spam: '#f2f4f8',
  deadline: '#e03131',
  revolving: '#a55eea',
  boss: '#ffd23f',
} as const;

const registry = new Map<string, Sprite>();

function blank(w: number, h: number): { canvas: HTMLCanvasElement; c: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((w + PAD * 2) * SUPERSAMPLE);
  canvas.height = Math.ceil((h + PAD * 2) * SUPERSAMPLE);
  return { canvas, c: canvas.getContext('2d')! };
}

/** 絵の形はそのままに、1 色で塗りつぶした版を作る */
function silhouette(src: HTMLCanvasElement, w: number, h: number, color: string): HTMLCanvasElement {
  const { canvas, c } = blank(w, h);
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

interface MakeOptions {
  /** 足元の影（中心 x、中心 y、横半径、縦半径） */
  shadow?: readonly [number, number, number, number];
  /** 輪郭を付けない（光やけむりなど） */
  noOutline?: boolean;
  /** 撃たれたときに重ねる白い版も作る（ID は `${id}#flash`） */
  flash?: boolean;
}

function make(id: string, w: number, h: number, draw: (c: Ctx) => void, opts: MakeOptions = {}): void {
  const content = blank(w, h);
  content.c.scale(SUPERSAMPLE, SUPERSAMPLE);
  content.c.translate(PAD, PAD);
  draw(content.c);
  const out = blank(w, h);
  if (opts.shadow) {
    const [x, y, rx, ry] = opts.shadow;
    out.c.save();
    out.c.scale(SUPERSAMPLE, SUPERSAMPLE);
    out.c.translate(PAD, PAD);
    ellipse(out.c, x, y, rx, ry, 'rgba(10,14,30,0.3)');
    out.c.restore();
  }
  if (!opts.noOutline) {
    const ink = silhouette(content.canvas, w, h, INK);
    const t = OUTLINE * SUPERSAMPLE;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      out.c.drawImage(ink, Math.cos(a) * t, Math.sin(a) * t);
    }
  }
  out.c.drawImage(content.canvas, 0, 0);
  registry.set(id, { canvas: out.canvas, w, h });
  if (opts.flash) registry.set(`${id}#flash`, { canvas: silhouette(content.canvas, w, h, '#ffffff'), w, h });
}

export function sprite(id: string): Sprite {
  const s = registry.get(id);
  if (!s) throw new Error(`スプライトがありません: ${id}`);
  return s;
}

/** 下端の中央を (cx, bottom) に合わせて描く */
export function drawSprite(ctx: Ctx, id: string, cx: number, bottom: number, scale = 1): void {
  const s = sprite(id);
  const w = (s.w + PAD * 2) * scale;
  const h = (s.h + PAD * 2) * scale;
  ctx.drawImage(s.canvas, cx - w / 2, bottom - h + PAD * scale, w, h);
}

/** 中心を (cx, cy) に合わせ、回転させて描く */
export function drawSpriteCentered(ctx: Ctx, id: string, cx: number, cy: number, scale = 1, rotation = 0): void {
  const s = sprite(id);
  const w = (s.w + PAD * 2) * scale;
  const h = (s.h + PAD * 2) * scale;
  if (rotation === 0) {
    ctx.drawImage(s.canvas, cx - w / 2, cy - h / 2, w, h);
    return;
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.drawImage(s.canvas, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function radial(c: Ctx, x: number, y: number, r: number, stops: readonly (readonly [number, string])[]): CanvasGradient {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

/** 怒った目。gap は中心から目までの距離、r は目の大きさ */
function angryEyes(c: Ctx, cx: number, y: number, gap: number, r: number): void {
  for (const dir of [-1, 1]) {
    const x = cx + dir * gap;
    ellipse(c, x, y, r, r * 1.08, '#ffffff');
    circle(c, x - dir * r * 0.25, y + r * 0.2, r * 0.48, INK);
    circle(c, x - dir * r * 0.4, y, r * 0.16, '#ffffff');
    c.strokeStyle = INK;
    c.lineWidth = r * 0.62;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x + dir * r * 1.25, y - r * 1.55);
    c.lineTo(x - dir * r * 1.15, y - r * 0.7);
    c.stroke();
  }
}

// ---------------------------------------------------------------- 敵

/**
 * 未読通知の、アプリの絵柄（台の上の色、下の色、足の色）。
 * 「よくあるアプリ」に見えればよく、実在のアプリのアイコンには似せない（色と形を、どれとも変えてある）。
 */
const NOTICE_APPS = {
  chat: ['#ffa48f', '#ee4f6c', '#8f1f3a'],
  work: ['#ffffff', '#e6e8f2', '#1d6b63'],
  mail: ['#9a8cff', '#4f43c4', '#2a2278'],
} as const;

/** 未読通知。アプリのアイコンの角に、未読の件数を書いた赤いバッジが付いている。顔はアプリごとに変える */
function drawNotice(c: Ctx, app: keyof typeof NOTICE_APPS, label: string): void {
  const [top, bottom, feet] = NOTICE_APPS[app];
  ellipse(c, 13, 46.5, 6, 3, feet);
  ellipse(c, 31, 46.5, 6, 3, feet);
  // アイコンの台
  roundRect(c, 3, 8, 38, 37, 10);
  c.fillStyle = gradV(c, 8, 45, top, bottom);
  c.fill();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (app === 'chat') {
    // チャット: 吹き出しに、まろ眉のむっとした顔
    ellipse(c, 15, 13, 9, 3, 'rgba(255,255,255,0.28)');
    ellipse(c, 22, 26, 14, 11, '#ffffff');
    poly(c, [12, 31, 9, 41, 20, 35], '#ffffff');
    // まろ眉（短くて丸い眉）に、むっとした口
    for (const dir of [-1, 1]) {
      const x = 22 + dir * 6.2;
      ellipse(c, x, 20.6, 2.5, 1.8, INK);
      circle(c, x, 27.2, 2.7, INK);
      circle(c, x - 0.9, 26.2, 0.9, '#ffffff');
    }
    c.strokeStyle = INK;
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(18.5, 33.6);
    c.quadraticCurveTo(22, 31, 25.5, 33.6);
    c.stroke();
  } else if (app === 'work') {
    // 仕事のチャット: 白い台を斜めに 2 色で塗り分け、気の抜けた顔を付ける（怒った顔ばかりだと単調なので、これだけ変顔）
    c.save();
    roundRect(c, 3, 8, 38, 37, 10);
    c.clip();
    poly(c, [3, 8, 30, 8, 3, 34], '#19b5a5');
    poly(c, [41, 45, 14, 45, 41, 19], '#ff9a2e');
    ellipse(c, 22, 27, 14.5, 13, '#ffffff');
    c.restore();
    // 左右で大きさの違う目と、ゆがんだ口、ちょろっと出た舌
    circle(c, 16, 24.5, 3, INK);
    circle(c, 15, 23.4, 1, '#ffffff');
    circle(c, 28.5, 23.5, 2.1, INK);
    circle(c, 27.8, 22.8, 0.7, '#ffffff');
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(15.5, 31);
    c.quadraticCurveTo(22, 37.5, 29.5, 30);
    c.stroke();
    ellipse(c, 24.5, 35.2, 2.6, 2.2, '#ff7a9c');
  } else {
    // メール: 封筒に、じと目（ふたの線と重ならないよう、眉は描かない）
    ellipse(c, 15, 13, 9, 3, 'rgba(255,255,255,0.28)');
    fillRoundRect(c, 8, 17, 28, 22, 3.5, '#ffffff');
    c.strokeStyle = bottom;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(9.5, 19);
    c.lineTo(22, 26.5);
    c.lineTo(34.5, 19);
    c.stroke();
    for (const x of [15.5, 28.5]) {
      // 上半分をまぶたで切った、半開きの目
      c.fillStyle = INK;
      c.beginPath();
      c.arc(x, 30.5, 3.1, 0, Math.PI);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 1.8;
      c.beginPath();
      c.moveTo(x - 4.2, 30.5);
      c.lineTo(x + 4.2, 30.5);
      c.stroke();
    }
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(19.5, 36);
    c.lineTo(24.5, 36);
    c.stroke();
  }
  // 未読の件数のバッジ（台の色に埋もれないよう、白い縁を付ける）
  circle(c, 37.5, 10.5, 10.6, '#ffffff');
  circle(c, 37.5, 10.5, 9.2, '#ff3b30');
  ellipse(c, 35.2, 6.6, 4, 2, 'rgba(255,255,255,0.45)');
  text(c, label, 37.5, 11.3, { size: label.length > 1 ? 11 : 13.5, weight: 900, stroke: '#8a0f08', strokeWidth: 2.5 });
}

function drawSpam(c: Ctx): void {
  roundRect(c, 2, 6, 32, 20, 3.5);
  c.fillStyle = gradV(c, 6, 26, '#ffffff', '#cfd8ea');
  c.fill();
  c.strokeStyle = '#8e9bb5';
  c.lineWidth = 1.6;
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(3, 7.5);
  c.lineTo(18, 18);
  c.lineTo(33, 7.5);
  c.stroke();
  circle(c, 12.5, 21, 1.7, INK);
  circle(c, 23.5, 21, 1.7, INK);
  circle(c, 29.5, 6.5, 6.8, '#ff3b30');
  ellipse(c, 27.5, 4, 3, 1.5, 'rgba(255,255,255,0.45)');
  text(c, '!', 29.5, 7, { size: 11, weight: 900 });
}

function drawDeadline(c: Ctx): void {
  fillRoundRect(c, 20, 84, 14, 9, 3, '#3b4152');
  fillRoundRect(c, 50, 84, 14, 9, 3, '#3b4152');
  roundRect(c, 5, 11, 74, 76, 9);
  c.fillStyle = gradV(c, 11, 87, '#ffffff', '#e6e1d0');
  c.fill();
  c.save();
  roundRect(c, 5, 11, 74, 76, 9);
  c.clip();
  c.fillStyle = gradV(c, 11, 36, '#ff5a5a', '#c92a2a');
  c.fillRect(5, 11, 74, 25);
  c.fillStyle = 'rgba(0,0,0,0.12)';
  c.fillRect(5, 36, 74, 3);
  c.restore();
  for (const x of [25, 59]) fillRoundRect(c, x - 4, 2, 8, 18, 4, '#565c6e');
  text(c, '締切', 42, 25, { size: 15, weight: 900, stroke: '#8a1414', strokeWidth: 3 });
  angryEyes(c, 42, 53, 14, 6.6);
  text(c, '〆', 42, 74, { size: 24, weight: 900, color: INK });
}

function drawRevolving(c: Ctx): void {
  roundRect(c, 3, 4, 52, 35, 7);
  c.fillStyle = gradV(c, 4, 39, '#c98cff', '#6a25a8');
  c.fill();
  c.fillStyle = 'rgba(20,0,40,0.5)';
  c.fillRect(3, 10, 52, 6);
  roundRect(c, 8, 21, 11, 9, 2.5);
  c.fillStyle = gradV(c, 21, 30, '#ffe9a3', '#e0a020');
  c.fill();
  ellipse(c, 16, 7, 10, 2, 'rgba(255,255,255,0.3)');
  text(c, '％', 37, 27.5, { size: 22, weight: 900, stroke: '#3d0f66', strokeWidth: 4 });
}

// ---------------------------------------------------------------- ボス（基準サイズ 200）

function drawBossMonday(c: Ctx): void {
  roundRect(c, 14, 14, 172, 180, 14);
  c.fillStyle = gradV(c, 14, 194, '#ffffff', '#e4dfcd');
  c.fill();
  c.save();
  roundRect(c, 14, 14, 172, 180, 14);
  c.clip();
  c.fillStyle = gradV(c, 14, 62, '#f04848', '#b21f1f');
  c.fillRect(14, 14, 172, 48);
  c.fillStyle = 'rgba(0,0,0,0.14)';
  c.fillRect(14, 62, 172, 5);
  c.restore();
  for (const x of [56, 144]) fillRoundRect(c, x - 7, 0, 14, 32, 7, '#565c6e');
  text(c, 'MONDAY', 100, 40, { size: 27, weight: 900, stroke: '#7a1010', strokeWidth: 4 });
  text(c, '月', 100, 142, { size: 104, weight: 900, color: INK });
  angryEyes(c, 100, 84, 36, 11);
}

function drawBossTax(c: Ctx): void {
  for (let i = 5; i >= 0; i--) {
    const x = 26 + (i % 2 ? 6 : -4);
    roundRect(c, x, 46 + i * 24, 152, 30, 3);
    c.fillStyle = i % 2 ? '#e2dcc8' : '#f4efdf';
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.14)';
    c.fillRect(x, 72 + i * 24, 152, 4);
  }
  roundRect(c, 22, 14, 156, 104, 5);
  c.fillStyle = gradV(c, 14, 118, '#ffffff', '#f3eeda');
  c.fill();
  text(c, '確定申告', 100, 40, { size: 30, weight: 900, color: INK });
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
  angryEyes(c, 100, 152, 30, 10);
}

function drawBossAd(c: Ctx): void {
  roundRect(c, 6, 24, 188, 150, 12);
  c.fillStyle = gradV(c, 24, 174, '#2a2e3d', '#10121a');
  c.fill();
  roundRect(c, 13, 31, 174, 112, 7);
  c.fillStyle = gradV(c, 31, 143, '#5b2ea6', '#12265c');
  c.fill();
  circle(c, 100, 86, 31, 'rgba(255,255,255,0.94)');
  poly(c, [90, 68, 90, 104, 121, 86], '#15171f');
  roundRect(c, 19, 37, 48, 23, 5);
  c.fillStyle = gradV(c, 37, 60, '#ffe066', '#f5b800');
  c.fill();
  text(c, '広告', 43, 49.5, { size: 16, weight: 900, color: '#15171f' });
  fillRoundRect(c, 84, 113, 98, 24, 3, 'rgba(0,0,0,0.72)');
  c.strokeStyle = '#b8b8b8';
  c.lineWidth = 1;
  c.strokeRect(84, 113, 98, 24);
  text(c, '広告をスキップ ▶ 5', 133, 125.5, { size: 11, weight: 700, maxWidth: 90 });
  c.fillStyle = '#4c5060';
  c.fillRect(13, 150, 174, 7);
  c.fillStyle = '#ffd23f';
  c.fillRect(13, 150, 58, 7);
  circle(c, 71, 153.5, 6, '#ffd23f');
  angryEyes(c, 100, 186, 26, 8);
}

function drawBossRelatives(c: Ctx): void {
  const heads: [number, number, string, string][] = [
    [46, 150, '#7b5b3a', '#6c8ebf'],
    [154, 150, '#b9b9c4', '#bf6c8e'],
    [100, 142, '#3b3027', '#7fae6c'],
  ];
  for (const [x, y, hair, cloth] of heads) {
    fillRoundRect(c, x - 36, y + 22, 72, 40, 16, cloth);
    c.beginPath();
    c.arc(x, y, 30, 0, Math.PI * 2);
    c.fillStyle = radial(c, x - 9, y - 10, 38, [[0, '#ffe6cf'], [1, '#f2bf95']]);
    c.fill();
    c.beginPath();
    c.arc(x, y - 4, 31, Math.PI * 1.05, Math.PI * 1.95);
    c.fillStyle = hair;
    c.fill();
    // にこにこ顔。目は弧、口は大きく開ける
    c.strokeStyle = INK;
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
    ellipse(c, x - 17, y + 10, 5, 3, 'rgba(255,120,120,0.5)');
    ellipse(c, x + 17, y + 10, 5, 3, 'rgba(255,120,120,0.5)');
  }
  fillRoundRect(c, 12, 6, 176, 68, 20, '#ffffff');
  poly(c, [84, 70, 116, 70, 96, 94], '#ffffff');
  text(c, 'いい人', 100, 28, { size: 26, weight: 900, color: INK });
  text(c, 'いないの？', 100, 54, { size: 22, weight: 900, color: '#d6336c' });
}

// ---------------------------------------------------------------- ブロック（幅 150 × 高さ 110）

/** 箱の上面の高さ。数字と HP バーは描画のたびに正面へ重ねる */
export const BLOCK_TOP = 16;
/** 正面に描く数字の中心（箱の中心からの x のずれ、下端からの高さ）と幅の上限 */
export const BLOCK_NUMBER = { dx: 20, up: 43, maxWidth: 92 } as const;

/** ブロックの種類を表す白い絵。s は一辺の大きさ */
function drawIcon(c: Ctx, kind: BlockKind, cx: number, cy: number, s: number): void {
  const u = s / 40;
  c.save();
  c.translate(cx, cy);
  c.scale(u, u);
  c.fillStyle = '#ffffff';
  c.strokeStyle = '#ffffff';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  switch (kind) {
    case 'gold':
      // エナジードリンクの缶に、稲妻
      fillRoundRect(c, -11, -15, 22, 32, 5, '#ffffff');
      fillRoundRect(c, -8, -19, 16, 6, 2.5, 'rgba(255,255,255,0.8)');
      poly(c, [3, -10, -7, 3, -1, 3, -4, 13, 7, -1, 1, -1], '#f5a000');
      break;
    case 'rank':
      // 上向きの矢羽根 2 枚
      for (const y of [-6, 8]) poly(c, [-15, y + 6, 0, y - 10, 15, y + 6, 15, y + 13, 0, y - 2, -15, y + 13], '#ffffff');
      break;
    case 'buddy':
      ellipse(c, 0, 4, 18, 9, '#ffffff');
      ellipse(c, 0, 0, 18, 9, 'rgba(255,255,255,0.75)');
      circle(c, 0, -1, 3.5, 'rgba(0,0,0,0.35)');
      break;
    case 'bomb':
      circle(c, -2, 5, 13, '#ffffff');
      c.fillRect(-1, -13, 7, 8);
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(3, -12);
      c.quadraticCurveTo(10, -20, 16, -13);
      c.stroke();
      circle(c, 16, -13, 3, '#fff3a0');
      break;
    case 'vacation':
      // パラソル
      c.beginPath();
      c.arc(0, 0, 17, Math.PI, 0);
      c.closePath();
      c.fill();
      c.lineWidth = 3.5;
      c.beginPath();
      c.moveTo(0, -2);
      c.lineTo(0, 17);
      c.stroke();
      poly(c, [-6, 0, -2, -16.5, 2, -16.5, 6, 0], 'rgba(0,0,0,0.22)');
      break;
    case 'expand':
      poly(c, [-17, -1, 0, -17, 17, -1, 12, -1, 12, 16, -12, 16, -12, -1], '#ffffff');
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(-2.5, 0, 5, 13);
      c.fillRect(-7, 4, 14, 5);
      break;
    case 'trap':
      break;
    case 'hat':
      ellipse(c, 0, 10, 19, 5, '#ffffff');
      fillRoundRect(c, -11, -12, 22, 22, 9, '#ffffff');
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(-11, 3, 22, 4);
      break;
  }
  c.restore();
}

function drawBlock(c: Ctx, kind: BlockKind): void {
  const color = BLOCK_COLORS[kind];
  const h = 110 - BLOCK_TOP;
  // 上面
  poly(c, [13, 0, 137, 0, 150, BLOCK_TOP, 0, BLOCK_TOP], color);
  poly(c, [13, 0, 137, 0, 150, BLOCK_TOP, 0, BLOCK_TOP], 'rgba(255,255,255,0.45)');
  // 正面
  fillRoundRect(c, 0, BLOCK_TOP, 150, h, 7, color);
  roundRect(c, 0, BLOCK_TOP, 150, h, 7);
  c.fillStyle = gradV(c, BLOCK_TOP, 110, 'rgba(255,255,255,0.22)', 'rgba(0,0,0,0.3)');
  c.fill();
  // 面取りの光と影
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(4, BLOCK_TOP + 2, 142, 3);
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.fillRect(4, 104, 142, 4);
  if (kind === 'trap') {
    // 危険物ではなく「お買い得」に見せる。赤い縞は下の細い帯だけ
    c.save();
    roundRect(c, 0, BLOCK_TOP, 150, h, 7);
    c.clip();
    for (let x = -20; x < 170; x += 22) poly(c, [x, 110, x + 11, 110, x + 21, 98, x + 10, 98], '#e3101f');
    c.restore();
    c.save();
    c.translate(75, 40);
    c.rotate(-0.06);
    text(c, BLOCKS.trap.name, 0, 0, { size: 27, weight: 900, color: '#e3101f', stroke: '#ffffff', strokeWidth: 6, maxWidth: 132 });
    c.restore();
    return;
  }
  if (kind === 'gold') {
    for (const [x, y, r] of [[18, 28, 5], [134, 34, 4], [126, 96, 3.5]] as const) {
      poly(c, [x, y - r, x + r * 0.3, y - r * 0.3, x + r, y, x + r * 0.3, y + r * 0.3, x, y + r, x - r * 0.3, y + r * 0.3, x - r, y, x - r * 0.3, y - r * 0.3], '#fffbe0');
    }
  }
  text(c, BLOCKS[kind].name, 75, 34, { size: 19, weight: 900, stroke: 'rgba(0,0,0,0.6)', strokeWidth: 4, maxWidth: 134 });
  drawIcon(c, kind, 27, 110 - BLOCK_NUMBER.up, 38);
}

// ---------------------------------------------------------------- プレイヤーまわり

/** suit が真なら、スーツ姿（月曜日を倒したあとの出社スタイル） */
function drawPlayer(c: Ctx, suit: boolean): void {
  const pants = suit ? '#262b3a' : '#2b3a67';
  const shoes = suit ? '#17181d' : '#f4f6fa';
  const sleeve = suit ? '#34405f' : '#ff6b3d';
  const jacket = suit ? (['#46537a', '#262f4c'] as const) : (['#ff8a55', '#f0502a'] as const);
  const bag = suit ? (['#8a5f38', '#5a3a1e'] as const) : (['#4f5d86', '#2f3a5c'] as const);
  // 奥を向いて立っている後ろ姿。頭を大きめにして、遠目にも人だと分かるようにする
  fillRoundRect(c, 23, 66, 12, 22, 5, pants);
  fillRoundRect(c, 41, 66, 12, 22, 5, pants);
  fillRoundRect(c, 20, 84, 17, 9, 4, shoes);
  fillRoundRect(c, 39, 84, 17, 9, 4, shoes);
  // 右腕は横に伸ばして武器を構える
  c.strokeStyle = sleeve;
  c.lineWidth = 10;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(52, 46);
  c.lineTo(66, 52);
  c.stroke();
  c.beginPath();
  c.moveTo(24, 46);
  c.lineTo(14, 60);
  c.stroke();
  roundRect(c, 18, 38, 40, 36, 13);
  c.fillStyle = gradV(c, 38, 74, jacket[0], jacket[1]);
  c.fill();
  // リュック
  roundRect(c, 25, 44, 26, 25, 7);
  c.fillStyle = gradV(c, 44, 69, bag[0], bag[1]);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.fillRect(29, 52, 18, 3);
  circle(c, 67, 52, 5.5, '#ffd9b8');
  circle(c, 13.5, 61, 5.5, '#ffd9b8');
  fillRoundRect(c, 33, 31, 10, 10, 3, '#f2bf95');
  // スーツのときは、白いシャツの襟をのぞかせる
  if (suit) fillRoundRect(c, 28, 36.5, 20, 5, 2.5, '#ffffff');
  c.beginPath();
  c.arc(38, 20, 18, 0, Math.PI * 2);
  c.fillStyle = radial(c, 31, 11, 24, [[0, '#7a4f2e'], [1, '#3e2614']]);
  c.fill();
  ellipse(c, 21.5, 23, 3, 5, '#ffd9b8');
  ellipse(c, 54.5, 23, 3, 5, '#ffd9b8');
  ellipse(c, 31, 10, 7, 3.5, 'rgba(255,255,255,0.22)');
}

function drawHat(c: Ctx, color: string): void {
  ellipse(c, 19, 13, 19, 5, color);
  roundRect(c, 7, 1, 24, 13, 8);
  c.fillStyle = color;
  c.fill();
  roundRect(c, 7, 1, 24, 13, 8);
  c.fillStyle = gradV(c, 1, 14, 'rgba(255,255,255,0.4)', 'rgba(0,0,0,0.1)');
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(7, 9, 24, 3);
}

/** AI の相棒。宙に浮く白い球に、暗い画面の顔。頭の上に、AI の目印のきらめき（実在のサービスのロゴには似せない） */
function drawBuddyAi(c: Ctx): void {
  // 浮いているので、下に光の輪
  ellipse(c, 27, 44, 15, 4, 'rgba(120,200,255,0.55)');
  ellipse(c, 27, 44, 9, 2.2, 'rgba(255,255,255,0.8)');
  // 本体
  c.beginPath();
  c.arc(27, 25, 16, 0, Math.PI * 2);
  c.fillStyle = radial(c, 21, 17, 22, [[0, '#ffffff'], [0.6, '#e4ecff'], [1, '#aab8e0']]);
  c.fill();
  // 顔の画面
  fillRoundRect(c, 15, 18, 24, 14, 7, '#1b2140');
  c.strokeStyle = '#7df0ff';
  c.lineWidth = 2;
  c.lineCap = 'round';
  for (const x of [21.5, 32.5]) {
    c.beginPath();
    c.arc(x, 26.5, 2.8, Math.PI * 1.15, Math.PI * 1.85);
    c.stroke();
  }
  // きらめき（大小 2 つの 4 角の星）
  for (const [x, y, r, color] of [[42, 9, 7, '#ffb347'], [50, 19, 3.6, '#ff7ad9']] as const) {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x, y - r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.quadraticCurveTo(x, y, x, y + r);
    c.quadraticCurveTo(x, y, x - r, y);
    c.quadraticCurveTo(x, y, x, y - r);
    c.fill();
  }
}

function drawBuddy(c: Ctx): void {
  ellipse(c, 27, 19, 26, 12, '#262a35');
  c.beginPath();
  c.ellipse(27, 15, 26, 12, 0, 0, Math.PI * 2);
  c.fillStyle = gradV(c, 3, 27, '#7d869b', '#444b5c');
  c.fill();
  c.beginPath();
  c.ellipse(27, 14, 18, 7.5, 0, 0, Math.PI * 2);
  c.fillStyle = gradV(c, 6, 22, '#9aa3b8', '#5d6577');
  c.fill();
  circle(c, 27, 13, 4.2, '#1e222b');
  circle(c, 27, 13, 2.8, '#69f08a');
  ellipse(c, 17, 8.5, 7, 2, 'rgba(255,255,255,0.35)');
}

/** 武器（幅 44 × 高さ 70）。上が銃口 */
const WEAPON_DRAWERS: ((c: Ctx) => void)[] = [
  // 0 水鉄砲
  (c) => {
    fillRoundRect(c, 19, 4, 6, 16, 2, '#ff9f1a');
    roundRect(c, 14, 16, 16, 40, 6);
    c.fillStyle = gradV(c, 16, 56, '#6fdcff', '#1ea6e0');
    c.fill();
    circle(c, 26, 46, 10, '#ff9f1a');
    circle(c, 23.5, 43, 3, 'rgba(255,255,255,0.65)');
    fillRoundRect(c, 15, 52, 9, 16, 3, '#1c9fd6');
  },
  // 1 輪ゴム鉄砲
  (c) => {
    fillRoundRect(c, 18, 6, 9, 56, 2, '#b67a41');
    fillRoundRect(c, 10, 46, 25, 8, 2, '#8a5a2c');
    fillRoundRect(c, 14, 52, 9, 16, 2, '#8a5a2c');
    c.strokeStyle = '#f0d08a';
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
    poly(c, [5, 38, 39, 38, 35, 66, 9, 66], '#e0ad62');
    poly(c, [5, 38, 39, 38, 37, 44, 7, 44], '#b98338');
    for (const [x, y] of [[13, 36], [22, 33], [31, 36], [17, 30], [27, 30], [22, 26]] as const) circle(c, x, y, 4.5, '#ecc973');
    text(c, '福', 22, 55, { size: 15, weight: 900, color: '#7a4b12' });
  },
  // 3 エアガン
  (c) => {
    fillRoundRect(c, 17, 4, 10, 6, 1, '#ff7a1a');
    fillRoundRect(c, 17, 9, 10, 36, 2, '#343842');
    fillRoundRect(c, 13, 36, 18, 14, 3, '#454a56');
    fillRoundRect(c, 14, 48, 11, 20, 3, '#2a2d34');
  },
  // 4 ピストル
  (c) => {
    roundRect(c, 16, 4, 12, 40, 2);
    c.fillStyle = gradV(c, 4, 44, '#e2e7f0', '#9aa3b2');
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(16, 20, 12, 3);
    fillRoundRect(c, 13, 38, 18, 12, 3, '#9aa3b2');
    fillRoundRect(c, 14, 48, 12, 20, 3, '#4b3a2a');
  },
  // 5 ショットガン
  (c) => {
    fillRoundRect(c, 12, 0, 9, 50, 3, '#454a56');
    fillRoundRect(c, 23, 0, 9, 50, 3, '#454a56');
    fillRoundRect(c, 11, 30, 22, 10, 2, '#9a6732');
    fillRoundRect(c, 13, 46, 18, 22, 4, '#6e4621');
  },
  // 6 マシンガン
  (c) => {
    fillRoundRect(c, 19, 0, 6, 12, 1, '#1e2026');
    fillRoundRect(c, 15, 8, 14, 50, 3, '#3d424e');
    fillRoundRect(c, 28, 34, 10, 20, 2, '#23262d');
    fillRoundRect(c, 15, 54, 10, 14, 3, '#23262d');
    c.fillStyle = '#687086';
    for (let y = 14; y < 34; y += 5) c.fillRect(17, y, 10, 2);
  },
  // 7 ガトリング砲
  (c) => {
    roundRect(c, 7, 2, 30, 46, 5);
    c.fillStyle = gradV(c, 2, 48, '#aab2c4', '#6c7488');
    c.fill();
    c.fillStyle = '#4c5261';
    for (const x of [10, 17, 24, 31]) c.fillRect(x, 2, 3, 46);
    fillRoundRect(c, 7, 6, 30, 5, 2, '#5c6373');
    fillRoundRect(c, 7, 36, 30, 5, 2, '#5c6373');
    fillRoundRect(c, 12, 46, 20, 22, 4, '#3a3e47');
  },
  // 8 バズーカ
  (c) => {
    fillRoundRect(c, 5, 0, 34, 9, 3, '#44602a');
    roundRect(c, 10, 4, 24, 62, 5);
    c.fillStyle = gradV(c, 4, 66, '#7c9a50', '#4d6a2e');
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.fillRect(10, 30, 24, 5);
    fillRoundRect(c, 32, 22, 7, 14, 2, '#2f3d1d');
    fillRoundRect(c, 14, 60, 16, 9, 3, '#44602a');
  },
  // 9 レーザー
  (c) => {
    roundRect(c, 13, 14, 18, 52, 5);
    c.fillStyle = gradV(c, 14, 66, '#ffffff', '#cfd6e3');
    c.fill();
    c.fillStyle = '#ff3b30';
    c.fillRect(13, 30, 18, 4);
    c.fillRect(13, 40, 18, 4);
    circle(c, 22, 11, 10, '#30343d');
    circle(c, 22, 11, 6, '#ff3b30');
    circle(c, 20, 9, 2, '#ffd0cc');
  },
  // 10 波動砲
  (c) => {
    roundRect(c, 8, 12, 28, 54, 6);
    c.fillStyle = gradV(c, 12, 66, '#3a55b8', '#1a2a66');
    c.fill();
    fillRoundRect(c, 4, 26, 36, 8, 3, '#5b78e0');
    circle(c, 22, 13, 13, '#0f1a44');
    circle(c, 22, 13, 9, '#7fe3ff');
    circle(c, 22, 13, 4, '#fff');
  },
  // 11 回転寿司レーン砲
  (c) => {
    fillRoundRect(c, 5, 6, 34, 60, 6, '#aab2c4');
    fillRoundRect(c, 9, 10, 26, 52, 4, '#3a3e47');
    for (const [y, top] of [[24, '#e8452f'], [48, '#ffb347']] as const) {
      ellipse(c, 22, y + 3, 11, 7, '#fff');
      fillRoundRect(c, 15, y - 3, 14, 7, 3, '#fafafa');
      fillRoundRect(c, 14, y - 6, 16, 6, 3, top);
    }
  },
  // 12 課金砲
  (c) => {
    roundRect(c, 9, 4, 26, 62, 6);
    c.fillStyle = gradV(c, 4, 66, '#ffe27a', '#d99a00');
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
    c.strokeStyle = INK;
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
    c.strokeStyle = '#e8943a';
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(34, 60);
    c.quadraticCurveTo(46, 54, 38, 42);
    c.stroke();
    ellipse(c, 22, 50, 15, 17, '#f4a94e');
    circle(c, 22, 26, 13, '#f7b660');
    poly(c, [10, 22, 12, 7, 20, 16], '#f4a94e');
    poly(c, [34, 22, 32, 7, 24, 16], '#f4a94e');
    c.fillStyle = '#d9822b';
    for (const y of [44, 51, 58]) c.fillRect(13, y, 18, 3);
    c.fillRect(19, 15, 2.5, 8);
    c.fillRect(23.5, 15, 2.5, 8);
  },
];

export const WEAPON_SPRITE = { w: 44, h: 70 } as const;

// ---------------------------------------------------------------- 光と雲

function drawGlow(c: Ctx, color: string): void {
  c.globalAlpha = 0.9;
  c.fillStyle = radial(c, 50, 50, 50, [[0, color], [0.35, color], [1, 'rgba(255,255,255,0)']]);
  c.fillRect(0, 0, 100, 100);
}

function drawMuzzle(c: Ctx): void {
  c.fillStyle = radial(c, 32, 32, 32, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,240,170,0.9)'], [1, 'rgba(255,170,60,0)']]);
  c.fillRect(0, 0, 64, 64);
  const pts: number[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 9 : 30;
    pts.push(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  poly(c, pts, 'rgba(255,250,210,0.85)');
}

function drawCloud(c: Ctx, variant: number): void {
  const blobs = [
    [40, 34, 26],
    [70, 26, 30],
    [102, 34, 24],
    [56, 44, 24],
    [88, 44, 26],
  ] as const;
  c.fillStyle = 'rgba(255,255,255,0.92)';
  for (const [x, y, r] of blobs) {
    c.beginPath();
    c.ellipse(x + variant * 3, y, r * 1.25, r * 0.62, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = 'rgba(190,225,250,0.55)';
  c.beginPath();
  c.ellipse(72 + variant * 3, 54, 52, 9, 0, 0, Math.PI * 2);
  c.fill();
}

/** 全スプライトを作る。起動時に 1 回だけ呼ぶ */
export function initSprites(): void {
  NOTICE_VARIANTS.forEach(([app, label], i) => make(`enemy.notice.${i}`, 48, 50, (c) => drawNotice(c, app, label), { shadow: [24, 47, 17, 4], flash: true }));
  make('enemy.spam', 36, 30, drawSpam, { shadow: [18, 28, 15, 3], flash: true });
  make('enemy.deadline', 84, 94, drawDeadline, { shadow: [42, 91, 32, 5], flash: true });
  make('enemy.revolving', 58, 44, drawRevolving, { shadow: [29, 42, 25, 4], flash: true });
  [drawBossMonday, drawBossTax, drawBossAd, drawBossRelatives].forEach((draw, i) =>
    make(`boss.${i}`, 200, 200, draw, { shadow: [100, 196, 84, 9], flash: true }),
  );
  for (const kind of BLOCK_KINDS) {
    make(`block.${kind}`, 150, 110, (c) => drawBlock(c, kind), { flash: true });
    make(`glow.${kind}`, 100, 100, (c) => drawGlow(c, BLOCK_COLORS[kind]), { noOutline: true });
  }
  make('player', 76, 94, (c) => drawPlayer(c, false), { shadow: [38, 92, 28, 5] });
  make('player.suit', 76, 94, (c) => drawPlayer(c, true), { shadow: [38, 92, 28, 5] });
  make('buddy', 54, 32, drawBuddy, { shadow: [27, 28, 26, 6] });
  make('buddy.ai', 56, 48, drawBuddyAi);
  HAT_COLORS.forEach((color, i) => make(`hat.${i}`, 38, 18, (c) => drawHat(c, color)));
  WEAPONS.forEach((_, i) => make(`weapon.${i}`, WEAPON_SPRITE.w, WEAPON_SPRITE.h, WEAPON_DRAWERS[i]!));
  make('muzzle', 64, 64, drawMuzzle, { noOutline: true });
  for (const kind of BLOCK_KINDS) if (kind !== 'trap') make(`icon.${kind}`, 40, 40, (c) => drawIcon(c, kind, 20, 20, 36));
  for (let level = 1; level <= CRACK_LEVELS; level++) make(`crack.${level}`, 150, 110, (c) => drawCracks(c, level), { noOutline: true });
  for (let i = 0; i < 3; i++) make(`cloud.${i}`, 150, 70, (c) => drawCloud(c, i), { noOutline: true });
}

/** 下端の中央を (cx, bottom) に合わせ、横と縦を別々の倍率で描く（歩く・撃たれるときの伸び縮み用） */
export function drawSpriteStretch(ctx: Ctx, id: string, cx: number, bottom: number, sx: number, sy: number): void {
  const s = sprite(id);
  const w = (s.w + PAD * 2) * sx;
  const h = (s.h + PAD * 2) * sy;
  ctx.drawImage(s.canvas, cx - w / 2, bottom - h + PAD * sy, w, h);
}

/** ブロックのひびの段階の数。削れるほど段階が上がる */
export const CRACK_LEVELS = 3;

/** ブロックの正面に重ねるひび。段階が上がるほど本数が増える */
function drawCracks(c: Ctx, level: number): void {
  // ひびの折れ線（正面の左上を原点とした座標）。先頭から level × 2 本を描く
  const lines: readonly (readonly number[])[] = [
    [118, 20, 104, 38, 112, 52, 96, 70],
    [20, 100, 36, 84, 30, 70, 48, 58],
    [70, 18, 62, 34, 74, 46],
    [140, 76, 122, 82, 112, 100],
    [8, 40, 24, 46, 34, 36, 52, 44],
    [84, 104, 78, 88, 92, 78, 86, 62],
  ];
  c.lineJoin = 'round';
  c.lineCap = 'round';
  for (let i = 0; i < Math.min(lines.length, level * 2); i++) {
    const pts = lines[i]!;
    for (const [color, width, dy] of [['rgba(255,255,255,0.55)', 1.5, 1.5], ['rgba(10,14,30,0.8)', 2.4, 0]] as const) {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.beginPath();
      c.moveTo(pts[0]!, pts[1]! + dy);
      for (let j = 2; j < pts.length; j += 2) c.lineTo(pts[j]!, pts[j + 1]! + dy);
      c.stroke();
    }
  }
}
