import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { freshDb, authedUser, seedProfile, seedSentence, seedReview } from '../helpers/testDb.js';

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

describe('POST /api/admin/reset-progress', () => {
  it('zeroes skill/xp and wipes vocabulary, sentences, reviews, and daily words across all of a user\'s profiles', async () => {
    const target = authedUser(db, { email: 'learner@test.local' });
    const profileA = seedProfile(db, target.id, { targetLanguage: 'French', skillScore: 5000 });
    const profileB = seedProfile(db, target.id, { targetLanguage: 'German', skillScore: 3000 });
    db.prepare('UPDATE language_profiles SET xp = 500 WHERE id = ?').run(profileA.id);
    db.prepare('UPDATE language_profiles SET xp = 200 WHERE id = ?').run(profileB.id);

    const sentenceA = seedSentence(db, profileA.id);
    seedReview(db, { sentenceId: sentenceA.id, profileId: profileA.id, overrides: { mode: 'challenge' } });
    db.prepare("INSERT INTO vocabulary (profile_id, word, translation, source) VALUES (?, 'chat', 'cat', 'manual')").run(profileA.id);
    db.prepare("INSERT INTO daily_words (profile_id, word, translation, date) VALUES (?, 'chien', 'dog', '2026-01-01')").run(profileA.id);

    const sentenceB = seedSentence(db, profileB.id);
    seedReview(db, { sentenceId: sentenceB.id, profileId: profileB.id, overrides: { mode: 'challenge' } });

    const res = await request(app).post('/api/admin/reset-progress').set(auth).send({ email: 'learner@test.local' });
    expect(res.status).toBe(200);
    expect(res.body.profilesReset).toBe(2);

    const updatedA = db.prepare('SELECT * FROM language_profiles WHERE id = ?').get(profileA.id);
    const updatedB = db.prepare('SELECT * FROM language_profiles WHERE id = ?').get(profileB.id);
    expect(updatedA.skill_score).toBe(0);
    expect(updatedA.xp).toBe(0);
    expect(updatedB.skill_score).toBe(0);
    expect(updatedB.xp).toBe(0);
    // Profile settings (target/native language) are untouched
    expect(updatedA.target_language).toBe('French');
    expect(updatedB.target_language).toBe('German');

    expect(db.prepare('SELECT * FROM sentences WHERE profile_id IN (?, ?)').all(profileA.id, profileB.id).length).toBe(0);
    expect(db.prepare('SELECT * FROM sentence_reviews WHERE profile_id IN (?, ?)').all(profileA.id, profileB.id).length).toBe(0);
    expect(db.prepare('SELECT * FROM vocabulary WHERE profile_id = ?').all(profileA.id).length).toBe(0);
    expect(db.prepare('SELECT * FROM daily_words WHERE profile_id = ?').all(profileA.id).length).toBe(0);
  });

  it('does not touch another user\'s data', async () => {
    const target = authedUser(db, { email: 'learner2@test.local' });
    const other = authedUser(db, { email: 'untouched@test.local' });
    const targetProfile = seedProfile(db, target.id, { skillScore: 1000 });
    const otherProfile = seedProfile(db, other.id, { skillScore: 2000 });

    await request(app).post('/api/admin/reset-progress').set(auth).send({ email: 'learner2@test.local' });

    const otherUpdated = db.prepare('SELECT * FROM language_profiles WHERE id = ?').get(otherProfile.id);
    expect(otherUpdated.skill_score).toBe(2000);
  });

  it('returns 404 for an unknown email', async () => {
    const res = await request(app).post('/api/admin/reset-progress').set(auth).send({ email: 'ghost@test.local' });
    expect(res.status).toBe(404);
  });

  it('rejects a missing email with 400', async () => {
    const res = await request(app).post('/api/admin/reset-progress').set(auth).send({});
    expect(res.status).toBe(400);
  });

  it('is a no-op (0 profiles reset) for a user with no language profile yet', async () => {
    authedUser(db, { email: 'noprofile@test.local' });
    const res = await request(app).post('/api/admin/reset-progress').set(auth).send({ email: 'noprofile@test.local' });
    expect(res.status).toBe(200);
    expect(res.body.profilesReset).toBe(0);
  });

  it('requires admin access', async () => {
    const nonAdmin = authedUser(db, { email: 'regular2@test.local' });
    const res = await request(app)
      .post('/api/admin/reset-progress')
      .set({ Authorization: `Bearer ${nonAdmin.token}` })
      .send({ email: 'learner@test.local' });
    expect(res.status).toBe(403);
  });
});
