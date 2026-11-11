// キャンバス上のボタン。タップでもキーボード（フォーカス移動 + 決定）でも押せる。
import { fillRoundRect, roundRect, text, type Ctx } from '../render/draw.ts';

export type ButtonStyle = 'primary' | 'normal' | 'small' | 'close' | 'pause';

export interface Button {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  style: ButtonStyle;
}

/** 小さいボタンでも指で押せるよう、当たり判定を少し広げる */
const TOUCH_SLOP = 8;

export function hitButton(buttons: readonly Button[], x: number, y: number): Button | undefined {
  return buttons.find((b) => x >= b.x - TOUCH_SLOP && x <= b.x + b.w + TOUCH_SLOP && y >= b.y - TOUCH_SLOP && y <= b.y + b.h + TOUCH_SLOP);
}

const COLORS: Record<ButtonStyle, { fill: string; edge: string; label: string }> = {
  primary: { fill: '#2fbf5f', edge: '#17803a', label: '#ffffff' },
  normal: { fill: '#f1f3f5', edge: '#9aa3b5', label: '#1d1f26' },
  small: { fill: 'rgba(0,0,0,0.55)', edge: 'rgba(255,255,255,0.5)', label: '#ffffff' },
  close: { fill: 'rgba(0,0,0,0.45)', edge: 'rgba(255,255,255,0.6)', label: '#ffffff' },
  pause: { fill: 'rgba(0,0,0,0.5)', edge: 'rgba(255,255,255,0.6)', label: '#ffffff' },
};

/** scale はボタンを中心から拡大する倍率（脈打つ演出用）、dx は横の揺れ */
export function drawButton(ctx: Ctx, b: Button, focused: boolean, scale = 1, dx = 0): void {
  const c = COLORS[b.style];
  ctx.save();
  ctx.translate(b.x + b.w / 2 + dx, b.y + b.h / 2);
  ctx.scale(scale, scale);
  const x = -b.w / 2;
  const y = -b.h / 2;
  const r = b.style === 'close' ? b.w / 2 : Math.min(18, b.h / 2.6);
  if (b.style === 'primary' || b.style === 'normal') fillRoundRect(ctx, x, y + 5, b.w, b.h, r, c.edge);
  fillRoundRect(ctx, x, y, b.w, b.h, r, c.fill);
  if (b.style === 'small' || b.style === 'close' || b.style === 'pause') {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = c.edge;
    roundRect(ctx, x, y, b.w, b.h, r);
    ctx.stroke();
  }
  if (b.style === 'pause') {
    ctx.fillStyle = c.label;
    ctx.fillRect(-8, -9, 6, 18);
    ctx.fillRect(2, -9, 6, 18);
  } else {
    const size = b.style === 'primary' ? b.h * 0.44 : b.style === 'normal' ? b.h * 0.38 : b.style === 'close' ? 14 : 16;
    text(ctx, b.label, 0, 1, { size, weight: 900, color: c.label, maxWidth: b.w - 16 });
  }
  if (focused) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffe066';
    roundRect(ctx, x - 5, y - 5, b.w + 10, b.h + 10, r + 5);
    ctx.stroke();
  }
  ctx.restore();
}
