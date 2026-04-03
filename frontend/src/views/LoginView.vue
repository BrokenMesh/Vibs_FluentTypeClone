<template>
  <div class="flex items-center justify-center min-h-[70vh]">
    <div class="card w-full max-w-sm">
      <h1 class="text-2xl font-semibold mb-1">
        fluent<span class="text-brand-400">type</span>
      </h1>
      <p class="text-zinc-500 text-sm mb-6">Sign in to continue learning</p>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Email</label>
          <input v-model="email" type="email" class="input" placeholder="you@example.com" required />
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Password</label>
          <input v-model="password" type="password" class="input" placeholder="••••••••" required />
        </div>

        <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>

        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <p class="text-center text-sm text-zinc-500 mt-4">
        No account?
        <RouterLink to="/register" class="text-brand-400 hover:text-brand-300">Register</RouterLink>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useProfileStore } from '../stores/profile.js';

const router = useRouter();
const auth = useAuthStore();
const profile = useProfileStore();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    const profiles = await profile.fetchProfiles();
    if (profiles.length === 0) {
      router.push('/profile/new');
    } else {
      if (!profile.activeProfile) profile.setActive(profiles[0]);
      router.push('/dashboard');
    }
  } catch (e) {
    error.value = e.response?.data?.error || 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>
