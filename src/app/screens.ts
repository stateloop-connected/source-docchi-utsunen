// タイトル・一時停止・リザルトの重ね描きと、各画面のボタン配置（仕様書 5.3 節・6.6 節）。
import { INK, clamp, fancyText, fillRoundRect, gradV, roundRect, text, type Ctx } from '../render/draw.ts';
import { formatComma } from '../render/format.ts';
import { H, HORIZON_Y, W } from '../render/projection.ts';
import { hash } from '../render/world.ts';
import type { Review } from './review.ts';
import { CONTINUE_COST, GEM } from './shop.ts';
import type { Button } from './ui.ts';

/** 煽り文句。4 秒ごとに切り替える */
export const TAUNTS = ['99% の人が WAVE 5 に届かない', 'IQ 120 以上ならクリア可能', '簡単そうに見えますよね？', '3 分遊ぶと止まらなくなる'] as const;
export const TAUNT_SECONDS = 4;
/** 出来事に反応する字幕の表示時間 */
export const CAPTION_SECONDS = 1.5;
/** デモが負けたあと「FAIL」を出す時間 */
export const FAIL_SECONDS = 2;
/** リザルトで「（広告の人と同じ）」と添える推定 IQ の上限。デモのスコアの中央値がこの値になる */
export const AD_IQ = 64;
/** リザルトのスコアが 0 から数え上がる時間 */
const COUNT_UP_SECONDS = 0.8;

export interface ResultStats {
  score: number;
  highScore: number;
  newRecord: boolean;
  wave: number;
  weapon: string;
  iq: number;
  review: Review;
}

// ---------------------------------------------------------------- ボタン配置

export function titleButtons(soundOn: boolean): Button[] {
  return [
    { id: 'play', x: 110, y: 896, w: 320, h: 50, label: '▶ 今すぐプレイ', style: 'primary' },
    { id: 'sound', x: 12, y: 902, w: 86, h: 38, label: soundOn ? '音: ON' : '音: OFF', style: 'small' },
    { id: 'close', x: 496, y: 16, w: 24, h: 24, label: '✕', style: 'close' },
    { id: 'shop', x: 442, y: 902, w: 86, h: 38, label: 'ショップ', style: 'small' },
  ];
}

export function playButtons(): Button[] {
  return [{ id: 'pause', x: 16, y: 48, w: 40, h: 40, label: '', style: 'pause' }];
}

export function pauseButtons(soundOn: boolean): Button[] {
  return [
    { id: 'resume', x: 120, y: 400, w: 300, h: 66, label: '再開', style: 'primary' },
    { id: 'sound', x: 120, y: 494, w: 300, h: 58, label: soundOn ? '音: ON' : '音: OFF', style: 'normal' },
    { id: 'title', x: 120, y: 578, w: 300, h: 58, label: 'タイトルへ', style: 'normal' },
  ];
}

export function resultButtons(): Button[] {
  return [
    { id: 'retry', x: 70, y: 690, w: 400, h: 70, label: 'もう一度', style: 'primary' },
    { id: 'title', x: 70, y: 786, w: 192, h: 56, label: 'タイトルへ', style: 'normal' },
    { id: 'copy', x: 278, y: 786, w: 192, h: 56, label: '結果をコピー', style: 'normal' },
    { id: 'continue', x: 110, y: 862, w: 320, h: 40, label: `${GEM}${CONTINUE_COST} でコンティニュー`, style: 'gold' },
  ];
}

// ---------------------------------------------------------------- 重ね描き

export interface TitleLook {
  time: number;
  highScore: number;
  /** 出来事の字幕。なければ煽り文句を出す */
  caption: string | null;
  /** デモが負けてからの秒数。負けていなければ負 */
  failAge: number;
  /** 「✕」を押してからの秒数。押していなければ負 */
  closeAge: number;
}

/** ロゴの後ろでゆっくり回る光の筋 */
function drawRays(ctx: Ctx, time: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 44, W, HORIZON_Y - 44);
  ctx.clip();
  ctx.translate(W / 2, 134);
  ctx.rotate(time * 0.15);
  ctx.fillStyle = 'rgba(255,255,255,0.11)';
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(420, -52);
    ctx.lineTo(420, 52);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 「今すぐプレイ」を指でつつく手 */
