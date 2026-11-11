// 遠景（空、街並み、海）。遊び進めるほど時間帯が移り変わる（仕様書 6.9 節）。
// ルールには影響しない、見た目だけの演出。
import { circle, poly, type Ctx } from './draw.ts';
import { H, HORIZON_Y, W } from './projection.ts';

/** 時間帯ごとの色 */
export interface Palette {
  /** 空の色（上、中、地平線） */
  sky: readonly [string, string, string];
  /** 太陽か月の位置・大きさ・色 */
  sun: { x: number; y: number; r: number; core: string; glow: string };
  /** 街並みの色（奥の列、手前の列）と、窓の色 */
  city: readonly [string, string];
  windows: string;
  /** 海の色（地平線、中、手前） */
  sea: readonly [string, string, string];
  /** 星を描くか */
  stars: boolean;
  /** 雲の濃さ */
  clouds: number;
  /** 道の上のもの全体に重ねる色（時間帯の光） */
  tint: string;
}

export const PALETTES: readonly Palette[] = [
  // 昼
  {
    sky: ['#1877e6', '#58bbff', '#dff6ff'],
    sun: { x: 430, y: 86, r: 170, core: 'rgba(255,255,240,0.95)', glow: 'rgba(255,250,210,0.75)' },
    city: ['#a9d6f3', '#7fb9e2'],
    windows: 'rgba(255,255,255,0.45)',
    sea: ['#b6f0f5', '#4fcfe0', '#127fb0'],
    stars: false,
    clouds: 1,
    tint: 'rgba(255,255,255,0)',
  },
  // 夕焼け
  {
    sky: ['#3b2a7a', '#e0607a', '#ffd29a'],
    sun: { x: 392, y: 206, r: 190, core: 'rgba(255,240,200,0.98)', glow: 'rgba(255,150,70,0.8)' },
    city: ['#b4708c', '#7a4a78'],
    windows: 'rgba(255,230,150,0.75)',
    sea: ['#ffc9a0', '#e07a8a', '#5a3a80'],
    stars: false,
    clouds: 0.8,
    tint: 'rgba(255,110,50,0.11)',
  },
  // 夜
  {
    sky: ['#060a24', '#141c4a', '#3a3f7a'],
    sun: { x: 428, y: 92, r: 110, core: 'rgba(250,250,255,0.98)', glow: 'rgba(170,190,255,0.5)' },
    city: ['#2a3566', '#1a2148'],
    windows: 'rgba(255,220,120,0.95)',
    sea: ['#4a5a9a', '#1c2a5e', '#0a1030'],
    stars: true,
    clouds: 0.25,
    tint: 'rgba(16,24,90,0.24)',
  },
  // 夜明け
  {
    sky: ['#3a5ac8', '#f0a0c0', '#ffe9c0'],
    sun: { x: 128, y: 212, r: 180, core: 'rgba(255,250,235,0.98)', glow: 'rgba(255,170,190,0.75)' },
    city: ['#c9a8d8', '#9a84c0'],
    windows: 'rgba(255,240,200,0.5)',
    sea: ['#ffe0d0', '#c0a0e0', '#4a6ac0'],
    stars: false,
    clouds: 0.9,
    tint: 'rgba(255,150,200,0.07)',
  },
];

/** 1 つの時間帯の長さ（秒）。5 ウェーブぶん */
export const PHASE_SECONDS = 100;
/** 次の時間帯へ移り変わるのにかける時間（秒）。ボス戦のウェーブのあいだに空が変わる */
export const PHASE_FADE = 20;

/** 経過時間から、今の時間帯・次の時間帯・混ざり具合（0〜1）を求める */
export function skyPhase(t: number): { from: number; to: number; mix: number } {
  const from = Math.floor(t / PHASE_SECONDS) % PALETTES.length;
  const within = t % PHASE_SECONDS;
  const x = Math.max(0, (within - (PHASE_SECONDS - PHASE_FADE)) / PHASE_FADE);
  return { from, to: (from + 1) % PALETTES.length, mix: x * x * (3 - 2 * x) };
}

/** 番号から決まる 0〜1 の擬似乱数。見た目を毎回同じにするために使う */
export function hash(i: number): number {
  const v = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
  return v - Math.floor(v);
}

function drawSky(c: Ctx, p: Palette): void {
  const sky = c.createLinearGradient(0, 0, 0, HORIZON_Y);
  sky.addColorStop(0, p.sky[0]);
  sky.addColorStop(0.55, p.sky[1]);
  sky.addColorStop(1, p.sky[2]);
  c.fillStyle = sky;
  c.fillRect(0, 0, W, HORIZON_Y);
  if (p.stars) {
    for (let i = 0; i < 90; i++) {
      c.globalAlpha = 0.35 + hash(i + 300) * 0.65;
      circle(c, hash(i + 100) * W, hash(i + 200) ** 1.4 * (HORIZON_Y - 40), 0.6 + hash(i + 400) * 1.1, '#ffffff');
    }
    c.globalAlpha = 1;
  }
  const sun = c.createRadialGradient(p.sun.x, p.sun.y, 0, p.sun.x, p.sun.y, p.sun.r);
  sun.addColorStop(0, p.sun.core);
  sun.addColorStop(0.12, p.sun.glow);
  sun.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sun;
  c.fillRect(0, 0, W, HORIZON_Y);
}

function drawSkyline(c: Ctx, p: Palette): void {
  // 奥の列は淡く、手前の列は少し濃く。窓を点で入れる
  for (let layer = 0; layer < 2; layer++) {
    let x = layer === 0 ? -10 : -24;
    let i = layer * 31;
    while (x < W) {
      const w = 22 + hash(i) * 26;
      const h = (layer === 0 ? 34 : 18) + hash(i + 7) * (layer === 0 ? 54 : 44);
      c.fillStyle = p.city[layer]!;
      c.fillRect(x, HORIZON_Y - h, w, h);
      c.fillStyle = p.windows;
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

function drawSea(c: Ctx, p: Palette): void {
  const sea = c.createLinearGradient(0, HORIZON_Y, 0, H);
  sea.addColorStop(0, p.sea[0]);
  sea.addColorStop(0.25, p.sea[1]);
  sea.addColorStop(1, p.sea[2]);
  c.fillStyle = sea;
  c.fillRect(0, HORIZON_Y, W, H - HORIZON_Y);
  // 波の筋。奥ほど細かく
  for (let i = 1; i < 40; i++) {
    const far = 1 - i / 40;
    const k = 1 / (1 + 3 * far * far);
    const y = HORIZON_Y + ((860 - HORIZON_Y) * (k - 0.25)) / 0.75;
    c.fillStyle = `rgba(255,255,255,${0.05 + 0.1 * hash(i)})`;
    c.fillRect(0, y, W, Math.max(1, 2.5 * k));
  }
}

/** 遠景を 1 枚描く */
export function drawWorld(c: Ctx, p: Palette): void {
  drawSky(c, p);
  drawSkyline(c, p);
  drawSea(c, p);
}
