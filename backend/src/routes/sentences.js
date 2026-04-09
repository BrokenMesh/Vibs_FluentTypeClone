import { Router } from 'express';
import { getDb, rowid } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { generateSentenceBatch, generateWordOfDay } from '../services/ai.js';
import { sm2Update, skillDelta } from '../services/sm2.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const DAILY_BATCH_SIZE = 10;

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getProfile(profileId, userId) {
  return getDb().prepare(
    'SELECT * FROM language_profiles WHERE id = ? AND user_id = ?'
  ).get(profileId, userId);
}

/** Derive track from mode string */
function trackForMode(mode) {
  return (mode === 'dictation' || mode === 'dictation-practice') ? 'dictation' : 'typing';
}

/**
 * Ensure the daily word exists for today. Creates it if missing.
 * Returns { word, translation }.
 */
async function ensureDailyWord(db, profile) {
  const date = today();
  const existing = db.prepare(
    'SELECT * FROM daily_words WHERE profile_id = ? AND date = ?'
  ).get(profile.id, date);
  if (existing) return existing;

  const allWords = db.prepare(
    'SELECT word FROM vocabulary WHERE profile_id = ?'
  ).all(profile.id).map(r => r.word);

  let wordData;
  try {
    wordData = await generateWordOfDay({
      targetLanguage: profile.target_language,
      nativeLanguage: profile.native_language,
      skillScore: profile.skill_score,
      existingWords: allWords,
    });
  } catch (e) {
    console.error('generateWordOfDay failed:', e.message);
    wordData = null;
  }

  if (!wordData) return null;

  db.prepare(
    'INSERT INTO daily_words (profile_id, word, translation, date) VALUES (?, ?, ?, ?)'
  ).run(profile.id, wordData.word.toLowerCase().trim(), wordData.translation, date);

  // Also add to vocabulary
  const wordExists = db.prepare(
    'SELECT id FROM vocabulary WHERE profile_id = ? AND word = ?'
  ).get(profile.id, wordData.word.toLowerCase().trim());
  if (!wordExists) {
    db.prepare(
      "INSERT INTO vocabulary (profile_id, word, translation, source) VALUES (?, ?, ?, 'ai')"
    ).run(profile.id, wordData.word.toLowerCase().trim(), wordData.translation);
  }

  const newDailyWord = db.prepare('SELECT * FROM daily_words WHERE profile_id = ? AND date = ?').get(profile.id, date);
  return newDailyWord;
}

/**
 * Generate a batch of sentences and persist them all.
 * Uses one AI call for the whole batch — avoids duplicates and ensures diversity.
 * Returns array of saved sentence rows.
 */
async function generateAndSaveBatch(db, profile, anchorWord, batchDate, count = DAILY_BATCH_SIZE) {
  const knownWords = db.prepare(
    'SELECT word FROM vocabulary WHERE profile_id = ? ORDER BY times_seen DESC LIMIT 60'
  ).all(profile.id).map(r => r.word);

  const existingTexts = db.prepare(
    'SELECT target_text FROM sentences WHERE profile_id = ? ORDER BY created_at DESC LIMIT 60'
  ).all(profile.id).map(r => r.target_text);

  const generated = await generateSentenceBatch({
    targetLanguage: profile.target_language,
    nativeLanguage: profile.native_language,
    skillScore: profile.skill_score,
    knownWords,
    anchorWord: anchorWord?.word ?? null,
    count,
    existingSentences: existingTexts,
  });

  const insertSentence = db.prepare(
    'INSERT INTO sentences (profile_id, source_text, target_text, difficulty, word_count, batch_date) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const updateSeen = db.prepare(
    'UPDATE vocabulary SET times_seen = times_seen + 1 WHERE profile_id = ? AND word = ?'
  );

  const saved = [];
  for (const gen of generated) {
    const wordCount = gen.targetText.split(/\s+/).length;
    const result = insertSentence.run(profile.id, gen.sourceText, gen.targetText, profile.skill_score, wordCount, batchDate);
    for (const w of gen.words) updateSeen.run(profile.id, w.toLowerCase().trim());
    saved.push(db.prepare('SELECT * FROM sentences WHERE id = ?').get(Number(result.lastInsertRowid)));
  }

  return saved;
}

