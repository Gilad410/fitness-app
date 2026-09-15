<script setup>
import './designPreview.css'
import IconHome from '../../components/icons/IconHome.vue'
import IconDumbbell from '../../components/icons/IconDumbbell.vue'
import IconApple from '../../components/icons/IconApple.vue'
import IconTrendingUp from '../../components/icons/IconTrendingUp.vue'

// Shared shell for the isolated /design-preview/* routes only -- the demo
// banner makes it unmistakable this is a preview, never the real app, and
// this component (plus its two screens) never imports a Pinia store or
// supabaseClient, so there is nothing here that could read or write
// production data regardless of how it's reached.
defineProps({
  active: { type: String, required: true }, // 'home' | 'nutrition'
})

const items = [
  { key: 'home', label: 'בית', to: '/design-preview/home', icon: IconHome },
  { key: 'training', label: 'אימון', to: '/design-preview/home', icon: IconDumbbell, disabled: true },
  { key: 'nutrition', label: 'תזונה', to: '/design-preview/nutrition', icon: IconApple },
  { key: 'progress', label: 'התקדמות', to: '/design-preview/home', icon: IconTrendingUp, disabled: true },
]
</script>

<template>
  <div class="tempo-preview">
    <div class="tp-demo-banner">
      תצוגה מקדימה של כיוון עיצוב חדש — נתוני הדגמה בלבד
      <RouterLink to="/trainee">חזרה לאפליקציה</RouterLink>
    </div>

    <div class="flex">
      <!-- Desktop rail -->
      <nav class="tp-rail w-56 shrink-0 flex-col gap-1 border-e p-4" style="border-color: var(--tp-border)" aria-label="ניווט">
        <p class="mb-3 px-2 text-lg font-extrabold" style="color: var(--tp-navy)">האזור שלי</p>
        <RouterLink
          v-for="item in items"
          :key="item.key"
          :to="item.to"
          class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium"
          :style="
            active === item.key
              ? 'background: var(--tp-navy); color: var(--tp-white)'
              : 'color: var(--tp-ink-soft)'
          "
          :aria-current="active === item.key ? 'page' : undefined"
        >
          <component :is="item.icon" class="size-5 shrink-0" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <main class="min-h-screen flex-1 pb-24 md:pb-8">
        <slot />
      </main>
    </div>

    <!-- Mobile bottom nav -->
    <nav class="tp-bottom-nav" aria-label="ניווט תחתון">
      <div class="grid grid-cols-4 px-2 pt-2 pb-1">
        <RouterLink
          v-for="item in items"
          :key="item.key"
          :to="item.to"
          class="tp-nav-item"
          :class="{ 'is-active': active === item.key }"
        >
          <component :is="item.icon" class="size-6" />
          <span class="text-[11px] font-medium">{{ item.label }}</span>
          <span class="tp-nav-item-dot" aria-hidden="true" />
        </RouterLink>
      </div>
    </nav>
  </div>
</template>
