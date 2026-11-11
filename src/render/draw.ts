// キャンバス描画の小さな道具。

export type Ctx = CanvasRenderingContext2D;

/** 端末の標準ゴシック（仕様書 1 章） */
export const FONT_FAMILY = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif';

export function font(size: number, weight: number | string = 800): string {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

export function fillRoundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string): void {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

export function circle(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function poly(ctx: Ctx, pts: readonly number[], color: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export interface TextStyle {
  size: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  weight?: number | string;
  /** 縁取りの色。省くと縁取りなし */
  stroke?: string;
  strokeWidth?: number;
  /** この幅に収まるよう文字を縮める */
  maxWidth?: number;
}

/** 文字を描く。maxWidth を超えるときは、横に潰さず文字の大きさを下げる */
export function text(ctx: Ctx, str: string, x: number, y: number, st: TextStyle): void {
  let size = st.size;
  ctx.font = font(size, st.weight);
  if (st.maxWidth !== undefined) {
    const w = ctx.measureText(str).width;
    if (w > st.maxWidth) {
      size = (size * st.maxWidth) / w;
      ctx.font = font(size, st.weight);
    }
  }
  ctx.textAlign = st.align ?? 'center';
  ctx.textBaseline = st.baseline ?? 'middle';
  if (st.stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = st.strokeWidth ?? Math.max(2, size * 0.16);
    ctx.strokeStyle = st.stroke;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = st.color ?? '#fff';
  ctx.fillText(str, x, y);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
