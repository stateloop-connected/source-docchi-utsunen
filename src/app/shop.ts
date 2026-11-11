// ネタのショップ（仕様書 6.10 節）。それらしく見えるだけの、偽の課金機能。
// 本物の決済はなく、入力欄もなく、外部との通信もしない。「購入」しても請求は 0 円で、
// 売っているのは「やる気」。持っていてもゲームの強さは変わらない（コードの中では gems と呼んでいる）。
import { INK, circle, clamp, fancyText, fillRoundRect, gradV, roundRect, text, type Ctx } from '../render/draw.ts';
import { formatComma } from '../render/format.ts';
import { H, W } from '../render/projection.ts';
import type { Button } from './ui.ts';

export interface Pack {
  readonly name: string;
  readonly gems: number;
  readonly yen: number;
  /** 売り文句の札。なければ空 */
  readonly badge: string;
}

export const PACKS: readonly Pack[] = [
  { name: 'ひとつかみ', gems: 60, yen: 120, badge: '' },
  { name: 'お得パック', gems: 500, yen: 980, badge: '人気 No.1' },
  { name: '社会人パック', gems: 2400, yen: 4900, badge: '80% お得' },
  { name: '石油王パック', gems: 99999, yen: 120000, badge: '燃え尽き注意' },
];

/** コンティニューに使う「やる気」の数 */
export const CONTINUE_COST = 5;
/** 「決済中」を見せる時間（秒） */
export const PAYING_SECONDS = 1.3;
/** セールの残り時間（秒）。0 になったら、何事もなかったように最初から数え直す */
const SALE_SECONDS = 300;

/** ショップの画面の状態 */
export type ShopStep =
  | { at: 'list'; notice: string }
  | { at: 'confirm'; pack: number }
  | { at: 'paying'; pack: number; since: number }
  | { at: 'done'; pack: number };

/** ショップで売っているものの名前。数の前に付けて「やる気 60」のように出す */
export const GEM = 'やる気 ';
const ROW_Y = 322;
const ROW_H = 82;

export function shopButtons(step: ShopStep): Button[] {
  if (step.at === 'confirm') {
    return [
      { id: 'pay', x: 90, y: 560, w: 360, h: 64, label: '購入する', style: 'primary' },
      { id: 'cancel', x: 90, y: 646, w: 360, h: 54, label: 'やめる', style: 'normal' },
    ];
  }
  if (step.at === 'paying') return [];
  if (step.at === 'done') return [{ id: 'ok', x: 120, y: 620, w: 300, h: 60, label: 'OK', style: 'primary' }];
  const buttons: Button[] = PACKS.map((p, i) => ({ id: `buy${i}`, x: 348, y: ROW_Y + i * ROW_H + 13, w: 122, h: 44, label: `¥${formatComma(p.yen)}`, style: 'primary' }));
  buttons.push({ id: 'shopClose', x: 70, y: 806, w: 250, h: 54, label: '閉じる', style: 'normal' });
  buttons.push({ id: 'refund', x: 336, y: 812, w: 134, h: 42, label: '返金する', style: 'small' });
  return buttons;
}

/** 「やる気」の絵。炎 */
function drawGem(ctx: Ctx, x: number, y: number, s: number): void {
  const flame = (k: number): void => {
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.25 * k);
    ctx.bezierCurveTo(x + s * 0.2 * k, y - s * 0.5 * k, x + s * 1.05 * k, y - s * 0.2 * k, x + s * 0.85 * k, y + s * 0.55 * k);
    ctx.bezierCurveTo(x + s * 0.7 * k, y + s * 1.2 * k, x - s * 0.7 * k, y + s * 1.2 * k, x - s * 0.85 * k, y + s * 0.55 * k);
    ctx.bezierCurveTo(x - s * 1.05 * k, y - s * 0.1 * k, x - s * 0.35 * k, y - s * 0.3 * k, x, y - s * 1.25 * k);
    ctx.closePath();
  };
  flame(1.14);
  ctx.fillStyle = INK;
  ctx.fill();
  flame(1);
  ctx.fillStyle = gradV(ctx, y - s * 1.25, y + s * 1.1, '#ffd23f', '#ff5a1f');
  ctx.fill();
  // 内側の明るい炎
  ctx.save();
  ctx.translate(0, s * 0.32);
  flame(0.5);
  ctx.fillStyle = '#fff3a0';
  ctx.fill();
  ctx.restore();
}

function panel(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  fillRoundRect(ctx, x - 3, y - 3, w + 6, h + 6, 25, INK);
  roundRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = gradV(ctx, y, y + h, '#ffffff', '#eef2fa');
  ctx.fill();
}

export interface ShopLook {
  time: number;
  step: ShopStep;
  gems: number;
  spent: number;
}

