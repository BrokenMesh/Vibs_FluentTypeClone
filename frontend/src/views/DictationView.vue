<template>
  <div class="space-y-6">
    <!-- No profile -->
    <div v-if="!profile.activeProfile" class="text-center py-20 text-zinc-500">
      <p class="mb-4">No language profile selected.</p>
      <RouterLink to="/profile/new" class="btn-primary">Create a profile</RouterLink>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="text-center py-20 text-zinc-500 animate-pulse">
      loading sentence…
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
      <p class="text-zinc-500 text-sm">Come back tomorrow for a new batch.</p>
      <RouterLink to="/dashboard" class="btn-ghost inline-block mt-2">Back to dashboard</RouterLink>
    </div>

    <!-- Results screen -->
    <ResultsScreen
      v-else-if="showResults"
      :score="lastScore"
      :wpm="0"
      mode="dictation"
      :xp-gained="xpGained"
      :new-skill="newSkill"
      :days-until-review="daysUntilReview"
      :sentence="currentSentence"
      :native-lang="profile.activeProfile?.native_language"
      :target-lang="profile.activeProfile?.target_language"
      :profile-id="profile.activeProfile?.id"
      :user-typed="userTyped"
      :typed-words="[]"
      :target-words-arr="[]"
      :word-results-arr="[]"
      @next="loadSentence"
    />

    <!-- Dictation test -->
    <template v-else-if="currentSentence">
      <!-- Header row -->
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
            dictation
          </span>
          <span class="text-xs text-zinc-600">1.5× points</span>
        </div>
        <div class="flex flex-wrap gap-2 items-center">
          <span v-if="started" class="text-xs text-zinc-600">{{ elapsedSeconds }}s</span>
          <span class="text-xs font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{{ queue.newToday ?? 0 }} new</span>
          <span class="text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">{{ queue.due ?? 0 }} due</span>
          <span v-if="isReview" class="text-xs text-yellow-400">↩ review</span>
          <button @click="delayCard" class="text-xs text-zinc-700 hover:text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-800 hover:border-zinc-600 transition-colors">delay →</button>
        </div>
      </div>

      <!-- Listen card -->
      <div class="card text-center space-y-6 py-8">
        <div>
          <p class="text-xs text-zinc-600 uppercase tracking-wider mb-1">
            {{ profile.activeProfile.target_language }} — listen and type what you hear
          </p>
          <p class="text-zinc-700 text-sm mt-1">no peeking — type the sentence you hear</p>
        </div>

        <!-- Big play button -->
        <button
          @click="playAudio"
          :class="[
            'mx-auto flex items-center justify-center w-20 h-20 rounded-full transition-all duration-200',
            playing
              ? 'bg-purple-500/20 text-purple-300 scale-110'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 hover:scale-105'
          ]"
          title="Play sentence"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
            <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>

        <p class="text-xs text-zinc-700">tap to replay anytime</p>
      </div>

      <!-- Input area -->
      <div class="relative">
        <input
          ref="inputEl"
          v-model="userInput"
          @input="handleInput"
          @keydown.enter="submitDictation"
          :disabled="finished"
          placeholder="type what you heard, press Enter…"
          class="input text-lg py-4 pr-24 focus:ring-2"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-600">Enter ↵</span>
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
const fetchError = ref('');
const currentSentence = ref(null);
const isReview = ref(false);
const doneForToday = ref(false);
const queue = ref({ due: 0, newToday: 0 });
const userInput = ref('');
const inputEl = ref(null);
const started = ref(false);
const finished = ref(false);
const showResults = ref(false);
const playing = ref(false);

const startTime = ref(null);
const elapsedSeconds = ref(0);
let timerInterval = null;

const userTyped = ref('');
const lastScore = ref(0);
const xpGained = ref(0);
const newSkill = ref(0);
const daysUntilReview = ref(1);

// TTS
const LANG_CODES = {
  german: 'de-DE', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
  portuguese: 'pt-PT', dutch: 'nl-NL', russian: 'ru-RU', japanese: 'ja-JP',
  chinese: 'zh-CN', korean: 'ko-KR', arabic: 'ar-SA', turkish: 'tr-TR',
  polish: 'pl-PL', swedish: 'sv-SE', norwegian: 'nb-NO', danish: 'da-DK',
  finnish: 'fi-FI', greek: 'el-GR', czech: 'cs-CZ', hungarian: 'hu-HU',
  english: 'en-US',
};
function langCode(name) { return LANG_CODES[name?.toLowerCase()] ?? name; }

function playAudio() {
  if (!window.speechSynthesis || !currentSentence.value) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(currentSentence.value.target_text);
  utt.lang = langCode(profile.activeProfile?.target_language);
  utt.onstart = () => { playing.value = true; };
  utt.onend = () => { playing.value = false; };
  utt.onerror = () => { playing.value = false; };
  window.speechSynthesis.speak(utt);
}

function handleInput() {
  if (finished.value) return;
  if (!started.value && userInput.value.length > 0) {
    started.value = true;
    startTime.value = Date.now();
    timerInterval = setInterval(() => {
      elapsedSeconds.value = Math.floor((Date.now() - startTime.value) / 1000);
    }, 1000);
  }
}

function submitDictation() {
  if (finished.value || !currentSentence.value) return;
  clearInterval(timerInterval);
  const typed = userInput.value;
  const target = currentSentence.value.target_text;
  userTyped.value = typed;

  const mistakes = [...target].filter((c, i) => typed[i] !== c).length;
  const score = Math.max(0, 1 - mistakes / 10);

  finished.value = true;
  submitReview(score);
}

async function submitReview(score) {
  lastScore.value = score;
  try {
    const res = await api.post(
      `/profiles/${profile.activeProfile.id}/sentences/${currentSentence.value.id}/review`,
      { mode: 'dictation', score, wpm: 0 }
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
  fetchError.value = '';
  userInput.value = '';
  userTyped.value = '';
  started.value = false;
  finished.value = false;
  playing.value = false;
  elapsedSeconds.value = 0;
  startTime.value = null;
  clearInterval(timerInterval);

  try {
    const [res] = await Promise.all([
      api.get(`/profiles/${profile.activeProfile.id}/sentences/next`),
      fetchQueue(),
    ]);
    if (res.data.done) { doneForToday.value = true; return; }
    currentSentence.value = res.data.sentence;
    isReview.value = res.data.isReview;
    if (isReview.value) queue.value.due = Math.max(0, (queue.value.due ?? 1) - 1);
    else queue.value.newToday = Math.max(0, (queue.value.newToday ?? 1) - 1);

    await nextTick();
    inputEl.value?.focus();
    // Auto-play after a short delay so the user knows a new sentence loaded
    setTimeout(playAudio, 400);
  } catch (e) {
    fetchError.value = e.response?.data?.error || 'Failed to load sentence';
  } finally {
    loading.value = false;
  }
}

async function delayCard() {
  if (!currentSentence.value) return;
  try {
    await api.post(`/profiles/${profile.activeProfile.id}/sentences/${currentSentence.value.id}/delay`);
  } catch (e) { console.error('Delay failed', e); }
  loadSentence();
}

watch(() => profile.activeProfile?.id, (id) => { if (id) loadSentence(); }, { immediate: true });
onUnmounted(() => { clearInterval(timerInterval); window.speechSynthesis?.cancel(); });
</script>
