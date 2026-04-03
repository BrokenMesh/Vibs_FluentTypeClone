<template>
  <div class="space-y-8">
    <h1 class="text-xl font-semibold">Admin Panel</h1>

    <!-- Not admin -->
    <div v-if="!isAdmin" class="text-center py-20 text-zinc-500">
      Access denied.
    </div>

    <template v-else>
      <!-- Email Whitelist -->
      <div class="card space-y-4">
        <h2 class="font-medium">Email Whitelist</h2>
        <p class="text-xs text-zinc-500">Only whitelisted emails can register an account.</p>

        <form @submit.prevent="addEmail" class="flex gap-2">
          <input v-model="newEmail" type="email" class="input flex-1" placeholder="user@example.com" />
          <button type="submit" class="btn-primary whitespace-nowrap" :disabled="addLoading">
            {{ addLoading ? '…' : '+ Add' }}
          </button>
        </form>
        <p v-if="addError" class="text-red-400 text-sm">{{ addError }}</p>

        <div v-if="listLoading" class="text-zinc-600 animate-pulse text-sm">loading…</div>
        <div v-else class="space-y-2">
          <div
            v-for="entry in whitelist"
            :key="entry.id"
            class="flex items-center justify-between bg-zinc-800 rounded px-3 py-2 text-sm"
          >
            <span class="text-zinc-200">{{ entry.email }}</span>
            <div class="flex items-center gap-3 text-xs text-zinc-600">
              <span>{{ formatDate(entry.created_at) }}</span>
              <button
                @click="removeEmail(entry)"
                :disabled="entry.email === adminEmail"
                class="text-zinc-600 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >✕</button>
            </div>
          </div>
          <p v-if="whitelist.length === 0" class="text-zinc-600 text-sm">No entries.</p>
        </div>
      </div>

      <!-- Reset Password -->
      <div class="card space-y-4">
        <h2 class="font-medium">Reset Password</h2>

        <div class="space-y-3">
          <div>
            <label class="block text-xs text-zinc-400 mb-1">User email</label>
            <select v-model="resetEmail" class="input">
              <option value="">— select user —</option>
              <option v-for="u in users" :key="u.id" :value="u.email">
                {{ u.email }} ({{ u.username }})
              </option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-zinc-400 mb-1">New password</label>
            <input v-model="newPassword" type="password" class="input" placeholder="min 6 characters" />
          </div>
          <button @click="resetPassword" class="btn-primary" :disabled="resetLoading || !resetEmail || !newPassword">
            {{ resetLoading ? 'Resetting…' : 'Reset password' }}
          </button>
          <p v-if="resetMsg" :class="resetOk ? 'text-brand-400' : 'text-red-400'" class="text-sm">{{ resetMsg }}</p>
        </div>
      </div>

      <!-- Users -->
      <div class="card space-y-3">
        <h2 class="font-medium">Registered Users</h2>
        <div class="space-y-2">
          <div
            v-for="u in users"
            :key="u.id"
            class="flex items-center justify-between bg-zinc-800 rounded px-3 py-2 text-sm"
          >
            <div>
              <span class="text-zinc-200">{{ u.username }}</span>
              <span class="text-zinc-500 ml-2">{{ u.email }}</span>
            </div>
            <span class="text-xs text-zinc-600">{{ formatDate(u.created_at) }}</span>
          </div>
          <p v-if="users.length === 0" class="text-zinc-600 text-sm">No users yet.</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../api/index.js';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || 'elkordhicham@gmail.com';

const isAdmin = computed(() => auth.user?.email === adminEmail);

const whitelist = ref([]);
const users = ref([]);
const listLoading = ref(false);
const newEmail = ref('');
const addLoading = ref(false);
const addError = ref('');

const resetEmail = ref('');
const newPassword = ref('');
const resetLoading = ref(false);
const resetMsg = ref('');
const resetOk = ref(false);

function formatDate(ts) {
  return new Date(ts * 1000).toLocaleDateString();
}

async function fetchData() {
  listLoading.value = true;
  try {
    const [wlRes, usersRes] = await Promise.all([
      api.get('/admin/whitelist'),
      api.get('/admin/users'),
    ]);
    whitelist.value = wlRes.data;
    users.value = usersRes.data;
  } catch (e) {
    console.error(e);
  } finally {
    listLoading.value = false;
  }
}

async function addEmail() {
  addError.value = '';
  addLoading.value = true;
  try {
    const res = await api.post('/admin/whitelist', { email: newEmail.value });
    whitelist.value.unshift(res.data);
    newEmail.value = '';
  } catch (e) {
    addError.value = e.response?.data?.error || 'Failed to add email';
  } finally {
    addLoading.value = false;
  }
}

async function removeEmail(entry) {
  try {
    await api.delete(`/admin/whitelist/${entry.id}`);
    whitelist.value = whitelist.value.filter(e => e.id !== entry.id);
  } catch (e) {
    console.error(e);
  }
}

async function resetPassword() {
  resetMsg.value = '';
  resetLoading.value = true;
  try {
    await api.post('/admin/reset-password', { email: resetEmail.value, newPassword: newPassword.value });
    resetMsg.value = 'Password reset successfully.';
    resetOk.value = true;
    newPassword.value = '';
  } catch (e) {
    resetMsg.value = e.response?.data?.error || 'Failed to reset password';
    resetOk.value = false;
  } finally {
    resetLoading.value = false;
  }
}

onMounted(() => { if (isAdmin.value) fetchData(); });
</script>
