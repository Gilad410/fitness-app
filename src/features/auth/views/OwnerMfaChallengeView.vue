<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../stores/auth'
import { normalizeTotpCode, validateTotpCode } from '../lib/ownerMfaRouting'

const authStore = useAuthStore()
const router = useRouter()
const factorId = ref('')
const code = ref('')
const loading = ref(true)
const submitting = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    const factors = await authStore.listMfaFactors()
    const factor = factors.totp?.find((item) => item.status === 'verified') ?? factors.totp?.[0]
    if (!factor) throw new Error('No verified TOTP factor')
    factorId.value = factor.id
  } catch {
    error.value = 'לא ניתן היה לטעון את אמצעי האימות. יש להתנתק ולנסות שוב.'
  } finally {
    loading.value = false
  }
})

async function verify() {
  error.value = validateTotpCode(code.value)
  if (error.value || submitting.value || !factorId.value) return
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
  <main dir="rtl" class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 p-6 text-brand-black">
    <h1 class="text-2xl font-bold">אימות דו־שלבי</h1>
    <p class="text-neutral-600">הזן את הקוד בן 6 הספרות שמופיע באפליקציית האימות שלך.</p>
    <p v-if="loading">טוען...</p>
    <form v-else class="flex flex-col gap-3" @submit.prevent="verify">
      <input v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" autofocus class="rounded-lg border border-neutral-300 px-3 py-2 text-center text-xl tracking-[0.3em]" aria-label="קוד אימות" />
      <p v-if="error" role="alert" class="text-sm text-status-red">{{ error }}</p>
      <button :disabled="submitting || !factorId" class="rounded-lg bg-brand-green px-4 py-2 font-medium disabled:opacity-60">
        {{ submitting ? 'מאמת...' : 'אימות וכניסה' }}
      </button>
    </form>
    <button type="button" class="self-start text-sm text-neutral-600 underline" @click="logout">התנתקות</button>
  </main>
</template>