/**
 * Generate and persist one sentence (used when adding a manual vocabulary word).
 * Kept for backward compatibility with vocabulary route.
 */
export async function generateAndSave(db, profile, anchorWord, existingTexts, batchDate) {
  const results = await generateAndSaveBatch(db, profile, anchorWord, batchDate, 1);
  return results[0] ?? null;
}

/**
 * GET /profiles/:profileId/sentences/next?track=typing|dictation
 *
 * Queue priority per track:
 *   1. Due reviews in this track (next_review <= now)
 *   2. Sentences never reviewed in this track (new)
 *   3. If batch incomplete → generate more (up to DAILY_BATCH_SIZE)
 *   4. Nothing left → return { done: true }
 */
router.get('/next', async (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const date = today();
  const track = req.query.track === 'dictation' ? 'dictation' : 'typing';

  // 1. Due reviews for this track — most overdue first
  const due = db.prepare(`
    SELECT s.*,
      sr.ease_factor as sr_ease, sr.interval_days as sr_interval, sr.next_review as sr_next_review
    FROM sentences s
    JOIN (
      SELECT sentence_id, ease_factor, interval_days, next_review
      FROM sentence_reviews
      WHERE profile_id = ? AND track = ?
      GROUP BY sentence_id
      HAVING MAX(reviewed_at)
    ) sr ON sr.sentence_id = s.id
    WHERE s.profile_id = ? AND sr.next_review <= ?
    ORDER BY sr.next_review ASC
    LIMIT 1
  `).get(profile.id, track, profile.id, now);

  if (due) {
    const dailyWord = db.prepare('SELECT * FROM daily_words WHERE profile_id = ? AND date = ?').get(profile.id, date);
    return res.json({ sentence: due, isReview: true, dailyWord, track });
  }

  // 2. Any sentence never reviewed in this track (carry over from any batch date)
  const newAny = db.prepare(`
    SELECT s.* FROM sentences s
    WHERE s.profile_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM sentence_reviews sr
        WHERE sr.sentence_id = s.id AND sr.profile_id = ? AND sr.track = ?
      )
    ORDER BY s.batch_date DESC, s.id ASC
    LIMIT 1
  `).get(profile.id, profile.id, track);

  if (newAny) {
    const dailyWord = db.prepare('SELECT * FROM daily_words WHERE profile_id = ? AND date = ?').get(profile.id, date);
    return res.json({ sentence: newAny, isReview: false, dailyWord, track });
  }

  // 3. No unreviewed left — generate today's batch if incomplete
  const todayCount = db.prepare(
    'SELECT COUNT(*) as n FROM sentences WHERE profile_id = ? AND batch_date = ?'
  ).get(profile.id, date).n;

  if (todayCount >= DAILY_BATCH_SIZE) {
    return res.json({ done: true, nextBatchDate: date });
  }

  // Generate today's full batch in one AI call
  const dailyWord = await ensureDailyWord(db, profile);
  const toGenerate = DAILY_BATCH_SIZE - todayCount;
  console.log(`Generating batch of ${toGenerate} sentences for profile ${profile.id} (batch ${date})`);

  let saved;
  try {
    saved = await generateAndSaveBatch(db, profile, dailyWord, date, toGenerate);
  } catch (e) {
    console.error('Batch sentence generation failed:', e.message);
    return res.status(502).json({ error: 'Failed to generate sentences. Please try again.' });
  }

  if (saved.length === 0) {
    return res.status(502).json({ error: 'Failed to generate sentences. Please try again.' });
  }

  const firstNew = saved.reduce((a, b) => (a.id < b.id ? a : b));
  return res.json({ sentence: firstNew, isReview: false, dailyWord, track });
});

/**
 * GET /profiles/:profileId/sentences/activity
 * Returns a map of { "YYYY-MM-DD": count } for reviews over the past 112 days.
 */
router.get('/activity', (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const db = getDb();
  const rows = db.prepare(`
    SELECT DATE(reviewed_at, 'unixepoch') as date, COUNT(*) as count
    FROM sentence_reviews
    WHERE profile_id = ? AND mode NOT IN ('delay')
      AND reviewed_at >= unixepoch('now', '-112 days')
    GROUP BY date
    ORDER BY date ASC
  `).all(profile.id);

  const activity = {};
  for (const row of rows) activity[row.date] = row.count;
  res.json(activity);
});

