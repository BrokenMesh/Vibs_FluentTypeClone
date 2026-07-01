import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, rowid } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/whitelist
router.get('/whitelist', (req, res) => {
  const db = getDb();
  const list = db.prepare(
    'SELECT * FROM email_whitelist ORDER BY created_at DESC'
  ).all();
  res.json(list);
});

// POST /api/admin/whitelist
router.post('/whitelist', (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  const db = getDb();
  const exists = db.prepare('SELECT id FROM email_whitelist WHERE email = ?').get(email.toLowerCase().trim());
  if (exists) return res.status(409).json({ error: 'Email already whitelisted' });

  const adminEmail = process.env.ADMIN_EMAIL || 'elkordhicham@gmail.com';
  const result = db.prepare(
    'INSERT INTO email_whitelist (email, added_by) VALUES (?, ?)'
  ).run(email.toLowerCase().trim(), adminEmail);

  res.status(201).json(db.prepare('SELECT * FROM email_whitelist WHERE id = ?').get(rowid(result)));
});

// DELETE /api/admin/whitelist/:id
router.delete('/whitelist/:id', (req, res) => {
  const db = getDb();
  const entry = db.prepare('SELECT * FROM email_whitelist WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });

  const adminEmail = process.env.ADMIN_EMAIL || 'elkordhicham@gmail.com';
  if (entry.email === adminEmail) {
    return res.status(400).json({ error: 'Cannot remove admin email' });
  }

  db.prepare('DELETE FROM email_whitelist WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/admin/users
router.get('/users', (req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, username, email, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json(users);
});

// POST /api/admin/reset-password
router.post('/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ error: 'email and newPassword are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(404).json({ error: 'User not found' });

  const hash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  // Revoke all refresh tokens for this user
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(user.id);

  res.json({ ok: true });
});

// POST /api/admin/reset-progress
// Wipes learning data (skill/xp, vocabulary, sentences, reviews, daily words)
// for every language profile a user has, but keeps their account and profile
// settings (target/native language, daily limits) intact.
router.post('/reset-progress', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(404).json({ error: 'User not found' });

  const profiles = db.prepare('SELECT id FROM language_profiles WHERE user_id = ?').all(user.id);

  const deleteSentences = db.prepare('DELETE FROM sentences WHERE profile_id = ?');
  const deleteVocabulary = db.prepare('DELETE FROM vocabulary WHERE profile_id = ?');
  const deleteDailyWords = db.prepare('DELETE FROM daily_words WHERE profile_id = ?');
  const resetProfile = db.prepare('UPDATE language_profiles SET skill_score = 0, xp = 0 WHERE id = ?');

  for (const profile of profiles) {
    deleteSentences.run(profile.id); // cascades to sentence_reviews
    deleteVocabulary.run(profile.id);
    deleteDailyWords.run(profile.id);
    resetProfile.run(profile.id);
  }

  res.json({ ok: true, profilesReset: profiles.length });
});

export default router;
