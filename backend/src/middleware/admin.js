import { getDb } from '../db/schema.js';

export function requireAdmin(req, res, next) {
  const adminEmail = process.env.ADMIN_EMAIL || 'elkordhicham@gmail.com';
  const db = getDb();
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId);
  if (!user || user.email !== adminEmail) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
