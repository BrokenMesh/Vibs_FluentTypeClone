<template>
  <div class="space-y-6">
    <!-- No profile -->
    <div v-if="!profile.activeProfile && !loading" class="text-center py-20 space-y-4">
      <p class="text-zinc-400 text-lg">Welcome to <span class="text-brand-400">FluentType</span></p>
      <p class="text-zinc-600">Start by creating a language profile.</p>
      <RouterLink to="/profile/new" class="btn-primary inline-block">Create profile</RouterLink>
    </div>

    <template v-else-if="profile.activeProfile">
      <!-- Profile header -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-xl font-semibold">
              {{ profile.activeProfile.native_language }}
              <span class="text-zinc-600 mx-2">→</span>
              <span class="text-brand-400">{{ profile.activeProfile.target_language }}</span>
            </h2>
            <p class="text-xs text-zinc-600 mt-0.5">{{ skillLabel }}</p>
          </div>
          <RouterLink to="/profile/new" class="text-xs text-zinc-600 hover:text-zinc-400">+ new profile</RouterLink>
        </div>

        <!-- Skill bar -->
        <div class="space-y-1">
          <div class="flex justify-between text-xs text-zinc-500">
            <span>skill</span>
            <span>{{ Math.round(profile.activeProfile.skill_score) }} / 100</span>
          </div>
          <div class="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-brand-500 rounded-full transition-all duration-700"
              :style="{ width: profile.activeProfile.skill_score + '%' }"
            />
          </div>
        </div>

        <!-- XP -->
        <div class="mt-3 text-sm text-zinc-500">
          <span class="text-brand-400 font-medium">{{ profile.activeProfile.xp }}</span> total XP
        </div>
      </div>

      <!-- Word of the day -->
      <div v-if="queue.dailyWord" class="card flex items-center justify-between">
        <div>
          <p class="text-xs text-zinc-600 uppercase tracking-wider mb-1">word of the day</p>
          <p class="text-2xl font-semibold text-brand-400">{{ queue.dailyWord.word }}</p>
          <p class="text-zinc-500 text-sm mt-0.5">{{ queue.dailyWord.translation }}</p>
        </div>
        <div class="text-right text-xs text-zinc-600 space-y-1">
          <div>{{ queue.totalToday }}/{{ queue.dailyBatchSize }} sentences today</div>
          <div v-if="queue.due > 0" class="text-yellow-500">{{ queue.due }} review{{ queue.due !== 1 ? 's' : '' }} due</div>
        </div>
      </div>

      <!-- Stats grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="vocab words" :value="stats.vocabCount" />
        <StatCard label="sentences done" :value="stats.sentenceCount" />
        <StatCard label="reviews due" :value="stats.dueCount" color="yellow" />
        <StatCard label="avg accuracy" :value="stats.avgAccuracy !== null ? Math.round(stats.avgAccuracy * 100) + '%' : '—'" />
      </div>

      <!-- Profile switcher (if multiple) -->
      <div v-if="profile.profiles.length > 1" class="card">
        <p class="text-xs text-zinc-600 mb-3 uppercase tracking-wider">Your profiles</p>
        <div class="space-y-2">
          <button
            v-for="p in profile.profiles"
            :key="p.id"
            @click="profile.setActive(p)"
            :class="[
              'w-full text-left flex items-center justify-between px-3 py-2 rounded border transition-colors',
              p.id === profile.activeProfile.id
                ? 'border-brand-700 bg-brand-500/5'
                : 'border-zinc-800 hover:border-zinc-700'
            ]"
          >
            <span>{{ p.native_language }} → <span class="text-brand-400">{{ p.target_language }}</span></span>
            <span class="text-xs text-zinc-600">skill {{ Math.round(p.skill_score) }}</span>
          </button>
        </div>
      </div>

      <!-- CTA -->
      <div class="flex gap-3">
        <RouterLink to="/type" class="btn-primary flex-1 text-center">start typing</RouterLink>
        <RouterLink to="/vocabulary" class="btn-ghost flex-1 text-center">vocabulary</RouterLink>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import api from '../api/index.js';
import { useProfileStore } from '../stores/profile.js';
import StatCard from '../components/StatCard.vue';

const profile = useProfileStore();
const loading = ref(false);
const stats = ref({ vocabCount: 0, sentenceCount: 0, dueCount: 0, avgAccuracy: null });
const queue = ref({ dailyWord: null, due: 0, totalToday: 0, dailyBatchSize: 10 });

const skillLabel = computed(() => {
  const s = profile.activeProfile?.skill_score ?? 0;
  if (s < 20) return 'Absolute beginner';
  if (s < 40) return 'Beginner';
  if (s < 60) return 'Elementary';
  if (s < 80) return 'Intermediate';
  return 'Upper-intermediate';
});

async function fetchStats() {
  if (!profile.activeProfile) return;
  const profileId = profile.activeProfile.id;
  const now = Math.floor(Date.now() / 1000);

  const [vocabRes, sentenceRes, queueRes] = await Promise.all([
    api.get(`/profiles/${profileId}/vocabulary`),
    api.get(`/profiles/${profileId}/sentences`),
    api.get(`/profiles/${profileId}/sentences/queue`),
  ]);
  queue.value = queueRes.data;

  const vocab = vocabRes.data;
  const sentences = sentenceRes.data;

  const scores = sentences.filter(s => s.last_score !== null).map(s => s.last_score);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  stats.value = {
    vocabCount: vocab.length,
    sentenceCount: sentences.length,
    dueCount: queueRes.data.due,   // sentence reviews due, not vocab
    avgAccuracy: avg,
  };
}

onMounted(async () => {
  loading.value = true;
  try {
    await profile.fetchProfiles();
    if (profile.profiles.length > 0 && !profile.activeProfile) {
      profile.setActive(profile.profiles[0]);
    }
    await fetchStats();
  } finally {
    loading.value = false;
  }
});
</script>
