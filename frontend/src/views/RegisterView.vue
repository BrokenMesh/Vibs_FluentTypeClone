<template>
  <div class="flex items-center justify-center min-h-[70vh]">
    <div class="card w-full max-w-sm">
      <h1 class="text-2xl font-semibold mb-1">
        fluent<span class="text-brand-400">type</span>
      </h1>
      <p class="text-zinc-500 text-sm mb-6">Create your account</p>

      <form @submit.prevent="handleRegister" class="space-y-4">
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Username</label>
          <input v-model="username" type="text" class="input" placeholder="typingwizard" required />
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Email</label>
          <input v-model="email" type="email" class="input" placeholder="you@example.com" required />
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1">Password</label>
          <input v-model="password" type="password" class="input" placeholder="min 6 characters" required />
        </div>

        <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>

        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? 'Creating account…' : 'Create account' }}
        </button>
      </form>

      <p class="text-center text-sm text-zinc-500 mt-4">
        Already have an account?
        <RouterLink to="/login" class="text-brand-400 hover:text-brand-300">Sign in</RouterLink>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const router = useRouter();
const auth = useAuthStore();

const username = ref('');
const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function handleRegister() {
  error.value = '';
  loading.value = true;
  try {
    await auth.register(username.value, email.value, password.value);
    router.push('/profile/new');
  } catch (e) {
    error.value = e.response?.data?.error || 'Registration failed';
  } finally {
    loading.value = false;
  }
}
</script>
