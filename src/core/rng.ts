// 種つき乱数（仕様書 8.1 節）。内部状態を数値 1 つで持ち、ゲーム状態に入れておけるようにする。

export interface RngState {
  a: number;
}

/** 敵の出現用の乱数列の種 = seed + SPAWN_SALT */
export const SPAWN_SALT = 0x9e3779b9;
/** ボット用の乱数列の種 = seed + BOT_SALT */
export const BOT_SALT = 0x85ebca6b;

export function seedRng(seed: number): RngState {
  return { a: seed >>> 0 };
}

/** mulberry32 の 1 回分。0 以上 1 未満を返す */
export function nextRandom(s: RngState): number {
  s.a = (s.a + 0x6d2b79f5) | 0;
  let t = Math.imul(s.a ^ (s.a >>> 15), 1 | s.a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function mulberry32(seed: number): () => number {
  const s = seedRng(seed);
  return () => nextRandom(s);
}

/** Fisher–Yates。i を n−1 から 1 まで減らしながら j = floor(乱数 × (i + 1)) と入れ替える */
export function shuffle<T>(arr: T[], rng: RngState): void {
  for (let i = arr.length - 1; i >= 1; i--) {
    const j = Math.floor(nextRandom(rng) * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}
