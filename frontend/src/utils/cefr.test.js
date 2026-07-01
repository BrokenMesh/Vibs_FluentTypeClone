import { describe, it, expect } from 'vitest';
import { CEFR, cefrOf, cefrNext, ptsToNext, levelProgress } from './cefr.js';

describe('cefrOf', () => {
  it.each([
    [0, 'A1'], [1666, 'A1'], [1667, 'A2'], [3333, 'A2'], [3334, 'B1'],
    [4999, 'B1'], [5000, 'B2'], [6666, 'B2'], [6667, 'C1'], [8333, 'C1'],
    [8334, 'C2'], [10000, 'C2'],
  ])('maps score %i to %s', (score, label) => {
    expect(cefrOf(score).label).toBe(label);
  });
});

describe('cefrNext', () => {
  it('returns the next tier for a non-C2 score', () => {
    expect(cefrNext(0).label).toBe('A2');
  });

  it('returns null only at C2 (the last tier)', () => {
    expect(cefrNext(8334)).toBeNull();
    expect(cefrNext(10000)).toBeNull();
    expect(cefrNext(8333)).not.toBeNull();
  });
});

describe('ptsToNext', () => {
  it('rounds up to the next whole point', () => {
    expect(ptsToNext(1666.1)).toBe(1); // next tier at 1667
  });

  it('is null at C2', () => {
    expect(ptsToNext(9000)).toBeNull();
  });
});

describe('levelProgress', () => {
  it('is 0 at the very start of a level', () => {
    expect(levelProgress(0)).toBe(0);
  });

  it('is ~500 at the midpoint of a level', () => {
    const mid = CEFR[0].min + (CEFR[1].min - CEFR[0].min) / 2;
    expect(levelProgress(mid)).toBeCloseTo(500, -1);
  });

  it('regression: fills gradually across all of C2 instead of instantly clamping to 1000', () => {
    const c2Start = CEFR[5].min; // 8334
    const quarterIntoC2 = c2Start + (10000 - c2Start) * 0.25;
    const halfwayIntoC2 = c2Start + (10000 - c2Start) * 0.5;
    const progressQuarter = levelProgress(quarterIntoC2);
    const progressHalf = levelProgress(halfwayIntoC2);
    // With the old hardcoded width of 167, any score more than 167 points into
    // C2 would already be clamped to 1000. These points are ~400+ in, so a
    // correct implementation must still show meaningful headroom.
    expect(progressQuarter).toBeLessThan(1000);
    expect(progressQuarter).toBeGreaterThan(0);
    expect(progressHalf).toBeGreaterThan(progressQuarter);
    expect(levelProgress(10000)).toBe(1000);
  });
});
