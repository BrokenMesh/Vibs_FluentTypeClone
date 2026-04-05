import { Router } from 'express';
import { getDb, rowid } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { generateAndSave, today } from './sentences.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

function getProfile(profileId, userId) {
  return getDb().prepare(
    'SELECT * FROM language_profiles WHERE id = ? AND user_id = ?'
  ).get(profileId, userId);
}

// GET /profiles/:profileId/vocabulary
router.get('/', (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const db = getDb();
  const words = db.prepare(
    'SELECT * FROM vocabulary WHERE profile_id = ? ORDER BY created_at DESC'
  ).all(profile.id);
  res.json(words);
});

// POST /profiles/:profileId/vocabulary  — add manual word
router.post('/', (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const { word, translation } = req.body;
  if (!word || !translation) {
    return res.status(400).json({ error: 'word and translation are required' });
  }

  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM vocabulary WHERE profile_id = ? AND word = ?'
  ).get(profile.id, word.toLowerCase().trim());

  if (existing) return res.status(409).json({ error: 'Word already in vocabulary' });

  const result = db.prepare(
    'INSERT INTO vocabulary (profile_id, word, translation, source) VALUES (?, ?, ?, ?)'
  ).run(profile.id, word.toLowerCase().trim(), translation.trim(), 'manual');

  const vocab = db.prepare('SELECT * FROM vocabulary WHERE id = ?').get(rowid(result));
  res.status(201).json(vocab);

  // Fire off 10 sentences in the background anchored to the new word
  const batchDate = today();
  const existingTexts = db.prepare(
    'SELECT target_text FROM sentences WHERE profile_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(profile.id).map(r => r.target_text);
  const anchorWord = { word: vocab.word };

  Promise.allSettled(
    Array.from({ length: 10 }, () => generateAndSave(db, profile, anchorWord, existingTexts, batchDate))
  ).then(results => {
    const ok = results.filter(r => r.status === 'fulfilled' && r.value).length;
    console.log(`Generated ${ok}/10 sentences for new word "${vocab.word}"`);
  }).catch(e => console.error('Background sentence gen failed:', e));
});

// DELETE /profiles/:profileId/vocabulary/:wordId
router.delete('/:wordId', (req, res) => {
  const profile = getProfile(req.params.profileId, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const db = getDb();
  const word = db.prepare(
    'SELECT id FROM vocabulary WHERE id = ? AND profile_id = ?'
  ).get(req.params.wordId, profile.id);
  if (!word) return res.status(404).json({ error: 'Word not found' });

  db.prepare('DELETE FROM vocabulary WHERE id = ?').run(req.params.wordId);
  res.json({ ok: true });
});

export default router;
