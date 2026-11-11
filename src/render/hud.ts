// プレイ中の表示類（仕様書 6.7 節）と、画面中央に出る演出の文字。
import { B, RUSH_START } from '../core/balance.ts';
import { bossName, dpsOf, waveOf, weaponName } from '../core/formulas.ts';
import type { GameState } from '../core/state.ts';
import { clamp, fillRoundRect, text, type Ctx } from './draw.ts';
import { formatComma, formatNumber } from './format.ts';
import { H, W } from './projection.ts';
import { LOOK, type View } from './view.ts';

/** 埋まり度がこの割合以上でゲージが赤く点滅する */
export const DANGER_RATIO = 0.7;
/** 開始からこの秒数だけ操作の案内を出す */
const GUIDE_SECONDS = 10;

export interface HudOptions {
  /** タイトル画面のデモ。右上の「✕」のためにゲージを短くし、武器名を上に移す */
  demo: boolean;
}

function drawGauge(ctx: Ctx, s: GameState, v: View, width: number): void {
  const x = 20;
  const y = 16;
  const h = 24;
  const ratio = clamp(s.fill / s.capacity, 0, 1);
  fillRoundRect(ctx, x - 3, y - 3, width + 6, h + 6, 9, 'rgba(0,0,0,0.55)');
  const danger = ratio >= DANGER_RATIO;
  // 点滅は毎秒 2.5 回（1 秒に 3 回を超えない）
  const blink = danger && Math.sin(v.time * Math.PI * 5) > 0;
  const color = danger ? (blink ? '#ff2d2d' : '#b81414') : ratio >= 0.45 ? '#ffb020' : '#35c96b';
  if (ratio > 0) fillRoundRect(ctx, x, y, Math.max(h, width * ratio), h, 6, color);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x + width * DANGER_RATIO, y, 2, h);
  text(ctx, `埋まり度 ${Math.floor(ratio * 100)}%`, x + width / 2, y + h / 2 + 1, { size: 16, weight: 900, stroke: 'rgba(0,0,0,0.7)', strokeWidth: 3 });
}

