import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../api/index.js';

export const useProfileStore = defineStore('profile', () => {
  const profiles = ref([]);
  const activeProfile = ref(JSON.parse(localStorage.getItem('activeProfile') || 'null'));

  async function fetchProfiles() {
    const res = await api.get('/profiles');
    profiles.value = res.data;
    return res.data;
  }

  async function createProfile(targetLanguage, nativeLanguage, skillScore = 0) {
    const res = await api.post('/profiles', { targetLanguage, nativeLanguage, skillScore });
    profiles.value.unshift(res.data);
    setActive(res.data);
    return res.data;
  }

  function setActive(profile) {
    activeProfile.value = profile;
    localStorage.setItem('activeProfile', JSON.stringify(profile));
  }

  async function refreshActive() {
    if (!activeProfile.value) return;
    const res = await api.get(`/profiles/${activeProfile.value.id}`);
    activeProfile.value = res.data;
    localStorage.setItem('activeProfile', JSON.stringify(res.data));
  }

  function clear() {
    profiles.value = [];
    activeProfile.value = null;
    localStorage.removeItem('activeProfile');
  }

  return { profiles, activeProfile, fetchProfiles, createProfile, setActive, refreshActive, clear };
});
