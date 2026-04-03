import axios from 'axios';
import { useAuthStore } from '../stores/auth.js';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const auth = useAuthStore();
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  return config;
});

let refreshPromise = null;

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (!refreshPromise) {
        const auth = useAuthStore();
        refreshPromise = auth.refreshAccessToken().finally(() => { refreshPromise = null; });
      }
      try {
        await refreshPromise;
        const auth = useAuthStore();
        original.headers.Authorization = `Bearer ${auth.accessToken}`;
        return api(original);
      } catch {
        const auth = useAuthStore();
        auth.logout();
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  }
);

export default api;
