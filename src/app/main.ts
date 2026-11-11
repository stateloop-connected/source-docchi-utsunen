// 起動、画面遷移、入力、毎フレームの更新と描画（仕様書 6.6 節・6.8 節・8.2 節）。
import { Synth } from '../audio/synth.ts';
import { AIM, B, RUSH_START } from '../core/balance.ts';
import { estimatedIq, waveOf, weaponName } from '../core/formulas.ts';
import type { GameEvent } from '../core/state.ts';
import { drawHud } from '../render/hud.ts';
import { CENTER_X, H, HALF_ROAD, W } from '../render/projection.ts';
import { drawScene, initScene } from '../render/scene.ts';
import { initSprites } from '../render/sprites.ts';
import {
  CAPTION_SECONDS,
  FAIL_SECONDS,
  drawPause,
  drawResult,
  drawTitle,
  pauseButtons,
  playButtons,
  resultButtons,
  resultText,
  titleButtons,
  type ResultStats,
} from './screens.ts';
import { reviewPlay } from './review.ts';
import { Session } from './session.ts';
import { loadHighScore, loadSound, saveHighScore, saveSound } from './storage.ts';
import { drawButton, hitButton, type Button } from './ui.ts';

type Mode = 'title' | 'play' | 'paused' | 'result';

/** ゲームオーバーからリザルトを出すまでの秒数（7 章） */
const RESULT_DELAY = 1.5;
/** 実解像度を上げる上限。高すぎると描画が重くなる */
const MAX_PIXEL_RATIO = 2;
/** 1 フレームの経過時間の上限（秒）。タブが戻った直後などの飛びを捨てる */
const MAX_FRAME = 0.1;
/** デモの字幕「あああああ」を出す埋まり度の割合 */
const DEMO_PANIC_RATIO = 0.9;

function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
}

