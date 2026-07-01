import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const state = vi.hoisted(() => ({
  requestHandler: null,
  successHandler: null,
  errorHandler: null,
  instanceCall: vi.fn(),
}));

vi.mock('axios', () => {
  const instanceFn = (...args) => state.instanceCall(...args);
  instanceFn.interceptors = {
    request: { use: (fn) => { state.requestHandler = fn; } },
    response: { use: (success, error) => { state.successHandler = success; state.errorHandler = error; } },
  };
  return {
    default: {
      create: () => instanceFn,
      post: vi.fn(),
    },
  };
});

const axios = (await import('axios')).default;
await import('./index.js'); // registers the interceptors into `state` above
const { useAuthStore } = await import('../stores/auth.js');

beforeEach(() => {
  vi.clearAllMocks();
  state.instanceCall.mockResolvedValue({ data: 'retried' });
  localStorage.clear();
  setActivePinia(createPinia());
});

function make401Error(overrides = {}) {
  return { config: { headers: {}, _retry: false, ...overrides }, response: { status: 401 } };
}

describe('request interceptor', () => {
  it('injects the Bearer token when accessToken is present', () => {
    const auth = useAuthStore();
    auth.accessToken = 'my-token';
    const config = state.requestHandler({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer my-token');
  });

  it('does not add an Authorization header when there is no accessToken', () => {
    useAuthStore(); // accessToken defaults to null
    const config = state.requestHandler({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
  });
});

describe('response interceptor — 401 handling', () => {
  it('refreshes once and retries the original request on a single 401', async () => {
    localStorage.setItem('refreshToken', 'r1');
    const auth = useAuthStore();
    axios.post.mockResolvedValue({ data: { accessToken: 'fresh-token' } });

    const result = await state.errorHandler(make401Error());
    expect(result).toEqual({ data: 'retried' });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(state.instanceCall).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent 401s into exactly one refreshAccessToken call', async () => {
    localStorage.setItem('refreshToken', 'r1');
    const auth = useAuthStore();
    const spy = vi.spyOn(auth, 'refreshAccessToken');
    axios.post.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ data: { accessToken: 'fresh-token' } }), 10);
    }));

    const results = await Promise.all([
      state.errorHandler(make401Error()),
      state.errorHandler(make401Error()),
      state.errorHandler(make401Error()),
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(3);
  });

  it('logs out and propagates the original error when the refresh itself fails', async () => {
    localStorage.setItem('refreshToken', 'r1');
    const auth = useAuthStore();
    const logoutSpy = vi.spyOn(auth, 'logout').mockResolvedValue();
    axios.post.mockRejectedValue(new Error('refresh failed'));

    const originalErr = make401Error();
    await expect(state.errorHandler(originalErr)).rejects.toBe(originalErr);
    expect(logoutSpy).toHaveBeenCalledTimes(1);
  });

  it('does not attempt another refresh for a request already marked _retry (no infinite loop)', async () => {
    localStorage.setItem('refreshToken', 'r1');
    const auth = useAuthStore();
    const spy = vi.spyOn(auth, 'refreshAccessToken');

    const alreadyRetried = make401Error({ _retry: true });
    await expect(state.errorHandler(alreadyRetried)).rejects.toBe(alreadyRetried);
    expect(spy).not.toHaveBeenCalled();
  });

  it('passes through non-401 errors untouched', async () => {
    const err = { config: { headers: {} }, response: { status: 500 } };
    await expect(state.errorHandler(err)).rejects.toBe(err);
  });
});
