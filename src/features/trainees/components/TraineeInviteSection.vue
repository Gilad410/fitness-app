<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { useTraineeInvitesStore } from '../store/traineeInvites'

const props = defineProps({
  trainee: { type: Object, required: true },
})

const invitesStore = useTraineeInvitesStore()

const showCancelConfirm = ref(false)
const showUnlinkConfirm = ref(false)
const copySuccess = ref(false)

// The token/link block is shown only for the exact trainee it was just
// issued for (see traineeInvites.js) -- this additionally clears it the
// moment this section leaves the page (e.g. navigating to a different
// trainee), so a previously issued token can never resurface later in
// the same session.
onUnmounted(() => {
  if (invitesStore.lastIssuedTraineeId === props.trainee.id) {
    invitesStore.clearToken()
  }
})

const hasEmail = computed(() => !!props.trainee.email && props.trainee.email.trim() !== '')

const statusLabel = computed(() => {
  if (props.trainee.invite_status === 'invited') return 'ההזמנה ממתינה'
  if (props.trainee.invite_status === 'accepted') return 'החשבון מחובר'
  return 'טרם הוזמן'
})

const statusClass = computed(() => {
  if (props.trainee.invite_status === 'invited') return 'bg-status-yellow/10 text-status-yellow'
  if (props.trainee.invite_status === 'accepted') return 'bg-brand-green/10 text-brand-green-dark'
  return 'bg-neutral-100 text-neutral-600'
})

const dateTimeFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long', timeStyle: 'short' })
const formattedExpiry = computed(() =>
  props.trainee.invite_expires_at
    ? dateTimeFormatter.format(new Date(props.trainee.invite_expires_at))
    : '',
)

const joinUrl = computed(() => {
  if (invitesStore.lastIssuedTraineeId !== props.trainee.id || !invitesStore.lastIssuedToken) {
    return ''
  }
  return `${window.location.origin}/trainee/join?token=${invitesStore.lastIssuedToken}`
})

async function handleIssue() {
  copySuccess.value = false
  try {
    await invitesStore.issue(props.trainee.id)
  } catch {
    // surfaced via invitesStore.error below
  }
}

async function handleCancel() {
  try {
    await invitesStore.cancel(props.trainee.id)
    showCancelConfirm.value = false
  } catch {
    // surfaced via invitesStore.error below; stays on the confirm step
  }
}

