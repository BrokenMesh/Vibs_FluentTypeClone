import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { freshDb, whitelistEmail, authedUser } from '../helpers/testDb.js';

let db, app;

beforeEach(() => {
  db = freshDb();
  app = createApp();
});

describe('requireAdmin middleware', () => {
  it('rejects a non-admin authenticated user with 403', async () => {
    const user = authedUser(db, { email: 'regular@test.local' });
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(403);
  });

  it('allows the admin user through', async () => {
    const admin = authedUser(db, { email: process.env.ADMIN_EMAIL });
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
  });

  it('only protects the current ADMIN_EMAIL value from whitelist deletion (known gap, documented)', async () => {
    const originalAdminRow = db.prepare('SELECT * FROM email_whitelist WHERE email = ?').get(process.env.ADMIN_EMAIL);
    expect(originalAdminRow).toBeTruthy();

    const originalEnv = process.env.ADMIN_EMAIL;
    // A second admin, matching what ADMIN_EMAIL will become after the env swap below —
    // this simulates the env var being changed to a new admin's address in production.
    const newAdmin = authedUser(db, { email: 'someone-else@test.local' });
    process.env.ADMIN_EMAIL = 'someone-else@test.local';
    try {
      const res = await request(app)
        .delete(`/api/admin/whitelist/${originalAdminRow.id}`)
        .set('Authorization', `Bearer ${newAdmin.token}`);
      // Documents current behavior: the *original* admin email is now deletable
      // because only the current env value is protected. This is a known gap,
      // left as-is per product decision — not one of the approved bug fixes.
      expect(res.status).toBe(200);
    } finally {
      process.env.ADMIN_EMAIL = originalEnv;
    }
  });
});