/**
 * GET /profiles/:profileId/sentences/queue
 * Returns per-track due/new counts plus daily word.
 */
router.get('/queue', async (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const date = today();

  const dailyWord = await ensureDailyWord(db, profile);

  function dueForTrack(track) {
    return db.prepare(`
      SELECT COUNT(*) as n FROM sentences s
      JOIN (
        SELECT sentence_id, MAX(reviewed_at) as last_rev, next_review
        FROM sentence_reviews WHERE profile_id = ? AND track = ?
        GROUP BY sentence_id
      ) sr ON sr.sentence_id = s.id
      WHERE s.profile_id = ? AND sr.next_review <= ?
    `).get(profile.id, track, profile.id, now).n;
  }

  function newForTrack(track) {
    return db.prepare(`
      SELECT COUNT(*) as n FROM sentences s
      WHERE s.profile_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM sentence_reviews sr
          WHERE sr.sentence_id = s.id AND sr.profile_id = ? AND sr.track = ?
        )
    `).get(profile.id, profile.id, track).n;
  }

  const totalToday = db.prepare(
    'SELECT COUNT(*) as n FROM sentences WHERE profile_id = ? AND batch_date = ?'
  ).get(profile.id, date).n;

  // Direct rate: fraction of challenge-attempted sentences with no prior practice in the same track
  const rateRow = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN prior = 0 THEN 1 ELSE 0 END) as direct
    FROM (
      SELECT fc.sentence_id, fc.track,
        (SELECT COUNT(*) FROM sentence_reviews p
         WHERE p.sentence_id = fc.sentence_id
           AND p.profile_id = ?
           AND p.track = fc.track
           AND p.mode IN ('practice', 'dictation-practice')
           AND p.reviewed_at < fc.first_at) as prior
      FROM (
        SELECT sentence_id, track, MIN(reviewed_at) as first_at
        FROM sentence_reviews
        WHERE profile_id = ? AND mode IN ('challenge', 'dictation')
        GROUP BY sentence_id, track
      ) fc
    )
  `).get(profile.id, profile.id);
  const directRate = rateRow.total > 0 ? rateRow.direct / rateRow.total : null;

  res.json({
    typing:    { due: dueForTrack('typing'),    new: newForTrack('typing')    },
    dictation: { due: dueForTrack('dictation'), new: newForTrack('dictation') },
    totalToday,
    dailyBatchSize: DAILY_BATCH_SIZE,
    dailyWord,
    directRate,
  });
});

/**
 * GET /profiles/:profileId/sentences
 * List past sentences with their latest review (either track).
 */
router.get('/', (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const db = getDb();
  const containsFilter = req.query.contains
    ? `AND (s.target_text LIKE ? OR s.source_text LIKE ?)`
    : '';
  const likeParam = req.query.contains ? `%${req.query.contains}%` : null;
  const params = likeParam ? [profile.id, likeParam, likeParam] : [profile.id];

  const sentences = db.prepare(`
    SELECT s.*,
      sr.score as last_score, sr.wpm as last_wpm, sr.reviewed_at as last_reviewed, sr.mode as last_mode,
      sr.next_review as next_review
    FROM sentences s
    LEFT JOIN sentence_reviews sr ON sr.id = (
      SELECT id FROM sentence_reviews WHERE sentence_id = s.id ORDER BY reviewed_at DESC LIMIT 1
    )
    WHERE s.profile_id = ? ${containsFilter}
    ORDER BY s.created_at DESC
    LIMIT 100
  `).all(...params);
  res.json(sentences);
});

/**
 * POST /profiles/:profileId/sentences/:sentenceId/review
 * Submit a completed attempt. Track is derived from mode.
 */
router.post('/:sentenceId/review', (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const db = getDb();
  const sentence = db.prepare(
    'SELECT * FROM sentences WHERE id = ? AND profile_id = ?'
  ).get(req.params.sentenceId, profile.id);
  if (!sentence) return res.status(404).json({ error: 'Sentence not found' });

  const { mode, score, wpm } = req.body;
  if (!mode || score === undefined || wpm === undefined) {
    return res.status(400).json({ error: 'mode, score, wpm are required' });
  }

  const track = trackForMode(mode);

  // Get track-specific SM-2 state from most recent review in this track
  const existingReview = db.prepare(
    'SELECT * FROM sentence_reviews WHERE sentence_id = ? AND profile_id = ? AND track = ? ORDER BY reviewed_at DESC LIMIT 1'
  ).get(sentence.id, profile.id, track);

  let easeFactor, intervalDays, nextReview;

  if (mode === 'practice' || mode === 'dictation-practice') {
    // Practice never advances the SM-2 schedule for this track
    easeFactor = existingReview?.ease_factor ?? 2.5;
    intervalDays = existingReview?.interval_days ?? 1;
    nextReview = existingReview?.next_review ?? Math.floor(Date.now() / 1000);
  } else {
    // challenge or dictation — advance SM-2
    ({ easeFactor, intervalDays, nextReview } = sm2Update({
      easeFactor: existingReview?.ease_factor ?? 2.5,
      intervalDays: existingReview?.interval_days ?? 1,
      score,
    }));
  }

  db.prepare(`
    INSERT INTO sentence_reviews (sentence_id, profile_id, mode, score, wpm, ease_factor, interval_days, next_review, track)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sentence.id, profile.id, mode, score, wpm, easeFactor, intervalDays, nextReview, track);

  let newSkillScore = profile.skill_score;
  let xpGained = 0;
  if (mode === 'challenge' || mode === 'dictation') {
    // Halve points if the user used practice mode in this track before challenging
    const practiceMode = mode === 'dictation' ? 'dictation-practice' : 'practice';
    const practicedFirst = existingReview?.mode === practiceMode;
    const modeMultiplier = mode === 'dictation' ? 1.5 : 1;
    const multiplier = (practicedFirst ? 0.5 : 1) * modeMultiplier;
    const delta = skillDelta(score, profile.skill_score) * multiplier;
    newSkillScore = Math.max(0, Math.min(10000, profile.skill_score + delta));
    xpGained = Math.round(score * sentence.word_count * 10 * multiplier);
    db.prepare(
      'UPDATE language_profiles SET skill_score = ?, xp = xp + ? WHERE id = ?'
    ).run(newSkillScore, xpGained, profile.id);
  }

  const daysUntilReview = Math.round(intervalDays);
  res.json({ ok: true, nextReview, intervalDays, daysUntilReview, xpGained, newSkillScore });
});

