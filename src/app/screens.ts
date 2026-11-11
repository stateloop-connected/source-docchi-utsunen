// タイトル・一時停止・リザルトの重ね描きと、各画面のボタン配置（仕様書 5.3 節・6.6 節）。
import { clamp, fillRoundRect, text, type Ctx } from '../render/draw.ts';
import { formatComma } from '../render/format.ts';
import { H, W } from '../render/projection.ts';
import type { Button } from './ui.ts';

/** 煽り文句。4 秒ごとに切り替える */
export const TAUNTS = ['99% の人が WAVE 5 に届かない', 'IQ 120 以上ならクリア可能', '簡単そうに見えますよね？', '3 分遊ぶと止まらなくなる'] as const;
export const TAUNT_SECONDS = 4;
/** 出来事に反応する字幕の表示時間 */
export const CAPTION_SECONDS = 1.5;
/** デモが負けたあと「FAIL」を出す時間 */
export const FAIL_SECONDS = 2;
/** リザルトで「（広告の人と同じ）」と添える推定 IQ の上限。デモのスコアの中央値がこの値になる */
export const AD_IQ = 62;

export interface ResultStats {
  score: number;
  highScore: number;
  newRecord: boolean;
  wave: number;
  weapon: string;
  iq: number;
}

// ---------------------------------------------------------------- ボタン配置

export function titleButtons(soundOn: boolean): Button[] {
  return [
    { id: 'play', x: 110, y: 900, w: 320, h: 50, label: '▶ 今すぐプレイ', style: 'primary' },
    { id: 'sound', x: 12, y: 900, w: 86, h: 40, label: soundOn ? '音 ON' : '音 OFF', style: 'small' },
    { id: 'close', x: 496, y: 16, w: 24, h: 24, label: '✕', style: 'close' },
  ];
}

export function playButtons(): Button[] {
  return [{ id: 'pause', x: 16, y: 48, w: 40, h: 40, label: '', style: 'pause' }];
}

export function pauseButtons(soundOn: boolean): Button[] {
  return [
    { id: 'resume', x: 120, y: 400, w: 300, h: 66, label: '再開', style: 'primary' },
    { id: 'sound', x: 120, y: 490, w: 300, h: 60, label: soundOn ? '音: ON' : '音: OFF', style: 'normal' },
    { id: 'title', x: 120, y: 572, w: 300, h: 60, label: 'タイトルへ', style: 'normal' },
  ];
}

