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

const JA_UNITS = ['万', '億', '兆', '京', '垓'] as const;
/** これを超える社会人力は、単位が足りないので「測定不能」と出す */
const POWER_LIMIT = 1e24;

/**
 * 社会人力の表示。1 万未満は 3 桁区切りの整数、それ以上は万・億・兆・京・垓を付けて 3〜4 桁（例: 26.2万、7,581万、7.21億）。
 * 垓でも足りなければ「測定不能」。
 */
export function formatPower(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v < 10000) return formatComma(v);
  if (v >= POWER_LIMIT) return '測定不能';
  let x = v;
  let unit = -1;
  while (x >= 10000 && unit < JA_UNITS.length - 1) {
    x /= 10000;
    unit++;
  }
  const digits = x < 10 ? 2 : x < 100 ? 1 : 0;
  const f = 10 ** digits;
  // 割り算の誤差で 5.02 が 5.0199… になり、切り捨てで 5.01 と出るのを防ぐ
  const shown = Math.floor(x * f + 1e-6) / f;
  return (digits === 0 ? formatComma(shown) : shown.toFixed(digits)) + JA_UNITS[unit]!;
}
