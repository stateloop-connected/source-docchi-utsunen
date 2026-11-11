// 1 刻みの処理（仕様書 2.7 節）。処理順は参照シミュレータの step と 1 対 1 で対応している。
import {
  B,
  BLOCKS,
  CALM_MULT,
  DT,
  ENEMIES,
  RUSH_START,
  SCORE,
  TPS,
  TRAP_ENEMY,
  type EnemyKind,
  type Lane,
} from './balance.ts';
import { drawBlock } from './deck.ts';
import { baseHp, bossHp, dpsOf, sizeRate, unlockedCount, waveOf, weaponStage } from './formulas.ts';
import { nextRandom } from './rng.ts';
import type { Block, Enemy, GameEvent, GameState } from './state.ts';

/** 倒した敵の抜け殻がこの数を超え、列の半分以上を占めたら詰め直す */
const COMPACT_AT = 256;

function addEnemy(s: GameState, kind: EnemyKind | 'boss', hp: number, size: number, bossIndex = 0): void {
  const e: Enemy = { id: s.nextId++, kind, hp, hp0: hp, size, born: s.t, bossIndex };
  s.enemies.push(e);
  s.fill += size;
  if (kind === 'revolving') s.growing.push(e);
}

/** 3.3 節の手順 2。1 回の出現を行い、出した敵のサイズ合計を返す */
function spawnGroup(s: GameState, ev: GameEvent[]): number {
  const n = unlockedCount(s.t);
  let total = 0;
  for (let i = 0; i < n; i++) total += ENEMIES[i]!.weight;
  let r = nextRandom(s.spawnRng) * total;
  let def = ENEMIES[0]!;
  for (let i = 0; i < n; i++) {
    def = ENEMIES[i]!;
    r -= def.weight;
    if (r <= 0) break;
  }
  const h = baseHp(s.t);
  for (let i = 0; i < def.count; i++) addEnemy(s, def.id, h * def.hpMult, def.size);
  ev.push({ type: 'enemySpawn', kind: def.id, count: def.count });
  return def.size * def.count;
}

function spawnMult(s: GameState): number {
  if (s.t % B.waveLength < RUSH_START) return CALM_MULT;
  return waveOf(s.t) % B.bossEvery === 0 ? 0 : B.rushMult;
}

/** 敵を 1 体消す。ボムで消したボス以外の敵にはスコアを入れない */
function removeEnemy(s: GameState, e: Enemy, byBomb: boolean, ev: GameEvent[]): void {
  e.hp = 0;
  s.fill -= e.size;
  if (!byBomb || e.kind === 'boss') s.score += e.size * waveOf(s.t) * SCORE.enemyPerSize;
  ev.push({ type: 'enemyKill', kind: e.kind, size: e.size, byBomb, id: e.id });
  if (e.kind === 'boss') {
    s.bossesKilled++;
    s.score += SCORE.boss * s.bossesKilled;
    ev.push({ type: 'bossKill', index: e.bossIndex });
  }
}

/** 先頭から順にダメージを与える。余りは次の敵へ持ち越す */
function damageEnemies(s: GameState, dmg: number, ev: GameEvent[]): void {
  while (dmg > 0 && s.head < s.enemies.length) {
    const e = s.enemies[s.head]!;
    if (e.hp <= dmg) {
      dmg -= e.hp;
      s.head++;
      removeEnemy(s, e, false, ev);
    } else {
      e.hp -= dmg;
      dmg = 0;
    }
  }
  if (s.head >= COMPACT_AT && s.head * 2 >= s.enemies.length) {
    s.enemies.splice(0, s.head);
    s.head = 0;
  }
}

/** 4.2 節の一斉削除 */
function bomb(s: GameState, ev: GameEvent[]): void {
  let remain: number = B.bombSize;
  const keep: Enemy[] = [];
  for (let i = s.head; i < s.enemies.length; i++) {
    const e = s.enemies[i]!;
    if (e.kind === 'boss') {
      e.hp -= e.hp0 * B.bombBossRatio;
      if (e.hp > 0) keep.push(e);
      else removeEnemy(s, e, true, ev);
    } else if (remain >= e.size - B.epsilon) {
      remain -= e.size;
      removeEnemy(s, e, true, ev);
    } else {
      keep.push(e);
    }
  }
  s.enemies = keep;
  s.head = 0;
}

function rankUp(s: GameState, by: number, ev: GameEvent[]): void {
  const before = weaponStage(s.player.rank);
  s.player.rank += by;
  ev.push({ type: 'rankUp', rank: s.player.rank, stageChanged: weaponStage(s.player.rank) !== before });
}

