import { describe, it, expect } from 'vitest';
import { initDb } from '../../src/db/schema.js';

// Regression test: `batch_date` was only ever added via a migration ALTER TABLE
// that skips a genuinely fresh database (PRAGMA table_info returns an empty
// array before the table exists, so the migration's guard never fires and
// CREATE TABLE IF NOT EXISTS didn't declare the column either). This broke
// every brand-new install/environment. Assert every column the app queries
// against actually exists right after a fresh initDb() call, for every table
// that has both a CREATE TABLE definition and a migration ALTER path.
describe('initDb on a fresh database', () => {
  it('creates the sentences table with a batch_date column', () => {
    const db = initDb(':memory:');
    const cols = db.prepare('PRAGMA table_info(sentences)').all().map((c) => c.name);
    expect(cols).toContain('batch_date');
  });

  it('creates the sentence_reviews table with a track column', () => {
    const db = initDb(':memory:');
    const cols = db.prepare('PRAGMA table_info(sentence_reviews)').all().map((c) => c.name);
    expect(cols).toContain('track');
  });

  it('creates the language_profiles table with the daily-limit and srs_strength columns', () => {
    const db = initDb(':memory:');
    const cols = db.prepare('PRAGMA table_info(language_profiles)').all().map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining([
      'daily_new_limit', 'daily_due_limit', 'daily_batch_size', 'srs_strength',
    ]));
  });
});
