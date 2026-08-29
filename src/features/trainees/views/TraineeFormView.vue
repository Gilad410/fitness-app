<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../../../layouts/AppLayout.vue'
import BackLink from '../../../components/layout/BackLink.vue'
import { useTraineesStore } from '../store/trainees'

const route = useRoute()
const router = useRouter()
const traineesStore = useTraineesStore()

const id = computed(() => route.params.id)
const isEdit = computed(() => !!id.value)
// New trainee has no detail page yet to go back to -- back to the list.
// Editing an existing one returns to that trainee's own detail page.
const backTo = computed(() => (isEdit.value ? `/trainees/${id.value}` : '/trainees'))

const fullName = ref('')
const email = ref('')
const phone = ref('')
const notes = ref('')
const startDate = ref('')
const goal = ref('')
const startingWeight = ref('')
const targetWeight = ref('')
const startingAbdomen = ref('')
const startingNeck = ref('')
const startingRightArm = ref('')
const startingLeftArm = ref('')
const startingRightLeg = ref('')
const startingLeftLeg = ref('')

const loading = ref(false)
const error = ref('')
const notFound = ref(false)
const checkingExisting = ref(isEdit.value)

onMounted(async () => {
  if (!isEdit.value) return

  await traineesStore.ensureLoaded()
  const trainee = traineesStore.getById(id.value)
  checkingExisting.value = false

  if (!trainee) {
    notFound.value = true
    return
  }

  fullName.value = trainee.full_name
  email.value = trainee.email ?? ''
  phone.value = trainee.phone ?? ''
  notes.value = trainee.notes ?? ''
  startDate.value = trainee.start_date ?? ''
  goal.value = trainee.goal ?? ''
  startingWeight.value = trainee.starting_weight ?? ''
  targetWeight.value = trainee.target_weight ?? ''
  startingAbdomen.value = trainee.starting_abdomen_cm ?? ''
  startingNeck.value = trainee.starting_neck_cm ?? ''
  startingRightArm.value = trainee.starting_right_arm_cm ?? ''
  startingLeftArm.value = trainee.starting_left_arm_cm ?? ''
  startingRightLeg.value = trainee.starting_right_leg_cm ?? ''
  startingLeftLeg.value = trainee.starting_left_leg_cm ?? ''
})

function emptyToNull(value) {
  return value === '' ? null : value
}

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    const payload = {
      full_name: fullName.value.trim(),
      email: emptyToNull(email.value.trim()),
      phone: emptyToNull(phone.value.trim()),
      notes: emptyToNull(notes.value.trim()),
      start_date: emptyToNull(startDate.value),
      goal: emptyToNull(goal.value),
      starting_weight: startingWeight.value === '' ? null : Number(startingWeight.value),
      target_weight: targetWeight.value === '' ? null : Number(targetWeight.value),
      starting_abdomen_cm: startingAbdomen.value === '' ? null : Number(startingAbdomen.value),
      starting_neck_cm: startingNeck.value === '' ? null : Number(startingNeck.value),
      starting_right_arm_cm: startingRightArm.value === '' ? null : Number(startingRightArm.value),
      starting_left_arm_cm: startingLeftArm.value === '' ? null : Number(startingLeftArm.value),
      starting_right_leg_cm: startingRightLeg.value === '' ? null : Number(startingRightLeg.value),
      starting_left_leg_cm: startingLeftLeg.value === '' ? null : Number(startingLeftLeg.value),
    }

    const trainee = isEdit.value
      ? await traineesStore.update(id.value, payload)
      : await traineesStore.create(payload)

    router.push({ name: 'trainee-detail', params: { id: trainee.id } })
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AppLayout>
    <section class="mx-auto max-w-lg">
      <BackLink :to="backTo" />

      <h1 class="mb-6 text-2xl font-bold text-brand-black sm:text-3xl">
        {{ isEdit ? 'עריכת מתאמן' : 'הוספת מתאמן' }}
      </h1>

      <p v-if="checkingExisting" class="text-neutral-600">טוען...</p>

      <p v-else-if="notFound" class="text-neutral-600">המתאמן לא נמצא.</p>

      <form v-else class="flex flex-col gap-4" @submit.prevent="handleSubmit">
        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">שם מלא</span>
          <input
            v-model="fullName"
            type="text"
            required
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">אימייל</span>
          <input
            v-model="email"
            type="email"
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">טלפון</span>
          <input
            v-model="phone"
            type="tel"
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">תאריך התחלה</span>
          <input
            v-model="startDate"
            type="date"
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">מטרה</span>
          <select
            v-model="goal"
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          >
            <option value="">— לא נבחר —</option>
            <option value="fat_loss">ירידה במשקל</option>
            <option value="muscle_gain">עלייה במסת שריר</option>
            <option value="maintenance">שמירה על משקל</option>
            <option value="custom">אחר</option>
          </select>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">משקל התחלתי (ק"ג)</span>
          <input
            v-model="startingWeight"
            type="number"
            step="0.1"
            min="0"
            dir="ltr"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">משקל מטרה (ק"ג)</span>
          <input
            v-model="targetWeight"
            type="number"
            step="0.1"
            min="0.1"
            dir="ltr"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
          />
        </label>

        <fieldset class="flex flex-col gap-3 rounded-lg border border-neutral-300 p-4">
          <legend class="px-1 text-sm text-neutral-600">היקפים התחלתיים (ס"מ)</legend>

          <div class="grid grid-cols-2 gap-4">
            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">בטן</span>
              <input
                v-model="startingAbdomen"
                type="number"
                step="0.1"
                min="0"
                dir="ltr"
                class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">צוואר</span>
              <input
                v-model="startingNeck"
                type="number"
                step="0.1"
                min="0"
                dir="ltr"
                class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">יד ימין</span>
              <input
                v-model="startingRightArm"
                type="number"
                step="0.1"
                min="0"
                dir="ltr"
                class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">יד שמאל</span>
              <input
                v-model="startingLeftArm"
                type="number"
                step="0.1"
                min="0"
                dir="ltr"
                class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">רגל ימין</span>
              <input
                v-model="startingRightLeg"
                type="number"
                step="0.1"
                min="0"
                dir="ltr"
                class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">רגל שמאל</span>
              <input
                v-model="startingLeftLeg"
                type="number"
                step="0.1"
                min="0"
                dir="ltr"
                class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
              />
            </label>
          </div>
        </fieldset>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">הערות</span>
          <textarea
            v-model="notes"
            rows="3"
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          />
        </label>

        <p v-if="error" class="text-sm text-status-red">{{ error }}</p>

        <button
          type="submit"
          :disabled="loading"
          class="rounded-lg bg-brand-green px-4 py-2 font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
        >
          {{ loading ? 'שומר...' : 'שמירה' }}
        </button>
      </form>
    </section>
  </AppLayout>
</template>
