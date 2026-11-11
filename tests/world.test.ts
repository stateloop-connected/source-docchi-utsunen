import { describe, expect, it } from 'vitest';
import { PALETTES, PHASE_FADE, PHASE_SECONDS, skyPhase } from '../src/render/world.ts';

describe('時間帯の移り変わり', () => {
  it('昼・夕焼け・夜・夜明けの 4 つがある', () => {
    expect(PALETTES).toHaveLength(4);
  });

  it('開始から 80 秒は昼のまま', () => {
    expect(skyPhase(0)).toEqual({ from: 0, to: 1, mix: 0 });
    expect(skyPhase(PHASE_SECONDS - PHASE_FADE)).toEqual({ from: 0, to: 1, mix: 0 });
  });

  it('5 ウェーブ目（ボス戦）のあいだに、次の時間帯へなめらかに移る', () => {
    const mid = skyPhase(PHASE_SECONDS - PHASE_FADE / 2);
    expect(mid.from).toBe(0);
    expect(mid.mix).toBeCloseTo(0.5, 9);
    expect(skyPhase(99.9).mix).toBeGreaterThan(0.99);
    expect(skyPhase(100)).toEqual({ from: 1, to: 2, mix: 0 });
  });

  it('夜明けのあとは昼に戻る', () => {
    expect(skyPhase(399).to).toBe(0);
    expect(skyPhase(400).from).toBe(0);
  });
});
