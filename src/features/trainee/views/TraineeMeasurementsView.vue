<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import TraineeLayout from '../layouts/TraineeLayout.vue'
import { useTraineeCircumferenceLogsStore } from '../store/traineeCircumferenceLogs'
import { useTraineeProgressPhotosStore } from '../store/traineeProgressPhotos'
import { useTraineeProgressLogsStore } from '../store/traineeProgressLogs'
import { useTraineeProfileStore } from '../store/traineeProfile'

// Trainee-side "Measurements and Photos": own circumference history +
// logging, own progress photos, plus a weight summary at the top that
// reuses the SAME trainee-scoped stores "My Progress" already built
// (useTraineeProgressLogsStore / useTraineeProfileStore) -- no new weight
// column, RPC, or duplicated fetch is introduced here; this page only
// reads what those stores already load. The circumference/photo stat
// blocks, form shapes, and hand-rolled grouped-photo-gallery logic below
// are a direct, intentional re-implementation of the coach's
// TraineeCircumferenceSection.vue / TraineeProgressPhotosSection.vue (same
// calculations, same Hebrew wording/labels) -- NOT an import of either
// component or its coach-scoped, multi-trainee store.
const circumferenceLogsStore = useTraineeCircumferenceLogsStore()
const photosStore = useTraineeProgressPhotosStore()
const progressLogsStore = useTraineeProgressLogsStore()
const profileStore = useTraineeProfileStore()

const checking = ref(true)
const loadError = ref('')

onMounted(async () => {
  try {
    await Promise.all([
      circumferenceLogsStore.ensureLoaded(),
      circumferenceLogsStore.ensureStartingLoaded(),
      photosStore.ensureLoaded(),
      progressLogsStore.ensureLoaded(),
      profileStore.fetchProfile(),
    ])
  } catch (err) {
    loadError.value = err.message
  } finally {
    checking.value = false
  }
})

function todayIsoDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const dateFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' })

// ---- Weight summary (reused stores, no duplicated data) ----
const currentWeight = computed(() => progressLogsStore.latestLog?.weight ?? null)
const targetWeight = computed(() => profileStore.profile?.target_weight ?? null)

// Same wording as TraineeProgressView.vue's targetStatus -- phrased as a
// plain-language status rather than a signed number.
const weightTargetStatus = computed(() => {
  if (currentWeight.value === null || !targetWeight.value) return null
  const diff = currentWeight.value - targetWeight.value
  const rounded = Math.round(Math.abs(diff) * 10) / 10
  if (rounded === 0) return 'הגעת ליעד'
  return diff < 0 ? `חסר ${rounded} ק"ג` : `${rounded} ק"ג מעל היעד`
})

// ---- Circumferences ----
const MEASUREMENTS = [
  { key: 'abdomen_cm', startingKey: 'starting_abdomen_cm', formKey: 'abdomenCm', label: 'בטן' },
  { key: 'neck_cm', startingKey: 'starting_neck_cm', formKey: 'neckCm', label: 'צוואר' },
  { key: 'right_arm_cm', startingKey: 'starting_right_arm_cm', formKey: 'rightArmCm', label: 'יד ימין' },
  { key: 'left_arm_cm', startingKey: 'starting_left_arm_cm', formKey: 'leftArmCm', label: 'יד שמאל' },
  { key: 'right_leg_cm', startingKey: 'starting_right_leg_cm', formKey: 'rightLegCm', label: 'רגל ימין' },
  { key: 'left_leg_cm', startingKey: 'starting_left_leg_cm', formKey: 'leftLegCm', label: 'רגל שמאל' },
]

const showAddMeasurement = ref(false)
const circumferenceForm = reactive(Object.fromEntries(MEASUREMENTS.map((m) => [m.formKey, ''])))
const circumferenceDate = ref(todayIsoDate())
const circumferenceNote = ref('')
const circumferenceValidationError = ref('')

const confirmDeleteMeasurementId = ref(null)

// Newest log (logs are already newest-first) that has a non-null value
// for this key -- a log may only record some of the six measurements.
function latestValueFor(key) {
  const log = circumferenceLogsStore.logs.find((l) => l[key] !== null && l[key] !== undefined)
  return log ? log[key] : null
}