function drawHand(ctx: Ctx, time: number): void {
  const tap = Math.abs(Math.sin(time * 5));
  ctx.save();
  ctx.translate(404 + tap * 10, 944 + tap * 10);
  ctx.rotate(-0.6);
  const part = (x: number, y: number, w: number, h: number, r: number, color: string): void => fillRoundRect(ctx, x, y, w, h, r, color);
  part(-12, -34, 24, 46, 11, INK);
  part(-20, -10, 42, 38, 14, INK);
  part(-9, -31, 18, 40, 9, '#ffffff');
  part(-17, -7, 36, 32, 12, '#ffffff');
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(-1, -4, 2, 16);
  ctx.fillRect(8, -4, 2, 16);
  ctx.restore();
}

export function drawTitle(ctx: Ctx, t: TitleLook): void {
  drawRays(ctx, t.time);
  text(ctx, `ハイスコア ${formatComma(t.highScore)}`, 20, 106, { size: 14, weight: 900, align: 'left', color: '#ffe066', stroke: INK, strokeWidth: 3.5 });

  // ロゴ。厚みを下にずらして重ね、ゆっくり揺らす
  ctx.save();
  ctx.translate(W / 2, 134);
  ctx.rotate(-0.05 + Math.sin(t.time * 1.6) * 0.012);
  const s = 1 + Math.sin(t.time * 3.2) * 0.015;
  ctx.scale(s, s);
  fancyText(ctx, 'どっち撃つねん', 0, 7, { size: 52, top: '#7a1238', bottom: '#7a1238', stroke: '#7a1238', strokeWidth: 16, shadow: 0 });
  fancyText(ctx, 'どっち撃つねん', 0, 0, { size: 52, top: '#fffbe0', bottom: '#ffc400', stroke: '#e6336e', strokeWidth: 11, shadow: 0 });
  ctx.restore();

  // 煽り文句と字幕
  if (t.caption) {
    const dx = Math.sin(t.time * 60) * 2;
    fillRoundRect(ctx, 33 + dx, 195, 474, 52, 14, INK);
    roundRect(ctx, 36 + dx, 198, 468, 46, 11);
    ctx.fillStyle = gradV(ctx, 198, 244, '#ff5a5a', '#c40f1f');
    ctx.fill();
    fancyText(ctx, t.caption, W / 2 + dx, 222, { size: 28, top: '#fffbe0', bottom: '#ffd000', stroke: '#5a0000', maxWidth: 440, shadow: 2 });
  } else {
    const label = TAUNTS[Math.floor(t.time / TAUNT_SECONDS) % TAUNTS.length]!;
    fillRoundRect(ctx, 36, 198, 468, 46, 11, 'rgba(14,18,36,0.72)');
    fancyText(ctx, label, W / 2, 222, { size: 24, top: '#ffffff', bottom: '#dbe8ff', maxWidth: 440, shadow: 0, strokeWidth: 4 });
  }

  if (t.failAge >= 0) {
    const pop = t.failAge < 0.15 ? 2.2 - (t.failAge / 0.15) * 1.2 : 1;
    ctx.save();
    ctx.translate(W / 2, 480);
    ctx.rotate(-0.14);
    ctx.scale(pop, pop);
    fancyText(ctx, 'FAIL', 0, 12, { size: 170, top: '#5a0000', bottom: '#5a0000', stroke: '#5a0000', strokeWidth: 30, shadow: 0 });
    fancyText(ctx, 'FAIL', 0, 0, { size: 170, top: '#ff7a7a', bottom: '#e00000', stroke: '#ffffff', strokeWidth: 18, shadow: 0 });
    ctx.restore();
  }

  // 広告らしい飾り
  // 「広告」の札と、ショップの「SALE」の札
  fillRoundRect(ctx, 44, 186, 54, 22, 6, '#ffd23f');
  text(ctx, '広告', 71, 197.5, { size: 14, weight: 900, color: INK });
  ctx.save();
  ctx.translate(512, 902);
  ctx.rotate(0.2);
  fillRoundRect(ctx, -24, -10, 48, 20, 10, '#e3101f');
  text(ctx, 'SALE', 0, 0.5, { size: 12, weight: 900, color: '#fff7a8' });
  ctx.restore();
  drawHand(ctx, t.time);
  if (t.closeAge >= 0 && t.closeAge < 1.2) {
    ctx.globalAlpha = clamp((1.2 - t.closeAge) / 0.3, 0, 1);
    fillRoundRect(ctx, 366, 46, 158, 32, 9, 'rgba(14,18,36,0.92)');
    text(ctx, '閉じられません', 445, 63, { size: 17, weight: 900 });
    ctx.globalAlpha = 1;
  }
}

