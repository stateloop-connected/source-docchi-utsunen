// 腕前ボット（仕様書 9.1 節）。人の腕前を数字で表した自動プレイヤー。
import { AIM, type BlockKind } from '../core/balance.ts';
import { sizeRate } from '../core/formulas.ts';
import type { Block, GameState } from '../core/state.ts';
import { BLOCK_PRIORITY, ENEMY_HOME, TIME_EPSILON, aimBest, aimOldest, botRandom, timeToBreak, type Bot } from './bot.ts';

export interface SkillParams {
  /** 敵側にいるとき、埋まり度の割合がこれ未満なら強化を取りに行く */
  readonly lo: number;
  /** 強化側にいるとき、埋まり度の割合がこれを超えたら敵側へ戻る */
  readonly hi: number;
  /** 行き先を決め直す間隔（秒） */
  readonly interval: number;
  /** 狙う敵を決め直す間隔（秒）。反応の速さ */
  readonly aimInterval: number;
  /** 罠と帽子を避ける確率 */
  readonly avoid: number;
  /** 何も考えず前回の行き先を維持する確率 */
  readonly lapse: number;
  /** 壊し切れるか・溢れないかを先読みする */
  readonly check: boolean;
  /** 効率のよい敵を選んで狙う（偽なら、いちばん古い敵を狙う） */
  readonly smartAim: boolean;
}

export const SKILL_BOTS = {
  timid: { lo: 0.1, hi: 0.35, interval: 0.8, aimInterval: 0.3, avoid: 0.5, lapse: 0.15, check: false, smartAim: false },
  casual: { lo: 0.3, hi: 0.6, interval: 0.6, aimInterval: 0.22, avoid: 0.8, lapse: 0.08, check: false, smartAim: false },
  good: { lo: 0.5, hi: 0.75, interval: 0.35, aimInterval: 0.15, avoid: 1.0, lapse: 0.03, check: true, smartAim: true },
  expert: { lo: 0.8, hi: 0.95, interval: 0.15, aimInterval: 0.08, avoid: 1.0, lapse: 0, check: true, smartAim: true },
} as const satisfies Record<string, SkillParams>;

/** check が有効なボットの先読みで使う値 */
const CHECK = {
  /** ボムは埋まり度（サイズ）がこれ未満なら取らない */
  bombMinFill: 25,
  /** 通過までの残り秒数から引く余裕 */
  passMargin: 0.1,
  /** 壊している間に溜まる敵を見込んで、容量のこの割合を超えるなら取らない */
  maxFillRatio: 0.92,
} as const;

/** 埋まり度の割合がこれを超えたら、ボムを最優先にする */
const BOMB_FIRST_RATIO = 0.5;

function isJunk(kind: BlockKind): boolean {
  return kind === 'trap' || kind === 'hat';
}

/** 今いちばん壊したいブロックを選ぶ。なければ undefined。fooled は、罠や帽子に釣られると決めたブロック */
function pickBlock(s: GameState, p: SkillParams, fooled: (b: Block) => boolean): Block | undefined {
  const ratio = s.fill / s.capacity;
  let best: Block | undefined;
  let bestRank = Infinity;
  for (const b of s.blocks) {
    // 同じ列の手前に別のブロックがあると、そちらに当たってしまうので狙えない
    if (s.blocks.some((o) => o.col === b.col && o.passAt < b.passAt)) continue;
    if (isJunk(b.kind) && !fooled(b)) continue;
    if (p.check) {
      if (b.kind === 'bomb' && s.fill < CHECK.bombMinFill) continue;
      const need = timeToBreak(s, b);
      if (need > b.passAt - s.t - CHECK.passMargin) continue;
      if (s.fill + sizeRate(s.t) * need > CHECK.maxFillRatio * s.capacity) continue;
    }
    // 通過の早い段を先に。同じ段の中では優先順で選ぶ
    const priority = b.kind === 'bomb' && ratio > BOMB_FIRST_RATIO ? -1 : BLOCK_PRIORITY.indexOf(b.kind);
    const rank = b.row * 100 + priority;
    if (rank < bestRank) {
      bestRank = rank;
      best = b;
    }
  }
  return best;
}

export function createSkillBot(seed: number, p: SkillParams): Bot {
  const rnd = botRandom(seed);
  let nextDecide = 0;
  let nextAim = 0;
  let goingForBlocks = false;
  let targetId = 0;
  let aim = ENEMY_HOME;
  /** 罠や帽子は、初めて見たときに「釣られるか」を 1 回だけ決める */
  const junkChoice = new Map<number, boolean>();
  const fooled = (b: Block): boolean => {
    let v = junkChoice.get(b.id);
    if (v === undefined) {
      v = rnd() >= p.avoid;
      junkChoice.set(b.id, v);
    }
    return v;
  };

  /** 行き先を決める。前回の行き先（強化を取りに行っていたか）で、戻る・行くのしきい値が変わる */
  const decide = (s: GameState): void => {
    const b = pickBlock(s, p, fooled);
    const ratio = s.fill / s.capacity;
    if (!b) goingForBlocks = false;
    else if (goingForBlocks) goingForBlocks = ratio <= p.hi;
    else goingForBlocks = ratio < p.lo;
    targetId = goingForBlocks && b ? b.id : 0;
  };

  return {
    act(s) {
      if (s.t >= nextDecide - TIME_EPSILON) {
        nextDecide += p.interval;
        if (rnd() >= p.lapse) decide(s);
      }
      if (goingForBlocks) {
        const b = s.blocks.find((o) => o.id === targetId);
        if (b) return b.u;
        // 狙っていたブロックがなくなった。続けて取れるものがあれば、そのまま次へ行く
        const next = pickBlock(s, p, fooled);
        if (next) {
          targetId = next.id;
          return next.u;
        }
        return s.player.x;
      }
      if (s.t >= nextAim - TIME_EPSILON) {
        nextAim = s.t + p.aimInterval;
        aim = p.smartAim ? aimBest(s) : aimOldest(s);
      }
      return aim;
    },
  };
}

/** 敵だけを狙うボット（enemy_only） */
export function createEnemyOnlyBot(): Bot {
  let nextAim = 0;
  let aim = ENEMY_HOME;
  return {
    act(s) {
      if (s.t >= nextAim - TIME_EPSILON) {
        nextAim = s.t + SKILL_BOTS.casual.aimInterval;
        aim = aimOldest(s);
      }
      return aim;
    },
  };
}

/** 強化だけを狙うボット（block_only）。罠も帽子も区別せず、通過の早い順・優先順に壊す */
export function createBlockOnlyBot(): Bot {
  return {
    act(s) {
      let best: Block | undefined;
      let bestRank = Infinity;
      for (const b of s.blocks) {
        const rank = b.row * 100 + BLOCK_PRIORITY.indexOf(b.kind);
        if (rank < bestRank) {
          bestRank = rank;
          best = b;
        }
      }
      return best ? best.u : AIM.blockCols[1];
    },
  };
}
