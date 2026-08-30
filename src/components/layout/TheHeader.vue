<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

defineEmits(['toggle-sidebar'])

const authStore = useAuthStore()
const router = useRouter()

async function handleLogout() {
  await authStore.signOut()
  router.push('/login')
}
</script>

<template>
  <header
    class="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-neutral-300 bg-brand-black px-4 sm:px-6"
  >
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="rounded-md p-2.5 text-brand-white hover:bg-white/10"
        aria-label="פתיחת תפריט ניווט"
        @click="$emit('toggle-sidebar')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-6"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <span class="text-lg font-bold text-brand-white">ניהול כושר</span>
    </div>

    <div class="flex items-center gap-3 sm:gap-4">
      <span class="hidden max-w-[12rem] truncate text-sm text-neutral-300 sm:inline">
        {{ authStore.user?.email }}
      </span>
      <button
        type="button"
        class="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-600 px-3 py-1.5 text-sm font-medium text-brand-white transition-colors hover:border-brand-green hover:text-brand-green"
        @click="handleLogout"
      >
        התנתקות
      </button>
    </div>
  </header>
</template>
