import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import { freshDb, whitelistEmail, seedProfile } from '../helpers/testDb.js';

let db, app;

beforeEach(() => {
  db = freshDb();
  app = createApp();
});

// Any protected route works to exercise requireAuth — profiles list is simplest.
const PROTECTED = '/api/profiles';

describe('requireAuth middleware', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get(PROTECTED);
    expect(res.status).toBe(401);
  });

  it('rejects a header without the Bearer prefix', async () => {
    const res = await request(app).get(PROTECTED).set('Authorization', 'sometoken');
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = jwt.sign({ sub: 1 }, 'wrong-secret', { expiresIn: '15m' });
    const res = await request(app).get(PROTECTED).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const token = jwt.sign({ sub: 1 }, process.env.JWT_SECRET, { expiresIn: -10 });
    const res = await request(app).get(PROTECTED).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('accepts a valid token and scopes data to that user', async () => {
    whitelistEmail(db, 'iris@test.local');
    const register = await request(app).post('/api/auth/register').send({
      username: 'iris', email: 'iris@test.local', password: 'password123',
    });
    const token = register.body.accessToken;
    seedProfile(db, register.body.user.id);
    const res = await request(app).get(PROTECTED).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});
