<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useProgressPhotosStore } from '../store/progressPhotos'

const props = defineProps({
  trainee: { type: Object, required: true },
})

const progressPhotosStore = useProgressPhotosStore()

const ANGLES = [
  { key: 'front', label: 'מלפנים' },
  { key: 'side', label: 'מהצד' },
  { key: 'back', label: 'מאחור' },
]

const photosChecking = ref(true)
const photosError = ref('')

const showAddPhotos = ref(false)
const addingPhotos = ref(false)
const addPhotosError = ref('')
const angleErrors = reactive({})
const photoDate = ref(todayIsoDate())
const files = reactive({ front: null, side: null, back: null })
const previews = reactive({ front: null, side: null, back: null })

const confirmDeleteId = ref(null)
const deletingId = ref(null)
const deleteError = ref('')

onMounted(async () => {
  try {
    await progressPhotosStore.ensureLoaded(props.trainee.id)
  } catch (err) {
    photosError.value = err.message
  } finally {
    photosChecking.value = false
  }
})

onBeforeUnmount(() => {
  ANGLES.forEach((a) => revokePreview(a.key))
})

const photos = computed(() => progressPhotosStore.photosFor(props.trainee.id))

// Flat rows (one per angle) grouped into date "sessions" for display.
// photos is already sorted newest-date-first by the store, and Map
// preserves insertion order, so the grouped list stays in that order too.
const groupedByDate = computed(() => {
  const byDate = new Map()
  for (const photo of photos.value) {
    if (!byDate.has(photo.logged_at)) byDate.set(photo.logged_at, {})
    byDate.get(photo.logged_at)[photo.angle] = photo
  }
  return [...byDate.entries()].map(([date, byAngle]) => ({ date, byAngle }))
})

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

const dateFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' })

function revokePreview(angle) {
  if (previews[angle]) URL.revokeObjectURL(previews[angle])
  previews[angle] = null
}

function handleFileChange(angle, event) {
  const file = event.target.files[0] ?? null
  revokePreview(angle)
  files[angle] = file
  previews[angle] = file ? URL.createObjectURL(file) : null
}

function resetForm() {
  ANGLES.forEach((a) => {
    revokePreview(a.key)
    files[a.key] = null
    angleErrors[a.key] = null
  })
  photoDate.value = todayIsoDate()
}

async function handleAddPhotos() {
  addPhotosError.value = ''
  ANGLES.forEach((a) => {
    angleErrors[a.key] = null
  })

  const selected = ANGLES.filter((a) => files[a.key])
  if (selected.length === 0) {
    addPhotosError.value = 'יש לבחור לפחות תמונה אחת.'
    return
  }

  addingPhotos.value = true
  try {
    for (const angle of selected) {
      try {
        await progressPhotosStore.addPhoto(props.trainee.id, {
          angle: angle.key,
          logged_at: photoDate.value,
          file: files[angle.key],
        })
        revokePreview(angle.key)
        files[angle.key] = null
      } catch (err) {
        angleErrors[angle.key] = err.message
      }
    }

    if (ANGLES.every((a) => !angleErrors[a.key])) {
      resetForm()
      showAddPhotos.value = false
    }
  } finally {
    addingPhotos.value = false
  }
}

async function confirmDelete(photo) {
  deleteError.value = ''
  deletingId.value = photo.id
  try {
    await progressPhotosStore.deletePhoto(props.trainee.id, photo)
    confirmDeleteId.value = null
  } catch (err) {
    deleteError.value = err.message
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="mt-8 flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
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
            v-if="previews[angle.key]"
            :src="previews[angle.key]"
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
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="text-xs"
            @change="handleFileChange(angle.key, $event)"
          />

          <p v-if="angleErrors[angle.key]" class="text-xs text-status-red">
            {{ angleErrors[angle.key] }}
          </p>
        </div>
      </div>

      <p v-if="addPhotosError" class="text-sm text-status-red">{{ addPhotosError }}</p>

      <div class="flex flex-wrap gap-3">
        <button
          type="submit"
          :disabled="addingPhotos"
          class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
        >
          {{ addingPhotos ? 'מעלה...' : 'שמור תמונות' }}
        </button>
        <button
          type="button"
          :disabled="addingPhotos"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
          @click="resetForm(); showAddPhotos = false"
        >
          ביטול
        </button>
      </div>
    </form>

    <p v-if="photosChecking" class="text-sm text-neutral-600">טוען...</p>

    <p v-else-if="photosError" class="text-sm text-status-red">{{ photosError }}</p>

    <p v-if="deleteError" class="text-sm text-status-red">{{ deleteError }}</p>

    <p
      v-if="!photosChecking && !photosError && groupedByDate.length === 0"
      class="text-sm text-neutral-600"
    >
      אין עדיין תמונות התקדמות.
    </p>

    <ul v-else-if="!photosChecking && !photosError" class="flex flex-col gap-4">
      <li
        v-for="session in groupedByDate"
        :key="session.date"
        class="border-t border-neutral-300 pt-4 first:border-t-0 first:pt-0"
      >
        <p class="mb-2 text-sm text-neutral-600">{{ dateFormatter.format(new Date(session.date)) }}</p>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div v-for="angle in ANGLES" :key="angle.key" class="flex flex-col gap-2">
            <template v-if="session.byAngle[angle.key]">
              <img
                :src="session.byAngle[angle.key].signedUrl"
                :alt="angle.label"
                class="aspect-square w-full rounded-lg border border-neutral-300 object-cover"
              />
              <span class="text-center text-xs text-neutral-600">{{ angle.label }}</span>

              <template v-if="confirmDeleteId === session.byAngle[angle.key].id">
                <button
                  type="button"
                  :disabled="deletingId === session.byAngle[angle.key].id"
                  class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-status-red px-2 py-1 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:opacity-60"
                  @click="confirmDelete(session.byAngle[angle.key])"
                >
                  {{ deletingId === session.byAngle[angle.key].id ? 'מוחק...' : 'אישור מחיקה' }}
                </button>
                <button
                  type="button"
                  :disabled="deletingId === session.byAngle[angle.key].id"
                  class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-neutral-300 px-2 py-1 text-xs font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                  @click="confirmDeleteId = null"
                >
                  ביטול
                </button>
              </template>
              <button
                v-else
                type="button"
                class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-neutral-300 px-2 py-1 text-xs font-medium text-brand-black hover:bg-neutral-100"
                @click="confirmDeleteId = session.byAngle[angle.key].id"
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
  </div>
</template>
