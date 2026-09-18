<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { lookupBarcode, isPlausibleBarcode, SOURCE_OPEN_FOOD_FACTS } from '../lib/barcodeLookup.js'
import { calculateBarcodeNutrition } from '../lib/barcodeCalculation.js'
import {
  getCameraScanStrategy,
  supportsCameraBarcodeScanning,
  CAMERA_STRATEGY_NATIVE,
  CAMERA_STRATEGY_ZXING,
} from '../lib/barcodeCameraSupport.js'
import { formatNutritionAmount } from '../../../lib/formatNumber'

// Self-contained barcode food-entry flow: scan (or type) a barcode ->
// look it up against Open Food Facts -> show the matched product ->
// enter grams -> review -> emit "resolved" with a payload shaped to
// spread straight into nutritionLogsStore.addLog(), exactly the same
// resolve()-returns-a-payload contract FoodQuantityPicker.vue uses for
// the existing regular-food/restaurant-item flow (see its own comment
// for why) -- kept as a SEPARATE component rather than a third tab on
// that shared picker, since FoodQuantityPicker is also used by the
// coach's nutrition-PLAN builder (NutritionPlanSection.vue), and
// barcode scanning is in scope for the LOG only per this feature's
// requirements; reusing that picker would have pulled barcode support
// into meal planning too, which was never asked for and would need its
// own schema/trigger work on a completely different table.
//
// This component does not itself call any store or touch Supabase --
// same separation FoodQuantityPicker.vue already has: the caller
// (NutritionSection.vue) owns persistence.

const emit = defineEmits(['resolved', 'cancel'])

// 'choose' (scan vs manual) -> 'scanning' (camera live) ->
// 'looking_up' -> 'found' | 'lookup_failed' (not_found/no_nutrition_data/
// invalid_barcode/error, collapsed to one UI state with a per-case
// message) -> 'manual_nutrition' (typed-in fallback, reachable from
// 'lookup_failed' or directly if the barcode step is skipped entirely
// is NOT offered -- a barcode is always attempted first, per requirement).
const step = ref('choose')
const cameraSupported = supportsCameraBarcodeScanning()

const manualBarcodeInput = ref('')
const scanError = ref('')
const lookupMessage = ref('')
const lastBarcode = ref('')

const product = ref(null) // { name, caloriesPer100g, proteinPer100g, source, sourceUrl }
const grams = ref('')

// Manual-nutrition fallback fields (requirement 8: a clear message plus
// manual entry when nothing usable was found).
const manualName = ref('')
const manualCalories = ref('')
const manualProtein = ref('')

let videoEl = null
let mediaStream = null
let detector = null
let scanLoopId = null
let scanStrategy = null // CAMERA_STRATEGY_NATIVE | CAMERA_STRATEGY_ZXING, set for the duration of one scan attempt
let zxingReader = null
let zxingControls = null

const gramsNumber = computed(() => {
  const n = Number(grams.value)
  return Number.isFinite(n) && n > 0 ? n : null
})

const preview = computed(() => {
  if (!product.value || gramsNumber.value === null) return null
  try {
    return calculateBarcodeNutrition({
      caloriesPer100g: product.value.caloriesPer100g,
      proteinPer100g: product.value.proteinPer100g,
      grams: gramsNumber.value,
    })
  } catch {
    return null
  }
})

function sourceLabel(source) {
  return source === SOURCE_OPEN_FOOD_FACTS ? 'Open Food Facts' : source
}

const manualPreview = computed(() => {
  const cal = Number(manualCalories.value)
  const grm = gramsNumber.value
  if (!Number.isFinite(cal) || cal < 0 || grm === null) return null
  const proteinRaw = manualProtein.value.trim()
  const protein = proteinRaw === '' ? null : Number(manualProtein.value)
  if (protein !== null && (!Number.isFinite(protein) || protein < 0)) return null
  try {
    return calculateBarcodeNutrition({ caloriesPer100g: cal, proteinPer100g: protein, grams: grm })
  } catch {
    return null
  }
})

function startManualBarcode() {
  stopScanning()
  step.value = 'manual_barcode'
}

