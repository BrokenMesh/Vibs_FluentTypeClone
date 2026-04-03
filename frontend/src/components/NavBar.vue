<template>
  <nav class="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
    <div class="container mx-auto px-4 max-w-4xl flex items-center justify-between h-14">
      <RouterLink to="/dashboard" class="text-brand-400 font-semibold text-lg tracking-tight">
        fluent<span class="text-zinc-100">type</span>
      </RouterLink>

      <div class="flex items-center gap-1">
        <RouterLink to="/type" class="btn-ghost text-sm px-3 py-1.5 rounded">type</RouterLink>
        <RouterLink to="/vocabulary" class="btn-ghost text-sm px-3 py-1.5 rounded">vocab</RouterLink>
        <RouterLink to="/history" class="btn-ghost text-sm px-3 py-1.5 rounded">history</RouterLink>
        <RouterLink v-if="isAdmin" to="/admin" class="btn-ghost text-sm px-3 py-1.5 rounded text-zinc-500">admin</RouterLink>

        <div class="ml-3 flex items-center gap-2">
          <span v-if="profile.activeProfile" class="text-xs text-zinc-500 hidden sm:inline">
            {{ profile.activeProfile.target_language }}
            <span class="text-brand-500 ml-1">{{ Math.round(profile.activeProfile.skill_score) }}</span>
          </span>
          <button @click="handleLogout" class="btn-ghost text-sm px-3 py-1.5 rounded text-zinc-500 hover:text-zinc-100">
            logout
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useProfileStore } from '../stores/profile.js';

const auth = useAuthStore();
const profile = useProfileStore();
const router = useRouter();

const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || 'elkordhicham@gmail.com';
const isAdmin = computed(() => auth.user?.email === adminEmail);

async function handleLogout() {
  await auth.logout();
  profile.clear();
  router.push('/login');
}
</script>
