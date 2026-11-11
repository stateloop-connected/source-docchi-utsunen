// キャンバス上のボタン。タップでもキーボード（フォーカス移動 + 決定）でも押せる。
import { INK, fancyText, fillRoundRect, gradV, roundRect, text, type Ctx } from '../render/draw.ts';

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

export interface ButtonLook {
  focused: boolean;
  /** 中心から拡大する倍率（脈打つ演出用） */
  scale?: number;
  /** 横の揺れ */
  dx?: number;
  /** 光の帯が横切る位置（0〜1）。負なら出さない */
  shine?: number;
}

/** 立体的な板のボタン（上が明るく、下に厚みがある） */
function slab(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, top: string, bottom: string, edge: string): void {
  fillRoundRect(ctx, x - 3, y - 3, w + 6, h + 12, r + 3, INK);
  fillRoundRect(ctx, x, y + 6, w, h, r, edge);
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = gradV(ctx, y, y + h, top, bottom);
  ctx.fill();
  roundRect(ctx, x + 4, y + 3, w - 8, h * 0.42, r * 0.7);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();
}

export function drawButton(ctx: Ctx, b: Button, look: ButtonLook): void {
  ctx.save();
  ctx.translate(b.x + b.w / 2 + (look.dx ?? 0), b.y + b.h / 2);
  const scale = look.scale ?? 1;
  ctx.scale(scale, scale);
  const x = -b.w / 2;
  const y = -b.h / 2;
  let ring = Math.min(18, b.h / 2.6);
  switch (b.style) {
    case 'primary': {
      slab(ctx, x, y, b.w, b.h, ring, '#7dea6a', '#22b04d', '#147a35');
      const shine = look.shine ?? -1;
      if (shine >= 0) {
        ctx.save();
        roundRect(ctx, x, y, b.w, b.h, ring);
        ctx.clip();
        const sx = x - 60 + (b.w + 120) * shine;
        ctx.beginPath();
        ctx.moveTo(sx, y + b.h);
        ctx.lineTo(sx + 26, y + b.h);
        ctx.lineTo(sx + 50, y);
        ctx.lineTo(sx + 24, y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fill();
        ctx.restore();
      }
      fancyText(ctx, b.label, 0, 1, { size: b.h * 0.46, top: '#ffffff', bottom: '#eaffd8', stroke: '#0f5a27', maxWidth: b.w - 24 });
      break;
    }
    case 'normal':
      slab(ctx, x, y, b.w, b.h, ring, '#ffffff', '#dfe5f0', '#8f99ae');
      text(ctx, b.label, 0, 1, { size: b.h * 0.38, weight: 900, color: INK, maxWidth: b.w - 20 });
      break;
    case 'small':
      fillRoundRect(ctx, x - 2, y - 2, b.w + 4, b.h + 4, ring + 2, INK);
      roundRect(ctx, x, y, b.w, b.h, ring);
      ctx.fillStyle = gradV(ctx, y, y + b.h, '#55607c', '#2c3246');
      ctx.fill();
      text(ctx, b.label, 0, 1, { size: 16, weight: 900, maxWidth: b.w - 12 });
      break;
    case 'pause':
      ring = 12;
      fillRoundRect(ctx, x - 2.5, y - 2.5, b.w + 5, b.h + 5, ring + 2.5, INK);
      roundRect(ctx, x, y, b.w, b.h, ring);
      ctx.fillStyle = gradV(ctx, y, y + b.h, '#55607c', '#2c3246');
      ctx.fill();
      fillRoundRect(ctx, -9, -9, 6.5, 18, 2, '#ffffff');
      fillRoundRect(ctx, 2.5, -9, 6.5, 18, 2, '#ffffff');
      break;
    case 'close':
      // 広告の「✕」。わざと小さく、目立たなくしてある
      ring = b.w / 2;
      fillRoundRect(ctx, x, y, b.w, b.h, ring, 'rgba(20,24,40,0.55)');
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      roundRect(ctx, x, y, b.w, b.h, ring);
      ctx.stroke();
      text(ctx, b.label, 0, 1, { size: 13, weight: 700 });
      break;
  }
  if (look.focused) {
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#ffe066';
    roundRect(ctx, x - 7, y - 7, b.w + 14, b.h + (b.style === 'primary' || b.style === 'normal' ? 20 : 14), ring + 7);
    ctx.stroke();
  }
  ctx.restore();
}
