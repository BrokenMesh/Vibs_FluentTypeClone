import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { freshDb, authedUser } from '../helpers/testDb.js';

let db, app, admin, auth;

beforeEach(() => {
  db = freshDb();
  app = createApp();
  admin = authedUser(db, { email: process.env.ADMIN_EMAIL });
  auth = { Authorization: `Bearer ${admin.token}` };
});

describe('whitelist CRUD', () => {
  it('lists the whitelist (seeded with the admin email)', async () => {
    const res = await request(app).get('/api/admin/whitelist').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.some((e) => e.email === process.env.ADMIN_EMAIL)).toBe(true);
  });

  it('adds a new email', async () => {
    const res = await request(app).post('/api/admin/whitelist').set(auth).send({ email: 'New@Person.com' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('new@person.com');
  });

  it('rejects an invalid email with 400', async () => {
    const res = await request(app).post('/api/admin/whitelist').set(auth).send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/admin/whitelist').set(auth).send({ email: 'dup@test.local' });
    const res = await request(app).post('/api/admin/whitelist').set(auth).send({ email: 'dup@test.local' });
    expect(res.status).toBe(409);
  });

  it('cannot delete the current admin email', async () => {
    const row = db.prepare('SELECT * FROM email_whitelist WHERE email = ?').get(process.env.ADMIN_EMAIL);
    const res = await request(app).delete(`/api/admin/whitelist/${row.id}`).set(auth);
    expect(res.status).toBe(400);
  });

  it('deletes a non-admin email', async () => {
    const created = await request(app).post('/api/admin/whitelist').set(auth).send({ email: 'removable@test.local' });
    const res = await request(app).delete(`/api/admin/whitelist/${created.body.id}`).set(auth);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/admin/users', () => {
  it('lists users without exposing password_hash', async () => {
    const res = await request(app).get('/api/admin/users').set(auth);
    expect(res.status).toBe(200);
    expect(res.body[0].password_hash).toBeUndefined();
  });
});

describe('POST /api/admin/reset-password', () => {
  it('revokes all existing refresh tokens for the user and sets a working new password', async () => {
    const whitelistRes = await request(app).post('/api/admin/whitelist').set(auth).send({ email: 'target@test.local' });
    const register = await request(app).post('/api/auth/register').send({
      username: 'target', email: 'target@test.local', password: 'oldpassword',
    });
    // A second session/token for the same user
    const login2 = await request(app).post('/api/auth/login').send({
      email: 'target@test.local', password: 'oldpassword',
    });

    const reset = await request(app).post('/api/admin/reset-password').set(auth).send({
      email: 'target@test.local', newPassword: 'newpassword123',
    });
    expect(reset.status).toBe(200);

    const refreshAttempt1 = await request(app).post('/api/auth/refresh').send({ refreshToken: register.body.refreshToken });
    const refreshAttempt2 = await request(app).post('/api/auth/refresh').send({ refreshToken: login2.body.refreshToken });
    expect(refreshAttempt1.status).toBe(401);
    expect(refreshAttempt2.status).toBe(401);

    const loginWithNewPassword = await request(app).post('/api/auth/login').send({
      email: 'target@test.local', password: 'newpassword123',
    });
    expect(loginWithNewPassword.status).toBe(200);
  });

  it('rejects a password under 6 characters', async () => {
    const res = await request(app).post('/api/admin/reset-password').set(auth).send({
      email: 'someone@test.local', newPassword: '123',
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown email', async () => {
    const res = await request(app).post('/api/admin/reset-password').set(auth).send({
      email: 'ghost@test.local', newPassword: 'password123',
    });
    expect(res.status).toBe(404);
  });
});
