// 遠近法（仕様書 6.1 節）。奥行き z は 0（手前の防衛線）〜1（地平線）、横位置 u は −1（道の左端）〜+1（右端）。

/** 論理解像度 */
export const W = 540;
export const H = 960;

export const HORIZON_Y = 250;
export const FRONT_Y = 860;
export const CENTER_X = 270;
/** 手前での道の半分の幅 */
export const HALF_ROAD = 240;

/** レーンの範囲（u） */
export const ENEMY_LANE = { min: -0.92, max: -0.08, center: -0.5 } as const;
export const BLOCK_LANE = { min: 0.08, max: 0.92, center: 0.5 } as const;

/** 奥行きによる縮小率。手前で 1、地平線で 0.25 */
export function kOf(z: number): number {
  return 1 / (1 + 3 * z);
}

export function yOf(z: number): number {
  return HORIZON_Y + ((FRONT_Y - HORIZON_Y) * (kOf(z) - 0.25)) / 0.75;
}

export function xOf(u: number, z: number): number {
  return CENTER_X + HALF_ROAD * u * kOf(z);
}