function startingValueFor(startingKey) {
  return circumferenceLogsStore.starting?.[startingKey] ?? null
}

function changeFor(key, startingKey) {
  const latest = latestValueFor(key)
  const starting = startingValueFor(startingKey)
  if (latest === null || !starting) return null
  const rounded = Math.round((Number(latest) - Number(starting)) * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded} ס"מ`
}

const measurementSummaries = computed(() =>
  MEASUREMENTS.map((m) => ({
    ...m,
    starting: startingValueFor(m.startingKey),
    latest: latestValueFor(m.key),
    change: changeFor(m.key, m.startingKey),
  })).filter((m) => m.starting !== null || m.latest !== null),
)

function measurementsFor(log) {
  return MEASUREMENTS.filter((m) => log[m.key] !== null && log[m.key] !== undefined)
}

function resetCircumferenceForm() {
  MEASUREMENTS.forEach((m) => {
    circumferenceForm[m.formKey] = ''
  })
  circumferenceDate.value = todayIsoDate()
  circumferenceNote.value = ''
  circumferenceValidationError.value = ''
}

async function handleAddMeasurement() {
  circumferenceValidationError.value = ''

  const payload = Object.fromEntries(
    MEASUREMENTS.map((m) => [m.formKey, circumferenceForm[m.formKey] === '' ? null : Number(circumferenceForm[m.formKey])]),
  )

  if (Object.values(payload).every((value) => value === null)) {
    circumferenceValidationError.value = 'יש להזין לפחות מדידה אחת.'
    return
  }

  try {
    await circumferenceLogsStore.addLog({
      ...payload,
      loggedAt: circumferenceDate.value,
      note: circumferenceNote.value.trim() === '' ? null : circumferenceNote.value.trim(),
    })
    resetCircumferenceForm()
    showAddMeasurement.value = false
  } catch {
    // surfaced via circumferenceLogsStore.addError below; form stays open for retry
  }
}

async function confirmDeleteMeasurement(logId) {
  try {
    await circumferenceLogsStore.deleteLog(logId)
    confirmDeleteMeasurementId.value = null
  } catch {
    // surfaced via circumferenceLogsStore.deleteError below; stays on confirm step
  }
}

// ---- Photos ----
const ANGLES = [
  { key: 'front', label: 'מלפנים' },
  { key: 'side', label: 'מהצד' },
  { key: 'back', label: 'מאחור' },
]

const showAddPhotos = ref(false)
const angleErrors = reactive({})
const photoDate = ref(todayIsoDate())
const photoFiles = reactive({ front: null, side: null, back: null })
const photoPreviews = reactive({ front: null, side: null, back: null })
const addPhotosValidationError = ref('')
const addingPhotos = ref(false)

// Native <input type="file"> elements, one per angle -- keyed here (not
// v-model, which file inputs don't support) so a successful upload or a
// cancel/reset can clear the browser's own selected-file state, not just
// this component's JS-tracked photoFiles/photoPreviews. Without this, the
// input keeps visually showing the previously chosen filename even after
// photoFiles[angle] is reset to null.
const fileInputRefs = reactive({ front: null, side: null, back: null })
function setFileInputRef(angle, el) {
  fileInputRefs[angle] = el
}

const confirmDeletePhotoId = ref(null)

// Flat rows (one per angle) grouped into date "sessions" for display.
// photos is already sorted newest-date-first by the store, and Map
// preserves insertion order, so the grouped list stays in that order too.
const groupedPhotosByDate = computed(() => {
  const byDate = new Map()
  for (const photo of photosStore.photos) {
    if (!byDate.has(photo.logged_at)) byDate.set(photo.logged_at, {})
    byDate.get(photo.logged_at)[photo.angle] = photo
  }
  return [...byDate.entries()].map(([date, byAngle]) => ({ date, byAngle }))
})

onBeforeUnmount(() => {
  ANGLES.forEach((a) => revokePhotoPreview(a.key))
})

function revokePhotoPreview(angle) {
  if (photoPreviews[angle]) URL.revokeObjectURL(photoPreviews[angle])
  photoPreviews[angle] = null
}

// Clears the file this component is tracking AND the native input's own
// selected-file state -- see the fileInputRefs comment above.
function clearPhotoInput(angle) {
  revokePhotoPreview(angle)
  photoFiles[angle] = null
  if (fileInputRefs[angle]) fileInputRefs[angle].value = ''
}

