<template>
  <div class="space-y-6">
    <!-- No profile -->
    <div v-if="!profile.activeProfile" class="text-center py-20 text-zinc-500">
      <p class="mb-4">No language profile selected.</p>
      <RouterLink to="/profile/new" class="btn-primary">Create a profile</RouterLink>
    </div>

    <!-- Loading sentence -->
    <div v-else-if="loading" class="text-center py-20 text-zinc-500 animate-pulse">
      {{ loadingMessage }}
    </div>

    <!-- Error -->
    <div v-else-if="fetchError" class="text-center py-20">
      <p class="text-red-400 mb-4">{{ fetchError }}</p>
      <button @click="loadSentence" class="btn-ghost">Try again</button>
    </div>

    <!-- Done for today -->
    <div v-else-if="doneForToday" class="text-center py-20 space-y-4">
      <p class="text-2xl">🎉</p>
      <p class="text-zinc-200 text-lg font-medium">All done for today!</p>
      <p class="text-zinc-500 text-sm">You've completed all 10 sentences and cleared your due reviews. Come back tomorrow for a new batch.</p>
      <RouterLink to="/vocabulary" class="btn-ghost inline-block mt-2">Browse vocabulary</RouterLink>
    </div>

    <!-- Results screen -->
    <ResultsScreen
      v-else-if="showResults"
      :score="lastScore"
      :wpm="lastWpm"
      :mode="mode"
      :xp-gained="xpGained"
      :new-skill="newSkill"
      :days-until-review="daysUntilReview"
      :sentence="currentSentence"
      @next="loadSentence"
    />

    <!-- Typing test -->
    <template v-else-if="currentSentence && !doneForToday">
      <!-- Header row -->
      <div class="flex items-center justify-between">
        <div class="flex gap-2">
          <button
            @click="setMode('challenge')"
            :class="['btn text-sm px-3 py-1', mode === 'challenge' ? 'btn-primary' : 'btn-ghost']"
          >challenge</button>
          <button
            @click="setMode('practice')"
            :class="['btn text-sm px-3 py-1', mode === 'practice' ? 'bg-zinc-700 text-zinc-100' : 'btn-ghost']"
          >practice</button>
        </div>
        <div class="text-xs text-zinc-600 flex gap-3 items-center">
          <span v-if="mode === 'challenge' && started">{{ elapsedSeconds }}s</span>
          <span v-if="queue.due > 0" class="text-yellow-500">{{ queue.due }} due</span>
          <span v-if="queue.newToday > 0">{{ queue.newToday }} new</span>
          <span>skill {{ Math.round(profile.activeProfile.skill_score) }}/100</span>
          <span v-if="isReview" class="text-yellow-400">↩ review</span>
        </div>
      </div>


      <!-- Source text (what user reads and translates) -->
      <div class="card">
        <p class="text-xs text-zinc-600 mb-2 uppercase tracking-wider">{{ profile.activeProfile.native_language }} — translate this</p>
        <p class="text-zinc-200 text-lg leading-relaxed">{{ currentSentence.source_text }}</p>
      </div>

      <!-- Practice mode: word progress + hint -->
      <div v-if="mode === 'practice'" class="card space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-xs text-zinc-600 uppercase tracking-wider">
            {{ profile.activeProfile.target_language }} — word {{ practiceWordIndex + 1 }} of {{ targetWords.length }}
          </p>
          <button
            @click="hintVisible = !hintVisible"
            class="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
          >
            {{ hintVisible ? 'hide hint' : 'hint' }}
          </button>
        </div>

        <!-- Word dots progress -->
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="(word, wi) in targetWords"
            :key="wi"
            :class="[
              'h-2 rounded-full transition-all duration-200',
              wi < practiceWordIndex
                ? (wordResults[wi] ? 'bg-brand-500 w-4' : 'bg-red-500 w-4')
                : wi === practiceWordIndex
                  ? 'bg-zinc-400 w-4'
                  : 'bg-zinc-700 w-2'
            ]"
          />
        </div>

        <!-- Hint: show current word -->
        <div v-if="hintVisible" class="text-xl font-medium text-yellow-400 tracking-wide">
          {{ targetWords[practiceWordIndex] }}
        </div>

        <!-- Past word results -->
        <div v-if="practiceWordIndex > 0" class="flex flex-wrap gap-2 text-sm">
          <span
            v-for="(word, wi) in targetWords.slice(0, practiceWordIndex)"
            :key="wi"
            :class="wordResults[wi] ? 'text-brand-400' : 'text-red-400 line-through'"
          >{{ word }}</span>
        </div>
      </div>

      <!-- Challenge mode: just a label, no target text shown -->
      <div v-else class="card">
        <p class="text-xs text-zinc-600 uppercase tracking-wider">
          {{ profile.activeProfile.target_language }} — type your translation
        </p>
        <p class="text-zinc-700 text-sm mt-2 italic">translate from memory, then press Enter</p>
      </div>

      <!-- Input area -->
      <div class="relative">
        <input
          ref="inputEl"
          v-model="userInput"
          @input="handleInput"
          @keydown.enter="handleEnter"
          @keydown="handleKeydown"
          :disabled="finished"
          :placeholder="mode === 'practice' ? 'type word, press Space…' : 'type full translation, press Enter…'"
          class="input text-lg py-4 pr-24 focus:ring-2"
          :class="inputClass"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-600">
          {{ mode === 'challenge' ? 'Enter ↵' : 'Space →' }}
        </span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';
import api from '../api/index.js';
import { useProfileStore } from '../stores/profile.js';
import ResultsScreen from '../components/ResultsScreen.vue';

