<template>
  <nav class="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
    <div class="container mx-auto px-4 max-w-4xl flex items-center justify-between h-14">
      <RouterLink to="/dashboard" class="text-brand-400 font-semibold text-lg tracking-tight">
        fluent<span class="text-zinc-100">type</span>
      </RouterLink>

      <!-- Desktop nav -->
      <div class="hidden md:flex items-center gap-1">
        <RouterLink to="/type" class="btn-ghost text-sm px-3 py-1.5 rounded">type</RouterLink>
        <RouterLink to="/dictate" class="btn-ghost text-sm px-3 py-1.5 rounded">dictate</RouterLink>
        <RouterLink to="/vocabulary" class="btn-ghost text-sm px-3 py-1.5 rounded">vocab</RouterLink>
        <RouterLink to="/history" class="btn-ghost text-sm px-3 py-1.5 rounded">history</RouterLink>
        <RouterLink to="/settings" class="btn-ghost text-sm px-3 py-1.5 rounded">settings</RouterLink>
        <RouterLink v-if="isAdmin" to="/admin" class="btn-ghost text-sm px-3 py-1.5 rounded text-zinc-500">admin</RouterLink>

        <div class="ml-3 flex items-center gap-2">
          <span v-if="profile.activeProfile" class="text-xs text-zinc-500">
            {{ profile.activeProfile.target_language }}
            <span class="text-brand-500 ml-1">{{ cefrLevel }}</span>
            <span class="text-zinc-700 ml-1">{{ nextInfo }}</span>
          </span>
          <button @click="handleLogout" class="btn-ghost text-sm px-3 py-1.5 rounded text-zinc-500 hover:text-zinc-100">
            logout
          </button>
        </div>
      </div>

      <!-- Mobile: skill score + hamburger -->
      <div class="flex md:hidden items-center gap-3">
        <span v-if="profile.activeProfile" class="text-xs text-zinc-500">
          {{ profile.activeProfile.target_language }}
          <span class="text-brand-500 ml-1">{{ cefrLevel }}</span>
          <span class="text-zinc-700 ml-1">{{ nextInfo }}</span>
        </span>
        <button
          @click="menuOpen = !menuOpen"
          class="p-2 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          aria-label="Toggle menu"
        >
          <!-- Hamburger / X icon -->
          <svg v-if="!menuOpen" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile dropdown menu -->
    <div v-if="menuOpen" class="md:hidden border-t border-zinc-800 bg-zinc-950">
      <div class="container mx-auto px-4 max-w-4xl py-2 flex flex-col gap-1">
        <RouterLink to="/type" class="btn-ghost text-sm px-3 py-2 rounded text-left" @click="menuOpen = false">type</RouterLink>
        <RouterLink to="/dictate" class="btn-ghost text-sm px-3 py-2 rounded text-left" @click="menuOpen = false">dictate</RouterLink>
        <RouterLink to="/vocabulary" class="btn-ghost text-sm px-3 py-2 rounded text-left" @click="menuOpen = false">vocab</RouterLink>
        <RouterLink to="/history" class="btn-ghost text-sm px-3 py-2 rounded text-left" @click="menuOpen = false">history</RouterLink>
        <RouterLink to="/settings" class="btn-ghost text-sm px-3 py-2 rounded text-left" @click="menuOpen = false">settings</RouterLink>
        <RouterLink v-if="isAdmin" to="/admin" class="btn-ghost text-sm px-3 py-2 rounded text-left text-zinc-500" @click="menuOpen = false">admin</RouterLink>
        <button @click="handleLogout" class="btn-ghost text-sm px-3 py-2 rounded text-left text-zinc-500 hover:text-zinc-100">
          logout
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useProfileStore } from '../stores/profile.js';
import { cefrOf, cefrNext, ptsToNext } from '../utils/cefr.js';

const auth = useAuthStore();
const profile = useProfileStore();
const router = useRouter();

const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || 'elkordhicham@gmail.com';
const isAdmin = computed(() => auth.user?.email === adminEmail);
const menuOpen = ref(false);

const cefrLevel = computed(() => cefrOf(profile.activeProfile?.skill_score ?? 0).label);
const nextInfo = computed(() => {
  const s = profile.activeProfile?.skill_score ?? 0;
  const pts = ptsToNext(s);
  const next = cefrNext(s);
  return pts !== null ? `${Math.ceil(pts)}→${next.label}` : 'C2';
});

async function handleLogout() {
  menuOpen.value = false;
  await auth.logout();
  profile.clear();
  router.push('/login');
}
</script>
