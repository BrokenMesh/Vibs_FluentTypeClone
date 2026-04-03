import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref(null);
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'));
  const refreshToken = ref(localStorage.getItem('refreshToken'));

  function setTokens(access, refresh) {
    accessToken.value = access;
    refreshToken.value = refresh;
    if (refresh) localStorage.setItem('refreshToken', refresh);
  }

  function setUser(u) {
    user.value = u;
    if (u) localStorage.setItem('user', JSON.stringify(u));
    else localStorage.removeItem('user');
  }

  async function register(username, email, password) {
    const res = await axios.post('/api/auth/register', { username, email, password });
    setTokens(res.data.accessToken, res.data.refreshToken);
    setUser(res.data.user);
    return res.data;
  }

  async function login(email, password) {
    const res = await axios.post('/api/auth/login', { email, password });
    setTokens(res.data.accessToken, res.data.refreshToken);
    setUser(res.data.user);
    return res.data;
  }

  async function refreshAccessToken() {
    const stored = refreshToken.value;
    if (!stored) throw new Error('No refresh token');
    const res = await axios.post('/api/auth/refresh', { refreshToken: stored });
    accessToken.value = res.data.accessToken;
  }

  async function logout() {
    try {
      await axios.post('/api/auth/logout', { refreshToken: refreshToken.value });
    } catch { /* ignore */ }
    accessToken.value = null;
    setUser(null);
    refreshToken.value = null;
    localStorage.removeItem('refreshToken');
  }

  async function init() {
    if (refreshToken.value && !accessToken.value) {
      try {
        await refreshAccessToken();
      } catch {
        refreshToken.value = null;
        localStorage.removeItem('refreshToken');
        setUser(null);
      }
    }
  }

  return { accessToken, user, refreshToken, register, login, logout, refreshAccessToken, init };
});
