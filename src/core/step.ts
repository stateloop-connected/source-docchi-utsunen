// 1 刻みの処理（仕様書 2.7 節）。処理順は参照シミュレータの step と 1 対 1 で対応している。
import { AIM, B, BLOCKS, CALM_MULT, DT, ENEMIES, RUSH_START, SCORE, TPS, TRAP_ENEMY, type EnemyDef, type EnemyKind } from './balance.ts';
import { drawRow } from './deck.ts';
import { baseHp, bossHp, dpsOf, sizeRate, unlockedCount, waveOf, weaponStage } from './formulas.ts';
import { nextRandom } from './rng.ts';
import type { Block, Enemy, GameEvent, GameState } from './state.ts';

function addEnemy(s: GameState, kind: EnemyKind | 'boss', hp: number, size: number, u: number, halfWidth: number, bossIndex = 0): void {
  const e: Enemy = { id: s.nextId++, kind, hp, hp0: hp, size, born: s.t, bossIndex, u, halfWidth };
  s.enemies.push(e);
  s.fill += size;
  if (kind === 'revolving') s.growing.push(e);
}

/** 敵 count 体を、ひとかたまりで出す。まとめて出る敵は中心のまわりに散らばる */
function addGroup(s: GameState, def: EnemyDef, count: number, hp: number): void {
  const lo = AIM.enemyMin + def.halfWidth;
  const hi = AIM.enemyMax - def.halfWidth;
  const center = lo + (hi - lo) * nextRandom(s.positionRng);
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? center : Math.min(hi, Math.max(lo, center + (nextRandom(s.positionRng) - 0.5) * AIM.groupSpread));
    addEnemy(s, def.id, hp, def.size, u, def.halfWidth);
  }
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
  addGroup(s, def, def.count, baseHp(s.t) * def.hpMult);
  ev.push({ type: 'enemySpawn', kind: def.id, count: def.count });
  return def.size * def.count;
}

function spawnMult(s: GameState): number {
  if (s.t % B.waveLength < RUSH_START) return CALM_MULT;
  return waveOf(s.t) % B.bossEvery === 0 ? 0 : B.rushMult;
}

/** 敵を 1 体消したあとの後始末。列からの取り除きは呼ぶ側が行う。ボムで消したボス以外の敵にはスコアを入れない */
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

/**
 * 列の先頭から順に、条件に合う敵へダメージを与える。余りは次の合う敵へ持ち越す。
 * x を渡すと、その列に重なる敵だけが対象（プレイヤーの弾）。渡さなければ全員が対象（相棒）。
 */
function damageEnemies(s: GameState, dmg: number, ev: GameEvent[], x?: number): void {
  let i = 0;
  while (dmg > 0 && i < s.enemies.length) {
    const e = s.enemies[i]!;
    if (x !== undefined && Math.abs(e.u - x) > e.halfWidth + AIM.beamHalf) {
      i++;
    } else if (e.hp <= dmg) {
      dmg -= e.hp;
      s.enemies.splice(i, 1);
      removeEnemy(s, e, false, ev);
    } else {
      e.hp -= dmg;
      dmg = 0;
    }
  }
}

/** 4.2 節の一斉削除 */
function bomb(s: GameState, ev: GameEvent[]): void {
  let remain: number = B.bombSize;
  const keep: Enemy[] = [];
  for (const e of s.enemies) {
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
}

function rankUp(s: GameState, by: number, ev: GameEvent[]): void {
  const before = weaponStage(s.player.rank);
  s.player.rank += by;
  ev.push({ type: 'rankUp', rank: s.player.rank, stageChanged: weaponStage(s.player.rank) !== before });
}

function applyBlock(s: GameState, b: Block, ev: GameEvent[]): void {
  s.got[b.kind]++;
  s.score += SCORE.block * waveOf(s.t);
  // 同じ段のもう片方を先に壊していれば「両取り」
  const half = s.halfRows.indexOf(b.row);
  const double = half >= 0;
  if (double) {
    s.halfRows.splice(half, 1);
    s.doubles++;
  } else if (s.blocks.some((o) => o.row === b.row)) {
    s.halfRows.push(b.row);
  }
  ev.push({ type: 'blockBreak', kind: b.kind, id: b.id, double });
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
    case 'trap':
      for (let i = 0; i < B.trapCount; i++) addGroup(s, TRAP_ENEMY, 1, baseHp(s.t) * TRAP_ENEMY.hpMult);
      ev.push({ type: 'enemySpawn', kind: TRAP_ENEMY.id, count: B.trapCount });
      break;
    case 'hat':
      s.player.hats++;
      break;
  }
}

/** ゲームを 1 刻み進め、起きた出来事を返す。aim は「どの横位置に立ちたいか」 */
export function step(s: GameState, aim: number): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.over) return ev;
  const p = s.player;

  // 1. 入力。立ちたい位置へ、決まった速さで近づく
  const want = Math.min(AIM.maxX, Math.max(AIM.minX, aim));
  const reach = AIM.moveSpeed * DT;
  p.x += Math.min(reach, Math.max(-reach, want - p.x));

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
    addEnemy(s, 'boss', bossHp(s.t), B.bossSize, AIM.bossU, AIM.bossHalf, s.bossesSpawned);
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

  // 5. ブロックの段の出現（HP は出現した瞬間のランクで決まり、相棒は含めない）
  if (s.t >= s.nextRowAt) {
    const kinds = drawRow(s.deck);
    const row = s.rowsSpawned++;
    kinds.forEach((kind, col) => {
      const hp = BLOCKS[kind].cost * dpsOf(p.rank);
      s.blocks.push({ id: s.nextId++, kind, hp, maxHp: hp, passAt: s.nextRowAt + B.blockTravel, row, col, u: AIM.blockCols[col]! });
      ev.push({ type: 'blockSpawn', kind, hp });
    });
    s.nextRowAt += B.blockInterval;
  }

  // 6. ブロックの通過
  while (s.blocks.length > 0 && s.blocks[0]!.passAt <= s.t) {
    const b = s.blocks.shift()!;
    s.missed[b.kind]++;
    const half = s.halfRows.indexOf(b.row);
    if (half >= 0) s.halfRows.splice(half, 1);
    ev.push({ type: 'blockPass', kind: b.kind, damaged: b.hp < b.maxHp, left: b.hp / b.maxHp, id: b.id });
  }

  // 7. 相棒（列に関係なく、敵の先頭から撃つ）
  const dps = dpsOf(p.rank);
  if (p.buddies > 0) damageEnemies(s, dps * B.buddyDps * p.buddies * DT, ev);

  // 8. プレイヤー。立っている列に重なる、最も手前の標的を撃つ
  if (Math.abs(p.x) < AIM.border) {
    damageEnemies(s, dps * DT, ev, p.x);
  } else {
    const i = s.blocks.findIndex((b) => Math.abs(b.u - p.x) <= AIM.blockHalf + AIM.beamHalf);
    if (i >= 0) {
      const b = s.blocks[i]!;
      b.hp -= dps * DT;
      if (b.hp <= 0) {
        s.blocks.splice(i, 1);
        applyBlock(s, b, ev);
      }
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
