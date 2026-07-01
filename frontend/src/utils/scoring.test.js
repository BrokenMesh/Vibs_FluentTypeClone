import { describe, it, expect } from 'vitest';
import {
  charMistakes, challengeScore, wordMatches, practiceScore, computeWpm, updateStreak,
} from './scoring.js';

describe('charMistakes', () => {
  it('is 0 for an exact match', () => {
    expect(charMistakes('bonjour', 'bonjour')).toBe(0);
  });

  it('counts every mismatched position for same-length strings', () => {
    expect(charMistakes('xxxxxxx', 'bonjour')).toBe(7);
  });

  it('counts missing trailing characters as mistakes (stopping early is penalised)', () => {
    expect(charMistakes('bon', 'bonjour')).toBe(4); // 'j','o','u','r' missing
  });
});

describe('challengeScore', () => {
  it('is 1.0 with zero mistakes', () => {
    expect(challengeScore('bonjour', 'bonjour')).toBe(1);
  });

  it('is exactly 0.0 at 10 mistakes', () => {
    expect(challengeScore('aaaaaaaaaa', 'bbbbbbbbbb')).toBe(0);
  });

  it('clamps at 0 rather than going negative for more than 10 mistakes', () => {
    expect(challengeScore('a'.repeat(15), 'b'.repeat(15))).toBe(0);
  });
});

describe('wordMatches', () => {
  it('is case-insensitive', () => {
    expect(wordMatches('Hund', 'hund')).toBe(true);
  });

  it('trims the typed side', () => {
    expect(wordMatches('  hund  ', 'hund')).toBe(true);
  });

  it('does not trim the target side (asymmetric)', () => {
    expect(wordMatches('hund', 'hund ')).toBe(false);
  });
});

describe('practiceScore', () => {
  it('is 1.0 with no mistakes', () => {
    expect(practiceScore([true, true, true])).toBe(1);
  });

  it('uses the same 1 - mistakes/10 formula as challengeScore, applied per-word', () => {
    const wordResults = [false, false, false, true, true]; // 3 mistakes
    expect(practiceScore(wordResults)).toBeCloseTo(0.7, 5);
    expect(practiceScore(wordResults)).toBeCloseTo(challengeScore('xxx', 'yyy'), 5);
  });

  it('clamps at 0 for 10+ mistakes', () => {
    const wordResults = Array(12).fill(false);
    expect(practiceScore(wordResults)).toBe(0);
  });
});

describe('computeWpm', () => {
  it('is 0 when elapsed time is 0', () => {
    expect(computeWpm('some words here', 0)).toBe(0);
  });

  it('is 0 when elapsed time is negative', () => {
    expect(computeWpm('some words here', -500)).toBe(0);
  });

  it('computes words per minute for a normal case', () => {
    // 4 words typed in 30 seconds = 8 wpm
    expect(computeWpm('one two three four', 30000)).toBe(8);
  });

  it('counts a single word with no spaces as 1 word', () => {
    expect(computeWpm('word', 60000)).toBe(1);
  });
});

describe('updateStreak', () => {
  it('increments at exactly the 0.8 threshold (inclusive)', () => {
    expect(updateStreak(2, 0.8)).toBe(3);
  });

  it('resets to 0 just below the threshold', () => {
    expect(updateStreak(5, 0.79999)).toBe(0);
  });

  it('resets fully to 0 on failure, not a decrement', () => {
    expect(updateStreak(100, 0)).toBe(0);
  });

  it('respects a custom threshold', () => {
    expect(updateStreak(0, 0.5, 0.5)).toBe(1);
    expect(updateStreak(0, 0.49, 0.5)).toBe(0);
  });
});