// Dispatches to whichever decode engine getCameraScanStrategy() picks --
// native BarcodeDetector when the browser has it (no extra bundle
// weight), otherwise the ZXing fallback that makes iOS Safari/Firefox
// scanning possible at all. cameraSupported (computed once, above)
// already gated whether the "סרוק עם המצלמה" button is shown in the
// first place, so CAMERA_STRATEGY_UNSUPPORTED is not expected to reach
// here in normal use -- the manual-entry branch below is defensive.
async function startScanning() {
  scanError.value = ''
  step.value = 'scanning'
  scanStrategy = getCameraScanStrategy()

  if (scanStrategy === CAMERA_STRATEGY_NATIVE) {
    await startNativeScanning()
  } else if (scanStrategy === CAMERA_STRATEGY_ZXING) {
    await startZxingScanning()
  } else {
    startManualBarcode()
  }
}

async function startNativeScanning() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  } catch {
    // Permission denied, no camera, or any other getUserMedia failure --
    // all land in the same manual-entry fallback (requirement: handle
    // camera permission denial).
    scanError.value = 'לא ניתן לגשת למצלמה. ניתן להזין את הברקוד ידנית.'
    startManualBarcode()
    return
  }

  // videoEl is bound via the template ref once step === 'scanning'
  // renders the <video> element; assigned by the template's @vue:mounted
  // hook below rather than a template ref, so this function can attach
  // the stream to it directly without waiting an extra tick.
  if (videoEl) {
    videoEl.srcObject = mediaStream
    await videoEl.play()
  }

  // BarcodeDetector: a browser global, only reached when
  // getCameraScanStrategy() already confirmed it exists.
  detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
  runScanLoop()
}

function runScanLoop() {
  scanLoopId = requestAnimationFrame(async () => {
    if (!videoEl || step.value !== 'scanning') return
    try {
      const barcodes = await detector.detect(videoEl)
      if (barcodes.length > 0) {
        await handleBarcodeCaptured(barcodes[0].rawValue)
        return
      }
    } catch {
      // A single failed detect() pass (e.g. a transient decode error) is
      // not fatal -- just try again on the next frame.
    }
    runScanLoop()
  })
}

// ZXing fallback engine (Safari/iOS, Firefox -- anything without
// BarcodeDetector). Dynamically imported so its bundle cost is only
// ever paid by browsers that actually need it -- a Chrome/Edge user
// scanning via the native path never downloads this at all (Vite
// automatically code-splits a dynamic import into its own chunk).
async function startZxingScanning() {
  let BrowserMultiFormatReader, DecodeHintType, BarcodeFormat
  try {
    ;[{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ])
  } catch {
    // The decoder library itself failed to load (e.g. offline) -- same
    // fallback as any other camera failure, nothing barcode-specific to
    // say about it.
    scanError.value = 'לא ניתן לטעון את מנוע הסריקה. ניתן להזין את הברקוד ידנית.'
    startManualBarcode()
    return
  }

  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
  ])
  zxingReader = new BrowserMultiFormatReader(hints)

  try {
    // decodeFromConstraints calls getUserMedia internally with these
    // constraints -- a rejection here (permission denied, no camera)
    // surfaces the exact same way the native path's own getUserMedia
    // call does, so one catch block covers both engines identically.
    zxingControls = await zxingReader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoEl,
      (result) => {
        // `result` is undefined on almost every callback invocation --
        // ZXing calls back on every failed decode attempt too (a
        // NotFoundException on the `error` argument, ignored here since
        // it just means "no barcode in view yet on this frame", not a
        // real failure). Only a defined `result` is a genuine capture.
        if (result) {
          handleBarcodeCaptured(result.getText())
        }
      },
    )
  } catch {
    scanError.value = 'לא ניתן לגשת למצלמה. ניתן להזין את הברקוד ידנית.'
    startManualBarcode()
  }
}

function stopScanning() {
  if (scanLoopId !== null) {
    cancelAnimationFrame(scanLoopId)
    scanLoopId = null
  }
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) track.stop()
    mediaStream = null
  }
  detector = null
  if (zxingControls) {
    // .stop() also releases the underlying camera stream ZXing opened
    // via decodeFromConstraints -- no separate track-stopping needed on
    // this path the way the native branch above needs it.
    zxingControls.stop()
    zxingControls = null
  }
  zxingReader = null
  scanStrategy = null
}

onBeforeUnmount(stopScanning)

