<template>
  <div class="flex items-center justify-center min-h-[70vh]">
    <div class="card w-full max-w-md">
      <h2 class="text-xl font-semibold mb-1">Create a language profile</h2>
      <p class="text-zinc-500 text-sm mb-6">Tell us what you want to learn</p>

      <form @submit.prevent="handleCreate" class="space-y-5">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Your native language</label>
          <select v-model="nativeLanguage" class="input">
            <option v-for="lang in languages" :key="lang" :value="lang">{{ lang }}</option>
          </select>
        </div>

        <div>
          <label class="block text-xs text-zinc-400 mb-1">Language you want to learn</label>
          <select v-model="targetLanguage" class="input">
            <option v-for="lang in languages.filter(l => l !== nativeLanguage)" :key="lang" :value="lang">{{ lang }}</option>
          </select>
        </div>

        <div>
          <label class="block text-xs text-zinc-400 mb-2">Your current skill level</label>
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <button
              v-for="level in skillLevels"
              :key="level.value"
              type="button"
              @click="skillScore = level.value"
              :class="[
                'rounded border px-2 py-2 text-xs transition-colors',
                skillScore === level.value
                  ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              ]"
            >
              {{ level.label }}
            </button>
          </div>
          <p class="text-xs text-zinc-600 mt-1">Skill score: {{ skillScore }}/100</p>
        </div>

        <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>

        <button type="submit" class="btn-primary w-full" :disabled="loading || !targetLanguage">
          {{ loading ? 'Creating…' : 'Start learning' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useProfileStore } from '../stores/profile.js';

const router = useRouter();
const profile = useProfileStore();

const languages = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
  'Dutch', 'Polish', 'Russian', 'Japanese', 'Chinese (Mandarin)',
  'Korean', 'Arabic', 'Turkish', 'Swedish', 'Norwegian', 'Danish',
  'Finnish', 'Czech', 'Romanian', 'Hungarian',
];

const skillLevels = [
  { label: 'Beginner', value: 0 },
  { label: 'Elementary', value: 20 },
  { label: 'Intermediate', value: 40 },
  { label: 'Upper-Int.', value: 60 },
  { label: 'Advanced', value: 80 },
];

const nativeLanguage = ref('English');
const targetLanguage = ref('Spanish');
const skillScore = ref(0);
const error = ref('');
const loading = ref(false);

async function handleCreate() {
  if (targetLanguage.value === nativeLanguage.value) {
    error.value = 'Target and native languages must be different';
    return;
  }
  error.value = '';
  loading.value = true;
  try {
    await profile.createProfile(targetLanguage.value, nativeLanguage.value, skillScore.value);
    router.push('/type');
  } catch (e) {
    error.value = e.response?.data?.error || 'Failed to create profile';
  } finally {
    loading.value = false;
  }
}
</script>
