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
            <p class="text-xs text-zinc-600 mt-0.5">
              <span class="text-brand-400 font-medium">{{ cefrLevel }}</span> — {{ skillLabel }}
            </p>
          </div>
          <RouterLink to="/profile/new" class="text-xs text-zinc-600 hover:text-zinc-400">+ new profile</RouterLink>
        </div>

        <!-- Skill bar — progress within current CEFR level -->
        <div class="space-y-1">
          <div class="flex justify-between text-xs text-zinc-500">
            <span>{{ cefrLevel }}</span>
            <span class="text-zinc-600">{{ nextLabel }}</span>
          </div>
          <div class="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-brand-500 rounded-full transition-all duration-700"
              :style="{ width: barWidth + '%' }"
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
        <div class="flex flex-col items-end gap-2">
          <div class="text-xs text-zinc-600">{{ queue.totalToday }}/{{ queue.dailyBatchSize }} today</div>
          <div class="flex gap-1.5">
            <span class="text-xs font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{{ queue.newToday ?? 0 }} new</span>
            <span class="text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">{{ queue.due ?? 0 }} due</span>
          </div>
        </div>
      </div>

      <!-- Stats grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="streak" :value="streak + (streak === 1 ? ' day' : ' days')" color="brand" />
        <StatCard label="sentences done" :value="stats.sentenceCount" />
        <StatCard label="reviews due" :value="stats.dueCount" color="yellow" />
        <StatCard label="avg accuracy" :value="stats.avgAccuracy !== null ? Math.round(stats.avgAccuracy * 100) + '%' : '—'" />
      </div>

      <!-- Activity grid -->
      <div class="card space-y-2">
        <p class="text-xs text-zinc-600 uppercase tracking-wider">activity — last 16 weeks</p>
        <div class="flex gap-1 overflow-x-auto pb-1">
          <div v-for="(week, wi) in activityGrid" :key="wi" class="flex flex-col gap-1">
            <div
              v-for="(day, di) in week"
              :key="di"
              :title="day.date + ': ' + day.count + ' review' + (day.count !== 1 ? 's' : '')"
              :class="['w-3 h-3 rounded-sm flex-shrink-0', activityColor(day.count)]"
            />
          </div>
        </div>
        <div class="flex justify-between text-xs text-zinc-700">
          <span>16 weeks ago</span>
          <span>today</span>
        </div>
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
        <RouterLink to="/dictate" class="flex-1 text-center btn text-sm font-medium px-4 py-2 rounded-lg border border-purple-700 text-purple-400 hover:bg-purple-500/10 transition-colors">dictation</RouterLink>
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
import { cefrOf, cefrNext, ptsToNext, levelProgress } from '../utils/cefr.js';

const profile = useProfileStore();
const loading = ref(false);
const stats = ref({ vocabCount: 0, sentenceCount: 0, dueCount: 0, avgAccuracy: null });
const queue = ref({ dailyWord: null, due: 0, totalToday: 0, dailyBatchSize: 10 });
const activityMap = ref({});

// Build a 16-week (112-day) grid: array of 16 weeks, each with 7 day cells
const activityGrid = computed(() => {
  const today = new Date();
  const msPerDay = 86400000;
  const days = [];
  for (let i = 111; i >= 0; i--) {
    const d = new Date(today.getTime() - i * msPerDay);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: activityMap.value[key] ?? 0 });
  }
  const weeks = [];
  for (let w = 0; w < 16; w++) weeks.push(days.slice(w * 7, w * 7 + 7));
  return weeks;
});

const streak = computed(() => {
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;
  let d = new Date();
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (!activityMap.value[key] || activityMap.value[key] === 0) {
      // Allow today to be empty (session just started)
      if (key === today && count === 0) { d.setDate(d.getDate() - 1); continue; }
      break;
    }
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
});

function activityColor(count) {
  if (count === 0) return 'bg-zinc-800';
  if (count <= 2) return 'bg-brand-900';
  if (count <= 5) return 'bg-brand-600';
  if (count <= 9) return 'bg-brand-500';
  return 'bg-brand-400';
}

const score = computed(() => profile.activeProfile?.skill_score ?? 0);
const cefrLevel = computed(() => cefrOf(score.value).label);
const skillLabel = computed(() => cefrOf(score.value).name);
const barWidth = computed(() => levelProgress(score.value) / 10); // 0–100 for CSS %
const nextLabel = computed(() => {
  const pts = ptsToNext(score.value);
  const next = cefrNext(score.value);
  return pts !== null ? `${Math.ceil(pts)} pts to ${next.label}` : 'C2 — mastered';
});

async function fetchStats() {
  if (!profile.activeProfile) return;
  const profileId = profile.activeProfile.id;

  const [vocabRes, sentenceRes, queueRes, activityRes] = await Promise.all([
    api.get(`/profiles/${profileId}/vocabulary`),
    api.get(`/profiles/${profileId}/sentences`),
    api.get(`/profiles/${profileId}/sentences/queue`),
    api.get(`/profiles/${profileId}/sentences/activity`),
  ]);
  queue.value = queueRes.data;
  activityMap.value = activityRes.data;

  const vocab = vocabRes.data;
  const sentences = sentenceRes.data;

  const scores = sentences.filter(s => s.last_score !== null).map(s => s.last_score);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  stats.value = {
    vocabCount: vocab.length,
    sentenceCount: sentences.length,
    dueCount: queueRes.data.due,
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
