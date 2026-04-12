<template>
  <div class="space-y-6 max-w-lg">
    <h1 class="text-xl font-semibold">Settings</h1>

    <div v-if="!profile.activeProfile" class="text-zinc-500 text-center py-10">
      <RouterLink to="/profile/new" class="text-brand-400">Create a profile</RouterLink> first.
    </div>

    <template v-else>
      <!-- Daily limits -->
      <div class="card space-y-5">
        <div>
          <h2 class="text-sm font-medium text-zinc-200">Daily limits</h2>
          <p class="text-xs text-zinc-500 mt-0.5">Caps how many cards you see per day per track. Useful to prevent queue overwhelm.</p>
        </div>

        <div class="space-y-4">
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="text-sm text-zinc-300">New cards per day</label>
              <span class="text-sm font-medium text-brand-400 w-8 text-right">{{ form.dailyNewLimit }}</span>
            </div>
            <input
              v-model.number="form.dailyNewLimit"
              type="range" min="1" max="50" step="1"
              class="w-full accent-brand-400"
            />
            <div class="flex justify-between text-xs text-zinc-600">
              <span>1</span><span>50</span>
            </div>
            <p class="text-xs text-zinc-600">Fresh sentences you haven't seen before. Applied independently per track (typing / dictation).</p>
          </div>

          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="text-sm text-zinc-300">Due reviews per day</label>
              <span class="text-sm font-medium text-yellow-400 w-10 text-right">{{ form.dailyDueLimit }}</span>
            </div>
            <input
              v-model.number="form.dailyDueLimit"
              type="range" min="1" max="200" step="5"
              class="w-full accent-yellow-400"
            />
            <div class="flex justify-between text-xs text-zinc-600">
              <span>1</span><span>200</span>
            </div>
            <p class="text-xs text-zinc-600">Previously seen sentences scheduled for review. Applied independently per track.</p>
          </div>
        </div>
      </div>

      <!-- Generation settings -->
      <div class="card space-y-5">
        <div>
          <h2 class="text-sm font-medium text-zinc-200">Sentence generation</h2>
          <p class="text-xs text-zinc-500 mt-0.5">Controls how many new sentences are generated when your queue runs out.</p>
        </div>

        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-sm text-zinc-300">Daily batch size</label>
            <span class="text-sm font-medium text-zinc-300 w-8 text-right">{{ form.dailyBatchSize }}</span>
          </div>
          <input
            v-model.number="form.dailyBatchSize"
            type="range" min="1" max="30" step="1"
            class="w-full accent-zinc-400"
          />
          <div class="flex justify-between text-xs text-zinc-600">
            <span>1</span><span>30</span>
          </div>
          <p class="text-xs text-zinc-600">Sentences generated per day via a single AI call. Higher = more variety but slower to generate.</p>
        </div>
      </div>

      <!-- SRS strength -->
      <div class="card space-y-5">
        <div>
          <h2 class="text-sm font-medium text-zinc-200">Review interval strength</h2>
          <p class="text-xs text-zinc-500 mt-0.5">Controls how quickly intervals grow after a correct answer. Does not affect past reviews.</p>
        </div>

        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-sm text-zinc-300">Interval multiplier</label>
            <span class="text-sm font-medium text-zinc-300 w-10 text-right">{{ form.srsStrength.toFixed(1) }}×</span>
          </div>
          <input
            v-model.number="form.srsStrength"
            type="range" min="0.3" max="3.0" step="0.1"
            class="w-full accent-zinc-400"
          />
          <div class="flex justify-between text-xs text-zinc-600">
            <span>0.3× more frequent</span>
            <span class="text-zinc-700">1.0× default</span>
            <span>3.0× less frequent</span>
          </div>
          <div class="text-xs text-zinc-600 space-y-0.5 mt-1">
            <p>At <span class="text-zinc-400">{{ form.srsStrength.toFixed(1) }}×</span>: first success → <span class="text-zinc-400">{{ Math.max(2, Math.round(6 * form.srsStrength)) }} days</span>, then grows by ease factor × {{ form.srsStrength.toFixed(1) }}</p>
          </div>
        </div>
      </div>

      <!-- Save -->
      <div class="flex items-center gap-3">
        <button
          @click="save"
          :disabled="saving"
          class="btn-primary"
        >
          {{ saving ? 'Saving…' : 'Save settings' }}
        </button>
        <span v-if="saved" class="text-sm text-brand-400">Saved</span>
        <span v-if="error" class="text-sm text-red-400">{{ error }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import api from '../api/index.js';
import { useProfileStore } from '../stores/profile.js';

const profile = useProfileStore();

const form = ref({ dailyNewLimit: 10, dailyDueLimit: 30, dailyBatchSize: 10, srsStrength: 1.0 });
const saving = ref(false);
const saved = ref(false);
const error = ref('');

// Populate form from active profile whenever it loads
watch(() => profile.activeProfile, (p) => {
  if (p) {
    form.value = {
      dailyNewLimit:  p.daily_new_limit  ?? 10,
      dailyDueLimit:  p.daily_due_limit  ?? 30,
      dailyBatchSize: p.daily_batch_size ?? 10,
      srsStrength:    p.srs_strength     ?? 1.0,
    };
  }
}, { immediate: true });

async function save() {
  saving.value = true;
  saved.value = false;
  error.value = '';
  try {
    const res = await api.put(
      `/profiles/${profile.activeProfile.id}/settings`,
      form.value
    );
    // Update the store so navbar/dashboard reflect new values immediately
    profile.activeProfile.daily_new_limit  = res.data.daily_new_limit;
    profile.activeProfile.daily_due_limit  = res.data.daily_due_limit;
    profile.activeProfile.daily_batch_size = res.data.daily_batch_size;
    profile.activeProfile.srs_strength     = res.data.srs_strength;
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 2500);
  } catch (e) {
    error.value = e.response?.data?.error || 'Failed to save';
  } finally {
    saving.value = false;
  }
}
</script>
