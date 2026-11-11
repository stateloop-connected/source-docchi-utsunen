// localStorage への保存（ハイスコアと音の設定のみ。仕様書 1 章）。
// 使えない環境（プライベートブラウズなど）でも落ちないよう、失敗は黙って無視する。

const KEY_HIGH_SCORE = 'docchi-utsunen.highScore';
const KEY_SOUND = 'docchi-utsunen.sound';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できなくても遊べる
  }
}

export function loadHighScore(): number {
  const n = Number(read(KEY_HIGH_SCORE));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function saveHighScore(score: number): void {
  write(KEY_HIGH_SCORE, String(Math.floor(score)));
}

/** 音は初めはオン。実際に鳴り始めるのは最初のタップから */
export function loadSound(): boolean {
  return read(KEY_SOUND) !== 'off';
}

export function saveSound(on: boolean): void {
  write(KEY_SOUND, on ? 'on' : 'off');
}