export function resultButtons(): Button[] {
  return [
    { id: 'retry', x: 70, y: 668, w: 400, h: 72, label: 'もう一度', style: 'primary' },
    { id: 'title', x: 70, y: 762, w: 192, h: 58, label: 'タイトルへ', style: 'normal' },
    { id: 'copy', x: 278, y: 762, w: 192, h: 58, label: '結果をコピー', style: 'normal' },
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

export function drawTitle(ctx: Ctx, t: TitleLook): void {
  text(ctx, `ハイスコア ${formatComma(t.highScore)}`, 20, 106, { size: 14, weight: 800, align: 'left', color: '#ffe066', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 3 });

  // ロゴ
  ctx.save();
  ctx.translate(W / 2, 132);
  ctx.rotate(-0.05);
  text(ctx, 'どっち撃つねん', 0, 4, { size: 50, weight: 900, color: '#1d1f26', stroke: '#1d1f26', strokeWidth: 14 });
  text(ctx, 'どっち撃つねん', 0, 0, { size: 50, weight: 900, color: '#ffe600', stroke: '#d6336c', strokeWidth: 9 });
  ctx.restore();

  // 煽り文句と字幕
  if (t.caption) {
    const dx = Math.sin(t.time * 60) * 2;
    fillRoundRect(ctx, 36 + dx, 198, 468, 46, 10, '#e3101f');
    text(ctx, t.caption, W / 2 + dx, 222, { size: 28, weight: 900, color: '#ffe600', stroke: '#5a0000', strokeWidth: 4, maxWidth: 440 });
  } else {
    const label = TAUNTS[Math.floor(t.time / TAUNT_SECONDS) % TAUNTS.length]!;
    fillRoundRect(ctx, 36, 198, 468, 46, 10, 'rgba(0,0,0,0.62)');
    text(ctx, label, W / 2, 222, { size: 24, weight: 900, maxWidth: 440 });
  }

  if (t.failAge >= 0) {
    const pop = t.failAge < 0.15 ? 2.2 - (t.failAge / 0.15) * 1.2 : 1;
    ctx.save();
    ctx.translate(W / 2, 480);
    ctx.rotate(-0.14);
    ctx.scale(pop, pop);
    text(ctx, 'FAIL', 0, 0, { size: 170, weight: 900, color: '#ff1f1f', stroke: '#ffffff', strokeWidth: 16 });
    ctx.restore();
  }

  // 広告らしい飾り
  fillRoundRect(ctx, 442, 904, 86, 32, 6, 'rgba(0,0,0,0.45)');
  text(ctx, '広告', 485, 921, { size: 15, weight: 700, color: '#dfe6f3' });
  if (t.closeAge >= 0 && t.closeAge < 1.2) {
    ctx.globalAlpha = clamp((1.2 - t.closeAge) / 0.3, 0, 1);
    fillRoundRect(ctx, 370, 46, 154, 32, 8, 'rgba(0,0,0,0.85)');
    text(ctx, '閉じられません', 447, 63, { size: 17, weight: 800 });
    ctx.globalAlpha = 1;
  }
}

export function drawPause(ctx: Ctx): void {
  ctx.fillStyle = 'rgba(8,10,20,0.72)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, '一時停止', W / 2, 320, { size: 46, weight: 900 });
}

export function drawResult(ctx: Ctx, r: ResultStats, message: string | null): void {
  ctx.fillStyle = 'rgba(8,10,20,0.78)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'GAME OVER', W / 2, 132, { size: 56, weight: 900, color: '#ff4d4d', stroke: '#ffffff', strokeWidth: 6 });
  fillRoundRect(ctx, 40, 190, 460, 450, 22, 'rgba(255,255,255,0.96)');
  const dark = '#1d1f26';
  text(ctx, 'スコア', W / 2, 222, { size: 18, weight: 800, color: '#6b7280' });
  text(ctx, formatComma(r.score), W / 2, 272, { size: 64, weight: 900, color: dark, maxWidth: 420 });
  if (r.newRecord) {
    text(ctx, 'NEW RECORD!', W / 2, 322, { size: 22, weight: 900, color: '#e3101f' });
  } else {
    text(ctx, `ハイスコア ${formatComma(r.highScore)}`, W / 2, 322, { size: 19, weight: 800, color: '#6b7280' });
  }
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(70, 350, 400, 2);
  const row = (label: string, value: string, y: number): void => {
    text(ctx, label, 76, y, { size: 20, weight: 800, align: 'left', color: '#6b7280' });
    text(ctx, value, 464, y, { size: 26, weight: 900, align: 'right', color: dark, maxWidth: 270 });
  };
  row('到達 WAVE', String(r.wave), 392);
  row('最終武器', r.weapon, 442);
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(70, 474, 400, 2);
  text(ctx, '推定 IQ', W / 2, 506, { size: 18, weight: 800, color: '#6b7280' });
  text(ctx, String(r.iq), W / 2, 558, { size: 70, weight: 900, color: r.iq <= AD_IQ ? '#e3101f' : '#2f7bff' });
  if (r.iq <= AD_IQ) text(ctx, '（広告の人と同じ）', W / 2, 612, { size: 20, weight: 900, color: '#e3101f' });
  if (message) text(ctx, message, W / 2, 856, { size: 18, weight: 800, color: '#ffe066', maxWidth: 500 });
}

/** 「結果をコピー」でクリップボードに入れる文字列（仕様書 2.6 節） */
export function resultText(r: ResultStats): string {
  return `どっち撃つねん｜WAVE ${r.wave}・スコア ${formatComma(r.score)}・推定IQ ${r.iq}`;
}
