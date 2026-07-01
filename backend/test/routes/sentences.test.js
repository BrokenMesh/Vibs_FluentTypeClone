import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/ai.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateSentenceBatch: vi.fn().mockResolvedValue([]),
    generateLearnerProfile: vi.fn().mockResolvedValue(''),
    generateWordOfDay: vi.fn().mockResolvedValue({ word: 'maison', translation: 'house' }),
  };
});

const { createApp } = await import('../../src/app.js');
const { today } = await import('../../src/routes/sentences.js');
const { sm2Update } = await import('../../src/services/sm2.js');
const {
  freshDb, authedUser, seedProfile, seedSentence, seedReview,
} = await import('../helpers/testDb.js');
const ai = await import('../../src/services/ai.js');

let db, app, user, auth, profile;

beforeEach(() => {
  vi.clearAllMocks();
  db = freshDb();
  app = createApp();
  user = authedUser(db, { email: 'owner@test.local' });
  auth = { Authorization: `Bearer ${user.token}` };
  profile = seedProfile(db, user.id, {
    dailyNewLimit: 10, dailyDueLimit: 30, dailyBatchSize: 10,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('today() 3am rollover', () => {
  it('rolls to the previous calendar day before 3am and the current day at/after 3am', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 2, 59, 59)); // June 15, 02:59:59 local
    const beforeRollover = today();
    vi.setSystemTime(new Date(2026, 5, 15, 3, 0, 1)); // June 15, 03:00:01 local
    const afterRollover = today();
    expect(beforeRollover).toBe('2026-06-14');
    expect(afterRollover).toBe('2026-06-15');
  });
});

describe('GET /sentences/next — queue priority', () => {
  it('returns the oldest unreviewed sentence when nothing is due', async () => {
    const older = seedSentence(db, profile.id, { batchDate: '2026-01-01', targetText: 'Older.' });
    seedSentence(db, profile.id, { batchDate: '2026-01-02', targetText: 'Newer.' });
    const res = await request(app).get(`/api/profiles/${profile.id}/sentences/next?track=typing`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.isReview).toBe(false);
    expect(res.body.sentence.id).toBe(older.id);
  });

  it('prefers a due review over a new sentence', async () => {
    const due = seedSentence(db, profile.id, { targetText: 'Due one.' });
    seedReview(db, {
      sentenceId: due.id, profileId: profile.id,
      overrides: { mode: 'challenge', nextReview: Math.floor(Date.now() / 1000) - 10, track: 'typing' },
    });
    seedSentence(db, profile.id, { targetText: 'Brand new.' });

    const res = await request(app).get(`/api/profiles/${profile.id}/sentences/next?track=typing`).set(auth);
    expect(res.body.isReview).toBe(true);
    expect(res.body.sentence.id).toBe(due.id);
  });

  it('skips due reviews once the daily due limit is hit, even if an eligible row exists', async () => {
    profile = { ...profile, ...db.prepare(
      'UPDATE language_profiles SET daily_due_limit = 1 WHERE id = ? RETURNING *'
    ).get(profile.id) };

    // sentenceA: due-completed-today (counts toward today's due usage)
    const completedToday = seedSentence(db, profile.id, { targetText: 'Completed today.' });
    seedReview(db, {
      sentenceId: completedToday.id, profileId: profile.id,
      overrides: { mode: 'challenge', reviewedAt: Math.floor(Date.now() / 1000) - 3 * 86400, nextReview: Math.floor(Date.now() / 1000) - 3 * 86400 + 1, track: 'typing' },
    });
    seedReview(db, {
      sentenceId: completedToday.id, profileId: profile.id,
      overrides: { mode: 'challenge', reviewedAt: Math.floor(Date.now() / 1000), nextReview: Math.floor(Date.now() / 1000) + 86400, track: 'typing' },
    });

    // sentenceB: still due right now, but the due limit is already spent
    const stillDue = seedSentence(db, profile.id, { targetText: 'Still due.' });
    seedReview(db, {
      sentenceId: stillDue.id, profileId: profile.id,
      overrides: { mode: 'challenge', reviewedAt: Math.floor(Date.now() / 1000) - 3 * 86400, nextReview: Math.floor(Date.now() / 1000) - 10, track: 'typing' },
    });

    const res = await request(app).get(`/api/profiles/${profile.id}/sentences/next?track=typing`).set(auth);
    // Due is skipped entirely once the limit is hit; nothing new exists either.
    expect(res.body.isReview).not.toBe(true);
    if (res.body.sentence) expect(res.body.sentence.id).not.toBe(stillDue.id);
  });

  it('skips new sentences once the daily new limit is hit', async () => {
    db.prepare('UPDATE language_profiles SET daily_new_limit = 1 WHERE id = ?').run(profile.id);

    const alreadyChallengedToday = seedSentence(db, profile.id, { targetText: 'Already challenged.' });
    seedReview(db, {
      sentenceId: alreadyChallengedToday.id, profileId: profile.id,
      overrides: { mode: 'challenge', track: 'typing', nextReview: Math.floor(Date.now() / 1000) + 6 * 86400 },
    });

    const stillNew = seedSentence(db, profile.id, { targetText: 'Still new.' });

    const res = await request(app).get(`/api/profiles/${profile.id}/sentences/next?track=typing`).set(auth);
    expect(res.body.isReview).not.toBe(true);
    if (res.body.sentence) expect(res.body.sentence.id).not.toBe(stillNew.id);
  });

  it('treats typing and dictation as independent "new" queues', async () => {
    const sentence = seedSentence(db, profile.id, { targetText: 'One sentence.' });
    seedReview(db, {
      sentenceId: sentence.id, profileId: profile.id,
      overrides: { mode: 'challenge', track: 'typing' },
    });

    const res = await request(app).get(`/api/profiles/${profile.id}/sentences/next?track=dictation`).set(auth);
    expect(res.body.isReview).toBe(false);
    expect(res.body.sentence.id).toBe(sentence.id);
  });

  it('regression: returns {done:true} instead of crashing when nothing is due/new and today\'s batch is incomplete', async () => {
    db.prepare('UPDATE language_profiles SET daily_new_limit = 1, daily_batch_size = 10 WHERE id = ?').run(profile.id);
    const challenged = seedSentence(db, profile.id, { targetText: 'Challenged.', batchDate: today() });
    seedReview(db, {
      sentenceId: challenged.id, profileId: profile.id,
      overrides: { mode: 'challenge', track: 'typing', nextReview: Math.floor(Date.now() / 1000) + 6 * 86400 },
    });
    // Only 1 sentence exists in today's batch, batch size is 10 — batch is NOT full,
    // new-limit (1) IS hit, and there's no due review. This used to throw a
    // ReferenceError (dailyWord undefined) and 500.
    const res = await request(app).get(`/api/profiles/${profile.id}/sentences/next?track=typing`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
    expect(res.body.nextBatchDate).toBeTruthy();
  });

  it('returns {done:true} when the queue is fully exhausted and the batch is full', async () => {
    db.prepare('UPDATE language_profiles SET daily_batch_size = 1 WHERE id = ?').run(profile.id);
    const only = seedSentence(db, profile.id, { batchDate: today() });
    seedReview(db, {
      sentenceId: only.id, profileId: profile.id,
      overrides: { mode: 'challenge', track: 'typing', nextReview: Math.floor(Date.now() / 1000) + 6 * 86400 },
    });
    const res = await request(app).get(`/api/profiles/${profile.id}/sentences/next?track=typing`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
  });
});

describe('POST /sentences/:id/review — SM-2 branching', () => {
  it('practice mode never advances SM-2 state or profile skill/xp', async () => {
    const sentence = seedSentence(db, profile.id);
    const before = db.prepare('SELECT skill_score, xp FROM language_profiles WHERE id = ?').get(profile.id);

    const res = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${sentence.id}/review`)
      .set(auth).send({ mode: 'practice', score: 0.1, wpm: 5 });

    expect(res.status).toBe(200);
    const review = db.prepare('SELECT * FROM sentence_reviews WHERE sentence_id = ?').get(sentence.id);
    expect(review.ease_factor).toBe(2.5);
    expect(review.interval_days).toBe(1);

    const after = db.prepare('SELECT skill_score, xp FROM language_profiles WHERE id = ?').get(profile.id);
    expect(after.skill_score).toBe(before.skill_score);
    expect(after.xp).toBe(before.xp);
  });

  it('a clean challenge matches a direct sm2Update() call with the same inputs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
    const sentence = seedSentence(db, profile.id);

    const res = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${sentence.id}/review`)
      .set(auth).send({ mode: 'challenge', score: 0.9, wpm: 40 });

    const expected = sm2Update({ easeFactor: 2.5, intervalDays: 1, score: 0.9, intervalModifier: 1.0 });
    expect(res.body.intervalDays).toBe(expected.intervalDays);
    expect(res.body.nextReview).toBe(expected.nextReview);
  });

  it('practicing within the last 1800s forces a 1-day reset and halves the XP/skill multiplier, even with a perfect score', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
    const now = Math.floor(Date.now() / 1000);
    const sentence = seedSentence(db, profile.id, { wordCount: 5 });
    seedReview(db, {
      sentenceId: sentence.id, profileId: profile.id,
      overrides: { mode: 'practice', track: 'typing', reviewedAt: now - 1800 },
    });

    const clean = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${sentence.id}/review`)
      .set(auth).send({ mode: 'challenge', score: 1.0, wpm: 40 });

    expect(clean.body.intervalDays).toBe(1);
    expect(clean.body.nextReview).toBe(now + 86400);

    const cleanXp = clean.body.xpGained;
    // Compare against an unpenalised challenge on a fresh sentence with identical inputs.
    const fresh = seedSentence(db, profile.id, { wordCount: 5 });
    const unpenalised = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${fresh.id}/review`)
      .set(auth).send({ mode: 'challenge', score: 1.0, wpm: 40 });

    expect(cleanXp).toBe(Math.round(unpenalised.body.xpGained * 0.5));
  });

  it('a practice exactly 1800s ago still counts as recent; 1801s ago does not', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
    const now = Math.floor(Date.now() / 1000);

    const s1 = seedSentence(db, profile.id);
    seedReview(db, { sentenceId: s1.id, profileId: profile.id, overrides: { mode: 'practice', track: 'typing', reviewedAt: now - 1800 } });
    const r1 = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${s1.id}/review`)
      .set(auth).send({ mode: 'challenge', score: 1.0, wpm: 40 });
    expect(r1.body.intervalDays).toBe(1); // penalised

    const s2 = seedSentence(db, profile.id);
    seedReview(db, { sentenceId: s2.id, profileId: profile.id, overrides: { mode: 'practice', track: 'typing', reviewedAt: now - 1801 } });
    const r2 = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${s2.id}/review`)
      .set(auth).send({ mode: 'challenge', score: 1.0, wpm: 40 });
    expect(r2.body.intervalDays).not.toBe(1); // graduates normally (6 days at default modifier)
  });

  it('dictation\'s 1.5x multiplier compounds multiplicatively with the practice penalty (0.75x total)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
    const now = Math.floor(Date.now() / 1000);

    const penalised = seedSentence(db, profile.id, { wordCount: 10 });
    seedReview(db, { sentenceId: penalised.id, profileId: profile.id, overrides: { mode: 'dictation-practice', track: 'dictation', reviewedAt: now - 100 } });
    const penalisedRes = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${penalised.id}/review`)
      .set(auth).send({ mode: 'dictation', score: 1.0, wpm: 0 });

    const clean = seedSentence(db, profile.id, { wordCount: 10 });
    const cleanRes = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${clean.id}/review`)
      .set(auth).send({ mode: 'dictation', score: 1.0, wpm: 0 });

    // clean dictation XP already includes the 1.5x mode multiplier;
    // penalised should be exactly half of that (0.5 * 1.5 = 0.75x of a plain challenge).
    expect(penalisedRes.body.xpGained).toBe(Math.round(cleanRes.body.xpGained * 0.5));
  });

  it('a recent practice in one track does not penalise a challenge in the other track', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
    const now = Math.floor(Date.now() / 1000);
    const sentence = seedSentence(db, profile.id);
    seedReview(db, { sentenceId: sentence.id, profileId: profile.id, overrides: { mode: 'dictation-practice', track: 'dictation', reviewedAt: now - 100 } });

    const res = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${sentence.id}/review`)
      .set(auth).send({ mode: 'challenge', score: 1.0, wpm: 40 });
    expect(res.body.intervalDays).not.toBe(1); // typing track unaffected by the dictation-track practice
  });

  it('regression: clamps out-of-range score and wpm instead of granting unbounded XP', async () => {
    const sentence = seedSentence(db, profile.id, { wordCount: 10 });
    const res = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${sentence.id}/review`)
      .set(auth).send({ mode: 'challenge', score: 5, wpm: 99999 });

    expect(res.status).toBe(200);
    const review = db.prepare('SELECT * FROM sentence_reviews WHERE sentence_id = ?').get(sentence.id);
    expect(review.score).toBe(1);
    expect(review.wpm).toBe(400);
    // xpGained should be bounded by a score of 1, not 5
    expect(res.body.xpGained).toBeLessThanOrEqual(10 * 10 * 1.5 + 1);

    const negative = seedSentence(db, profile.id);
    const res2 = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${negative.id}/review`)
      .set(auth).send({ mode: 'challenge', score: -3, wpm: -50 });
    const review2 = db.prepare('SELECT * FROM sentence_reviews WHERE sentence_id = ?').get(negative.id);
    expect(review2.score).toBe(0);
    expect(review2.wpm).toBe(0);
  });

  it('rejects missing mode/score/wpm with 400', async () => {
    const sentence = seedSentence(db, profile.id);
    const res = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${sentence.id}/review`)
      .set(auth).send({ mode: 'challenge' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a sentence belonging to another profile', async () => {
    const other = authedUser(db, { email: 'stranger@test.local' });
    const otherProfile = seedProfile(db, other.id);
    const sentence = seedSentence(db, otherProfile.id);
    const res = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${sentence.id}/review`)
      .set(auth).send({ mode: 'challenge', score: 1, wpm: 1 });
    expect(res.status).toBe(404);
  });
});

describe('POST /sentences/:id/delay', () => {
  it('preserves the existing ease/interval and pushes next_review to +24h, excluded from new/due counts', async () => {
    const sentence = seedSentence(db, profile.id);
    seedReview(db, { sentenceId: sentence.id, profileId: profile.id, overrides: { mode: 'challenge', easeFactor: 2.7, intervalDays: 12, track: 'typing' } });

    const before = Math.floor(Date.now() / 1000);
    const res = await request(app)
      .post(`/api/profiles/${profile.id}/sentences/${sentence.id}/delay`)
      .set(auth).send({ track: 'typing' });
    expect(res.status).toBe(200);

    const delayRow = db.prepare("SELECT * FROM sentence_reviews WHERE sentence_id = ? AND mode = 'delay'").get(sentence.id);
    expect(delayRow.ease_factor).toBe(2.7);
    expect(delayRow.interval_days).toBe(12);
    expect(delayRow.next_review).toBeGreaterThanOrEqual(before + 86400);

    const activity = await request(app).get(`/api/profiles/${profile.id}/sentences/activity`).set(auth);
    const todayKey = Object.keys(activity.body)[0];
    // Only the original 'challenge' review counts; the delay must not inflate activity.
    expect(activity.body[todayKey]).toBe(1);
  });
});

describe('GET /sentences/activity', () => {
  it('excludes delay-mode reviews and reviews older than 112 days', async () => {
    const sentence = seedSentence(db, profile.id);
    const now = Math.floor(Date.now() / 1000);
    seedReview(db, { sentenceId: sentence.id, profileId: profile.id, overrides: { mode: 'challenge', reviewedAt: now } });
    seedReview(db, { sentenceId: sentence.id, profileId: profile.id, overrides: { mode: 'delay', reviewedAt: now } });
    seedReview(db, { sentenceId: sentence.id, profileId: profile.id, overrides: { mode: 'challenge', reviewedAt: now - 200 * 86400 } });

    const res = await request(app).get(`/api/profiles/${profile.id}/sentences/activity`).set(auth);
    const total = Object.values(res.body).reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
  });
});

describe('GET /sentences/queue', () => {
  it('computes directRate as the fraction of challenge attempts with no prior practice', async () => {
    const now = Math.floor(Date.now() / 1000);
    const direct = seedSentence(db, profile.id);
    seedReview(db, { sentenceId: direct.id, profileId: profile.id, overrides: { mode: 'challenge', track: 'typing', reviewedAt: now } });

    const practicedThenChallenged = seedSentence(db, profile.id);
    seedReview(db, { sentenceId: practicedThenChallenged.id, profileId: profile.id, overrides: { mode: 'practice', track: 'typing', reviewedAt: now - 500 } });
    seedReview(db, { sentenceId: practicedThenChallenged.id, profileId: profile.id, overrides: { mode: 'challenge', track: 'typing', reviewedAt: now } });

    const res = await request(app).get(`/api/profiles/${profile.id}/sentences/queue`).set(auth);
    expect(res.body.directRate).toBeCloseTo(0.5, 5);
  });

  it('directRate is null when there are no challenge attempts yet', async () => {
    const res = await request(app).get(`/api/profiles/${profile.id}/sentences/queue`).set(auth);
    expect(res.body.directRate).toBeNull();
  });
});

describe('GET /sentences (list)', () => {
  it('filters to orphaned sentences (no matching vocabulary word)', async () => {
    const withWord = seedSentence(db, profile.id, { targetText: 'Le chien court vite.' });
    const orphan = seedSentence(db, profile.id, { targetText: 'La voiture roule.' });
    db.prepare("INSERT INTO vocabulary (profile_id, word, translation, source) VALUES (?, 'chien', 'dog', 'manual')").run(profile.id);

    const res = await request(app).get(`/api/profiles/${profile.id}/sentences?orphaned=true`).set(auth);
    const ids = res.body.map((s) => s.id);
    expect(ids).toContain(orphan.id);
    expect(ids).not.toContain(withWord.id);
  });

  it('filters by contains substring match', async () => {
    seedSentence(db, profile.id, { targetText: 'Bonjour le monde.' });
    const other = seedSentence(db, profile.id, { targetText: 'Au revoir.' });
    const res = await request(app).get(`/api/profiles/${profile.id}/sentences?contains=revoir`).set(auth);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(other.id);
  });

  it('caps results at 200 rows', async () => {
    for (let i = 0; i < 210; i++) {
      seedSentence(db, profile.id, { targetText: `Sentence number ${i}.` });
    }
    const res = await request(app).get(`/api/profiles/${profile.id}/sentences`).set(auth);
    expect(res.body.length).toBe(200);
  });
});

describe('GET /sentences/ensuredayword', () => {
  it('is idempotent — a second call does not create a duplicate daily word or vocabulary entry', async () => {
    ai.generateSentenceBatch.mockResolvedValue([
      { sourceText: 'A sentence.', targetText: 'Une phrase.', words: ['phrase'] },
    ]);
    const first = await request(app).get(`/api/profiles/${profile.id}/sentences/ensuredayword`).set(auth);
    expect(first.status).toBe(200);
    const second = await request(app).get(`/api/profiles/${profile.id}/sentences/ensuredayword`).set(auth);
    expect(second.status).toBe(200);

    const dailyWords = db.prepare('SELECT * FROM daily_words WHERE profile_id = ?').all(profile.id);
    expect(dailyWords.length).toBe(1);
    const vocabMatches = db.prepare("SELECT * FROM vocabulary WHERE profile_id = ? AND word = 'maison'").all(profile.id);
    expect(vocabMatches.length).toBe(1);
  });

  it('when the AI fails 3 times, ensureDailyWord gives up (returns null) but batch generation still proceeds unanchored', async () => {
    ai.generateWordOfDay.mockRejectedValue(new Error('AI down'));
    ai.generateSentenceBatch.mockResolvedValue([
      { sourceText: 'A sentence.', targetText: 'Une phrase.', words: ['phrase'] },
    ]);

    const res = await request(app).get(`/api/profiles/${profile.id}/sentences/ensuredayword`).set(auth);
    expect(res.status).toBe(200);
    expect(ai.generateWordOfDay).toHaveBeenCalledTimes(3);
    const dailyWords = db.prepare('SELECT * FROM daily_words WHERE profile_id = ?').all(profile.id);
    expect(dailyWords.length).toBe(0);
    const sentences = db.prepare('SELECT * FROM sentences WHERE profile_id = ?').all(profile.id);
    expect(sentences.length).toBeGreaterThan(0);
  });

  it('retries when the AI returns an already-known word, and keeps the fresh one', async () => {
    db.prepare("INSERT INTO vocabulary (profile_id, word, translation, source) VALUES (?, 'maison', 'house', 'manual')").run(profile.id);
    ai.generateWordOfDay
      .mockResolvedValueOnce({ word: 'maison', translation: 'house' }) // known, should be retried
      .mockResolvedValueOnce({ word: 'jardin', translation: 'garden' });

    const res = await request(app).get(`/api/profiles/${profile.id}/sentences/ensuredayword`).set(auth);
    expect(res.status).toBe(200);
    expect(ai.generateWordOfDay).toHaveBeenCalledTimes(2);
    const dailyWord = db.prepare('SELECT * FROM daily_words WHERE profile_id = ?').get(profile.id);
    expect(dailyWord.word).toBe('jardin');
  });
});
