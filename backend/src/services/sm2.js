/**
 * SM-2 spaced repetition algorithm adapted for sentences and vocabulary.
 * score: 0.0 – 1.0 (proportion correct / accuracy)
 */

/**
 * intervalModifier: user-controlled strength multiplier (default 1.0).
 *   < 1.0 → shorter intervals (review more often)
 *   > 1.0 → longer intervals (review less often)
 *
 * SM-2 progression on success:
 *   First success  (intervalDays <= 1) → 6 days  × modifier
 *   Subsequent                         → prev × easeFactor × modifier
 * On failure (q < 3): always reset to 1 day.
 */
export function sm2Update({ easeFactor = 2.5, intervalDays = 1, score, intervalModifier = 1.0 }) {
  // Map score 0–1 to SM-2 quality 0–5
  const q = Math.round(score * 5);

  let newEaseFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (newEaseFactor < 1.3) newEaseFactor = 1.3;

  let newInterval;
  if (q < 3) {
    // Failed — reset regardless of modifier
    newInterval = 1;
  } else if (intervalDays <= 1) {
    // First success: graduate to 6-day interval, scaled by modifier
    newInterval = Math.max(2, Math.round(6 * intervalModifier));
  } else {
    // Subsequent successes: grow by ease factor × modifier
    newInterval = Math.max(intervalDays + 1, Math.round(intervalDays * newEaseFactor * intervalModifier));
  }

  // Cap at 365 days
  if (newInterval > 365) newInterval = 365;

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
  // Skill score 0–10,000. Each CEFR level is ~1,667 pts wide.
  // Max +2 per perfect session → ~834 sessions to advance one level.
  if (score >= 0.95) return Math.min(2,   (10000 - currentSkill) * 0.0003);
  if (score >= 0.8)  return Math.min(1,   (10000 - currentSkill) * 0.00015);
  if (score >= 0.6)  return 0;
  if (score >= 0.4)  return -0.5;
  return -1;
}
