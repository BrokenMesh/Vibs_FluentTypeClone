/** Count character-position mismatches between what was typed and the target. */
export function charMistakes(typed, target) {
  return [...target].filter((c, i) => typed[i] !== c).length;
}

/** Challenge-mode score: 0 mistakes = 1.0, 10+ mistakes = 0.0. */
export function challengeScore(typed, target) {
  return Math.max(0, 1 - charMistakes(typed, target) / 10);
}

/** Case-insensitive word match; only the typed side is trimmed. */
export function wordMatches(typed, word) {
  return typed.trim().toLowerCase() === word.toLowerCase();
}

/** Practice-mode score from a list of per-word correct/incorrect booleans. */
export function practiceScore(wordResults) {
  const mistakes = wordResults.filter((r) => !r).length;
  return Math.max(0, 1 - mistakes / 10);
}

/** Words-per-minute from typed text and elapsed milliseconds; 0 if elapsed <= 0. */
export function computeWpm(typedText, elapsedMs) {
  if (elapsedMs <= 0) return 0;
  const elapsedMinutes = elapsedMs / 1000 / 60;
  return Math.round(typedText.split(/\s+/).length / elapsedMinutes);
}

/** Session streak: increments on score >= threshold, resets to 0 otherwise. */
export function updateStreak(currentStreak, score, threshold = 0.8) {
  return score >= threshold ? currentStreak + 1 : 0;
}