export function drawShop(ctx: Ctx, s: ShopLook): void {
  ctx.fillStyle = 'rgba(8,10,24,0.86)';
  ctx.fillRect(0, 0, W, H);

  fancyText(ctx, 'やる気ショップ', W / 2, 96, { size: 46, top: '#fff3a0', bottom: '#ff8a1f' });
  // 期間限定セール。残り時間は減り続け、0 になるとまた 5 分から始まる
  const left = SALE_SECONDS - (s.time % SALE_SECONDS);
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(Math.floor(left % 60)).padStart(2, '0');
  fillRoundRect(ctx, 96, 138, 348, 38, 19, '#e3101f');
  text(ctx, `期間限定セール！ あと ${mm}:${ss}`, W / 2, 158, { size: 19, weight: 900, color: '#fff7a8' });

  // 持っているやる気と、これまでの気持ち課金額
  fillRoundRect(ctx, 60, 196, 420, 96, 18, 'rgba(255,255,255,0.1)');
  drawGem(ctx, 98, 226, 15);
  text(ctx, '手持ちのやる気', 122, 226, { size: 17, weight: 800, align: 'left', color: '#cfe6ff' });
  fancyText(ctx, formatComma(s.gems), 462, 226, { size: 30, top: '#ffffff', bottom: '#bfe9ff', align: 'right', shadow: 0, strokeWidth: 4 });
  text(ctx, '気持ち課金額', 80, 268, { size: 16, weight: 800, align: 'left', color: '#cfe6ff' });
  text(ctx, `¥${formatComma(s.spent)}（実際のご請求 ¥0）`, 462, 268, { size: 17, weight: 900, align: 'right', color: '#fff7a8', maxWidth: 270 });

  PACKS.forEach((p, i) => {
    const y = ROW_Y + i * ROW_H;
    fillRoundRect(ctx, 57, y - 3, 426, ROW_H - 4, 19, INK);
    roundRect(ctx, 60, y, 420, ROW_H - 10, 16);
    ctx.fillStyle = gradV(ctx, y, y + ROW_H - 10, '#ffffff', '#e6ecf8');
    ctx.fill();
    // やる気の炎。高いパックほど数が多い
    const pile = Math.min(i, 2);
    for (let g = pile; g >= 0; g--) drawGem(ctx, 96 + g * 11 - pile * 5, y + 38 - g * 3, 15 - g);
    text(ctx, p.name, 138, y + 23, { size: 16, weight: 900, align: 'left', color: '#55607c' });
    text(ctx, `${GEM}${formatComma(p.gems)}`, 138, y + 50, { size: 25, weight: 900, align: 'left', color: INK });
    if (p.badge) {
      ctx.save();
      ctx.translate(290, y + 15);
      ctx.rotate(-0.05);
      fillRoundRect(ctx, -52, -11, 104, 22, 11, '#e3101f');
      text(ctx, p.badge, 0, 0.5, { size: 13, weight: 900, color: '#ffffff', maxWidth: 96 });
      ctx.restore();
    }
  });
  const notice = s.step.at === 'list' ? s.step.notice : '';
  text(ctx, notice || `やる気は「コンティニュー」（${GEM}${CONTINUE_COST}）に使えます`, W / 2, 668, { size: 17, weight: 900, color: notice ? '#ffd23f' : '#cfe6ff', maxWidth: 480 });
  text(ctx, '※ このショップはネタです。実際のお金はかかりません。', W / 2, 706, { size: 14, weight: 700, color: '#aab6d0' });
  text(ctx, '入力するものも、どこかへ送るものもありません。', W / 2, 728, { size: 14, weight: 700, color: '#aab6d0' });

  if (s.step.at === 'list') return;
  // 確認・決済中・完了は、一覧の上に重ねる
  ctx.fillStyle = 'rgba(8,10,24,0.7)';
  ctx.fillRect(0, 0, W, H);
  const pack = PACKS[s.step.pack]!;
  panel(ctx, 50, 300, 440, 430);
  drawGem(ctx, W / 2, 372, 30);
  if (s.step.at === 'confirm') {
    text(ctx, pack.name, W / 2, 432, { size: 24, weight: 900, color: INK });
    text(ctx, `${GEM}${formatComma(pack.gems)} を ¥${formatComma(pack.yen)} で購入しますか？`, W / 2, 472, { size: 19, weight: 900, color: '#55607c', maxWidth: 400 });
    text(ctx, '※ 実際には 1 円も請求されません', W / 2, 512, { size: 15, weight: 800, color: '#e3101f' });
  } else if (s.step.at === 'paying') {
    const dots = '・'.repeat(1 + (Math.floor((s.time - s.step.since) * 4) % 3));
    text(ctx, `決済中${dots}`, W / 2, 470, { size: 30, weight: 900, color: INK });
    // 進み具合の棒
    const p = clamp((s.time - s.step.since) / PAYING_SECONDS, 0, 1);
    fillRoundRect(ctx, 110, 530, 320, 18, 9, '#dfe4ee');
    fillRoundRect(ctx, 110, 530, Math.max(18, 320 * p), 18, 9, '#2fbf5f');
    for (let i = 0; i < 3; i++) circle(ctx, W / 2 - 30 + i * 30, 600, 6 + 3 * Math.sin(s.time * 8 - i), '#2a9df4');
  } else {
    fancyText(ctx, 'ご購入ありがとうございます！', W / 2, 436, { size: 26, top: '#ffb400', bottom: '#ff7a1a', stroke: '#ffffff', strokeWidth: 5, shadow: 0, maxWidth: 400 });
    text(ctx, `${GEM}${formatComma(pack.gems)} を手に入れました`, W / 2, 484, { size: 22, weight: 900, color: INK });
    fillRoundRect(ctx, 90, 518, 360, 74, 14, '#eef2fa');
    text(ctx, '今回のご請求: ¥0', W / 2, 542, { size: 21, weight: 900, color: '#17803a' });
    text(ctx, 'やる気は、お金では買えません（課金機能はありません）', W / 2, 572, { size: 15, weight: 800, color: '#55607c', maxWidth: 340 });
  }
}
