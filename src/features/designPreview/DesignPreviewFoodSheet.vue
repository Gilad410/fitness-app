<script setup>
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'
import { formatNutritionAmount } from '../../lib/formatNumber'
import { DEMO_FOOD_SOURCES, DEMO_FOODS } from './designPreviewData'

// Bottom-sheet (mobile) / centered dialog (desktop, via CSS only -- see
// designPreview.css) food picker -- the interaction this direction is
// meant to demonstrate. Reuses the REAL app's food-selection concept
// (three sources, grams for two of them, servings for the third, same
// calories/protein-only scope -- see FoodQuantityPicker.vue and
// TraineeNutritionView.vue's own inline picker) against DEMO_FOODS only.
// Emits `add` with a plain object the parent keeps in local component
// state -- nothing here ever imports a store or supabaseClient, so
// there is no path from this sheet to any real table.
const emit = defineEmits(['close', 'add'])

const source = ref('coach')
const searchTerm = ref('')
const selectedId = ref(null)
const quantity = ref('')

const sheetRef = useTemplateRef('sheet')

const results = computed(() => {
  const term = searchTerm.value.trim()
  const list = DEMO_FOODS[source.value]
  if (!term) return list
  return list.filter((f) => f.name.includes(term))
})

const selected = computed(() => DEMO_FOODS[source.value].find((f) => f.id === selectedId.value) ?? null)

function selectSource(id) {
  if (source.value === id) return
  source.value = id
  selectedId.value = null
  quantity.value = ''
}

function pick(food) {
  selectedId.value = food.id
  quantity.value = food.unit === 'servings' ? '1' : '150'
}

const step = computed(() => (selected.value?.unit === 'servings' ? 0.5 : 10))
const unitLabel = computed(() => (selected.value?.unit === 'servings' ? 'מנות' : 'גרם'))

function adjust(delta) {
  const current = Number(quantity.value) || 0
  const next = Math.max(step.value, current + delta)
  quantity.value = selected.value?.unit === 'servings' ? String(next) : String(Math.round(next))
}

const preview = computed(() => {
  if (!selected.value) return null
  const qty = Number(quantity.value)
  if (!Number.isFinite(qty) || qty <= 0) return null
  if (selected.value.unit === 'servings') {
    return {
      calories: selected.value.caloriesPerServing * qty,
      protein: selected.value.proteinPerServing * qty,
    }
  }
  return {
    calories: (selected.value.caloriesPer100 * qty) / 100,
    protein: (selected.value.proteinPer100 * qty) / 100,
  }
})

function handleAdd() {
  if (!selected.value || !preview.value) return
  emit('add', {
    id: `demo-${selected.value.id}-${Date.now()}`,
    name: selected.value.name,
    quantity: selected.value.unit === 'servings' ? `${quantity.value} מנות` : `${quantity.value} גרם`,
    calories: Math.round(preview.value.calories),
    protein: Math.round(preview.value.protein * 10) / 10,
  })
}

function onKeydown(event) {
  if (event.key === 'Escape') emit('close')
}

// Basic focus-into-sheet on open, matching the existing bottom-sheet
// convention already used by TheBottomNavElectric.vue / TraineeBottomNavElectric.vue.
// This component is only ever freshly mounted when the sheet opens (the
// parent renders it behind v-if), so a plain onMounted is enough -- no
// watcher needed.
onMounted(async () => {
  await nextTick()
  sheetRef.value?.querySelector('input, button')?.focus()
})
</script>

<template>
  <Transition name="tp-backdrop" appear>
    <div class="tp-sheet-backdrop" @click="emit('close')" />
  </Transition>
  <Transition name="tp-sheet" appear>
    <div
      ref="sheet"
      class="tp-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="הוספת מאכל"
      @keydown="onKeydown"
    >
      <div class="tp-sheet-handle" aria-hidden="true" />

      <div class="flex items-center justify-between px-4 pt-2 pb-3">
        <p class="text-base font-bold">הוספת מאכל</p>
        <button
          type="button"
          class="flex size-11 items-center justify-center rounded-full"
          style="color: var(--tp-ink-soft)"
          aria-label="סגירה"
          @click="emit('close')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="size-5" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      </div>

      <div class="px-4">
        <label class="relative block">
          <span class="sr-only">חיפוש מאכל</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="pointer-events-none absolute top-1/2 end-3.5 size-5 -translate-y-1/2"
            style="color: var(--tp-ink-soft)"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            v-model="searchTerm"
            type="text"
            placeholder="חיפוש מאכל..."
            class="w-full rounded-2xl border px-4 py-3 pe-11 text-base"
            style="border-color: var(--tp-border)"
          />
        </label>

        <div class="mt-3 flex gap-2">
          <button
            v-for="s in DEMO_FOOD_SOURCES"
            :key="s.id"
            type="button"
            class="tp-chip"
            :aria-pressed="source === s.id"
            @click="selectSource(s.id)"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <ul class="mt-3 flex-1 overflow-y-auto px-4 pb-2">
        <li v-if="results.length === 0" class="py-6 text-center text-sm" style="color: var(--tp-ink-soft)">
          לא נמצאו מאכלים
        </li>
        <li v-for="food in results" :key="food.id">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-start"
            :style="selectedId === food.id ? 'background: rgba(47,111,237,0.08)' : ''"
            @click="pick(food)"
          >
            <span class="min-w-0 truncate text-sm font-medium">{{ food.name }}</span>
            <span class="shrink-0 text-xs tp-num" style="color: var(--tp-ink-soft)">
              {{ food.unit === 'servings' ? `${food.caloriesPerServing} קק"ל למנה` : `${food.caloriesPer100} קק"ל ל-100 גרם` }}
            </span>
          </button>
        </li>
      </ul>

      <div v-if="selected" class="border-t px-4 pt-3" style="border-color: var(--tp-border)">
        <p class="text-sm font-semibold">{{ selected.name }}</p>

        <div class="mt-2 flex items-center justify-center gap-4">
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-full text-lg font-bold"
            style="background: var(--tp-lavender); color: var(--tp-navy)"
            aria-label="הפחתת כמות"
            @click="adjust(-step)"
          >
            −
          </button>
          <span class="tp-num w-24 text-center text-xl">{{ quantity || 0 }} <span class="text-sm font-medium">{{ unitLabel }}</span></span>
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-full text-lg font-bold"
            style="background: var(--tp-lavender); color: var(--tp-navy)"
            aria-label="הגדלת כמות"
            @click="adjust(step)"
          >
            +
          </button>
        </div>

        <div v-if="preview" class="mt-3 flex items-center justify-center gap-4">
          <span class="tp-stat-pair">
            <span class="tp-num text-lg" style="color: var(--tp-blue)">{{ formatNutritionAmount(preview.calories) }}</span>
            <span class="text-xs" style="color: var(--tp-ink-soft)">קק"ל</span>
          </span>
          <span class="tp-stat-pair">
            <span class="tp-num text-lg" style="color: var(--tp-violet)">{{ formatNutritionAmount(preview.protein) }}</span>
            <span class="text-xs" style="color: var(--tp-ink-soft)">גר' חלבון</span>
          </span>
        </div>
      </div>

      <div class="p-4">
        <button type="button" class="tp-btn-primary w-full" :disabled="!preview" @click="handleAdd">
          הוספה ליומן
        </button>
      </div>
    </div>
  </Transition>
</template>
