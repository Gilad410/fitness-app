<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../stores/auth'
import { normalizeTotpCode, validateTotpCode } from '../lib/ownerMfaRouting'

const authStore = useAuthStore()
const router = useRouter()
const loading = ref(true)
const submitting = ref(false)
const factorId = ref('')
const qrCode = ref('')
const secret = ref('')
const code = ref('')
const error = ref('')
const showSecret = ref(false)

onMounted(async () => {
  try {
    const enrollment = await authStore.enrollOwnerMfa()
    factorId.value = enrollment.id
    qrCode.value = enrollment.totp?.qr_code ?? ''
    secret.value = enrollment.totp?.secret ?? ''
    if (!factorId.value || !qrCode.value) throw new Error('Missing MFA enrollment data')
  } catch {
    error.value = 'לא ניתן היה להתחיל את הגדרת האימות. יש להתנתק ולנסות שוב.'
  } finally {
    loading.value = false
  }
})

async function verify() {
  error.value = validateTotpCode(code.value)
  if (error.value || submitting.value) return
  submitting.value = true
  try {
    await authStore.verifyMfaCode(factorId.value, normalizeTotpCode(code.value))
    await router.replace({ name: 'owner-coaches' })
  } catch {
    error.value = 'הקוד אינו תקין או שפג תוקפו. יש להזין את הקוד העדכני מהאפליקציה.'
  } finally {
    submitting.value = false
  }
}

async function logout() {
  await authStore.signOut()
  await router.replace('/login')
}
</script>

<template>
  <main dir="rtl" class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6 text-brand-black">
    <h1 class="text-2xl font-bold">הגנת חשבון המנהל</h1>
    <p class="text-neutral-600">סרוק את הקוד באפליקציית אימות, ולאחר מכן הזן את הקוד בן 6 הספרות.</p>

    <p v-if="loading">מכין קוד אבטחה...</p>
    <template v-else-if="qrCode">
      <div class="self-center rounded-xl border border-neutral-200 bg-white p-4">
        <img :src="qrCode" alt="קוד QR להגדרת אימות דו־שלבי" class="size-56" />
      </div>

      <button type="button" class="text-sm text-brand-green-dark underline" @click="showSecret = !showSecret">
        {{ showSecret ? 'הסתר מפתח ידני' : 'לא ניתן לסרוק? הצג מפתח ידני' }}
      </button>
      <code v-if="showSecret" class="break-all rounded-lg bg-neutral-100 p-3 text-left" dir="ltr">{{ secret }}</code>

      <form class="flex flex-col gap-3" @submit.prevent="verify">
        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">קוד אימות</span>
          <input v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" class="rounded-lg border border-neutral-300 px-3 py-2 text-center text-xl tracking-[0.3em]" />
        </label>
        <p v-if="error" role="alert" class="text-sm text-status-red">{{ error }}</p>
        <button :disabled="submitting" class="rounded-lg bg-brand-green px-4 py-2 font-medium disabled:opacity-60">
          {{ submitting ? 'מאמת...' : 'הפעלת אימות דו־שלבי' }}
        </button>
      </form>
    </template>
    <p v-else-if="error" role="alert" class="text-sm text-status-red">{{ error }}</p>

    <button type="button" class="self-start text-sm text-neutral-600 underline" @click="logout">התנתקות</button>
  </main>
</template>
