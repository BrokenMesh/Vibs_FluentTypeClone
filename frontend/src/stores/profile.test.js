import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../api/index.js', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const api = (await import('../api/index.js')).default;
const { useProfileStore } = await import('./profile.js');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('happy paths', () => {
  it('fetchProfiles populates profiles', async () => {
    api.get.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }] });
    const store = useProfileStore();
    await store.fetchProfiles();
    expect(store.profiles).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('createProfile prepends the new profile and sets it active, persisting to localStorage', async () => {
    api.post.mockResolvedValue({ data: { id: 5, target_language: 'French' } });
    const store = useProfileStore();
    store.profiles = [{ id: 1 }];
    await store.createProfile('French', 'English');

    expect(store.profiles[0]).toEqual({ id: 5, target_language: 'French' });
    expect(store.activeProfile).toEqual({ id: 5, target_language: 'French' });
    expect(JSON.parse(localStorage.getItem('activeProfile'))).toEqual({ id: 5, target_language: 'French' });
  });

  it('refreshActive is a no-op with no active profile', async () => {
    const store = useProfileStore();
    await store.refreshActive();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('refreshActive updates the active profile from the server', async () => {
    const store = useProfileStore();
    store.setActive({ id: 3, skill_score: 10 });
    api.get.mockResolvedValue({ data: { id: 3, skill_score: 20 } });
    await store.refreshActive();
    expect(store.activeProfile.skill_score).toBe(20);
  });
});

describe('error handling (documents current gap: no try/catch in this store)', () => {
  it('a failed fetchProfiles call propagates as a rejected promise to the caller', async () => {
    api.get.mockRejectedValue(new Error('network down'));
    const store = useProfileStore();
    await expect(store.fetchProfiles()).rejects.toThrow('network down');
  });

  it('a failed refreshActive call propagates as a rejected promise to the caller', async () => {
    const store = useProfileStore();
    store.setActive({ id: 1 });
    api.get.mockRejectedValue(new Error('network down'));
    await expect(store.refreshActive()).rejects.toThrow('network down');
  });
});
