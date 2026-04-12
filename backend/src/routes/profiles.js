import { Router } from 'express';
import { getDb, rowid } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const db = getDb();
  const profiles = db.prepare(
    'SELECT * FROM language_profiles WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.userId);
  res.json(profiles);
});

router.post('/', (req, res) => {
  const { targetLanguage, nativeLanguage, skillScore = 0 } = req.body;
  if (!targetLanguage || !nativeLanguage) {
    return res.status(400).json({ error: 'targetLanguage and nativeLanguage are required' });
  }

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO language_profiles (user_id, target_language, native_language, skill_score) VALUES (?, ?, ?, ?)'
  ).run(req.userId, targetLanguage, nativeLanguage, Math.max(0, Math.min(100, skillScore)));

  const profile = db.prepare('SELECT * FROM language_profiles WHERE id = ?').get(rowid(result));
  res.status(201).json(profile);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const profile = db.prepare(
    'SELECT * FROM language_profiles WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  res.json(profile);
});

router.put('/:id/settings', (req, res) => {
  const db = getDb();
  const profile = db.prepare(
    'SELECT id FROM language_profiles WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const { dailyNewLimit, dailyDueLimit, dailyBatchSize, srsStrength } = req.body;
  const updates = [];
  const params = [];

  if (dailyNewLimit !== undefined) {
    const v = Math.max(1, Math.min(200, parseInt(dailyNewLimit) || 10));
    updates.push('daily_new_limit = ?'); params.push(v);
  }
  if (dailyDueLimit !== undefined) {
    const v = Math.max(1, Math.min(500, parseInt(dailyDueLimit) || 30));
    updates.push('daily_due_limit = ?'); params.push(v);
  }
  if (dailyBatchSize !== undefined) {
    const v = Math.max(1, Math.min(50, parseInt(dailyBatchSize) || 10));
    updates.push('daily_batch_size = ?'); params.push(v);
  }
  if (srsStrength !== undefined) {
    const v = Math.max(0.3, Math.min(3.0, parseFloat(srsStrength) || 1.0));
    updates.push('srs_strength = ?'); params.push(v);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  params.push(req.params.id);
  db.prepare(`UPDATE language_profiles SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM language_profiles WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const profile = db.prepare(
    'SELECT id FROM language_profiles WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  db.prepare('DELETE FROM language_profiles WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