function handlePhotoFileChange(angle, event) {
  const file = event.target.files[0] ?? null
  revokePhotoPreview(angle)
  photoFiles[angle] = file
  photoPreviews[angle] = file ? URL.createObjectURL(file) : null
}

function resetPhotoForm() {
  ANGLES.forEach((a) => {
    clearPhotoInput(a.key)
    angleErrors[a.key] = null
  })
  photoDate.value = todayIsoDate()
  addPhotosValidationError.value = ''
}

async function handleAddPhotos() {
  addPhotosValidationError.value = ''
  ANGLES.forEach((a) => {
    angleErrors[a.key] = null
  })

  const selected = ANGLES.filter((a) => photoFiles[a.key])
  if (selected.length === 0) {
    addPhotosValidationError.value = 'יש לבחור לפחות תמונה אחת.'
    return
  }

  addingPhotos.value = true
  try {
    for (const angle of selected) {
      try {
        await photosStore.addPhoto({
          angle: angle.key,
          loggedAt: photoDate.value,
          file: photoFiles[angle.key],
        })
        clearPhotoInput(angle.key)
      } catch (err) {
        angleErrors[angle.key] = err.message
      }
    }

    if (ANGLES.every((a) => !angleErrors[a.key])) {
      resetPhotoForm()
      showAddPhotos.value = false
    }
  } finally {
    addingPhotos.value = false
  }
}

async function confirmDeletePhoto(photo) {
  try {
    await photosStore.deletePhoto(photo)
    confirmDeletePhotoId.value = null
  } catch {
    // surfaced via photosStore.deleteError below; stays on confirm step
  }
}
</script>