export function drawPause(ctx: Ctx): void {
  ctx.fillStyle = 'rgba(8,10,24,0.74)';
  ctx.fillRect(0, 0, W, H);
  fancyText(ctx, '一時停止', W / 2, 318, { size: 50, top: '#ffffff', bottom: '#bcd7ff' });
  // 操作の説明
  fillRoundRect(ctx, 70, 668, 400, 132, 18, 'rgba(255,255,255,0.1)');
  const help: readonly (readonly [string, string])[] = [
    ['指・マウス', '触れた・動かした位置へ動く'],
    ['← →　A D', '押している間だけ動く'],
    ['Esc　P', '一時停止'],
  ];
  help.forEach(([key, what], i) => {
    text(ctx, key, 94, 696 + i * 38, { size: 17, weight: 900, align: 'left', color: '#ffe066' });
    text(ctx, what, 446, 696 + i * 38, { size: 16, weight: 800, align: 'right', color: '#e8eefc', maxWidth: 230 });
  });
}

/** age はリザルトを出してからの秒数 */
export function drawResult(ctx: Ctx, r: ResultStats, message: string | null, age: number, gems: number): void {
  ctx.fillStyle = 'rgba(8,10,24,0.8)';
  ctx.fillRect(0, 0, W, H);
  const drop = (1 - clamp(age / 0.25, 0, 1)) ** 2 * -60;
  ctx.save();
  ctx.translate(0, drop);
  ctx.globalAlpha = clamp(age / 0.2, 0, 1);

  fancyText(ctx, 'GAME OVER', W / 2, 122, { size: 58, top: '#ff9a9a', bottom: '#e01010', stroke: '#ffffff', strokeWidth: 10 });

  // カード
  fillRoundRect(ctx, 37, 181, 466, 492, 26, INK);
  roundRect(ctx, 40, 184, 460, 482, 23);
  ctx.fillStyle = gradV(ctx, 184, 666, '#ffffff', '#eef2fa');
  ctx.fill();

  text(ctx, 'スコア', W / 2, 212, { size: 17, weight: 900, color: '#6b7280' });
  const shown = r.score * clamp(age / COUNT_UP_SECONDS, 0, 1) ** 0.5;
  fancyText(ctx, formatComma(shown), W / 2, 260, { size: 64, top: '#3a4157', bottom: '#12151f', stroke: '#ffffff', strokeWidth: 6, shadow: 0, maxWidth: 420 });
  if (r.newRecord) {
    const pulse = 1 + 0.06 * Math.sin(age * 9);
    fancyText(ctx, 'NEW RECORD!', W / 2, 308, { size: 23 * pulse, top: '#fff3a0', bottom: '#ff9d1a', stroke: '#b3200f', strokeWidth: 5, shadow: 0 });
  } else {
    text(ctx, `ハイスコア ${formatComma(r.highScore)}`, W / 2, 308, { size: 18, weight: 900, color: '#6b7280' });
  }

  const divider = (y: number): void => {
    ctx.fillStyle = '#dfe4ee';
    ctx.fillRect(66, y, 408, 2);
  };
  const row = (label: string, value: string, y: number): void => {
    text(ctx, label, 72, y, { size: 18, weight: 900, align: 'left', color: '#6b7280' });
    text(ctx, value, 468, y, { size: 24, weight: 900, align: 'right', color: INK, maxWidth: 270 });
  };
  divider(332);
  row('到達 WAVE', String(r.wave), 362);
  row('最終武器', r.weapon, 402);
  row('取った強化', `${r.review.taken} / ${r.review.offered}（両取り ${r.review.doubles}）`, 442);
  divider(468);

  // 左に推定 IQ、右に称号
  const ad = r.iq <= AD_IQ;
  text(ctx, '推定 IQ', 160, 494, { size: 16, weight: 900, color: '#6b7280' });
  fancyText(ctx, String(r.iq), 160, 540, { size: 62, top: ad ? '#ff8a8a' : '#7fb6ff', bottom: ad ? '#e01010' : '#1f5fe0', stroke: '#ffffff', strokeWidth: 6, shadow: 0 });
  if (ad) text(ctx, '（広告の人と同じ）', 160, 586, { size: 16, weight: 900, color: '#e01010' });
  ctx.fillStyle = '#dfe4ee';
  ctx.fillRect(278, 484, 2, 108);
  text(ctx, '称号', 384, 494, { size: 16, weight: 900, color: '#6b7280' });
  fillRoundRect(ctx, 296, 514, 176, 52, 14, INK);
  roundRect(ctx, 299, 517, 170, 46, 11);
  ctx.fillStyle = gradV(ctx, 517, 563, '#ffe27a', '#ffb000');
  ctx.fill();
  text(ctx, r.review.title, 384, 541, { size: 23, weight: 900, color: INK, maxWidth: 156 });

  // ひとこと
  fillRoundRect(ctx, 58, 606, 424, 46, 12, '#e9eefa');
  text(ctx, r.review.hint, W / 2, 630, { size: 16, weight: 900, color: '#2a3350', maxWidth: 404 });
  ctx.restore();
  ctx.globalAlpha = 1;

  text(ctx, `所持ジェム ${GEM}${formatComma(gems)}`, W / 2, 922, { size: 14, weight: 800, color: '#cfe6ff' });
  if (message) fancyText(ctx, message, W / 2, 944, { size: 18, top: '#fff7a8', bottom: '#ffd23f', maxWidth: 500, shadow: 0, strokeWidth: 4 });

  // ハイスコアを更新したら、紙吹雪を降らせる
  if (r.newRecord) {
    const colors = ['#ffd23f', '#ff5c8a', '#4fd26b', '#5ad1ff', '#ffffff'];
    for (let i = 0; i < 60; i++) {
      const fall = ((hash(i) * H + age * (140 + hash(i + 60) * 160)) % (H + 40)) - 20;
      const x = hash(i + 120) * W + Math.sin(age * 2 + i) * 18;
      ctx.save();
      ctx.translate(x, fall);
      ctx.rotate(age * (2 + hash(i + 180) * 4) + i);
      ctx.fillStyle = colors[i % colors.length]!;
      ctx.fillRect(-5, -3, 10, 6);
      ctx.restore();
    }
  }
// ハイスコアを更新したら、紙吹雪を降らせる  if (r.newRecord) {    const colors = ['#ffd23f', '#ff5c8a', '#4fd26b', '#5ad1ff', '#ffffff'];    for (let i = 0; i < 60; i++) {      const fall = (hash(i) * H + age * (140 + hash(i + 60) * 160)) % (H + 40) - 20;      const x = hash(i + 120) * W + Math.sin(age * 2 + i) * 18;      ctx.save();      ctx.translate(x, fall);      ctx.rotate(age * (2 + hash(i + 180) * 4) + i);      ctx.fillStyle = colors[i % colors.length]!;      ctx.fillRect(-5, -3, 10, 6);      ctx.restore();    }  }
}

/** 「結果をコピー」でクリップボードに入れる文字列（仕様書 2.6 節） */
export function resultText(r: ResultStats): string {
  return `どっち撃つねん｜WAVE ${r.wave}・スコア ${formatComma(r.score)}・推定IQ ${r.iq}`;
}

/** 本編の開始直後に、画面の上のほうへ出すひとこと。left は消えるまでの秒数 */
export function drawBanner(ctx: Ctx, label: string, left: number): void {
  ctx.globalAlpha = clamp(left / 0.4, 0, 1);
  fillRoundRect(ctx, 30, 196, 480, 44, 22, 'rgba(14,18,36,0.82)');
  text(ctx, label, W / 2, 219, { size: 18, weight: 900, color: '#fff7a8', maxWidth: 450 });
  ctx.globalAlpha = 1;
}