function applyBlock(s: GameState, b: Block, ev: GameEvent[]): void {
  s.got[b.kind]++;
  s.score += SCORE.block * waveOf(s.t);
  ev.push({ type: 'blockBreak', kind: b.kind, id: b.id });
  switch (b.kind) {
    case 'rank':
      rankUp(s, 1, ev);
      break;
    case 'gold':
      rankUp(s, B.goldRanks, ev);
      break;
    case 'buddy':
      s.player.buddies = Math.min(B.buddyMax, s.player.buddies + 1);
      break;
    case 'bomb':
      bomb(s, ev);
      break;
    case 'vacation':
      s.vacationUntil = Math.max(s.vacationUntil, s.t) + B.vacation;
      break;
    case 'expand':
      if (s.expands < B.expandMax) {
        s.expands++;
        s.capacity += B.expand;
      }
      break;
    case 'trap': {
      const h = baseHp(s.t);
      for (let i = 0; i < B.trapCount; i++) addEnemy(s, TRAP_ENEMY.id, h * TRAP_ENEMY.hpMult, TRAP_ENEMY.size);
      ev.push({ type: 'enemySpawn', kind: TRAP_ENEMY.id, count: B.trapCount });
      break;
    }
    case 'hat':
      s.player.hats++;
      break;
  }
}

/** ゲームを 1 刻み進め、起きた出来事を返す。want は「どちらのレーンにいたいか」 */
export function step(s: GameState, want: Lane): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.over) return ev;
  const p = s.player;

  // 1. 入力
  if (want !== p.lane && p.switchLeft <= 0) {
    p.lane = want;
    p.switchLeft = B.switchTime;
  }

  // 2. 警告とボス
  const wave = waveOf(s.t);
  const tau = s.t % B.waveLength;
  const isBossWave = wave % B.bossEvery === 0;
  if (tau >= B.warnAt && s.warnedWave !== wave) {
    s.warnedWave = wave;
    ev.push(isBossWave ? { type: 'bossWarning', wave, index: s.bossesSpawned + 1 } : { type: 'rushWarning', wave });
  }
  if (isBossWave && s.bossWave !== wave && tau >= RUSH_START) {
    s.bossWave = wave;
    s.bossesSpawned++;
    addEnemy(s, 'boss', bossHp(s.t), B.bossSize, s.bossesSpawned);
    ev.push({ type: 'bossSpawn', index: s.bossesSpawned });
  }

  // 3. 敵の出現（有給休暇の効果中は予算も貯めない）
  if (s.t >= s.vacationUntil) {
    s.budget += sizeRate(s.t) * spawnMult(s) * DT;
    while (s.budget > 0) s.budget -= spawnGroup(s, ev);
  }

  // 4. リボ払いの成長
  if (s.growing.length > 0) {
    s.growing = s.growing.filter((e) => e.hp > 0 && s.t - e.born < B.revolvingTime);
    for (const e of s.growing) e.hp += e.hp0 * B.revolvingRate * DT;
  }

  // 5. ブロックの出現（HP は出現した瞬間のランクで決まり、相棒は含めない）
  if (s.t >= s.nextBlockAt) {
    const kind = drawBlock(s.deck);
    const hp = BLOCKS[kind].cost * dpsOf(p.rank);
    s.blocks.push({ id: s.nextId++, kind, hp, maxHp: hp, passAt: s.nextBlockAt + B.blockTravel });
    s.nextBlockAt += B.blockInterval;
    ev.push({ type: 'blockSpawn', kind, hp });
  }

  // 6. ブロックの通過
  while (s.blocks.length > 0 && s.blocks[0]!.passAt <= s.t) {
    const b = s.blocks.shift()!;
    s.missed[b.kind]++;
    ev.push({ type: 'blockPass', kind: b.kind, damaged: b.hp < b.maxHp, id: b.id });
  }

  // 7. 相棒
  const dps = dpsOf(p.rank);
  if (p.buddies > 0) damageEnemies(s, dps * B.buddyDps * p.buddies * DT, ev);

  // 8. プレイヤー
  if (p.switchLeft > 0) {
    p.switchLeft -= DT;
  } else if (p.lane === 'enemy') {
    damageEnemies(s, dps * DT, ev);
  } else if (s.blocks.length > 0) {
    const b = s.blocks[0]!;
    b.hp -= dps * DT;
    if (b.hp <= 0) {
      s.blocks.shift();
      applyBlock(s, b, ev);
    }
  }

  // 9. 時間（足し込まず、刻み数から求める）
  s.tick++;
  s.t = s.tick / TPS;

  // 10. 終了判定
  if (s.fill >= s.capacity - B.epsilon) {
    s.over = true;
    ev.push({ type: 'gameOver' });
  }
  return ev;
}
