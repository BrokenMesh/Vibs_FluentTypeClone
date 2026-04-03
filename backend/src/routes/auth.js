import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDb, rowid } from '../db/schema.js';

const router = Router();

function createAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

function createRefreshToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = getDb();

  // Check email whitelist
  const allowed = db.prepare('SELECT id FROM email_whitelist WHERE email = ?').get(email.toLowerCase().trim());
  if (!allowed) {
    return res.status(403).json({ error: 'This email is not on the access list. Contact the admin.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
  if (existing) {
    return res.status(409).json({ error: 'Email or username already taken' });
  }

  const hash = await bcrypt.hash(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  ).run(username, email, hash);

  const userId = rowid(result);
  const accessToken = createAccessToken(userId);
  const refreshToken = createRefreshToken(userId);

  db.prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).run(userId, hashToken(refreshToken), Math.floor(Date.now() / 1000) + 30 * 86400);

  res.status(201).json({
    accessToken,
    refreshToken,
    user: { id: userId, username, email },
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const accessToken = createAccessToken(user.id);
  const refreshToken = createRefreshToken(user.id);

  db.prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).run(user.id, hashToken(refreshToken), Math.floor(Date.now() / 1000) + 30 * 86400);

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, username: user.username, email: user.email },
  });
});

router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  const db = getDb();
  const stored = db.prepare(
    'SELECT * FROM refresh_tokens WHERE user_id = ? AND token_hash = ? AND expires_at > ?'
  ).get(payload.sub, hashToken(refreshToken), Math.floor(Date.now() / 1000));

  if (!stored) return res.status(401).json({ error: 'Refresh token revoked or expired' });

  const accessToken = createAccessToken(payload.sub);
  res.json({ accessToken });
});

router.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const db = getDb();
    db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hashToken(refreshToken));
  }
  res.json({ ok: true });
});

export default router;
