// 1 回分のゲーム。本編もデモも同じ core を使い、違うのは入力の出どころだけ（仕様書 5 章・8 章）。
import { createDemoBot, type DemoBot } from '../bots/demo.ts';
import { DT, type Lane } from '../core/balance.ts';
import { createGame, type GameEvent, type GameState } from '../core/state.ts';
import { step } from '../core/step.ts';
import { View, type Sfx } from '../render/view.ts';

/** 1 フレームで回す step の上限。それ以上の遅れは捨てる（仕様書 8.2 節） */
const MAX_STEPS_PER_FRAME = 5;

export interface Advance {
  events: GameEvent[];
  /** デモ AI が「あと少し」でブロックを離れた（規則 5） */
  demoQuit: boolean;
}

export class Session {
  readonly state: GameState;
  readonly view: View;
  /** 人が遊ぶときの希望レーン。押した瞬間に切り替わり、次に押すまで保たれる */
  want: Lane = 'enemy';
  /** 削ったのに壊し切れず通過させたブロックの数（リザルトのひとこと用） */
  nearMisses = 0;
  private readonly bot: DemoBot | null;
  private acc = 0;
  private blockTicks = 0;

  constructor(seed: number, demo: boolean, sfx: Sfx | null) {
    this.state = createGame(seed);
    this.view = new View(seed, sfx);
    this.bot = demo ? createDemoBot(seed) : null;
  }

  /** 強化レーンにいた時間の割合（0〜1） */
  get blockShare(): number {
    return this.state.tick > 0 ? this.blockTicks / this.state.tick : 0;
  }

  /** 実時間 dt 秒ぶん進める。経過時間を貯めて 1/60 秒ずつ step を回す */
  advance(dt: number): Advance {
    const events: GameEvent[] = [];
    let demoQuit = false;
    this.acc = Math.min(this.acc + dt, MAX_STEPS_PER_FRAME * DT);
    while (this.acc >= DT) {
      this.acc -= DT;
      if (this.state.over) continue;
      if (this.bot) {
        const prev = this.want;
        this.want = this.bot.act(this.state);
        if (this.bot.rule === 5 && prev === 'block' && this.want === 'enemy') demoQuit = true;
      }
      for (const e of step(this.state, this.want)) {
        events.push(e);
        if (e.type === 'blockPass' && e.damaged) this.nearMisses++;
      }
      if (this.state.player.lane === 'block') this.blockTicks++;
    }
    this.view.handle(events);
    this.view.update(dt, this.state);
    return { events, demoQuit };
  }
}
