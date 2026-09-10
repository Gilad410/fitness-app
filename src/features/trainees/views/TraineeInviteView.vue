<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '../../../layouts/AppLayout.vue'
import BackLink from '../../../components/layout/BackLink.vue'
import { useTraineesStore } from '../store/trainees'
import { useTraineeInvitesStore } from '../store/traineeInvites'

// Quick "Invite trainee" entry point, distinct from the full add-trainee
// form (TraineeFormView.vue -- goal/weights/measurements/etc.): just the
// two fields needed to create a minimal trainees row and immediately send
// a real invitation email for it. Everything after creation reuses
// already-built, already-audited pieces rather than duplicating them --
// traineesStore.create() is the same insert the full form uses, and
// invitesStore.issue() is the same issue-and-email action
// TraineeInviteSection.vue's "הזמן מתאמן"/"שלח הזמנה מחדש" buttons call
// (see that store for how the email actually gets sent -- the
// invite-trainee Edge Function). Landing on the new trainee's own detail
// page afterward means that page's existing TraineeInviteSection shows
// the success/failure state -- no separate success UI needed here.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const router = useRouter()
const traineesStore = useTraineesStore()
const invitesStore = useTraineeInvitesStore()

const fullName = ref('')
const email = ref('')
const loading = ref(false)
const error = ref('')

function validate() {
  if (fullName.value.trim() === '') return 'יש להזין שם מלא.'
  if (!EMAIL_RE.test(email.value.trim())) return 'יש להזין כתובת אימייל תקינה.'
  return ''
}

async function handleSubmit() {
  error.value = ''
  const validationError = validate()
  if (validationError) {
    error.value = validationError
    return
  }

  loading.value = true
  try {
    const trainee = await traineesStore.create({
      full_name: fullName.value.trim(),
      email: email.value.trim(),
    })
    try {
      await invitesStore.issue(trainee.id)
    } catch {
      // Trainee was still created successfully -- surfaced via
      // invitesStore.error on the trainee's own page below, where
      // TraineeInviteSection's "none" state already offers a retry.
    }
    router.push(`/trainees/${trainee.id}`)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AppLayout>
    <div class="mx-auto max-w-lg">
      <BackLink to="/trainees" />

      <h1 class="mb-2 text-2xl font-bold text-brand-black sm:text-3xl">הזמנת מתאמן/ת</h1>
      <p class="mb-6 text-sm text-neutral-600">
        ייווצר פרופיל מתאמן/ת חדש, ותישלח אליו/ה הזמנה במייל ליצירת סיסמה וכניסה לאזור האישי. ניתן
        להשלים פרטים נוספים (יעד, משקל, מדידות) בהמשך מדף המתאמן/ת.
      </p>

      <form
        class="flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6"
        @submit.prevent="handleSubmit"
      >
        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">שם מלא</span>
          <input
            v-model="fullName"
            type="text"
            required
            autocomplete="name"
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">אימייל</span>
          <input
            v-model="email"
            type="email"
            required
            dir="ltr"
            autocomplete="email"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
          />
        </label>

        <p v-if="error" class="text-sm text-status-red">{{ error }}</p>

        <div class="flex flex-wrap gap-3">
          <button
            type="submit"
            :disabled="loading"
            class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {{ loading ? 'שולח הזמנה...' : 'שלח הזמנה' }}
          </button>
          <RouterLink
            to="/trainees"
            class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
          >
            ביטול
          </RouterLink>
        </div>
      </form>
    </div>
  </AppLayout>
</template>
