export const CEFR = [
  { label: 'A1', name: 'Beginner',          min: 0    },
  { label: 'A2', name: 'Elementary',         min: 1667 },
  { label: 'B1', name: 'Intermediate',       min: 3334 },
  { label: 'B2', name: 'Upper-intermediate', min: 5000 },
  { label: 'C1', name: 'Advanced',           min: 6667 },
  { label: 'C2', name: 'Proficient',         min: 8334 },
];

/** Current CEFR entry for a skill score */
export function cefrOf(score) {
  for (let i = CEFR.length - 1; i >= 0; i--) {
    if (score >= CEFR[i].min) return CEFR[i];
  }
  return CEFR[0];
}

/** Next CEFR entry, or null at C2 */
export function cefrNext(score) {
  const idx = CEFR.findIndex(c => c.label === cefrOf(score).label);
  return idx < CEFR.length - 1 ? CEFR[idx + 1] : null;
}

/** Integer points remaining until next level (null at C2) */
export function ptsToNext(score) {
  const next = cefrNext(score);
  return next ? Math.ceil(next.min - score) : null;
}

/**
 * Progress within the current level, normalised to 0–1000.
 * Used to fill the progress bar "as if each level is 1000 pts".
 */
export function levelProgress(score) {
  const current = cefrOf(score);
  const next = cefrNext(score);
  const width = next ? next.min - current.min : 167; // C2 assumed same width
  return Math.min(1000, Math.round(((score - current.min) / width) * 1000));
}
