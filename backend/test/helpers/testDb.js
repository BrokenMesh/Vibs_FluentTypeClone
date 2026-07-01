import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { initDb, rowid } from '../../src/db/schema.js';

export function freshDb() {
  return initDb(':memory:');
}

export function whitelistEmail(db, email) {
  db.prepare('INSERT OR IGNORE INTO email_whitelist (email, added_by) VALUES (?, ?)')
    .run(email.toLowerCase().trim(), 'test');
}

let userCounter = 0;

export function seedUser(db, overrides = {}) {
  userCounter += 1;
  const {
    email = `user${userCounter}@test.local`,
    username = `testuser${userCounter}`,
    password = 'password123',
  } = overrides;
  const hash = bcrypt.hashSync(password, 4);
  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  ).run(username, email, hash);
  return { id: rowid(result), email, username, password };
}

export function accessTokenFor(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

export function authedUser(db, overrides = {}) {
  const user = seedUser(db, overrides);
  return { ...user, token: accessTokenFor(user.id) };
}

export function seedProfile(db, userId, overrides = {}) {
  const {
    targetLanguage = 'French',
    nativeLanguage = 'English',
    skillScore = 0,
    dailyNewLimit = 10,
    dailyDueLimit = 30,
    dailyBatchSize = 10,
    srsStrength = 1.0,
  } = overrides;
  const result = db.prepare(
    `INSERT INTO language_profiles
      (user_id, target_language, native_language, skill_score, daily_new_limit, daily_due_limit, daily_batch_size, srs_strength)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, targetLanguage, nativeLanguage, skillScore, dailyNewLimit, dailyDueLimit, dailyBatchSize, srsStrength);
  return db.prepare('SELECT * FROM language_profiles WHERE id = ?').get(rowid(result));
}

export function seedSentence(db, profileId, overrides = {}) {
  const {
    sourceText = 'The cat sleeps.',
    targetText = 'Le chat dort.',
    difficulty = 0,
    wordCount = 3,
    batchDate = '2026-01-01',
  } = overrides;
  const result = db.prepare(
    `INSERT INTO sentences (profile_id, source_text, target_text, difficulty, word_count, batch_date)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(profileId, sourceText, targetText, difficulty, wordCount, batchDate);
  return db.prepare('SELECT * FROM sentences WHERE id = ?').get(rowid(result));
}

export function seedReview(db, { sentenceId, profileId, overrides = {} }) {
  const {
    mode = 'challenge',
    score = 1,
    wpm = 30,
    easeFactor = 2.5,
    intervalDays = 1,
    nextReview = Math.floor(Date.now() / 1000),
    track = 'typing',
    reviewedAt = Math.floor(Date.now() / 1000),
  } = overrides;
  const result = db.prepare(
    `INSERT INTO sentence_reviews
      (sentence_id, profile_id, mode, score, wpm, ease_factor, interval_days, next_review, track, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sentenceId, profileId, mode, score, wpm, easeFactor, intervalDays, nextReview, track, reviewedAt);
  return db.prepare('SELECT * FROM sentence_reviews WHERE id = ?').get(rowid(result));
}
