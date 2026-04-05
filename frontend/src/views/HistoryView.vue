<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold">Sentence History</h1>

    <div v-if="!profile.activeProfile" class="text-zinc-500 text-center py-10">
      <RouterLink to="/profile/new" class="text-brand-400">Create a profile</RouterLink> first.
    </div>

    <div v-else-if="loading" class="text-zinc-500 animate-pulse">loading…</div>

    <div v-else-if="sentences.length === 0" class="text-zinc-600 text-center py-10">
      No sentences yet. <RouterLink to="/type" class="text-brand-400">Start typing!</RouterLink>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="s in sentences"
        :key="s.id"
        class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2 hover:border-zinc-700 transition-colors"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-zinc-500 text-sm">{{ s.source_text }}</p>
            <p class="text-zinc-100 mt-0.5">{{ s.target_text }}</p>
          </div>
          <div class="text-right shrink-0 space-y-1">
            <div v-if="s.last_score !== null">
              <span
                :class="[
                  'text-sm font-medium',
                  s.last_score >= 0.8 ? 'text-brand-400' : s.last_score >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                ]"
              >{{ Math.round(s.last_score * 100) }}%</span>
            </div>
            <div v-if="s.last_wpm > 0" class="text-xs text-zinc-600">{{ s.last_wpm }} wpm</div>
            <div v-if="s.last_mode" class="text-xs text-zinc-700">{{ s.last_mode }}</div>
          </div>
        </div>

        <!-- Due date + meta row -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-3 text-xs text-zinc-700">
            <span>difficulty {{ Math.round(s.difficulty) }}/100</span>
            <span>{{ s.word_count }} words</span>
            <span v-if="s.last_reviewed">reviewed {{ formatDate(s.last_reviewed) }}</span>
            <!-- Due date badge -->
            <span v-if="s.next_review" :class="dueBadgeClass(s.next_review)">
              {{ dueLabel(s.next_review) }}
            </span>
            <span v-else class="text-blue-400">new — not yet reviewed</span>
          </div>
          <!-- Reset button (only if reviewed) -->
          <button
            v-if="s.last_reviewed"
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
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import api from '../api/index.js';
import { useProfileStore } from '../stores/profile.js';

const profile = useProfileStore();
const sentences = ref([]);
const loading = ref(false);
const resetting = ref(null);

const now = () => Math.floor(Date.now() / 1000);

function formatDate(ts) {
  return new Date(ts * 1000).toLocaleDateString();
}

function dueLabel(nextReview) {
  const diff = nextReview - now();
  if (diff <= 0) return 'due now';
  const days = Math.round(diff / 86400);
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days}d`;
}

function dueBadgeClass(nextReview) {
  const diff = nextReview - now();
  if (diff <= 0) return 'text-yellow-400';
  return 'text-zinc-500';
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

onMounted(async () => {
  if (!profile.activeProfile) return;
  loading.value = true;
  try {
    const res = await api.get(`/profiles/${profile.activeProfile.id}/sentences`);
    sentences.value = res.data;
  } finally {
    loading.value = false;
  }
});
</script>
