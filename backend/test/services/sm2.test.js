import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sm2Update, skillDelta } from '../../src/services/sm2.js';

describe('sm2Update', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('grows ease factor on a perfect score', () => {
    const { easeFactor } = sm2Update({ easeFactor: 2.5, intervalDays: 1, score: 1 });
    expect(easeFactor).toBeCloseTo(2.6, 5);
  });

  it('shrinks ease factor at the quality=3 boundary (score=0.6)', () => {
    const { easeFactor } = sm2Update({ easeFactor: 2.5, intervalDays: 10, score: 0.6 });
    expect(easeFactor).toBeCloseTo(2.36, 5);
  });

  it('treats score=0.5 as a pass (rounds to quality 3, not a failure)', () => {
    const { intervalDays } = sm2Update({ easeFactor: 2.5, intervalDays: 10, score: 0.5 });
    // quality 3 is a pass, so this should grow the interval, not reset to 1
    expect(intervalDays).toBeGreaterThan(1);
  });

  it('treats score just below 0.5 as a failure (quality rounds to 2)', () => {
    const { intervalDays } = sm2Update({ easeFactor: 2.5, intervalDays: 10, score: 0.49 });
    expect(intervalDays).toBe(1);
  });

  it('score=0 always fails and resets interval to 1', () => {
    const { intervalDays } = sm2Update({ easeFactor: 2.5, intervalDays: 50, score: 0 });
    expect(intervalDays).toBe(1);
  });

  it('failure resets a large existing interval to 1 regardless of modifier', () => {
    const { intervalDays } = sm2Update({
      easeFactor: 2.5,
      intervalDays: 200,
      score: 0.3,
      intervalModifier: 3.0,
    });
    expect(intervalDays).toBe(1);
  });

  describe('first-success graduation (intervalDays <= 1)', () => {
    it('graduates to 6 days at default modifier', () => {
      const { intervalDays } = sm2Update({ easeFactor: 2.5, intervalDays: 1, score: 1, intervalModifier: 1.0 });
      expect(intervalDays).toBe(6);
    });

    it('floors at 2 days for a low modifier', () => {
      const { intervalDays } = sm2Update({ easeFactor: 2.5, intervalDays: 1, score: 1, intervalModifier: 0.3 });
      expect(intervalDays).toBe(2);
    });

    it('scales up for a high modifier', () => {
      const { intervalDays } = sm2Update({ easeFactor: 2.5, intervalDays: 1, score: 1, intervalModifier: 3.0 });
      expect(intervalDays).toBe(18);
    });
  });

  describe('subsequent success growth', () => {
    it('grows by intervalDays * easeFactor * modifier', () => {
      const { intervalDays } = sm2Update({ easeFactor: 2.5, intervalDays: 10, score: 1, intervalModifier: 1.0 });
      // newEaseFactor = 2.6, 10 * 2.6 = 26
      expect(intervalDays).toBe(26);
    });

    it('floors growth at intervalDays + 1 when ease*modifier would grow it by less', () => {
      // easeFactor floors at 1.3; with a 0.5 modifier, 10 * 1.3 * 0.5 = 6.5 (rounds to 7),
      // which is less than intervalDays+1 (11) — the floor should win.
      const { intervalDays } = sm2Update({ easeFactor: 1.3, intervalDays: 10, score: 0.6, intervalModifier: 0.5 });
      expect(intervalDays).toBe(11);
    });
  });

  it('clamps ease factor at a floor of 1.3 after repeated failures', () => {
    let state = { easeFactor: 2.5, intervalDays: 1 };
    for (let i = 0; i < 10; i++) {
      state = sm2Update({ ...state, score: 0 });
    }
    expect(state.easeFactor).toBe(1.3);
  });

  it('caps intervalDays at 365 even with a high modifier and repeated perfect scores', () => {
    let state = { easeFactor: 2.5, intervalDays: 1 };
    for (let i = 0; i < 10; i++) {
      state = sm2Update({ ...state, score: 1, intervalModifier: 3.0 });
    }
    expect(state.intervalDays).toBeLessThanOrEqual(365);
    expect(state.intervalDays).toBe(365);
  });

  it('sets nextReview to now + intervalDays * 86400', () => {
    const { intervalDays, nextReview } = sm2Update({ easeFactor: 2.5, intervalDays: 1, score: 1 });
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(nextReview).toBe(nowSeconds + intervalDays * 86400);
  });
});

describe('skillDelta', () => {
  it('score >= 0.95 grants up to +2, scaled by distance from the cap', () => {
    expect(skillDelta(0.95, 0)).toBeCloseTo(2, 5);
    expect(skillDelta(1, 0)).toBeCloseTo(2, 5);
    expect(skillDelta(0.95, 9999)).toBeCloseTo(0.0003, 6);
  });

  it('0.8 <= score < 0.95 grants up to +1, scaled by distance from the cap', () => {
    expect(skillDelta(0.94999, 0)).toBeCloseTo(1, 5);
    expect(skillDelta(0.8, 0)).toBeCloseTo(1, 5);
    expect(skillDelta(0.85, 9999)).toBeCloseTo(0.00015, 6);
  });

  it('0.6 <= score < 0.8 is neutral (0 delta)', () => {
    expect(skillDelta(0.79999, 5000)).toBe(0);
    expect(skillDelta(0.6, 5000)).toBe(0);
  });

  it('0.4 <= score < 0.6 costs -0.5', () => {
    expect(skillDelta(0.59999, 5000)).toBe(-0.5);
    expect(skillDelta(0.4, 5000)).toBe(-0.5);
  });

  it('score < 0.4 costs -1', () => {
    expect(skillDelta(0.39999, 5000)).toBe(-1);
    expect(skillDelta(0, 5000)).toBe(-1);
  });
});
