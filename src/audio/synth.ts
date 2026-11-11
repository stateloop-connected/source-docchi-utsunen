// 効果音と BGM（仕様書 7 章）。すべて Web Audio の発振器とノイズで合成し、音声ファイルは持たない。
import type { Sfx } from '../render/view.ts';

/** 1 秒あたりに鳴らす回数の上限 */
const LIMIT = { shot: 12, kill: 10, blockHit: 8 } as const;

/** 武器の段階ごとの発射音。[波形, 始まりの高さ, 終わりの高さ, 長さ, ノイズの量] */
const SHOTS: readonly (readonly [OscillatorType, number, number, number, number])[] = [
  ['sine', 900, 500, 0.06, 0], // 水鉄砲
  ['triangle', 520, 260, 0.07, 0], // 輪ゴム鉄砲
  ['square', 1200, 900, 0.03, 0.2], // 節分の豆
  ['square', 700, 300, 0.05, 0.3], // エアガン
  ['square', 420, 120, 0.07, 0.5], // ピストル
  ['sawtooth', 260, 60, 0.12, 0.9], // ショットガン
  ['square', 360, 140, 0.04, 0.5], // マシンガン
  ['sawtooth', 240, 90, 0.05, 0.7], // ガトリング砲
  ['sawtooth', 160, 40, 0.18, 0.8], // バズーカ
  ['sawtooth', 1500, 1300, 0.06, 0], // レーザー
  ['sawtooth', 300, 700, 0.09, 0.1], // 波動砲
  ['triangle', 1047, 1319, 0.07, 0], // 回転寿司レーン砲
  ['square', 1568, 2093, 0.06, 0], // 課金砲
  ['sine', 1319, 988, 0.08, 0], // 既読スルー光線
  ['triangle', 784, 1175, 0.09, 0], // 定時退社ビーム
  ['sine', 620, 880, 0.1, 0], // ねこ
];

/** BGM: 4 小節の繰り返し。1 小節 = 8 分音符 8 個。数字はベースの高さ（Hz）、0 は休み */
const BASS: readonly number[] = [
  55, 0, 55, 110, 0, 55, 82.4, 110,
  43.7, 0, 43.7, 87.3, 0, 43.7, 65.4, 87.3,
  65.4, 0, 65.4, 130.8, 0, 65.4, 98, 130.8,
  49, 0, 49, 98, 0, 49, 73.4, 98,
];
const BGM = {
  baseBpm: 104,
  bpmPerWave: 4,
  maxBpm: 168,
  /** 何秒先まで音を予約するか */
  lookahead: 0.25,
} as const;

/** 心拍の間隔（秒）。埋まり度 70% で slow、100% で fast */
const HEARTBEAT = { from: 0.7, slow: 0.95, fast: 0.38 } as const;

