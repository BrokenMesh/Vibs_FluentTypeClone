<template>
  <div class="card text-center space-y-6 py-10">
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
      <div v-if="mode === 'challenge' && xpGained > 0" class="text-center">
        <div class="text-2xl font-semibold text-brand-400">+{{ xpGained }}</div>
        <div class="text-xs text-zinc-500">xp</div>
      </div>
      <div v-if="mode === 'practice'" class="text-center">
        <div class="text-lg font-semibold text-zinc-400">practice</div>
        <div class="text-xs text-zinc-500">no points</div>
      </div>
    </div>

    <!-- Sentence reveal -->
    <div class="text-left bg-zinc-800/50 rounded-lg p-4 space-y-3">
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
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <p class="text-xs text-zinc-600">correct translation</p>
          <button @click="speak(sentence.target_text, targetLang)" title="Listen" class="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
              <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>
        <p class="text-zinc-200">{{ sentence.target_text }}</p>
      </div>
    </div>

    <!-- Skill progress + next review -->
    <div class="flex justify-center gap-6 text-sm text-zinc-500">
      <span v-if="mode === 'challenge'">
        <span class="text-brand-400 font-medium">{{ cefrLabel(newSkill) }}</span>
        <span class="text-zinc-600 ml-1">{{ Math.round(newSkill) }}/1000</span>
      </span>
      <span>
        next review
        <span class="text-zinc-300">
          {{ daysUntilReview <= 1 ? 'tomorrow' : `in ${daysUntilReview} days` }}
        </span>
      </span>
    </div>

    <button @click="$emit('next')" class="btn-primary px-8">
      next sentence →
    </button>
  </div>
</template>

<script setup>
defineProps({
  score: Number,
  wpm: Number,
  mode: String,
  xpGained: Number,
  newSkill: Number,
  daysUntilReview: Number,
  sentence: Object,
  nativeLang: String,
  targetLang: String,
});
defineEmits(['next']);

const CEFR = [
  { label: 'A1', min: 0 }, { label: 'A2', min: 167 }, { label: 'B1', min: 334 },
  { label: 'B2', min: 500 }, { label: 'C1', min: 666 }, { label: 'C2', min: 833 },
];
function cefrLabel(score) {
  for (let i = CEFR.length - 1; i >= 0; i--) if (score >= CEFR[i].min) return CEFR[i].label;
  return 'A1';
}

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
</script>
