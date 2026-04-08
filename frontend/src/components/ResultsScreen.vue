<template>
  <div class="card text-center space-y-6 py-8">
    <!-- Score ring -->
    <div class="flex justify-center">
      <div class="relative w-28 h-28">
        <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#27272a" stroke-width="3" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            :stroke="score >= 0.8 ? '#22c55e' : score >= 0.5 ? '#eab308' : '#ef4444'"
            stroke-width="3"
            stroke-linecap="round"
            :stroke-dasharray="`${score * 100} 100`"
          />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-2xl font-semibold">{{ Math.round(score * 100) }}%</span>
          <span class="text-xs text-zinc-500">accuracy</span>
        </div>
      </div>
    </div>

    <!-- Stats row -->
    <div class="flex justify-center gap-8">
      <div v-if="mode === 'challenge' && wpm > 0" class="text-center">
        <div class="text-2xl font-semibold text-zinc-100">{{ wpm }}</div>
        <div class="text-xs text-zinc-500">wpm</div>
      </div>
      <div v-if="(mode === 'challenge' || mode === 'dictation') && xpGained > 0" class="text-center">
        <div class="text-2xl font-semibold text-brand-400">+{{ xpGained }}</div>
        <div class="text-xs text-zinc-500">xp</div>
      </div>
      <div v-if="mode === 'dictation'" class="text-center">
        <div class="text-sm font-semibold text-purple-400">1.5×</div>
        <div class="text-xs text-zinc-500">dictation bonus</div>
      </div>
      <div v-if="mode === 'practice'" class="text-center">
        <div class="text-lg font-semibold text-zinc-400">practice</div>
        <div class="text-xs text-zinc-500">no points</div>
      </div>
    </div>

    <!-- Sentence reveal -->
    <div class="text-left bg-zinc-800/50 rounded-lg p-4 space-y-3">
      <!-- Original -->
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <p class="text-xs text-zinc-600">original</p>
          <button @click="speak(sentence.source_text, nativeLang)" title="Listen" class="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
              <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>
        <p class="text-zinc-400 text-sm">{{ sentence.source_text }}</p>
      </div>

      <!-- Correct translation — words are clickable -->
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <p class="text-xs text-zinc-600">correct translation <span class="text-zinc-700">(tap word to add)</span></p>
          <button @click="speak(sentence.target_text, targetLang)" title="Listen" class="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
              <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>
        <p class="text-zinc-200 leading-relaxed">
          <span
            v-for="(token, i) in targetTokens"
            :key="i"
            @click="token.word ? openPopup(token.word, token.raw) : null"
            :class="[
              token.word ? 'cursor-pointer rounded px-0.5 hover:bg-zinc-700 transition-colors' : '',
              addedWords.has(token.word) ? 'text-brand-400' : '',
            ]"
          >{{ token.raw }}</span>
        </p>
      </div>

      <!-- What the user typed — error diff -->
      <div v-if="(mode === 'challenge' || mode === 'dictation') && userTyped" class="space-y-1 pt-1 border-t border-zinc-700">
        <p class="text-xs text-zinc-600">your attempt</p>
        <p class="font-mono text-sm leading-relaxed break-all">
          <span
            v-for="(ch, i) in typedDiff"
            :key="i"
            :class="ch.ok ? 'text-zinc-400' : 'text-red-400'"
          >{{ ch.c }}</span><span
            v-for="(ch, i) in missingDiff"
            :key="'m'+i"
            class="text-red-800"
          >{{ ch }}</span>
        </p>
      </div>

      <!-- Practice word-by-word breakdown -->
      <div v-if="mode === 'practice' && typedWords?.length" class="space-y-1 pt-1 border-t border-zinc-700">
        <p class="text-xs text-zinc-600">your attempt</p>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span v-for="(word, i) in targetWordsArr" :key="i">
            <span :class="wordResultsArr[i] ? 'text-brand-400' : 'text-red-400'">{{ typedWords[i] || '—' }}</span>
            <span v-if="!wordResultsArr[i]" class="text-zinc-600 ml-1">→ {{ word }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- Skill + next review -->
    <div class="flex justify-center gap-6 text-sm text-zinc-500">
      <span v-if="mode === 'challenge' || mode === 'dictation'">
        <span class="text-brand-400 font-medium">{{ cefrLabel(newSkill) }}</span>
        <span class="text-zinc-600 ml-1">{{ skillNextLabel(newSkill) }}</span>
      </span>
      <span>
        next review
        <span class="text-zinc-300">{{ daysUntilReview <= 1 ? 'tomorrow' : `in ${daysUntilReview} days` }}</span>
      </span>
    </div>

    <button @click="$emit('next')" class="btn-primary px-8">next sentence →</button>
  </div>

  <!-- Word popup -->
  <div
    v-if="popup.word"
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
    @click.self="popup.word = null"
  >
    <div class="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-sm mx-4 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-xl text-zinc-100">{{ popup.raw }}</h3>
        <button @click="popup.word = null" class="text-zinc-500 hover:text-zinc-200 text-lg leading-none">✕</button>
      </div>

      <input
        v-model="popup.translation"
        class="input"
        :placeholder="`Translation in ${nativeLang}…`"
        @keydown.enter="addToVocab"
        @input="popup.alreadyExists = false"
      />

      <p v-if="popup.alreadyExists" class="text-yellow-400 text-sm">
        Already in your vocabulary.
      </p>

      <div class="flex flex-col gap-2">
        <button
          @click="addToVocab"
          :disabled="addingWord || !popup.translation.trim() || addedWords.has(popup.word)"
          class="btn-primary w-full disabled:opacity-50"
        >
          {{ addingWord ? '…' : addedWords.has(popup.word) ? '✓ Added' : 'Add to vocabulary' }}
        </button>
        <button @click="askClaude" class="btn-ghost w-full text-sm">
          Ask Claude about "{{ popup.raw }}"
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import api from '../api/index.js';
import { cefrOf, cefrNext, ptsToNext } from '../utils/cefr.js';

const props = defineProps({
  score: Number,
  wpm: Number,
  mode: String,
  xpGained: Number,
  newSkill: Number,
  daysUntilReview: Number,
  sentence: Object,
  nativeLang: String,
  targetLang: String,
  profileId: [Number, String],
  userTyped: String,
  typedWords: Array,
  targetWordsArr: Array,
  wordResultsArr: Array,
});
defineEmits(['next']);

function cefrLabel(score) { return cefrOf(score).label; }
function skillNextLabel(score) {
  const pts = ptsToNext(score);
  const next = cefrNext(score);
  return pts !== null ? `${Math.ceil(pts)} pts to ${next.label}` : 'C2 — mastered';
}

// TTS
const LANG_CODES = {
  german: 'de-DE', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
  portuguese: 'pt-PT', dutch: 'nl-NL', russian: 'ru-RU', japanese: 'ja-JP',
  chinese: 'zh-CN', korean: 'ko-KR', arabic: 'ar-SA', turkish: 'tr-TR',
  polish: 'pl-PL', swedish: 'sv-SE', norwegian: 'nb-NO', danish: 'da-DK',
  finnish: 'fi-FI', greek: 'el-GR', czech: 'cs-CZ', hungarian: 'hu-HU',
  english: 'en-US',
};
function speak(text, lang) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = LANG_CODES[lang?.toLowerCase()] ?? lang;
  window.speechSynthesis.speak(utt);
}

