<template>
  <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
    <div class="text-2xl font-semibold" :class="color === 'yellow' ? 'text-yellow-400' : color === 'brand' ? 'text-brand-400' : 'text-zinc-100'">
      {{ value }}
    </div>
    <div class="text-xs text-zinc-600 mt-0.5">{{ label }}</div>
  </div>
</template>

<script setup>
defineProps({
  label: String,
  value: [String, Number],
  color: { type: String, default: '' },
});
</script>