async function handleBarcodeCaptured(barcode) {
  stopScanning()
  await runLookup(barcode)
}

async function submitManualBarcode() {
  const value = manualBarcodeInput.value.trim()
  if (!isPlausibleBarcode(value)) {
    scanError.value = 'הברקוד שהוזן אינו תקין (יש להזין 8, 12, 13 או 14 ספרות)'
    return
  }
  scanError.value = ''
  await runLookup(value)
}

async function runLookup(barcode) {
  lastBarcode.value = barcode
  step.value = 'looking_up'
  const result = await lookupBarcode(barcode)

  if (result.status === 'found') {
    product.value = result.product
    grams.value = ''
    step.value = 'found'
    return
  }

  const messages = {
    not_found: 'המוצר לא נמצא במאגר. ניתן להזין את הפרטים ידנית.',
    no_nutrition_data: result.productName
      ? `נמצא "${result.productName}", אך ללא נתוני קלוריות. ניתן להזין את הפרטים ידנית.`
      : 'המוצר נמצא אך ללא נתוני תזונה. ניתן להזין את הפרטים ידנית.',
    invalid_barcode: 'הברקוד שנסרק אינו תקין. ניתן לנסות שוב או להזין ידנית.',
    error: result.message || 'אירעה שגיאה בחיפוש. ניתן להזין את הפרטים ידנית.',
  }
  lookupMessage.value = messages[result.status] ?? messages.error
  manualName.value = result.productName ?? ''
  step.value = 'lookup_failed'
}

function goToManualNutrition() {
  step.value = 'manual_nutrition'
}

function confirmFound() {
  if (!product.value || preview.value === null) return
  emit('resolved', {
    barcode: lastBarcode.value,
    barcode_source: product.value.source,
    barcode_product_name: product.value.name,
    barcode_calories_per_100g: product.value.caloriesPer100g,
    barcode_protein_per_100g: product.value.proteinPer100g,
    grams: gramsNumber.value,
  })
}

function confirmManual() {
  if (manualPreview.value === null) return
  const proteinRaw = manualProtein.value.trim()
  emit('resolved', {
    barcode: lastBarcode.value || null,
    barcode_source: 'manual',
    barcode_product_name: manualName.value.trim() || 'מוצר ללא שם',
    barcode_calories_per_100g: Number(manualCalories.value),
    barcode_protein_per_100g: proteinRaw === '' ? null : Number(manualProtein.value),
    grams: gramsNumber.value,
  })
}

function reset() {
  stopScanning()
  step.value = 'choose'
  manualBarcodeInput.value = ''
  scanError.value = ''
  lookupMessage.value = ''
  lastBarcode.value = ''
  product.value = null
  grams.value = ''
  manualName.value = ''
  manualCalories.value = ''
  manualProtein.value = ''
}

function cancel() {
  reset()
  emit('cancel')
}

defineExpose({ reset })
</script>

