import { Router } from 'express';
import { getDb, rowid } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { generateSentence, generateWordOfDay } from '../services/ai.js';
import { sm2Update, skillDelta } from '../services/sm2.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const DAILY_BATCH_SIZE = 10;

export function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getProfile(profileId, userId) {
  return getDb().prepare(
    'SELECT * FROM language_profiles WHERE id = ? AND user_id = ?'
  ).get(profileId, userId);
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

  // Generate sentences for the new word immediately (background, non-blocking)
  const existingTexts = db.prepare(
    'SELECT target_text FROM sentences WHERE profile_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(profile.id).map(r => r.target_text);
  Promise.allSettled(
    Array.from({ length: DAILY_BATCH_SIZE }, () => generateAndSave(db, profile, newDailyWord, existingTexts, date))
  ).then(results => {
    const ok = results.filter(r => r.status === 'fulfilled' && r.value).length;
    console.log(`Generated ${ok}/${DAILY_BATCH_SIZE} sentences for word of day "${newDailyWord.word}"`);
  }).catch(e => console.error('WotD sentence gen failed:', e));

  return newDailyWord;
}

/**
 * Generate and persist one sentence, retrying up to maxAttempts times to avoid duplicates.
 * existingTexts is a shared array — append to it so parallel siblings see each other's results.
 */
export async function generateAndSave(db, profile, dailyWord, existingTexts, batchDate) {
  const knownWords = db.prepare(
    'SELECT word FROM vocabulary WHERE profile_id = ? ORDER BY times_seen DESC LIMIT 50'
  ).all(profile.id).map(r => r.word);

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let generated;
    try {
      // Snapshot existingTexts at call time so each retry has fresh dedup list
      generated = await generateSentence({
        targetLanguage: profile.target_language,
        nativeLanguage: profile.native_language,
        skillScore: profile.skill_score,
        knownWords,
        anchorWord: dailyWord?.word ?? null,
        existingSentences: [...existingTexts],
      });
    } catch (e) {
      if (e.message === 'DUPLICATE') {
        console.warn(`Duplicate sentence on attempt ${attempt + 1}, retrying…`);
        continue;
      }
      throw e;
    }

    // Check again against existingTexts (another parallel call may have added it)
    const normalised = generated.targetText.trim().toLowerCase();
    if (existingTexts.some(s => s.trim().toLowerCase() === normalised)) {
      console.warn('Race-condition duplicate, retrying…');
      continue;
    }

    existingTexts.push(generated.targetText); // claim this slot before writing to DB

    const wordCount = generated.targetText.split(/\s+/).length;
    const result = db.prepare(
      'INSERT INTO sentences (profile_id, source_text, target_text, difficulty, word_count, batch_date) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(profile.id, generated.sourceText, generated.targetText, profile.skill_score, wordCount, batchDate);
    const sentenceId = rowid(result);

    const updateSeen = db.prepare(
      'UPDATE vocabulary SET times_seen = times_seen + 1 WHERE profile_id = ? AND word = ?'
    );
    for (const w of generated.words) {
      updateSeen.run(profile.id, w.toLowerCase().trim());
    }

    return db.prepare('SELECT * FROM sentences WHERE id = ?').get(sentenceId);
  }

  return null; // failed after all attempts
}

/**
 * GET /profiles/:profileId/sentences/next
 *
 * Queue priority:
 *   1. Due reviews (reviewed before, next_review <= now)
 *   2. New sentences from today's batch (never reviewed)
 *   3. If batch incomplete → generate more (up to DAILY_BATCH_SIZE)
 *   4. Nothing left today → return { done: true }
 */
router.get('/next', async (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const date = today();

  // 1. Due reviews — pick the most overdue
  const due = db.prepare(`
    SELECT s.*,
      sr.ease_factor as sr_ease, sr.interval_days as sr_interval, sr.next_review as sr_next_review
    FROM sentences s
    JOIN (
      SELECT sentence_id, ease_factor, interval_days, next_review
      FROM sentence_reviews
      WHERE profile_id = ?
      GROUP BY sentence_id
      HAVING MAX(reviewed_at)
    ) sr ON sr.sentence_id = s.id
    WHERE s.profile_id = ? AND sr.next_review <= ?
    ORDER BY sr.next_review ASC
    LIMIT 1
  `).get(profile.id, profile.id, now);

  if (due) {
    const dailyWord = db.prepare('SELECT * FROM daily_words WHERE profile_id = ? AND date = ?').get(profile.id, date);
    return res.json({ sentence: due, isReview: true, dailyWord });
  }

  // 2. Any unreviewed sentence (any batch date — yesterday's carry over too)
  const newAny = db.prepare(`
    SELECT s.* FROM sentences s
    WHERE s.profile_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM sentence_reviews sr WHERE sr.sentence_id = s.id AND sr.profile_id = ?
      )
    ORDER BY s.batch_date DESC, s.id ASC
    LIMIT 1
  `).get(profile.id, profile.id);

  if (newAny) {
    const dailyWord = db.prepare('SELECT * FROM daily_words WHERE profile_id = ? AND date = ?').get(profile.id, date);
    return res.json({ sentence: newAny, isReview: false, dailyWord });
  }

  // 3. No unreviewed left — generate today's batch if incomplete
  const todayCount = db.prepare(
    'SELECT COUNT(*) as n FROM sentences WHERE profile_id = ? AND batch_date = ?'
  ).get(profile.id, date).n;

  if (todayCount >= DAILY_BATCH_SIZE) {
    // Batch full and nothing left — done for today
    return res.json({ done: true, nextBatchDate: date });
  }

  // Generate sentences to fill today's batch — all in parallel
  const dailyWord = await ensureDailyWord(db, profile);
  const existingTexts = db.prepare(
    'SELECT target_text FROM sentences WHERE profile_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(profile.id).map(r => r.target_text);

  const toGenerate = DAILY_BATCH_SIZE - todayCount;
  console.log(`Generating ${toGenerate} sentences in parallel for profile ${profile.id} (batch ${date})`);

  const results = await Promise.allSettled(
    Array.from({ length: toGenerate }, () => generateAndSave(db, profile, dailyWord, existingTexts, date))
  );

  const saved = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  results
    .filter(r => r.status === 'rejected')
    .forEach(r => console.error('Sentence generation failed:', r.reason?.message));

  if (saved.length === 0) {
    return res.status(502).json({ error: 'Failed to generate sentences. Please try again.' });
  }

  // Return the first saved sentence (lowest id = first in batch)
  const firstNew = saved.reduce((a, b) => (a.id < b.id ? a : b));
  return res.json({ sentence: firstNew, isReview: false, dailyWord });
});

/**
 * GET /profiles/:profileId/sentences/queue
 * Returns counts for the current queue. Also ensures the daily word exists.
 */
router.get('/queue', async (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const date = today();

  // Proactively generate today's word so the dashboard can show it immediately
  const dailyWord = await ensureDailyWord(db, profile);

  const due = db.prepare(`
    SELECT COUNT(*) as n FROM sentences s
    JOIN (
      SELECT sentence_id, MAX(reviewed_at) as last_rev, next_review
      FROM sentence_reviews WHERE profile_id = ?
      GROUP BY sentence_id
    ) sr ON sr.sentence_id = s.id
    WHERE s.profile_id = ? AND sr.next_review <= ?
  `).get(profile.id, profile.id, now).n;

  const newToday = db.prepare(`
    SELECT COUNT(*) as n FROM sentences s
    WHERE s.profile_id = ?
      AND NOT EXISTS (SELECT 1 FROM sentence_reviews sr WHERE sr.sentence_id = s.id AND sr.profile_id = ?)
  `).get(profile.id, profile.id).n;

  const totalToday = db.prepare(
    'SELECT COUNT(*) as n FROM sentences WHERE profile_id = ? AND batch_date = ?'
  ).get(profile.id, date).n;

  res.json({ due, newToday, totalToday, dailyBatchSize: DAILY_BATCH_SIZE, dailyWord });
});

/**
 * GET /profiles/:profileId/sentences
 * List past sentences with their latest review.
 */
router.get('/', (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const db = getDb();
  const containsFilter = req.query.contains
    ? `AND (s.target_text LIKE ? OR s.source_text LIKE ?)`
    : '';
  const likeParam = req.query.contains ? `%${req.query.contains}%` : null;
  const params = likeParam
    ? [profile.id, likeParam, likeParam]
    : [profile.id];

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
 * Submit a completed challenge or practice attempt.
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

  const existingReview = db.prepare(
    'SELECT * FROM sentence_reviews WHERE sentence_id = ? AND profile_id = ? ORDER BY reviewed_at DESC LIMIT 1'
  ).get(sentence.id, profile.id);

  let easeFactor, intervalDays, nextReview;

  if (mode === 'practice') {
    // Practice never advances the SM-2 schedule — sentence stays at its current due date
    easeFactor = existingReview?.ease_factor ?? 2.5;
    intervalDays = existingReview?.interval_days ?? 1;
    nextReview = existingReview?.next_review ?? Math.floor(Date.now() / 1000); // stays due now if never reviewed
  } else {
    const prevEase = existingReview?.ease_factor ?? 2.5;
    const prevInterval = existingReview?.interval_days ?? 1;
    ({ easeFactor, intervalDays, nextReview } = sm2Update({
      easeFactor: prevEase,
      intervalDays: prevInterval,
      score,
    }));
  }

  db.prepare(`
    INSERT INTO sentence_reviews (sentence_id, profile_id, mode, score, wpm, ease_factor, interval_days, next_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sentence.id, profile.id, mode, score, wpm, easeFactor, intervalDays, nextReview);

  let newSkillScore = profile.skill_score;
  let xpGained = 0;
  if (mode === 'challenge') {
    const delta = skillDelta(score, profile.skill_score);
    newSkillScore = Math.max(0, Math.min(1000, profile.skill_score + delta));
    xpGained = Math.round(score * sentence.word_count * 10);
    db.prepare(
      'UPDATE language_profiles SET skill_score = ?, xp = xp + ? WHERE id = ?'
    ).run(newSkillScore, xpGained, profile.id);
  }

  const daysUntilReview = Math.round(intervalDays);
  res.json({ ok: true, nextReview, intervalDays, daysUntilReview, xpGained, newSkillScore });
});

/**
 * POST /profiles/:profileId/sentences/:sentenceId/delay
 * Push the sentence to tomorrow without affecting SM-2 ease/interval.
 */
router.post('/:sentenceId/delay', (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const db = getDb();
  const sentence = db.prepare(
    'SELECT * FROM sentences WHERE id = ? AND profile_id = ?'
  ).get(req.params.sentenceId, profile.id);
  if (!sentence) return res.status(404).json({ error: 'Sentence not found' });

  const tomorrow = Math.floor(Date.now() / 1000) + 86400;
  const existing = db.prepare(
    'SELECT * FROM sentence_reviews WHERE sentence_id = ? AND profile_id = ? ORDER BY reviewed_at DESC LIMIT 1'
  ).get(sentence.id, profile.id);

  db.prepare(`
    INSERT INTO sentence_reviews (sentence_id, profile_id, mode, score, wpm, ease_factor, interval_days, next_review)
    VALUES (?, ?, 'delay', 0, 0, ?, ?, ?)
  `).run(sentence.id, profile.id,
    existing?.ease_factor ?? 2.5,
    existing?.interval_days ?? 1,
    tomorrow
  );

  res.json({ ok: true });
});

/**
 * DELETE /profiles/:profileId/sentences/:sentenceId/reviews
 * Reset SM-2 data for a sentence — makes it due immediately again.
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
