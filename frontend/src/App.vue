<template>
  <div class="min-h-screen flex flex-col">
    <NavBar v-if="auth.accessToken" />
    <main class="flex-1 container mx-auto px-4 py-8 max-w-4xl">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { RouterView } from 'vue-router';
import NavBar from './components/NavBar.vue';
import { useAuthStore } from './stores/auth.js';

const auth = useAuthStore();
</script>