class App {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly synth = new Synth(loadSound());
  private highScore = loadHighScore();
  private mode: Mode = 'title';
  private session = new Session(newSeed(), true, null);
  private pixelScale = 1;
  private time = 0;
  private last = 0;
  /** キーボードで選んでいるボタンの番号。操作するまでは -1（決定キーは主ボタンに効く） */
  private focus = -1;
  private overAge = 0;
  private caption: { label: string; until: number } | null = null;
  private demoPanicked = false;
  private closePressedAt = -10;
  private result: ResultStats | null = null;
  private resultAt = 0;
  private readonly held = { left: false, right: false };
  /** キーで動いている最中か（離した瞬間に止めるために覚えておく） */
  private keyMoving = false;
  private message: { label: string; until: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => this.releaseKeys());
    // マウスは動かすだけで、指は触れている間、その横位置を狙う
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    // 余白（キャンバスの外の黒い部分）を押してもレーンを切り替えられるよう、画面全体で受ける
    window.addEventListener('pointerdown', (e) => this.onPointer(e));
    // iOS は指を離したときの操作でないと音を出せないことがあるので、離したときにも有効化を試みる
    for (const type of ['pointerup', 'touchend'] as const) window.addEventListener(type, () => this.synth.unlock());
    // ページの拡大・スクロール・長押しメニューを止める
    for (const type of ['touchstart', 'touchmove', 'gesturestart', 'dblclick', 'contextmenu'] as const) {
      document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.mode === 'play') this.pause();
        this.synth.suspend();
      } else if (this.mode !== 'paused') {
        this.synth.resume();
      }
    });
    requestAnimationFrame((now) => this.frame(now));
  }

  // ---------------------------------------------------------------- 画面遷移

  private toTitle(): void {
    this.mode = 'title';
    this.focus = -1;
    this.synth.stopBgm();
    this.synth.resume();
    this.startDemo();
  }

  private startDemo(): void {
    this.session = new Session(newSeed(), true, null);
    this.overAge = 0;
    this.caption = null;
    this.demoPanicked = false;
  }

  private startGame(): void {
    this.mode = 'play';
    this.focus = -1;
    this.overAge = 0;
    this.result = null;
    this.message = null;
    this.session = new Session(newSeed(), false, this.synth);
    this.synth.resume();
    this.synth.startBgm();
  }

  private pause(): void {
    if (this.mode !== 'play' || this.session.state.over) return;
    this.mode = 'paused';
    this.focus = -1;
    this.synth.suspend();
  }

  private resume(): void {
    this.mode = 'play';
    this.focus = -1;
    this.synth.resume();
  }

  private showResult(): void {
    const s = this.session.state;
    const score = Math.floor(s.score);
    const newRecord = score > this.highScore;
    if (newRecord) {
      this.highScore = score;
      saveHighScore(score);
    }
    const review = reviewPlay(s, this.session.blockShare, this.session.nearMisses);
    this.result = { score, highScore: this.highScore, newRecord, wave: waveOf(s.t), weapon: weaponName(s.player.rank), iq: estimatedIq(score), review };
    this.resultAt = this.time;
    if (newRecord) this.synth.newRecord();
    this.mode = 'result';
    this.focus = -1;
  }

  private toggleSound(): void {
    const on = !this.synth.isEnabled;
    this.synth.setEnabled(on);
    saveSound(on);
    this.synth.click();
  }

  private copyResult(): void {
    if (!this.result) return;
    const label = resultText(this.result);
    const show = (m: string): void => {
      this.message = { label: m, until: this.time + 2.5 };
    };
    const clip = navigator.clipboard;
    if (!clip) {
      show(label);
      return;
    }
    clip.writeText(label).then(
      () => show('コピーしました'),
      () => show(label),
    );
  }

  // ---------------------------------------------------------------- 入力

  private buttons(): Button[] {
    switch (this.mode) {
      case 'title':
        return titleButtons(this.synth.isEnabled);
      case 'play':
        return this.session.state.over ? [] : playButtons();
      case 'paused':
        return pauseButtons(this.synth.isEnabled);
      case 'result':
        return resultButtons();
    }
  }

  private press(id: string): void {
    if (id !== 'sound') this.synth.click();
    switch (id) {
      case 'play':
      case 'retry':
        this.startGame();
        break;
      case 'sound':
        this.toggleSound();
        break;
      case 'close':
        this.closePressedAt = this.time;
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'title':
        this.toTitle();
        break;
      case 'copy':
        this.copyResult();
        break;
    }
  }

  /** 画面の x（論理解像度）を、立ちたい横位置にする */
  private aimAt(x: number): void {
    if (this.mode === 'play') this.session.aim = (x - CENTER_X) / HALF_ROAD;
  }

  private logicalX(e: PointerEvent): number {
    const rect = this.canvas.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * W;
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse' || e.buttons > 0 || e.pressure > 0) this.aimAt(this.logicalX(e));
  }

  private releaseKeys(): void {
    this.held.left = false;
    this.held.right = false;
  }

  private onKeyUp(e: KeyboardEvent): void {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === 'ArrowLeft' || key === 'a') this.held.left = false;
    else if (key === 'ArrowRight' || key === 'd') this.held.right = false;
  }

  /** キーを押している間はその向きへ動き続け、離したらその場で止まる */
  private applyKeys(): void {
    if (this.held.left !== this.held.right) {
      this.session.aim = this.held.left ? AIM.minX : AIM.maxX;
      this.keyMoving = true;
    } else if (this.keyMoving) {
      this.session.aim = this.session.state.player.x;
      this.keyMoving = false;
    }
  }

  private onPointer(e: PointerEvent): void {
    e.preventDefault();
    this.synth.unlock();
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    const b = hitButton(this.buttons(), x, y);
    if (b) {
      this.focus = -1;
      this.press(b.id);
    } else {
      // ボタン以外は、押した横位置を狙う
      this.aimAt(x);
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    this.synth.unlock();
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let handled = true;
    if (this.mode === 'play') {
      if (key === 'ArrowLeft' || key === 'a') this.held.left = true;
      else if (key === 'ArrowRight' || key === 'd') this.held.right = true;
      else if (key === 'Escape' || key === 'p') this.pause();
      else handled = false;
    } else {
      const buttons = this.buttons();
      const n = buttons.length;
      if (this.mode === 'paused' && (key === 'Escape' || key === 'p')) this.resume();
      else if (key === 'ArrowDown' || key === 'ArrowRight' || (key === 'Tab' && !e.shiftKey)) this.focus = (this.focus + 1) % n;
      else if (key === 'ArrowUp' || key === 'ArrowLeft' || key === 'Tab') this.focus = (Math.max(this.focus, 0) + n - 1) % n;
      else if (key === 'Enter' || key === ' ') this.press(buttons[Math.max(this.focus, 0)]!.id);
      else handled = false;
    }
    if (handled) e.preventDefault();
  }

  // ---------------------------------------------------------------- 更新

  private say(label: string): void {
    this.caption = { label, until: this.time + CAPTION_SECONDS };
  }

  /** デモの出来事に合わせて字幕を出す（仕様書 5.3 節） */
  private demoCaptions(events: readonly GameEvent[], demoQuit: boolean): void {
    if (demoQuit) this.say('なぜそっちを撃つ！？');
    for (const e of events) {
      if (e.type === 'blockBreak' && e.kind === 'trap') this.say('それは罠！！');
      else if (e.type === 'blockBreak' && e.kind === 'hat') this.say('帽子はいらない');
      else if (e.type === 'blockPass' && e.kind === 'bomb') this.say('ボムを取れ！！');
    }
    const s = this.session.state;
    const panic = s.fill / s.capacity > DEMO_PANIC_RATIO;
    if (panic && !this.demoPanicked) this.say('あああああ');
    this.demoPanicked = panic;
  }

  private update(dt: number): void {
    this.time += dt;
    const s = this.session.state;
    if (this.mode === 'title') {
      const { events, demoQuit } = this.session.advance(dt);
      this.demoCaptions(events, demoQuit);
      if (s.over) {
        this.overAge += dt;
        if (this.overAge >= FAIL_SECONDS) this.startDemo();
      }
    } else if (this.mode === 'play') {
      this.applyKeys();
      this.session.advance(dt);
      const rush = s.t % B.waveLength >= RUSH_START;
      this.synth.update(waveOf(s.t), rush, s.fill / s.capacity);
      if (s.over) {
        this.overAge += dt;
        if (this.overAge >= RESULT_DELAY) this.showResult();
      }
    }
  }

  // ---------------------------------------------------------------- 描画

  private resize(): void {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    const cssW = Math.floor(W * scale);
    const cssH = Math.floor(H * scale);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.canvas.width = Math.round(cssW * ratio);
    this.canvas.height = Math.round(cssH * ratio);
    this.pixelScale = this.canvas.width / W;
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.pixelScale, 0, 0, this.pixelScale, 0, 0);
    const { state, view } = this.session;
    drawScene(ctx, state, view);
    drawHud(ctx, state, view, { demo: this.mode === 'title' });
    const drawButtons = (): void => {
      const closeAge = this.time - this.closePressedAt;
      this.buttons().forEach((b, i) => {
        // 「今すぐプレイ」は脈打って光の帯が横切り、「✕」は押すと震える
        const play = b.id === 'play';
        drawButton(ctx, b, {
          focused: i === this.focus,
          scale: play ? 1 + 0.05 * Math.sin(this.time * 7) : 1,
          dx: b.id === 'close' && closeAge < 0.4 ? Math.sin(closeAge * 80) * 4 : 0,
          shine: play ? (this.time * 0.6) % 1.6 : -1,
        });
      });
    };
    if (this.mode === 'title') {
      // タイトルの飾り（つつく手）はボタンの上に重ねる
      drawButtons();
      drawTitle(ctx, {
        time: this.time,
        highScore: this.highScore,
        caption: this.caption && this.time < this.caption.until ? this.caption.label : null,
        failAge: state.over ? this.overAge : -1,
        closeAge: this.time - this.closePressedAt,
      });
      return;
    }
    if (this.mode === 'paused') {
      drawPause(ctx);
    } else if (this.mode === 'result' && this.result) {
      drawResult(ctx, this.result, this.message && this.time < this.message.until ? this.message.label : null, this.time - this.resultAt);
    }
    drawButtons();
  }

  private frame(now: number): void {
    const dt = Math.min(MAX_FRAME, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.update(dt);
    this.render();
    requestAnimationFrame((t) => this.frame(t));
  }
}

initSprites();
initScene();
const app = new App(document.getElementById('game') as HTMLCanvasElement);
// 開発時だけ、ブラウザのコンソールや確認用スクリプトから状態を触れるようにする
if (import.meta.env.DEV) (window as unknown as { app: App }).app = app;
