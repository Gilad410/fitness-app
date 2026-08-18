<script setup>
import { computed, onMounted } from 'vue'
import TraineeLayout from '../layouts/TraineeLayout.vue'
import { useTraineeNotificationsStore } from '../store/traineeNotifications'

// Full notifications experience -- separates unread/read, only ever reads
// public.trainee_notifications (RLS-scoped to the caller's own linked
// trainee row, 021_trainee_auth_and_roles.sql) and marks read exclusively
// through trainee_mark_notification_read().
const notificationsStore = useTraineeNotificationsStore()

onMounted(() => {
  notificationsStore.fetchAll().catch(() => {})
})

const unread = computed(() => notificationsStore.items.filter((n) => !n.is_read))
const read = computed(() => notificationsStore.items.filter((n) => n.is_read))

const dateTimeFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long', timeStyle: 'short' })

async function markRead(id) {
  try {
    await notificationsStore.markRead(id)
  } catch {
    // surfaced via notificationsStore.error below
  }
}
</script>

<template>
  <TraineeLayout>
    <div class="mx-auto max-w-2xl">
      <section class="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
        <div>
          <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">התראות</h1>
          <p class="mt-1 text-sm text-neutral-600">עדכונים מהמאמן/ת שלך</p>
        </div>
        <span
          v-if="notificationsStore.unreadCount > 0"
          class="flex shrink-0 items-center gap-1.5 rounded-full bg-status-red/10 px-3 py-1.5 text-sm font-semibold text-status-red"
        >
          {{ notificationsStore.unreadCount }} חדשות
        </span>
      </section>

      <p v-if="notificationsStore.loading && !notificationsStore.loaded" class="text-neutral-600">
        טוען...
      </p>

      <div
        v-else-if="notificationsStore.error"
        class="flex flex-col items-start gap-3 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm"
      >
        <p class="text-sm text-status-red">{{ notificationsStore.error }}</p>
        <button
          type="button"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
          @click="notificationsStore.fetchAll()"
        >
          נסה שוב
        </button>
      </div>

      <div
        v-else-if="notificationsStore.items.length === 0"
        class="flex flex-col items-center gap-2 rounded-2xl border border-neutral-300 bg-brand-white p-8 text-center shadow-sm"
      >
        <span class="text-3xl" aria-hidden="true">🔔</span>
        <p class="font-semibold text-brand-black">אין עדיין התראות</p>
        <p class="text-sm text-neutral-600">עדכונים מהמאמן/ת שלך יופיעו כאן.</p>
      </div>

      <div v-else class="flex flex-col gap-8">
        <section v-if="unread.length > 0" aria-labelledby="unread-heading">
          <h2 id="unread-heading" class="mb-3 font-semibold text-brand-black">חדשות</h2>
          <ul class="flex flex-col gap-3">
            <li
              v-for="n in unread"
              :key="n.id"
              class="flex flex-col gap-2 rounded-2xl border border-brand-green/30 bg-brand-green/5 p-4 shadow-sm sm:p-5"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <p class="font-semibold text-brand-black">{{ n.title }}</p>
                <span class="shrink-0 rounded-full bg-brand-green px-2 py-0.5 text-xs font-medium text-brand-white">
                  חדשה
                </span>
              </div>
              <p class="whitespace-pre-wrap text-sm text-neutral-700">{{ n.message }}</p>
              <div class="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p class="text-xs text-neutral-500">
                  {{ dateTimeFormatter.format(new Date(n.created_at)) }}
                </p>
                <button
                  type="button"
                  :aria-label="`סמן את ${n.title} כנקרא`"
                  :disabled="notificationsStore.markingReadId === n.id"
                  class="rounded-lg bg-brand-green px-3 py-1.5 text-xs font-medium text-brand-white hover:bg-brand-green-dark disabled:cursor-not-allowed disabled:opacity-60"
                  @click="markRead(n.id)"
                >
                  {{ notificationsStore.markingReadId === n.id ? 'מסמן...' : 'סמן כנקרא' }}
                </button>
              </div>
            </li>
          </ul>
        </section>

        <section v-if="read.length > 0" aria-labelledby="read-heading">
          <h2 id="read-heading" class="mb-3 font-semibold text-brand-black">נקראו</h2>
          <ul class="flex flex-col gap-3">
            <li
              v-for="n in read"
              :key="n.id"
              class="flex flex-col gap-2 rounded-2xl border border-neutral-300 bg-brand-white p-4 shadow-sm sm:p-5"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <p class="font-medium text-brand-black">{{ n.title }}</p>
                <span class="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                  נקראה
                </span>
              </div>
              <p class="whitespace-pre-wrap text-sm text-neutral-600">{{ n.message }}</p>
              <p class="text-xs text-neutral-500">{{ dateTimeFormatter.format(new Date(n.created_at)) }}</p>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </TraineeLayout>
</template>
