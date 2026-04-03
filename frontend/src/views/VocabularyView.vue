<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Vocabulary</h1>
      <button @click="showAdd = !showAdd" class="btn-primary text-sm">+ add word</button>
    </div>

    <!-- No profile -->
    <div v-if="!profile.activeProfile" class="text-zinc-500 text-center py-10">
      <RouterLink to="/profile/new" class="text-brand-400">Create a profile</RouterLink> first.
    </div>

    <template v-else>
      <!-- Add form -->
      <div v-if="showAdd" class="card space-y-3">
        <p class="text-sm text-zinc-400">Add a word in <span class="text-brand-400">{{ profile.activeProfile.target_language }}</span> that you've learned</p>
        <div class="flex gap-2">
          <input v-model="newWord" class="input flex-1" :placeholder="`Word in ${profile.activeProfile.target_language}`" />
          <input v-model="newTranslation" class="input flex-1" :placeholder="`Translation in ${profile.activeProfile.native_language}`" />
          <button @click="addWord" class="btn-primary whitespace-nowrap" :disabled="addLoading">
            {{ addLoading ? '…' : 'Add' }}
          </button>
        </div>
        <p v-if="addError" class="text-red-400 text-sm">{{ addError }}</p>
      </div>

      <!-- Filter / search -->
      <div class="flex gap-2 items-center">
        <input v-model="search" class="input max-w-xs" placeholder="search…" />
        <select v-model="sortBy" class="input max-w-xs">
          <option value="created_at">recent</option>
          <option value="times_seen">most seen</option>
          <option value="accuracy">accuracy</option>
          <option value="next_review">due</option>
        </select>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-zinc-500 animate-pulse">loading vocabulary…</div>

      <!-- Empty -->
      <div v-else-if="filtered.length === 0" class="text-zinc-600 text-center py-10">
        No words yet. Start typing to build your vocabulary!
      </div>

      <!-- Word list -->
      <div v-else class="space-y-2">
        <div
          v-for="word in filtered"
          :key="word.id"
          class="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 hover:border-zinc-700 transition-colors"
        >
          <div class="flex items-center gap-4 min-w-0">
            <div>
              <span class="text-zinc-100 font-medium">{{ word.word }}</span>
              <span class="text-zinc-500 text-sm ml-2">{{ word.translation }}</span>
            </div>
          </div>
          <div class="flex items-center gap-4 text-xs text-zinc-600 shrink-0">
            <span title="accuracy">
              {{ word.times_seen > 0 ? Math.round(word.times_correct / word.times_seen * 100) : '—' }}%
            </span>
            <span title="times seen">× {{ word.times_seen }}</span>
            <span
              :class="isDue(word) ? 'text-yellow-500' : 'text-zinc-700'"
              title="next review"
            >
              {{ dueLabel(word) }}
            </span>
            <span class="text-xs px-1.5 py-0.5 rounded" :class="word.source === 'manual' ? 'bg-zinc-800 text-zinc-400' : 'text-zinc-700'">
              {{ word.source }}
            </span>
            <button @click="deleteWord(word.id)" class="text-zinc-700 hover:text-red-400 transition-colors">✕</button>
          </div>
        </div>
      </div>

      <p class="text-xs text-zinc-700 text-right">{{ vocabulary.length }} words total</p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import api from '../api/index.js';
import { useProfileStore } from '../stores/profile.js';

const profile = useProfileStore();
const vocabulary = ref([]);
const loading = ref(false);
const showAdd = ref(false);
const newWord = ref('');
const newTranslation = ref('');
const addLoading = ref(false);
const addError = ref('');
const search = ref('');
const sortBy = ref('created_at');

const now = Math.floor(Date.now() / 1000);

function isDue(word) {
  return word.next_review <= now && word.times_seen > 0;
}

function dueLabel(word) {
  if (word.times_seen === 0) return 'new';
  if (isDue(word)) return 'due';
  const days = Math.ceil((word.next_review - now) / 86400);
  return `in ${days}d`;
}

const filtered = computed(() => {
  let list = vocabulary.value;
  if (search.value.trim()) {
    const q = search.value.toLowerCase();
    list = list.filter(w => w.word.includes(q) || w.translation.toLowerCase().includes(q));
  }
  return [...list].sort((a, b) => {
    if (sortBy.value === 'times_seen') return b.times_seen - a.times_seen;
    if (sortBy.value === 'accuracy') {
      const accA = a.times_seen ? a.times_correct / a.times_seen : 0;
      const accB = b.times_seen ? b.times_correct / b.times_seen : 0;
      return accB - accA;
    }
    if (sortBy.value === 'next_review') return a.next_review - b.next_review;
    return b.id - a.id;
  });
});

async function fetchVocabulary() {
  if (!profile.activeProfile) return;
  loading.value = true;
  try {
    const res = await api.get(`/profiles/${profile.activeProfile.id}/vocabulary`);
    vocabulary.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function addWord() {
  addError.value = '';
  if (!newWord.value.trim() || !newTranslation.value.trim()) {
    addError.value = 'Both fields are required';
    return;
  }
  addLoading.value = true;
  try {
    const res = await api.post(`/profiles/${profile.activeProfile.id}/vocabulary`, {
      word: newWord.value.trim(),
      translation: newTranslation.value.trim(),
    });
    vocabulary.value.unshift(res.data);
    newWord.value = '';
    newTranslation.value = '';
    showAdd.value = false;
  } catch (e) {
    addError.value = e.response?.data?.error || 'Failed to add word';
  } finally {
    addLoading.value = false;
  }
}

async function deleteWord(id) {
  try {
    await api.delete(`/profiles/${profile.activeProfile.id}/vocabulary/${id}`);
    vocabulary.value = vocabulary.value.filter(w => w.id !== id);
  } catch (e) {
    console.error(e);
  }
}

onMounted(fetchVocabulary);
</script>
