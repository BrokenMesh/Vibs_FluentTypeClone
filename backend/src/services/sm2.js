/**
 * SM-2 spaced repetition algorithm adapted for sentences and vocabulary.
 * score: 0.0 – 1.0 (proportion correct / accuracy)
 */

export function sm2Update({ easeFactor = 2.5, intervalDays = 1, score }) {
  // Map score 0-1 to SM-2 quality 0-5
  const q = Math.round(score * 5);

  let newInterval;
  let newEaseFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (newEaseFactor < 1.3) newEaseFactor = 1.3;

  if (q < 3) {
    // Failed — reset
    newInterval = 1;
  } else if (intervalDays <= 1) {
    newInterval = 1;
  } else if (intervalDays <= 6) {
    newInterval = 6;
  } else {
    newInterval = Math.round(intervalDays * newEaseFactor);
  }

  // Cap at 90 days
  if (newInterval > 90) newInterval = 90;

  const nextReview = Math.floor(Date.now() / 1000) + newInterval * 86400;

  return {
    easeFactor: newEaseFactor,
    intervalDays: newInterval,
    nextReview,
  };
}

/**
 * Compute skill score delta after a challenge attempt.
 * Positive on good accuracy, negative on poor accuracy.
 */
export function skillDelta(score, currentSkill) {
  // Skill score 0–1000. Each CEFR level is ~167 pts wide.
  // Max +2 per perfect session → ~84 sessions to advance one level.
  if (score >= 0.95) return Math.min(2,   (1000 - currentSkill) * 0.003);
  if (score >= 0.8)  return Math.min(1,   (1000 - currentSkill) * 0.0015);
  if (score >= 0.6)  return 0;
  if (score >= 0.4)  return -0.5;
  return -1;
}
