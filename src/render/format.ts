// 数字の表示（仕様書 6.7 節）。

const UNITS = ['K', 'M', 'B', 'T'] as const;

/** 1,000 未満は整数、それ以上は K・M・B・T を付けて有効数字 3 桁（例: 24.5K、3.02M）。端数は切り捨てる */
export function formatNumber(n: number): string {
  let v = Math.max(0, Math.floor(n));
  if (v < 1000) return String(v);
  let unit = -1;
  while (v >= 1000 && unit < UNITS.length - 1) {
    v /= 1000;
    unit++;
  }
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  const f = 10 ** digits;
  return (Math.floor(v * f) / f).toFixed(digits) + UNITS[unit]!;
}

/** 残り HP 用。生きているのに 0 と出ないよう切り上げる */
export function formatHp(hp: number): string {
  return formatNumber(Math.ceil(hp));
}

/** 3 桁区切りの整数（スコア用。小数点以下は切り捨て） */
export function formatComma(n: number): string {
  const s = String(Math.max(0, Math.floor(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return out;
}
