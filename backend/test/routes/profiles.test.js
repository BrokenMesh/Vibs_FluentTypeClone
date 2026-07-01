import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { freshDb, authedUser, seedProfile } from '../helpers/testDb.js';

let db, app, user, auth;

beforeEach(() => {
  db = freshDb();
  app = createApp();
  user = authedUser(db, { email: 'owner@test.local' });
  auth = { Authorization: `Bearer ${user.token}` };
});

describe('GET /api/profiles', () => {
  it('only returns the authenticated user\'s profiles', async () => {
    seedProfile(db, user.id, { targetLanguage: 'French' });
    const other = authedUser(db, { email: 'other@test.local' });
    seedProfile(db, other.id, { targetLanguage: 'German' });

    const res = await request(app).get('/api/profiles').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].target_language).toBe('French');
  });
});

describe('POST /api/profiles', () => {
  it('creates a profile', async () => {
    const res = await request(app).post('/api/profiles').set(auth).send({
      targetLanguage: 'Spanish', nativeLanguage: 'English',
    });
    expect(res.status).toBe(201);
    expect(res.body.target_language).toBe('Spanish');
  });

  it('rejects missing languages with 400', async () => {
    const res = await request(app).post('/api/profiles').set(auth).send({ targetLanguage: 'Spanish' });
    expect(res.status).toBe(400);
  });

  it('clamps skillScore into [0, 100]', async () => {
    const low = await request(app).post('/api/profiles').set(auth).send({
      targetLanguage: 'Spanish', nativeLanguage: 'English', skillScore: -10,
    });
    const high = await request(app).post('/api/profiles').set(auth).send({
      targetLanguage: 'Spanish', nativeLanguage: 'English', skillScore: 150,
    });
    expect(low.body.skill_score).toBe(0);
    expect(high.body.skill_score).toBe(100);
  });
});

describe('GET /api/profiles/:id', () => {
  it('returns 404 (not 403) for another user\'s profile', async () => {
    const other = authedUser(db, { email: 'stranger@test.local' });
    const profile = seedProfile(db, other.id);
    const res = await request(app).get(`/api/profiles/${profile.id}`).set(auth);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/profiles/:id/settings', () => {
  it('clamps each of the four settings fields at their bounds', async () => {
    const profile = seedProfile(db, user.id);
    const res = await request(app).put(`/api/profiles/${profile.id}/settings`).set(auth).send({
      dailyNewLimit: 999, dailyDueLimit: -5, dailyBatchSize: 100, srsStrength: 10,
    });
    expect(res.status).toBe(200);
    expect(res.body.daily_new_limit).toBe(200);
    expect(res.body.daily_due_limit).toBe(1);
    expect(res.body.daily_batch_size).toBe(50);
    expect(res.body.srs_strength).toBe(3.0);
  });

  it('applies a partial update, leaving other fields untouched', async () => {
    const profile = seedProfile(db, user.id, { dailyNewLimit: 10, dailyDueLimit: 30 });
    const res = await request(app).put(`/api/profiles/${profile.id}/settings`).set(auth).send({
      dailyNewLimit: 5,
    });
    expect(res.body.daily_new_limit).toBe(5);
    expect(res.body.daily_due_limit).toBe(30);
  });

  it('rejects an empty body with 400', async () => {
    const profile = seedProfile(db, user.id);
    const res = await request(app).put(`/api/profiles/${profile.id}/settings`).set(auth).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for another user\'s profile', async () => {
    const other = authedUser(db, { email: 'stranger2@test.local' });
    const profile = seedProfile(db, other.id);
    const res = await request(app).put(`/api/profiles/${profile.id}/settings`).set(auth).send({ dailyNewLimit: 5 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/profiles/:id', () => {
  it('returns 404 for another user\'s profile', async () => {
    const other = authedUser(db, { email: 'stranger3@test.local' });
    const profile = seedProfile(db, other.id);
    const res = await request(app).delete(`/api/profiles/${profile.id}`).set(auth);
    expect(res.status).toBe(404);
  });

  it('deletes an owned profile and cascades to vocabulary', async () => {
    const profile = seedProfile(db, user.id);
    db.prepare('INSERT INTO vocabulary (profile_id, word, translation, source) VALUES (?, ?, ?, ?)')
      .run(profile.id, 'chat', 'cat', 'manual');

    const res = await request(app).delete(`/api/profiles/${profile.id}`).set(auth);
    expect(res.status).toBe(200);

    const remaining = db.prepare('SELECT * FROM vocabulary WHERE profile_id = ?').all(profile.id);
    expect(remaining.length).toBe(0);
  });
});