<template>
  <div class="flex flex-col gap-4 rounded-xl border border-neutral-300 p-4">
    <template v-if="step === 'choose'">
      <p class="text-sm text-neutral-600">סרוק ברקוד של מוצר ארוז, או הזן אותו ידנית.</p>
      <div class="flex flex-wrap gap-3">
        <button
          v-if="cameraSupported"
          type="button"
          class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white"
          @click="startScanning"
        >
          סרוק עם המצלמה
        </button>
        <p v-else class="text-sm text-neutral-500">הדפדפן הזה אינו תומך בסריקת ברקוד במצלמה. ניתן להזין ברקוד ידנית.</p>
        <button
          type="button"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
          @click="startManualBarcode"
        >
          הזן ברקוד ידנית
        </button>
        <button type="button" class="text-sm text-neutral-600 underline" @click="cancel">ביטול</button>
      </div>
    </template>

    <template v-else-if="step === 'scanning'">
      <p class="text-sm text-neutral-600">כוון את המצלמה לברקוד</p>
      <video :ref="(el) => (videoEl = el)" class="w-full rounded-lg bg-black" muted playsinline></video>
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
          @click="startManualBarcode"
        >
          הזן ברקוד ידנית במקום
        </button>
        <button type="button" class="text-sm text-neutral-600 underline" @click="cancel">ביטול</button>
      </div>
    </template>

    <template v-else-if="step === 'manual_barcode'">
      <p v-if="scanError" class="text-sm text-status-red">{{ scanError }}</p>
      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">מספר ברקוד</span>
        <input
          v-model="manualBarcodeInput"
          type="text"
          inputmode="numeric"
          dir="ltr"
          placeholder="לדוגמה: 7290000000000"
          class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
        />
      </label>
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white"
          @click="submitManualBarcode"
        >
          חפש
        </button>
        <button type="button" class="text-sm text-neutral-600 underline" @click="cancel">ביטול</button>
      </div>
    </template>

    <template v-else-if="step === 'looking_up'">
      <p class="text-sm text-neutral-600">מחפש...</p>
    </template>

    <template v-else-if="step === 'found'">
      <div class="rounded-lg bg-neutral-100 p-3">
        <p class="font-medium text-brand-black">{{ product.name }}</p>
        <p class="text-xs text-neutral-500">מקור: {{ sourceLabel(product.source) }}</p>
        <p class="mt-1 text-sm text-neutral-600">
          {{ formatNutritionAmount(product.caloriesPer100g) }} קק"ל,
          {{ product.proteinPer100g === null ? 'חלבון לא ידוע' : `${formatNutritionAmount(product.proteinPer100g)} ג' חלבון` }}
          ל-100 גרם
        </p>
      </div>

      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">כמות (גרם)</span>
        <input
          v-model="grams"
          type="number"
          step="0.1"
          min="0.1"
          dir="ltr"
          class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
        />
      </label>

      <p v-if="preview" class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span class="text-sm text-neutral-600">סה"כ לבדיקה:</span>
        <span class="ec-num text-sm" style="color: var(--color-brand-green)">{{ formatNutritionAmount(preview.calories) }} קק"ל</span>
        <span v-if="preview.protein !== null" class="ec-num text-sm" style="color: var(--ec-violet)">
          {{ formatNutritionAmount(preview.protein) }} ג' חלבון
        </span>
      </p>

      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          :disabled="preview === null"
          class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
          @click="confirmFound"
        >
          המשך לשמירה
        </button>
        <button type="button" class="text-sm text-neutral-600 underline" @click="cancel">ביטול</button>
      </div>
    </template>

    <template v-else-if="step === 'lookup_failed'">
      <p class="text-sm text-status-red">{{ lookupMessage }}</p>
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white"
          @click="goToManualNutrition"
        >
          הזן פרטים ידנית
        </button>
        <button
          type="button"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
          @click="startManualBarcode"
        >
          נסה ברקוד אחר
        </button>
        <button type="button" class="text-sm text-neutral-600 underline" @click="cancel">ביטול</button>
      </div>
    </template>

    <template v-else-if="step === 'manual_nutrition'">
      <p class="text-xs text-neutral-500">
        הפריט לא נמצא במאגר -- הערכים יישמרו כהזנה ידנית, ולא יתווספו למאגר המאכלים המאומת.
      </p>
      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">שם המוצר</span>
        <input v-model="manualName" type="text" class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">קלוריות ל-100 גרם</span>
        <input v-model="manualCalories" type="number" step="0.1" min="0" dir="ltr" class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">חלבון (גרם) ל-100 גרם -- אופציונלי</span>
        <input v-model="manualProtein" type="number" step="0.1" min="0" dir="ltr" class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">כמות (גרם)</span>
        <input v-model="grams" type="number" step="0.1" min="0.1" dir="ltr" class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none" />
      </label>

      <p v-if="manualPreview" class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span class="text-sm text-neutral-600">סה"כ לבדיקה:</span>
        <span class="ec-num text-sm" style="color: var(--color-brand-green)">{{ formatNutritionAmount(manualPreview.calories) }} קק"ל</span>
        <span v-if="manualPreview.protein !== null" class="ec-num text-sm" style="color: var(--ec-violet)">
          {{ formatNutritionAmount(manualPreview.protein) }} ג' חלבון
        </span>
      </p>

      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          :disabled="manualPreview === null"
          class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
          @click="confirmManual"
        >
          המשך לשמירה
        </button>
        <button type="button" class="text-sm text-neutral-600 underline" @click="cancel">ביטול</button>
      </div>
    </template>
  </div>
</template>