/**
 * POST /profiles/:profileId/sentences/:sentenceId/delay
 * Push this sentence's track to tomorrow without affecting SM-2 ease/interval.
 * Body: { track: 'typing' | 'dictation' }
 */
router.post('/:sentenceId/delay', (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const db = getDb();
  const sentence = db.prepare(
    'SELECT * FROM sentences WHERE id = ? AND profile_id = ?'
  ).get(req.params.sentenceId, profile.id);
  if (!sentence) return res.status(404).json({ error: 'Sentence not found' });

  const track = req.body?.track === 'dictation' ? 'dictation' : 'typing';
  const tomorrow = Math.floor(Date.now() / 1000) + 86400;
  const existing = db.prepare(
    'SELECT * FROM sentence_reviews WHERE sentence_id = ? AND profile_id = ? AND track = ? ORDER BY reviewed_at DESC LIMIT 1'
  ).get(sentence.id, profile.id, track);

  db.prepare(`
    INSERT INTO sentence_reviews (sentence_id, profile_id, mode, score, wpm, ease_factor, interval_days, next_review, track)
    VALUES (?, ?, 'delay', 0, 0, ?, ?, ?, ?)
  `).run(sentence.id, profile.id,
    existing?.ease_factor ?? 2.5,
    existing?.interval_days ?? 1,
    tomorrow,
    track
  );

  res.json({ ok: true });
});

/**
 * DELETE /profiles/:profileId/sentences/:sentenceId/reviews
 * Reset all SM-2 data for a sentence (both tracks).
 */
router.delete('/:sentenceId/reviews', (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const db = getDb();
  db.prepare(
    'DELETE FROM sentence_reviews WHERE sentence_id = ? AND profile_id = ?'
  ).run(req.params.sentenceId, profile.id);

  res.json({ ok: true });
});

export default router;
