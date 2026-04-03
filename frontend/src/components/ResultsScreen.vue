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
    <div class="text-left bg-zinc-800/50 rounded-lg p-4 space-y-1">
      <p class="text-xs text-zinc-600">correct translation</p>
      <p class="text-zinc-200">{{ sentence.target_text }}</p>
    </div>

    <!-- Skill progress + next review -->
    <div class="flex justify-center gap-6 text-sm text-zinc-500">
      <span v-if="mode === 'challenge'">
        skill <span class="text-zinc-100">{{ Math.round(newSkill) }}/100</span>
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
});
defineEmits(['next']);
</script>
