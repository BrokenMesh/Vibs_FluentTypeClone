import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { freshDb, whitelistEmail, seedUser } from '../helpers/testDb.js';

let db, app;

beforeEach(() => {
  db = freshDb();
  app = createApp();
});

describe('POST /api/auth/register', () => {
  it('registers a whitelisted email and returns tokens + user', async () => {
    whitelistEmail(db, 'alice@test.local');
    const res = await request(app).post('/api/auth/register').send({
      username: 'alice',
      email: 'alice@test.local',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ username: 'alice', email: 'alice@test.local' });

    const row = db.prepare('SELECT * FROM users WHERE username = ?').get('alice');
    expect(row.password_hash).not.toBe('password123');
    const tokenRow = db.prepare('SELECT * FROM refresh_tokens WHERE user_id = ?').get(row.id);
    expect(tokenRow).toBeTruthy();
  });

  it('normalizes email casing consistently between whitelist check and stored user', async () => {
    whitelistEmail(db, 'bob@test.local'); // stored lowercase
    const res = await request(app).post('/api/auth/register').send({
      username: 'bob',
      email: 'Bob@Test.Local',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('bob@test.local');

    const row = db.prepare('SELECT * FROM users WHERE username = ?').get('bob');
    expect(row.email).toBe('bob@test.local');
  });

  it('rejects missing fields with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects passwords under 6 characters', async () => {
    whitelistEmail(db, 'short@test.local');
    const res = await request(app).post('/api/auth/register').send({
      username: 'short', email: 'short@test.local', password: '123',
    });
    expect(res.status).toBe(400);
  });

  it('rejects registration for a non-whitelisted email with 403', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'nope', email: 'nope@test.local', password: 'password123',
    });
    expect(res.status).toBe(403);
  });

  it('rejects a duplicate email with 409', async () => {
    whitelistEmail(db, 'dup@test.local');
    seedUser(db, { email: 'dup@test.local', username: 'first' });
    const res = await request(app).post('/api/auth/register').send({
      username: 'second', email: 'dup@test.local', password: 'password123',
    });
    expect(res.status).toBe(409);
  });

  it('rejects a duplicate username with 409', async () => {
    whitelistEmail(db, 'dup2@test.local');
    seedUser(db, { email: 'other@test.local', username: 'sameuser' });
    const res = await request(app).post('/api/auth/register').send({
      username: 'sameuser', email: 'dup2@test.local', password: 'password123',
    });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const user = seedUser(db, { email: 'carol@test.local', password: 'password123' });
    const res = await request(app).post('/api/auth/login').send({
      email: 'carol@test.local', password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.id).toBe(user.id);
  });

  it('returns the same error message for wrong password and unknown email (no enumeration)', async () => {
    seedUser(db, { email: 'dave@test.local', password: 'password123' });
    const wrongPassword = await request(app).post('/api/auth/login').send({
      email: 'dave@test.local', password: 'wrongpass',
    });
    const unknownEmail = await request(app).post('/api/auth/login').send({
      email: 'ghost@test.local', password: 'whatever1',
    });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a new access token for a valid refresh token', async () => {
    whitelistEmail(db, 'erin@test.local');
    const register = await request(app).post('/api/auth/register').send({
      username: 'erin', email: 'erin@test.local', password: 'password123',
    });
    const res = await request(app).post('/api/auth/refresh').send({
      refreshToken: register.body.refreshToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('rejects a malformed refresh token with 401, not 500', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'garbage' });
    expect(res.status).toBe(401);
  });

  it('rejects a refresh token that has been revoked (after logout)', async () => {
    whitelistEmail(db, 'frank@test.local');
    const register = await request(app).post('/api/auth/register').send({
      username: 'frank', email: 'frank@test.local', password: 'password123',
    });
    const refreshToken = register.body.refreshToken;
    await request(app).post('/api/auth/logout').send({ refreshToken });
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
  });

  it('rejects an expired-in-DB refresh token even if the JWT itself is still valid', async () => {
    whitelistEmail(db, 'grace@test.local');
    const register = await request(app).post('/api/auth/register').send({
      username: 'grace', email: 'grace@test.local', password: 'password123',
    });
    // Force the stored expiry into the past without touching the JWT's own expiry.
    db.prepare('UPDATE refresh_tokens SET expires_at = ?').run(Math.floor(Date.now() / 1000) - 10);
    const res = await request(app).post('/api/auth/refresh').send({
      refreshToken: register.body.refreshToken,
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('is best-effort: succeeds even with no refresh token provided', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('deletes the matching refresh token row', async () => {
    whitelistEmail(db, 'henry@test.local');
    const register = await request(app).post('/api/auth/register').send({
      username: 'henry', email: 'henry@test.local', password: 'password123',
    });
    await request(app).post('/api/auth/logout').send({ refreshToken: register.body.refreshToken });
    const row = db.prepare('SELECT * FROM refresh_tokens').all();
    expect(row.length).toBe(0);
  });
});
