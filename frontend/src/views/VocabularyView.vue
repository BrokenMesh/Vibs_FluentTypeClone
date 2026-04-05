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
        <p class="text-sm text-zinc-400">Add a word in <span class="text-brand-400">{{ profile.activeProfile.target_language }}</span></p>
        <div class="flex flex-col sm:flex-row gap-2">
          <input v-model="newWord" class="input flex-1" :placeholder="`Word in ${profile.activeProfile.target_language}`" />
          <input v-model="newTranslation" class="input flex-1" :placeholder="`Translation in ${profile.activeProfile.native_language}`" />
          <button @click="addWord" class="btn-primary whitespace-nowrap" :disabled="addLoading">
            {{ addLoading ? '…' : 'Add' }}
          </button>
        </div>
        <p v-if="addError" class="text-red-400 text-sm">{{ addError }}</p>
      </div>

      <!-- Search -->
      <input v-model="search" class="input" placeholder="search words…" />

      <!-- Loading -->
      <div v-if="loading" class="text-zinc-500 animate-pulse">loading vocabulary…</div>

      <!-- Empty -->
      <div v-else-if="filtered.length === 0" class="text-zinc-600 text-center py-10">
        No words yet. Start typing to build your vocabulary!
      </div>

      <!-- Word list -->
      <div v-else class="space-y-1">
        <div v-for="word in filtered" :key="word.id" class="rounded-lg border border-zinc-800 overflow-hidden">
          <!-- Word row -->
          <div
            class="flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800/60 transition-colors cursor-pointer select-none"
            @click="toggleExpand(word)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <svg
                :class="['h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform', expanded === word.id ? 'rotate-90' : '']"
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              >
                <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd"/>
              </svg>
              <span class="text-zinc-100 font-medium">{{ word.word }}</span>
              <span class="text-zinc-500 text-sm truncate">{{ word.translation }}</span>
            </div>
            <button
              @click.stop="deleteWord(word.id)"
              class="text-zinc-700 hover:text-red-400 transition-colors p-1"
            >✕</button>
          </div>

          <!-- Expanded: sentences -->
          <div v-if="expanded === word.id" class="border-t border-zinc-800 bg-zinc-950 px-4 py-3 space-y-3">
            <div v-if="sentencesLoading" class="text-zinc-600 text-sm animate-pulse">loading sentences…</div>
            <div v-else-if="wordSentences.length === 0" class="text-zinc-700 text-sm">
              No sentences found containing "{{ word.word }}".
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="s in wordSentences"
                :key="s.id"
                class="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-2"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0 space-y-0.5">
                    <p class="text-zinc-500 text-sm">{{ s.source_text }}</p>
                    <p class="text-zinc-100 text-sm">{{ s.target_text }}</p>
                  </div>
                  <div class="shrink-0 text-right space-y-1">
                    <div v-if="s.last_score !== null">
                      <span :class="['text-sm font-medium', s.last_score >= 0.8 ? 'text-brand-400' : s.last_score >= 0.5 ? 'text-yellow-400' : 'text-red-400']">
                        {{ Math.round(s.last_score * 100) }}%
                      </span>
                    </div>
                    <div v-if="s.last_wpm > 0" class="text-xs text-zinc-600">{{ s.last_wpm }} wpm</div>
                  </div>
                </div>
                <div class="flex items-center justify-between gap-2 flex-wrap">
                  <div class="flex items-center gap-3 text-xs">
                    <span v-if="s.next_review" :class="isDue(s.next_review) ? 'text-yellow-400' : 'text-zinc-600'">
                      {{ dueLabel(s.next_review) }}
                    </span>
                    <span v-else-if="s.last_reviewed === null" class="text-blue-400">new</span>
                    <span v-if="s.last_mode" class="text-zinc-700">{{ s.last_mode }}</span>
                  </div>
                  <button
                    v-if="s.last_reviewed !== null"
                    @click="resetSentence(s)"
                    :disabled="resetting === s.id"
                    class="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-700 transition-colors disabled:opacity-40"
                  >
                    {{ resetting === s.id ? '…' : 'reset' }}
                  </button>
                </div>
              </div>
            </div>
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

const expanded = ref(null);
const wordSentences = ref([]);
const sentencesLoading = ref(false);
const resetting = ref(null);

const now = () => Math.floor(Date.now() / 1000);

function isDue(nextReview) {
  return nextReview <= now();
}

function dueLabel(nextReview) {
  const diff = nextReview - now();
  if (diff <= 0) return 'due now';
  const days = Math.round(diff / 86400);
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days}d`;
}

const filtered = computed(() => {
  if (!search.value.trim()) return vocabulary.value;
  const q = search.value.toLowerCase();
  return vocabulary.value.filter(w => w.word.includes(q) || w.translation.toLowerCase().includes(q));
});

async function toggleExpand(word) {
  if (expanded.value === word.id) {
    expanded.value = null;
    wordSentences.value = [];
    return;
  }
  expanded.value = word.id;
  wordSentences.value = [];
  sentencesLoading.value = true;
  try {
    const res = await api.get(`/profiles/${profile.activeProfile.id}/sentences`, {
      params: { contains: word.word },
    });
    wordSentences.value = res.data;
  } catch (e) {
    console.error('Failed to load sentences', e);
  } finally {
    sentencesLoading.value = false;
  }
}

async function resetSentence(s) {
  resetting.value = s.id;
  try {
    await api.delete(`/profiles/${profile.activeProfile.id}/sentences/${s.id}/reviews`);
    s.last_reviewed = null;
    s.last_score = null;
    s.last_wpm = null;
    s.last_mode = null;
    s.next_review = null;
  } catch (e) {
    console.error('Reset failed', e);
  } finally {
    resetting.value = null;
  }
}

async function fetchVocabulary() {
  if (!profile.activeProfile) return;
  loading.value = true;
  try {
    const res = await api.get(`/profiles/${profile.activeProfile.id}/vocabulary`);
    vocabulary.value = res.data;
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
  if (expanded.value === id) { expanded.value = null; wordSentences.value = []; }
  try {
    await api.delete(`/profiles/${profile.activeProfile.id}/vocabulary/${id}`);
    vocabulary.value = vocabulary.value.filter(w => w.id !== id);
  } catch (e) {
    console.error(e);
  }
}

onMounted(fetchVocabulary);
</script>