export class Synth implements Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled: boolean;
  private readonly last = new Map<string, number>();
  private bgmOn = false;
  private bgmStep = 0;
  private bgmNext = 0;
  private heartNext = 0;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** 最初のタップやキー入力で呼ぶ。ブラウザは操作があるまで音を出せない */
  unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, len);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.unlock();
    else void this.ctx?.suspend();
  }

  /** 一時停止やタブが隠れたときに止める */
  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    if (this.enabled && this.ctx) void this.ctx.resume();
  }

  private get ready(): boolean {
    return this.enabled && this.ctx !== null && this.ctx.state === 'running';
  }

  private allow(key: string, perSecond: number): boolean {
    const now = this.ctx!.currentTime;
    if (now - (this.last.get(key) ?? -1) < 1 / perSecond) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, f0: number, f1: number, type: BiquadFilterType = 'lowpass', delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ---------------------------------------------------------------- 効果音

  shot(stage: number): void {
    if (!this.ready || !this.allow('shot', LIMIT.shot)) return;
    const [type, f0, f1, dur, n] = SHOTS[stage] ?? SHOTS[0]!;
    this.tone(type, f0, f1, dur, 0.07);
    if (n > 0) this.noise(dur, 0.09 * n, 3000, 600);
  }

  blockHit(): void {
    if (!this.ready || !this.allow('blockHit', LIMIT.blockHit)) return;
    this.tone('square', 190, 120, 0.04, 0.09);
    this.noise(0.03, 0.08, 2500, 1200, 'bandpass');
  }

  kill(): void {
    if (!this.ready || !this.allow('kill', LIMIT.kill)) return;
    this.noise(0.07, 0.16, 1800, 300);
    this.tone('triangle', 520, 180, 0.07, 0.08);
  }

  blockBreak(): void {
    if (!this.ready) return;
    [523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, 0.1, 0.16, i * 0.06));
    this.noise(0.12, 0.14, 4000, 800);
  }

  rankUp(stageChanged: boolean): void {
    if (!this.ready) return;
    const notes = stageChanged ? [523, 659, 784, 1047, 784, 1047, 1319] : [659, 784, 1047];
    notes.forEach((f, i) => this.tone('square', f, f, stageChanged ? 0.14 : 0.09, 0.1, 0.12 + i * (stageChanged ? 0.09 : 0.06)));
  }

  miss(): void {
    if (!this.ready) return;
    this.tone('triangle', 440, 415, 0.14, 0.14);
    this.tone('triangle', 311, 262, 0.22, 0.14, 0.14);
  }

  trap(): void {
    if (!this.ready) return;
    for (const f of [185, 196, 277]) this.tone('sawtooth', f, f * 0.94, 0.5, 0.09, 0.1);
  }

  bomb(): void {
    if (!this.ready) return;
    this.noise(0.6, 0.5, 900, 60);
    this.tone('sine', 110, 30, 0.5, 0.4);
  }

  rushWarning(): void {
    if (!this.ready) return;
    for (let i = 0; i < 2; i++) this.tone('square', 880, 880, 0.14, 0.12, i * 0.28);
  }

  bossWarning(): void {
    if (!this.ready) return;
    for (let i = 0; i < 3; i++) this.tone('sawtooth', 196, 147, 0.3, 0.16, i * 0.45);
  }

  bossKill(): void {
    if (!this.ready) return;
    this.noise(1.3, 0.6, 2400, 50);
    this.tone('sine', 150, 25, 1.1, 0.5);
    [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.16, 0.1, 0.5 + i * 0.1));
  }

  gameOver(): void {
    if (!this.ready) return;
    this.stopBgm();
    this.tone('sawtooth', 440, 55, 1.4, 0.25);
    this.tone('triangle', 330, 41, 1.4, 0.2, 0.05);
  }

  /** 「ギリギリ！」「持ち直した！」に添える、短く明るい 2 音 */
  praise(): void {
    if (!this.ready) return;
    this.tone('triangle', 988, 988, 0.08, 0.13);
    this.tone('triangle', 1319, 1319, 0.14, 0.13, 0.08);
  }

  click(): void {
    if (!this.ready) return;
    this.tone('triangle', 660, 880, 0.06, 0.12);
  }

  // ---------------------------------------------------------------- BGM と心拍

  startBgm(): void {
    this.bgmOn = true;
    this.bgmStep = 0;
    this.bgmNext = 0;
    this.heartNext = 0;
  }

  stopBgm(): void {
    this.bgmOn = false;
  }

  /**
   * 毎フレーム呼ぶ。少し先までの音を予約する。
   * WAVE が進むごとにテンポを上げ、ラッシュ中はハイハットを倍に刻む。
   */
  update(wave: number, rush: boolean, fillRatio: number): void {
    if (!this.ready || !this.bgmOn) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (this.bgmNext < now) this.bgmNext = now + 0.05;
    while (this.bgmNext < now + BGM.lookahead) {
      const bpm = Math.min(BGM.maxBpm, BGM.baseBpm + (wave - 1) * BGM.bpmPerWave);
      const eighth = 60 / bpm / 2;
      const delay = this.bgmNext - now;
      const f = BASS[this.bgmStep % BASS.length]!;
      if (f > 0) {
        this.tone('sawtooth', f, f, eighth * 0.9, 0.16, delay);
        this.tone('square', f * 2, f * 2, eighth * 0.5, 0.035, delay);
      }
      this.noise(0.03, this.bgmStep % 2 ? 0.07 : 0.035, 9000, 7000, 'highpass', delay);
      if (rush) this.noise(0.02, 0.04, 9000, 7000, 'highpass', delay + eighth / 2);
      this.bgmNext += eighth;
      this.bgmStep++;
    }
    // 心拍のような低音。割合が上がるほど速く
    if (fillRatio >= HEARTBEAT.from) {
      if (this.heartNext < now) {
        const d = Math.min(1, (fillRatio - HEARTBEAT.from) / (1 - HEARTBEAT.from));
        this.tone('sine', 70, 40, 0.12, 0.5);
        this.tone('sine', 60, 36, 0.12, 0.35, 0.14);
        this.heartNext = now + HEARTBEAT.slow + (HEARTBEAT.fast - HEARTBEAT.slow) * d;
      }
    } else {
      this.heartNext = 0;
    }
  }
}