// Error diff for challenge mode
const typedDiff = computed(() => {
  if (!props.userTyped || !props.sentence) return [];
  return [...props.userTyped].map((c, i) => ({
    c,
    ok: props.sentence.target_text[i] === c,
  }));
});
const missingDiff = computed(() => {
  if (!props.userTyped || !props.sentence) return [];
  const t = props.sentence.target_text;
  const u = props.userTyped;
  return u.length < t.length ? [...t.slice(u.length)] : [];
});

// Tokenise target text into clickable word spans + punctuation
const targetTokens = computed(() => {
  if (!props.sentence?.target_text) return [];
  const tokens = [];
  const regex = /([A-Za-zÀ-ÖØ-öø-ÿ\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF]+)|([^A-Za-zÀ-ÖØ-öø-ÿ\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF]+)/g;
  let m;
  while ((m = regex.exec(props.sentence.target_text)) !== null) {
    if (m[1]) tokens.push({ raw: m[0], word: m[1].toLowerCase() });
    else tokens.push({ raw: m[0], word: null });
  }
  return tokens;
});

// Word popup
const popup = ref({ word: null, raw: '', translation: '', alreadyExists: false });
const addingWord = ref(false);
const addedWords = ref(new Set());

function openPopup(word, raw) {
  popup.value = { word, raw, translation: '', alreadyExists: false };
}

async function addToVocab() {
  if (!props.profileId || !popup.value.translation.trim() || addedWords.value.has(popup.value.word)) return;
  addingWord.value = true;
  try {
    await api.post(`/profiles/${props.profileId}/vocabulary`, {
      word: popup.value.word,
      translation: popup.value.translation.trim(),
    });
    addedWords.value = new Set([...addedWords.value, popup.value.word]);
    popup.value.word = null;
  } catch (e) {
    if (e.response?.status === 409) {
      // Word already in vocab — show feedback but don't close
      popup.value.alreadyExists = true;
    }
    // other errors: silently ignore
  } finally {
    addingWord.value = false;
  }
}

async function askClaude() {
  const sentenceCtx = props.sentence
    ? `\n\nContext (the sentence it appeared in):\n"${props.sentence.source_text}"\n→ "${props.sentence.target_text}"`
    : '';
  const text = `What does the word "${popup.value.raw}" mean in ${props.targetLang}?${sentenceCtx}\n\nPlease explain:\n- Its meaning and common usage\n- How it's built (roots, prefixes, suffixes)\n- Conjugations or declensions if applicable\n- A few example sentences`;
  if (navigator.share) {
    try { await navigator.share({ text }); } catch { /* cancelled */ }
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    alert('Prompt copied to clipboard');
  }
}
</script>
