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

export default router;