function drawWave(ctx: Ctx, s: GameState, x: number): void {
  const wave = waveOf(s.t);
  const tau = s.t % B.waveLength;
  const bossWave = wave % B.bossEvery === 0;
  text(ctx, `WAVE ${wave}`, x, 64, { size: 24, weight: 900, align: 'left', stroke: 'rgba(0,0,0,0.6)' });
  // 20 秒の進行バー。凪とラッシュ（ボス戦ならボス）を色で分ける
  const bx = x;
  const by = 80;
  const bw = 150;
  const calm = (bw * RUSH_START) / B.waveLength;
  fillRoundRect(ctx, bx - 2, by - 2, bw + 4, 12, 6, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = '#3f6fb0';
  ctx.fillRect(bx, by, calm, 8);
  ctx.fillStyle = bossWave ? '#7a3fb0' : '#b03f3f';
  ctx.fillRect(bx + calm, by, bw - calm, 8);
  const p = (bw * tau) / B.waveLength;
  ctx.fillStyle = '#8fc0ff';
  ctx.fillRect(bx, by, Math.min(p, calm), 8);
  if (p > calm) {
    ctx.fillStyle = bossWave ? '#c98bff' : '#ff7a7a';
    ctx.fillRect(bx + calm, by, p - calm, 8);
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(bx + p - 1, by - 2, 2, 12);
}

function drawCenterTop(ctx: Ctx, s: GameState, v: View, y: number, small: boolean): void {
  const size = small ? 26 : 40;
  if (v.warning) {
    // 点滅は毎秒 2.5 回
    if (Math.sin(v.time * Math.PI * 5) > -0.2) {
      if (v.warning.boss) {
        text(ctx, 'WARNING', W / 2, y, { size, weight: 900, color: '#ffd23f', stroke: '#5a0000' });
        text(ctx, v.warning.name, W / 2, y + size * 0.9, { size: size * 0.62, weight: 900, color: '#fff', stroke: '#5a0000', maxWidth: 440 });
      } else {
        text(ctx, 'RUSH!', W / 2, y, { size: size * 1.15, weight: 900, color: '#ff5c5c', stroke: '#fff', strokeWidth: 5 });
      }
    }
    return;
  }
  // ボスがいる間は名前と HP を出す
  for (let i = s.head; i < s.enemies.length; i++) {
    const e = s.enemies[i]!;
    if (e.kind !== 'boss') continue;
    text(ctx, bossName(e.bossIndex), W / 2, y - 6, { size: small ? 18 : 24, weight: 900, stroke: '#3b0a0a', maxWidth: 400 });
    const bw = small ? 220 : 300;
    fillRoundRect(ctx, W / 2 - bw / 2 - 2, y + 12, bw + 4, 14, 7, 'rgba(0,0,0,0.6)');
    fillRoundRect(ctx, W / 2 - bw / 2, y + 14, bw * clamp(e.hp / e.hp0, 0, 1), 10, 5, '#ff4d4d');
    return;
  }
}

function drawToasts(ctx: Ctx, v: View): void {
  for (const t of v.toasts) {
    const age = v.time - t.start;
    // 出るときに少し大きく弾み、終わりに薄れる
    const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.55 : age < 0.2 ? 1.15 - ((age - 0.12) / 0.08) * 0.15 : 1;
    ctx.globalAlpha = clamp((t.life - age) / 0.25, 0, 1);
    text(ctx, t.label, t.x, t.y - age * 14, { size: t.size * pop, weight: 900, color: t.color, stroke: 'rgba(20,20,30,0.9)', maxWidth: 500 });
  }
  ctx.globalAlpha = 1;
}

function drawBossIntro(ctx: Ctx, v: View): void {
  if (!v.bossIntro) return;
  const age = v.time - v.bossIntro.start;
  const a = clamp(Math.min(age / 0.15, (LOOK.bossIntroTime - age) / 0.3), 0, 1);
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(20,0,0,0.78)';
  ctx.fillRect(0, 380, W, 190);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(0, 380, W, 6);
  ctx.fillRect(0, 564, W, 6);
  const slide = (1 - clamp(age / 0.2, 0, 1)) * 200;
  text(ctx, 'BOSS', W / 2 - slide, 420, { size: 26, weight: 900, color: '#ffd23f' });
  text(ctx, v.bossIntro.name, W / 2 + slide, 492, { size: 84, weight: 900, color: '#fff', stroke: '#c92a2a', strokeWidth: 8, maxWidth: 510 });
  ctx.globalAlpha = 1;
}

function drawGuide(ctx: Ctx, s: GameState): void {
  if (s.t >= GUIDE_SECONDS) return;
  ctx.globalAlpha = clamp(GUIDE_SECONDS - s.t, 0, 1);
  fillRoundRect(ctx, 60, 470, 420, 84, 16, 'rgba(0,0,0,0.5)');
  text(ctx, '← 敵 ｜ 強化 →', W / 2, 498, { size: 30, weight: 900 });
  text(ctx, 'タップで移動', W / 2, 534, { size: 19, weight: 700, color: '#dfe6f3' });
  ctx.globalAlpha = 1;
}

export function drawHud(ctx: Ctx, s: GameState, v: View, o: HudOptions): void {
  drawGauge(ctx, s, v, o.demo ? 460 : 500);
  drawWave(ctx, s, o.demo ? 20 : 66);
  text(ctx, formatComma(s.score), W - 20, 64, { size: 26, weight: 900, align: 'right', stroke: 'rgba(0,0,0,0.6)' });
  const weapon = `${weaponName(s.player.rank)} Lv.${s.player.rank}`;
  const dps = `DPS ${formatNumber(dpsOf(s.player.rank))}`;
  if (o.demo) {
    text(ctx, `${weapon}　${dps}`, W - 20, 90, { size: 15, weight: 800, align: 'right', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 3 });
    drawCenterTop(ctx, s, v, 176, true);
  } else {
    text(ctx, 'スコア', W - 20, 88, { size: 12, weight: 700, align: 'right', color: '#dfe6f3', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 3 });
    fillRoundRect(ctx, 10, 908, W - 20, 44, 12, 'rgba(0,0,0,0.5)');
    text(ctx, weapon, 24, H - 29, { size: 22, weight: 900, align: 'left', maxWidth: 320 });
    text(ctx, dps, W - 24, H - 29, { size: 20, weight: 900, align: 'right', color: '#ffe066' });
    drawCenterTop(ctx, s, v, 150, false);
    drawGuide(ctx, s);
  }
  drawToasts(ctx, v);
  drawBossIntro(ctx, v);
}
