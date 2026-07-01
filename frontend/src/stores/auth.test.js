import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('axios', () => ({
  default: { post: vi.fn() },
}));

const axios = (await import('axios')).default;
const { useAuthStore } = await import('./auth.js');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('login/register', () => {
  it('login sets accessToken in memory and persists refreshToken + user to localStorage', async () => {
    axios.post.mockResolvedValue({
      data: { accessToken: 'access1', refreshToken: 'refresh1', user: { id: 1, email: 'a@b.com' } },
    });
    const auth = useAuthStore();
    await auth.login('a@b.com', 'password');

    expect(auth.accessToken).toBe('access1');
    expect(localStorage.getItem('refreshToken')).toBe('refresh1');
    expect(JSON.parse(localStorage.getItem('user'))).toEqual({ id: 1, email: 'a@b.com' });
  });

  it('register does the same as login on success', async () => {
    axios.post.mockResolvedValue({
      data: { accessToken: 'access2', refreshToken: 'refresh2', user: { id: 2, email: 'c@d.com' } },
    });
    const auth = useAuthStore();
    await auth.register('carol', 'c@d.com', 'password');
    expect(auth.accessToken).toBe('access2');
    expect(localStorage.getItem('refreshToken')).toBe('refresh2');
  });
});

describe('logout', () => {
  it('clears all local state even when the server call fails', async () => {
    axios.post.mockResolvedValueOnce({
      data: { accessToken: 'a', refreshToken: 'r', user: { id: 1 } },
    });
    const auth = useAuthStore();
    await auth.login('a@b.com', 'pw');

    axios.post.mockRejectedValueOnce(new Error('network down'));
    await auth.logout();

    expect(auth.accessToken).toBeNull();
    expect(auth.user).toBeNull();
    expect(auth.refreshToken).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});

describe('refreshAccessToken', () => {
  it('throws without calling axios when there is no refresh token', async () => {
    const auth = useAuthStore();
    await expect(auth.refreshAccessToken()).rejects.toThrow('No refresh token');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('updates only accessToken on success, leaves refreshToken untouched', async () => {
    localStorage.setItem('refreshToken', 'existing-refresh');
    const auth = useAuthStore();
    axios.post.mockResolvedValue({ data: { accessToken: 'new-access' } });
    await auth.refreshAccessToken();
    expect(auth.accessToken).toBe('new-access');
    expect(auth.refreshToken).toBe('existing-refresh');
  });
});

describe('init', () => {
  it('is a no-op when there is no refresh token', async () => {
    const auth = useAuthStore();
    await auth.init();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('is a no-op when accessToken is already set', async () => {
    localStorage.setItem('refreshToken', 'existing-refresh');
    const auth = useAuthStore();
    axios.post.mockResolvedValue({ data: { accessToken: 'first' } });
    await auth.refreshAccessToken(); // sets accessToken
    axios.post.mockClear();
    await auth.init();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('refreshes when a refresh token exists but accessToken does not', async () => {
    localStorage.setItem('refreshToken', 'existing-refresh');
    const auth = useAuthStore();
    axios.post.mockResolvedValue({ data: { accessToken: 'refreshed' } });
    await auth.init();
    expect(auth.accessToken).toBe('refreshed');
  });

  it('clears everything (silent logout) when the refresh call fails', async () => {
    localStorage.setItem('refreshToken', 'stale-refresh');
    localStorage.setItem('user', JSON.stringify({ id: 1 }));
    const auth = useAuthStore();
    axios.post.mockRejectedValue(new Error('expired'));
    await auth.init();
    expect(auth.refreshToken).toBeNull();
    expect(auth.user).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});

describe('initial state on construction (simulated reload)', () => {
  it('hydrates user/refreshToken from localStorage but always starts with a null accessToken', () => {
    localStorage.setItem('refreshToken', 'persisted-refresh');
    localStorage.setItem('user', JSON.stringify({ id: 9, email: 'z@z.com' }));
    const auth = useAuthStore();
    expect(auth.accessToken).toBeNull();
    expect(auth.refreshToken).toBe('persisted-refresh');
    expect(auth.user).toEqual({ id: 9, email: 'z@z.com' });
  });
});