async function handleUnlink() {
  try {
    await invitesStore.unlink(props.trainee.id)
    showUnlinkConfirm.value = false
  } catch {
    // surfaced via invitesStore.error below; stays on the confirm step
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(joinUrl.value)
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch {
    invitesStore.error = 'העתקת הקישור נכשלה. ניתן לסמן ולהעתיק את הקישור ידנית.'
  }
}
</script>

<template>
  <section
    class="mt-6 flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="font-semibold text-brand-black">גישת המתאמן/ת לאזור האישי</h2>
      <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" :class="statusClass">
        {{ statusLabel }}
      </span>
    </div>

    <!-- none -->
    <div v-if="trainee.invite_status === 'none'" class="flex flex-col gap-2">
      <p v-if="!hasEmail" class="text-sm text-status-yellow">
        יש להוסיף כתובת אימייל למתאמן/ת (בעריכת הפרופיל) לפני שליחת הזמנה.
      </p>
      <div>
        <button
          type="button"
          :disabled="!hasEmail || invitesStore.issuing"
          class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:cursor-not-allowed disabled:opacity-60"
          @click="handleIssue"
        >
          {{ invitesStore.issuing ? 'שולח הזמנה...' : 'הזמן מתאמן' }}
        </button>
      </div>
    </div>

    <!-- invited -->
    <div v-else-if="trainee.invite_status === 'invited'" class="flex flex-col gap-3">
      <p class="text-sm text-neutral-600">ההזמנה תפוג בתאריך {{ formattedExpiry }}.</p>

      <div v-if="!showCancelConfirm" class="flex flex-wrap gap-3">
        <button
          type="button"
          :disabled="invitesStore.issuing"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
          @click="handleIssue"
        >
          {{ invitesStore.issuing ? 'שולח...' : 'שלח הזמנה מחדש' }}
        </button>
        <button
          type="button"
          :disabled="invitesStore.cancelling"
          class="rounded-lg border border-status-red/40 px-4 py-2 text-sm font-medium text-status-red hover:bg-status-red/5 disabled:cursor-not-allowed disabled:opacity-60"
          @click="showCancelConfirm = true"
        >
          בטל הזמנה
        </button>
      </div>

      <div v-else class="flex flex-col gap-3 rounded-xl border border-neutral-300 p-4">
        <p class="text-sm text-brand-black">לבטל את ההזמנה הממתינה?</p>
        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            :disabled="invitesStore.cancelling"
            class="rounded-lg bg-status-red px-4 py-2 text-sm font-medium text-brand-white hover:bg-status-red/90 disabled:cursor-not-allowed disabled:opacity-60"
            @click="handleCancel"
          >
            {{ invitesStore.cancelling ? 'מבטל...' : 'כן, בטל הזמנה' }}
          </button>
          <button
            type="button"
            :disabled="invitesStore.cancelling"
            class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
            @click="showCancelConfirm = false"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>

    <!-- accepted -->
    <div v-else class="flex flex-col gap-3">
      <p class="text-sm text-neutral-600">
        המתאמן/ת מחובר/ת לחשבון משלו/ה ויכול/ה להתחבר לאזור האישי.
      </p>

      <div v-if="!showUnlinkConfirm">
        <button
          type="button"
          :disabled="invitesStore.unlinking"
          class="inline-flex min-h-11 items-center justify-center rounded-lg border border-status-red/40 px-4 py-2 text-sm font-medium text-status-red hover:bg-status-red/5 disabled:cursor-not-allowed disabled:opacity-60"
          @click="showUnlinkConfirm = true"
        >
          נתק חשבון מתאמן
        </button>
      </div>

      <div v-else class="flex flex-col gap-3 rounded-xl border border-status-red/40 bg-status-red/5 p-4">
        <p class="text-sm font-medium text-brand-black">לנתק את חשבון המתאמן/ת?</p>
        <p class="text-sm text-neutral-600">
          המתאמן/ת לא יוכל/תוכל להתחבר יותר עד שתישלח הזמנה חדשה. הנתונים הקיימים (משקל, תזונה,
          תוכניות אימון) לא יימחקו ולא ייפגעו.
        </p>
        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            :disabled="invitesStore.unlinking"
            class="inline-flex min-h-11 items-center justify-center rounded-lg bg-status-red px-4 py-2 text-sm font-medium text-brand-white hover:bg-status-red/90 disabled:cursor-not-allowed disabled:opacity-60"
            @click="handleUnlink"
          >
            {{ invitesStore.unlinking ? 'מנתק...' : 'כן, נתק חשבון' }}
          </button>
          <button
            type="button"
            :disabled="invitesStore.unlinking"
            class="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
            @click="showUnlinkConfirm = false"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>

    <!-- Token/link -- only ever shown immediately after issue()/reissue,
    for this exact trainee (see joinUrl above and the onUnmounted cleanup). -->
    <div
      v-if="joinUrl"
      class="flex flex-col gap-2 rounded-xl border border-brand-green/30 bg-brand-green/5 p-4"
    >
      <p class="text-sm font-medium text-brand-black">
        ההזמנה נוצרה. יש להעביר את הקישור למתאמן/ת (לא נשלח מייל אוטומטית):
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <code
          class="min-w-0 flex-1 truncate rounded-lg bg-neutral-100 px-3 py-2 text-xs text-brand-black"
          dir="ltr"
        >
          {{ joinUrl }}
        </code>
        <button
          type="button"
          class="shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
          @click="copyLink"
        >
          {{ copySuccess ? 'הועתק!' : 'העתק קישור' }}
        </button>
      </div>
      <p class="text-xs text-neutral-500">הקישור מוצג כאן פעם אחת בלבד ולא נשמר.</p>
    </div>

    <p v-if="invitesStore.error" class="text-sm text-status-red">{{ invitesStore.error }}</p>
  </section>
</template>