const profile = useProfileStore();

const loading = ref(false);
const loadingMessage = ref('generating sentence…');
const fetchError = ref('');
const currentSentence = ref(null);
const isReview = ref(false);
const doneForToday = ref(false);
const queue = ref({ due: 0, newToday: 0 });
const mode = ref('challenge');
const userInput = ref('');
const inputEl = ref(null);
const started = ref(false);
const finished = ref(false);
const showResults = ref(false);
const hintVisible = ref(false);

// Timer
const startTime = ref(null);
const elapsedSeconds = ref(0);
let timerInterval = null;

// Practice mode tracking
const practiceWordIndex = ref(0);
const wordResults = ref([]);

// Results
const lastScore = ref(0);
const lastWpm = ref(0);
const xpGained = ref(0);
const newSkill = ref(0);
const daysUntilReview = ref(1);

const targetWords = computed(() =>
  currentSentence.value ? currentSentence.value.target_text.split(/\s+/) : []
);

const inputClass = computed(() => {
  if (!started.value || mode.value !== 'challenge') return '';
  const typed = userInput.value;
  const target = currentSentence.value?.target_text ?? '';
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] !== target[i]) return 'border-red-600 focus:ring-red-600';
  }
  return 'border-brand-700 focus:ring-brand-500';
});

function setMode(m) {
  mode.value = m;
  resetState();
}

function resetState() {
  userInput.value = '';
  started.value = false;
  finished.value = false;
  practiceWordIndex.value = 0;
  wordResults.value = [];
  elapsedSeconds.value = 0;
  startTime.value = null;
  hintVisible.value = false;
  clearInterval(timerInterval);
  nextTick(() => inputEl.value?.focus());
}

function startTimer() {
  startTime.value = Date.now();
  timerInterval = setInterval(() => {
    elapsedSeconds.value = Math.floor((Date.now() - startTime.value) / 1000);
  }, 1000);
}

function handleInput() {
  if (finished.value) return;
  if (!started.value && userInput.value.length > 0) {
    started.value = true;
    if (mode.value === 'challenge') startTimer();
  }
}

function handleEnter() {
  if (mode.value !== 'challenge' || finished.value) return;
  submitChallenge();
}

// Handle space key: only intercept in practice mode
function handleKeydown(e) {
  if (e.key === ' ' && mode.value === 'practice' && !finished.value) {
    e.preventDefault();
    if (!started.value) started.value = true;
    submitPracticeWord();
  }
}

function submitChallenge() {
  const typed = userInput.value;
  const target = currentSentence.value.target_text;
  clearInterval(timerInterval);

  const correctChars = [...typed].filter((c, i) => c === target[i]).length;
  const score = target.length > 0 ? correctChars / target.length : 0;
  const elapsed = (Date.now() - (startTime.value || Date.now())) / 1000 / 60;
  const wpm = elapsed > 0 ? Math.round(typed.split(/\s+/).length / elapsed) : 0;

  finished.value = true;
  submitReview(score, wpm);
}

function submitPracticeWord() {
  const currentWord = targetWords.value[practiceWordIndex.value];
  const typed = userInput.value.trim();
  const correct = typed.toLowerCase() === currentWord.toLowerCase();

  wordResults.value.push(correct);
  userInput.value = '';
  hintVisible.value = false;
  practiceWordIndex.value++;

  if (practiceWordIndex.value >= targetWords.value.length) {
    const score = wordResults.value.filter(Boolean).length / wordResults.value.length;
    finished.value = true;
    submitReview(score, 0);
  }
}

async function submitReview(score, wpm) {
  lastScore.value = score;
  lastWpm.value = wpm;
  try {
    const res = await api.post(
      `/profiles/${profile.activeProfile.id}/sentences/${currentSentence.value.id}/review`,
      { mode: mode.value, score, wpm }
    );
    xpGained.value = res.data.xpGained ?? 0;
    newSkill.value = res.data.newSkillScore ?? profile.activeProfile.skill_score;
    daysUntilReview.value = res.data.daysUntilReview ?? 1;
    await profile.refreshActive();
  } catch (e) {
    console.error('Review submit failed', e);
  }
  showResults.value = true;
}

async function fetchQueue() {
  if (!profile.activeProfile) return;
  try {
    const res = await api.get(`/profiles/${profile.activeProfile.id}/sentences/queue`);
    queue.value = res.data;
  } catch { /* non-critical */ }
}

async function loadSentence() {
  if (!profile.activeProfile) return;
  showResults.value = false;
  doneForToday.value = false;
  loading.value = true;
  loadingMessage.value = 'loading next sentence…';
  fetchError.value = '';
  try {
    // Refresh queue counts in parallel with loading the sentence
    const [res] = await Promise.all([
      api.get(`/profiles/${profile.activeProfile.id}/sentences/next`),
      fetchQueue(),
    ]);
    if (res.data.done) {
      doneForToday.value = true;
      return;
    }
    currentSentence.value = res.data.sentence;
    isReview.value = res.data.isReview;
    // Decrement count optimistically so header updates immediately
    if (isReview.value) queue.value.due = Math.max(0, (queue.value.due ?? 1) - 1);
    else queue.value.newToday = Math.max(0, (queue.value.newToday ?? 1) - 1);
    resetState();
  } catch (e) {
    fetchError.value = e.response?.data?.error || 'Failed to load sentence';
  } finally {
    loading.value = false;
  }
}

watch(() => profile.activeProfile?.id, (id) => { if (id) loadSentence(); }, { immediate: true });

onUnmounted(() => clearInterval(timerInterval));
</script>
