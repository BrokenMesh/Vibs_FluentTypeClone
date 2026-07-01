import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/ai.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateSentenceBatch: vi.fn().mockResolvedValue([
      { sourceText: 'The dog runs.', targetText: 'Le chien court.', words: ['chien'] },
    ]),
    generateLearnerProfile: vi.fn().mockResolvedValue(''),
    generateWordOfDay: vi.fn().mockResolvedValue({ word: 'maison', translation: 'house' }),
  };
});

const { createApp } = await import('../../src/app.js');
const { freshDb, authedUser, seedProfile } = await import('../helpers/testDb.js');
const ai = await import('../../src/services/ai.js');

let db, app, user, auth, profile;

beforeEach(() => {
  vi.clearAllMocks();
  db = freshDb();
  app = createApp();
  user = authedUser(db, { email: 'owner@test.local' });
  auth = { Authorization: `Bearer ${user.token}` };
  profile = seedProfile(db, user.id);
});

describe('POST /api/profiles/:id/vocabulary', () => {
  it('adds a word and normalizes case/whitespace', async () => {
    const res = await request(app).post(`/api/profiles/${profile.id}/vocabulary`).set(auth).send({
      word: '  Chien  ', translation: ' dog ',
    });
    expect(res.status).toBe(201);
    expect(res.body.word).toBe('chien');
    expect(res.body.translation).toBe('dog');
  });

  it('rejects a case-insensitive duplicate with 409', async () => {
    await request(app).post(`/api/profiles/${profile.id}/vocabulary`).set(auth).send({
      word: 'Hund', translation: 'dog',
    });
    const res = await request(app).post(`/api/profiles/${profile.id}/vocabulary`).set(auth).send({
      word: 'hund', translation: 'dog again',
    });
    expect(res.status).toBe(409);
  });

  it('responds before the background AI generation resolves', async () => {
    let resolveBatch;
    ai.generateSentenceBatch.mockReturnValueOnce(new Promise((resolve) => { resolveBatch = resolve; }));

    const start = Date.now();
    const res = await request(app).post(`/api/profiles/${profile.id}/vocabulary`).set(auth).send({
      word: 'katze', translation: 'cat',
    });
    const elapsed = Date.now() - start;

    expect(res.status).toBe(201);
    expect(elapsed).toBeLessThan(200); // did not wait on the still-pending AI call
    resolveBatch([]); // let the background promise settle so it doesn't leak into other tests
  });

  it('does not crash or affect the response when background generation fails', async () => {
    ai.generateSentenceBatch.mockRejectedValue(new Error('AI down'));
    const res = await request(app).post(`/api/profiles/${profile.id}/vocabulary`).set(auth).send({
      word: 'vogel', translation: 'bird',
    });
    expect(res.status).toBe(201);
    // give the background Promise.allSettled a tick to run without throwing
    await new Promise((r) => setTimeout(r, 20));
  });
});

describe('DELETE /api/profiles/:id/vocabulary/:wordId', () => {
  it('returns 404 for a word belonging to another profile', async () => {
    const other = authedUser(db, { email: 'stranger@test.local' });
    const otherProfile = seedProfile(db, other.id);
    const result = db.prepare(
      'INSERT INTO vocabulary (profile_id, word, translation, source) VALUES (?, ?, ?, ?)'
    ).run(otherProfile.id, 'wort', 'word', 'manual');

    const res = await request(app)
      .delete(`/api/profiles/${profile.id}/vocabulary/${result.lastInsertRowid}`)
      .set(auth);
    expect(res.status).toBe(404);
  });

  it('deletes an owned word', async () => {
    const created = await request(app).post(`/api/profiles/${profile.id}/vocabulary`).set(auth).send({
      word: 'baum', translation: 'tree',
    });
    const res = await request(app)
      .delete(`/api/profiles/${profile.id}/vocabulary/${created.body.id}`)
      .set(auth);
    expect(res.status).toBe(200);
  });
});
