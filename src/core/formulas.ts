// 仕様書 3.2 節の数式。計算の順序は参照シミュレータに合わせてある（浮動小数点の結果を揃えるため）。
import { B, BOSS_NAMES, BOSS_PREFIX, ENEMIES, FIRE_RATE, SCORE, WEAPONS, WEAPON_STEP } from './balance.ts';

/** プレイヤーの DPS */
export function dpsOf(rank: number): number {
  return B.d0 * B.g ** rank;
}

/** 基準火力 */
export function dRef(t: number): number {
  return B.d0 * B.g ** (B.rRef * t);
}

/** 圧力比 */
export function phi(t: number): number {
  return B.phi0 * Math.exp(B.kappa * t);
}

/** サイズ流入（サイズ/秒） */
export function sizeRate(t: number): number {
  return Math.min(B.sizeMax, B.sizeBase + B.sizeSlope * t);
}

export function waveOf(t: number): number {
  return Math.floor(t / B.waveLength) + 1;
}

/** 解禁済みの敵種の数。ENEMIES は解禁順に並んでいるので、先頭からこの数だけが対象 */
export function unlockedCount(t: number): number {
  const w = waveOf(t);
  let n = 0;
  for (const e of ENEMIES) if (e.unlockWave <= w) n++;
  return n;
}

/** 基礎 HP h(t)。s̄ と m̄ は「1 回の出現あたり」（出現数を掛ける）で平均する */
export function baseHp(t: number): number {
  const n = unlockedCount(t);
  let total = 0;
  let sSum = 0;
  let mSum = 0;
  for (let i = 0; i < n; i++) {
    const e = ENEMIES[i]!;
    total += e.weight;
    sSum += e.size * e.count * e.weight;
    mSum += e.hpMult * e.count * e.weight;
  }
  const sBar = sSum / total;
  const mBar = mSum / total;
  return (phi(t) * dRef(t) * sBar) / (sizeRate(t) * mBar);
}

export function bossHp(t: number): number {
  return B.bossCoef * phi(t) * dRef(t);
}

/** ボスの名前。index は出現順（1 始まり） */
export function bossName(index: number): string {
  const i = Math.max(0, index - 1);
  const name = BOSS_NAMES[i % BOSS_NAMES.length]!;
  return i >= BOSS_NAMES.length ? BOSS_PREFIX + name : name;
}

/** 武器の段階（0〜15） */
export function weaponStage(rank: number): number {
  return Math.min(WEAPONS.length - 1, Math.floor(rank / WEAPON_STEP));
}

/** 武器の表示名。最終段階を超えたランクは「ねこ +N」 */
export function weaponName(rank: number): string {
  const last = WEAPONS.length - 1;
  const name = WEAPONS[weaponStage(rank)]!;
  const over = rank - last * WEAPON_STEP;
  return over > 0 ? `${name} +${over}` : name;
}

/** 見た目の発射数（発/秒） */
export function fireRate(rank: number): number {
  return Math.min(FIRE_RATE.max, FIRE_RATE.base + rank * FIRE_RATE.perRank);
}

/** リザルトの推定 IQ */
export function estimatedIq(score: number): number {
  return Math.min(SCORE.iqMax, SCORE.iqBase + Math.floor(score / SCORE.iqPerScore));
}
