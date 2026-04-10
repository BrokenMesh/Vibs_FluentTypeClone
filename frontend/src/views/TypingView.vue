<template>
  <div class="space-y-3 sm:space-y-6">
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
      :native-lang="profile.activeProfile?.native_language"
      :target-lang="profile.activeProfile?.target_language"
      :profile-id="profile.activeProfile?.id"
      :user-typed="userTyped"
      :typed-words="typedWords"
      :target-words-arr="targetWords"
      :word-results-arr="wordResults"
      @next="loadSentence"
    />

    <!-- Typing test -->
    <template v-else-if="currentSentence && !doneForToday">
      <!-- Header row -->
      <div class="flex flex-wrap items-center justify-between gap-2">
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
        <div class="flex flex-wrap gap-2 items-center">
          <span v-if="mode === 'challenge' && started" class="text-xs text-zinc-600">{{ elapsedSeconds }}s</span>
          <span class="text-xs font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{{ effectiveNew }} new</span>
          <span class="text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">{{ effectiveDue }} due</span>
          <span class="text-xs text-zinc-600">{{ skillDisplay }}</span>
          <span v-if="isReview" class="text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">↩ review</span>
          <span v-else class="text-xs font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">✦ new</span>
          <button @click="delayCard" class="text-xs text-zinc-700 hover:text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-800 hover:border-zinc-600 transition-colors">delay →</button>
        </div>
      </div>


      <!-- Source text (what user reads and translates) -->
      <div class="card !p-3 sm:!p-4 md:!p-6">
        <div class="flex items-center justify-between mb-1.5">
          <p class="text-xs text-zinc-600 uppercase tracking-wider">{{ profile.activeProfile.native_language }} — translate this</p>
          <button
            @click="speak"
            title="Listen to pronunciation"
            class="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
              <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>
        <p class="text-zinc-200 text-base sm:text-lg leading-snug sm:leading-relaxed">{{ currentSentence.source_text }}</p>
      </div>

      <!-- Practice mode: word progress + hint -->
      <div v-if="mode === 'practice'" class="card !p-3 sm:!p-4 md:!p-6 space-y-2 sm:space-y-3">
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
      <div v-else class="card !p-3 sm:!p-4 md:!p-6">
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
          class="input text-base sm:text-lg py-3 sm:py-4 pr-24 focus:ring-2"
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

import { cefrOf, cefrNext, ptsToNext } from '../utils/cefr.js';
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
const queue = ref({ typing: { due: 0, new: 0 }, dictation: { due: 0, new: 0 }, limits: { dailyNewLimit: 10, dailyDueLimit: 30 }, todayProgress: { typing: { new: 0, due: 0 }, dictation: { new: 0, due: 0 } } });

const effectiveNew = computed(() => {
  const lim = queue.value.limits?.dailyNewLimit ?? 10;
  const done = queue.value.todayProgress?.typing?.new ?? 0;
  return Math.min(queue.value.typing?.new ?? 0, Math.max(0, lim - done));
});
const effectiveDue = computed(() => {
  const lim = queue.value.limits?.dailyDueLimit ?? 30;
  const done = queue.value.todayProgress?.typing?.due ?? 0;
  return Math.min(queue.value.typing?.due ?? 0, Math.max(0, lim - done));
});
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
const typedWords = ref([]);   // what user actually typed per word

// Challenge mode — store raw typed string for results diff
const userTyped = ref('');

// Results
const lastScore = ref(0);
const lastWpm = ref(0);
const xpGained = ref(0);
const newSkill = ref(0);
const daysUntilReview = ref(1);

const cefrLevel = computed(() => cefrOf(profile.activeProfile?.skill_score ?? 0).label);
const skillDisplay = computed(() => {
  const s = profile.activeProfile?.skill_score ?? 0;
  const pts = ptsToNext(s);
  const next = cefrNext(s);
  return pts !== null ? `${cefrLevel.value} · ${Math.ceil(pts)} to ${next.label}` : 'C2';
});

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
  userTyped.value = '';
  typedWords.value = [];
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
  // Mobile fallback: virtual keyboards don't reliably fire keydown for space
  if (mode.value === 'practice' && userInput.value.endsWith(' ')) {
    userInput.value = userInput.value.trimEnd();
    submitPracticeWord();
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
  userTyped.value = typed;

  // 10 mistakes = 0%, 0 mistakes = 100%
  const mistakes = [...target].filter((c, i) => typed[i] !== c).length;
  const score = Math.max(0, 1 - mistakes / 10);

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
  typedWords.value.push(typed);
  userInput.value = '';
  hintVisible.value = false;
  practiceWordIndex.value++;

  if (practiceWordIndex.value >= targetWords.value.length) {
    const mistakes = wordResults.value.filter(r => !r).length;
    const score = Math.max(0, 1 - mistakes / 10);
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
      api.get(`/profiles/${profile.activeProfile.id}/sentences/next?track=typing`),
      fetchQueue(),
    ]);
    if (res.data.done) {
      doneForToday.value = true;
      return;
    }
    currentSentence.value = res.data.sentence;
    isReview.value = res.data.isReview;
    // Decrement count optimistically so header updates immediately
    if (isReview.value) {
      queue.value.typing.due = Math.max(0, (queue.value.typing?.due ?? 1) - 1);
      if (queue.value.todayProgress?.typing) queue.value.todayProgress.typing.due++;
    } else {
      queue.value.typing.new = Math.max(0, (queue.value.typing?.new ?? 1) - 1);
      if (queue.value.todayProgress?.typing) queue.value.todayProgress.typing.new++;
    }
    resetState();
  } catch (e) {
    fetchError.value = e.response?.data?.error || 'Failed to load sentence';
  } finally {
    loading.value = false;
  }
}

// TTS — map display language names to BCP-47 codes
const LANG_CODES = {
  german: 'de-DE', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
  portuguese: 'pt-PT', dutch: 'nl-NL', russian: 'ru-RU', japanese: 'ja-JP',
  chinese: 'zh-CN', korean: 'ko-KR', arabic: 'ar-SA', turkish: 'tr-TR',
  polish: 'pl-PL', swedish: 'sv-SE', norwegian: 'nb-NO', danish: 'da-DK',
  finnish: 'fi-FI', greek: 'el-GR', czech: 'cs-CZ', hungarian: 'hu-HU',
  english: 'en-US',
};

function langCode(name) {
  return LANG_CODES[name?.toLowerCase()] ?? name;
}

function speak() {
  if (!window.speechSynthesis || !currentSentence.value) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(currentSentence.value.source_text);
  utt.lang = langCode(profile.activeProfile?.native_language);
  window.speechSynthesis.speak(utt);
}

async function delayCard() {
  if (!currentSentence.value) return;
  try {
    await api.post(`/profiles/${profile.activeProfile.id}/sentences/${currentSentence.value.id}/delay`, { track: 'typing' });
  } catch (e) {
    console.error('Delay failed', e);
  }
  loadSentence();
}

watch(() => profile.activeProfile?.id, (id) => { if (id) loadSentence(); }, { immediate: true });

onUnmounted(() => clearInterval(timerInterval));
</script>