<template>
  <TraineeLayout>
    <div class="mx-auto max-w-2xl">
      <section class="mb-6 sm:mb-8">
        <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">מדידות ותמונות</h1>
        <p class="mt-1 text-sm text-neutral-600">היקפי גוף ותמונות התקדמות פרטיות</p>
      </section>

      <p v-if="checking" class="text-neutral-600">טוען...</p>

      <div
        v-else-if="loadError"
        class="flex flex-col items-start gap-3 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm"
      >
        <p class="text-sm text-status-red">{{ loadError }}</p>
        <button
          type="button"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
          @click="$router.go(0)"
        >
          נסה שוב
        </button>
      </div>

      <template v-else>
        <!-- Weight summary -- reused from useTraineeProgressLogsStore / useTraineeProfileStore, no new data. -->
        <section
          v-if="currentWeight !== null || targetWeight !== null"
          class="mb-6 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6"
        >
          <h2 class="mb-4 font-semibold text-brand-black">משקל</h2>
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div v-if="currentWeight !== null">
              <dt class="text-sm text-neutral-600">משקל נוכחי</dt>
              <dd class="text-lg font-semibold text-brand-black">{{ currentWeight }} ק"ג</dd>
            </div>
            <div v-if="targetWeight !== null">
              <dt class="text-sm text-neutral-600">משקל יעד</dt>
              <dd class="text-lg font-semibold text-brand-black">{{ targetWeight }} ק"ג</dd>
            </div>
            <div v-if="weightTargetStatus">
              <dt class="text-sm text-neutral-600">לעומת יעד</dt>
              <dd class="text-lg font-semibold text-brand-black">{{ weightTargetStatus }}</dd>
            </div>
          </div>
        </section>

        <!-- Circumferences -->
        <section class="mb-6 flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <h2 class="font-semibold text-brand-black">היקפי גוף</h2>
            <button
              v-if="!showAddMeasurement"
              type="button"
              class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark"
              @click="showAddMeasurement = true"
            >
              הוסף מדידה
            </button>
          </div>

          <div v-if="measurementSummaries.length > 0" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div
              v-for="m in measurementSummaries"
              :key="m.key"
              class="rounded-xl border border-neutral-300 p-3"
            >
              <p class="text-sm font-medium text-brand-black">{{ m.label }}</p>
              <p class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-neutral-600">
                <span v-if="m.starting !== null">התחלתי: {{ m.starting }} ס"מ</span>
                <span v-if="m.latest !== null">נוכחי: {{ m.latest }} ס"מ</span>
                <span v-if="m.change">שינוי: {{ m.change }}</span>
              </p>
            </div>
          </div>

          <form
            v-if="showAddMeasurement"
            class="flex flex-col gap-4 rounded-xl border border-neutral-300 p-4"
            @submit.prevent="handleAddMeasurement"
          >
            <div class="grid grid-cols-2 gap-4">
              <label v-for="m in MEASUREMENTS" :key="m.formKey" class="flex flex-col gap-1">
                <span class="text-sm text-neutral-600">{{ m.label }} (ס"מ)</span>
                <input
                  v-model="circumferenceForm[m.formKey]"
                  type="number"
                  step="0.1"
                  min="0.1"
                  dir="ltr"
                  class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
                />
              </label>
            </div>

            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">תאריך</span>
              <input
                v-model="circumferenceDate"
                type="date"
                required
                class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">הערה</span>
              <textarea
                v-model="circumferenceNote"
                rows="2"
                class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
              />
            </label>

            <p v-if="circumferenceValidationError" class="text-sm text-status-red">
              {{ circumferenceValidationError }}
            </p>
            <p v-if="circumferenceLogsStore.addError" class="text-sm text-status-red">
              {{ circumferenceLogsStore.addError }}
            </p>

            <div class="flex flex-wrap gap-3">
              <button
                type="submit"
                :disabled="circumferenceLogsStore.adding"
                class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {{ circumferenceLogsStore.adding ? 'שומר...' : 'שמור מדידה' }}
              </button>
              <button
                type="button"
                :disabled="circumferenceLogsStore.adding"
                class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                @click="showAddMeasurement = false"
              >
                ביטול
              </button>
            </div>
          </form>

          <p v-if="circumferenceLogsStore.deleteError" class="text-sm text-status-red">
            {{ circumferenceLogsStore.deleteError }}
          </p>

          <p
            v-if="circumferenceLogsStore.logs.length === 0"
            class="text-sm text-neutral-600"
          >
            אין עדיין מדידות היקפים.
          </p>

          <ul v-else class="flex flex-col gap-3">
            <li
              v-for="log in circumferenceLogsStore.logs"
              :key="log.id"
              class="flex flex-wrap items-start justify-between gap-4 border-t border-neutral-300 pt-3 first:border-t-0 first:pt-0"
            >
              <div class="min-w-0">
                <p class="text-sm text-neutral-600">
                  {{ dateFormatter.format(new Date(log.logged_at)) }}
                </p>
                <p class="flex flex-wrap gap-x-3 gap-y-1 text-brand-black">
                  <span v-for="m in measurementsFor(log)" :key="m.key" class="font-semibold">
                    {{ m.label }}: {{ log[m.key] }} ס"מ
                  </span>
                </p>
                <p v-if="log.note" class="truncate text-sm text-neutral-600">{{ log.note }}</p>
              </div>

              <div class="flex shrink-0 items-center gap-3">
                <template v-if="confirmDeleteMeasurementId === log.id">
                  <button
                    type="button"
                    :disabled="circumferenceLogsStore.deletingId === log.id"
                    class="rounded-lg bg-status-red px-3 py-1.5 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:cursor-not-allowed disabled:opacity-60"
                    @click="confirmDeleteMeasurement(log.id)"
                  >
                    {{ circumferenceLogsStore.deletingId === log.id ? 'מוחק...' : 'אישור מחיקה' }}
                  </button>
                  <button
                    type="button"
                    :disabled="circumferenceLogsStore.deletingId === log.id"
                    class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                    @click="confirmDeleteMeasurementId = null"
                  >
                    ביטול
                  </button>
                </template>
                <button
                  v-else
                  type="button"
                  class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100"
                  @click="confirmDeleteMeasurementId = log.id"
                >
                  מחק
                </button>
              </div>
            </li>
          </ul>
        </section>

        <!-- Progress photos -->
        <section class="flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <h2 class="font-semibold text-brand-black">תמונות התקדמות</h2>
            <button
              v-if="!showAddPhotos"
              type="button"
              class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark"
              @click="showAddPhotos = true"
            >
              הוסף תמונות
            </button>
          </div>

          <p class="text-xs text-neutral-600">
            התמונות פרטיות ונגישות רק לך. הן נשמרות באחסון מאובטח ולא חשופות בקישור ציבורי.
          </p>

          <form
            v-if="showAddPhotos"
            class="flex flex-col gap-4 rounded-xl border border-neutral-300 p-4"
            @submit.prevent="handleAddPhotos"
          >
            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">תאריך</span>
              <input
                v-model="photoDate"
                type="date"
                required
                class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
              />
            </label>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div v-for="angle in ANGLES" :key="angle.key" class="flex flex-col gap-2">
                <span class="text-sm text-neutral-600">{{ angle.label }}</span>

                <img
                  v-if="photoPreviews[angle.key]"
                  :src="photoPreviews[angle.key]"
                  alt=""
                  class="aspect-square w-full rounded-lg border border-neutral-300 object-cover"
                />
                <div
                  v-else
                  class="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-600"
                >
                  אין תמונה
                </div>

                <input
                  :ref="(el) => setFileInputRef(angle.key, el)"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  class="text-xs"
                  @change="handlePhotoFileChange(angle.key, $event)"
                />

                <p v-if="angleErrors[angle.key]" class="text-xs text-status-red">
                  {{ angleErrors[angle.key] }}
                </p>
              </div>
            </div>

            <p v-if="addPhotosValidationError" class="text-sm text-status-red">
              {{ addPhotosValidationError }}
            </p>

            <div class="flex flex-wrap gap-3">
              <button
                type="submit"
                :disabled="addingPhotos"
                class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {{ addingPhotos ? 'מעלה...' : 'שמור תמונות' }}
              </button>
              <button
                type="button"
                :disabled="addingPhotos"
                class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                @click="resetPhotoForm(); showAddPhotos = false"
              >
                ביטול
              </button>
            </div>
          </form>

          <p v-if="photosStore.deleteError" class="text-sm text-status-red">{{ photosStore.deleteError }}</p>

          <p v-if="groupedPhotosByDate.length === 0" class="text-sm text-neutral-600">
            אין עדיין תמונות התקדמות.
          </p>

          <ul v-else class="flex flex-col gap-4">
            <li
              v-for="session in groupedPhotosByDate"
              :key="session.date"
              class="border-t border-neutral-300 pt-4 first:border-t-0 first:pt-0"
            >
              <p class="mb-2 text-sm text-neutral-600">{{ dateFormatter.format(new Date(session.date)) }}</p>

              <div class="grid grid-cols-3 gap-3">
                <div v-for="angle in ANGLES" :key="angle.key" class="flex flex-col gap-2">
                  <template v-if="session.byAngle[angle.key]">
                    <img
                      :src="session.byAngle[angle.key].signedUrl"
                      :alt="angle.label"
                      class="aspect-square w-full rounded-lg border border-neutral-300 object-cover"
                    />
                    <span class="text-center text-xs text-neutral-600">{{ angle.label }}</span>

                    <template v-if="confirmDeletePhotoId === session.byAngle[angle.key].id">
                      <button
                        type="button"
                        :disabled="photosStore.deletingId === session.byAngle[angle.key].id"
                        class="rounded-lg bg-status-red px-2 py-1 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:cursor-not-allowed disabled:opacity-60"
                        @click="confirmDeletePhoto(session.byAngle[angle.key])"
                      >
                        {{ photosStore.deletingId === session.byAngle[angle.key].id ? 'מוחק...' : 'אישור מחיקה' }}
                      </button>
                      <button
                        type="button"
                        :disabled="photosStore.deletingId === session.byAngle[angle.key].id"
                        class="rounded-lg border border-neutral-300 px-2 py-1 text-xs font-medium text-brand-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                        @click="confirmDeletePhotoId = null"
                      >
                        ביטול
                      </button>
                    </template>
                    <button
                      v-else
                      type="button"
                      class="rounded-lg border border-neutral-300 px-2 py-1 text-xs font-medium text-brand-black hover:bg-neutral-100"
                      @click="confirmDeletePhotoId = session.byAngle[angle.key].id"
                    >
                      מחק
                    </button>
                  </template>
                  <template v-else>
                    <div
                      class="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-600"
                    >
                      אין תמונה
                    </div>
                    <span class="text-center text-xs text-neutral-600">{{ angle.label }}</span>
                  </template>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </TraineeLayout>
</template>
