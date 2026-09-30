<script setup>
import { RouterView } from 'vue-router'
import { KEEP_ALIVE_VIEWS } from './lib/swipeNavigation'

// The portals' main screens stay alive between navigations. Without
// this, swiping re-created the whole page -- layout, header, bottom nav
// and the view itself -- and every view re-ran its own fetch, so the
// destination appeared as a loading state first and the movement read as
// a page load rather than a slide.
//
// Only the swipeable screens are kept; forms, detail pages and the auth
// screens still mount fresh every time, which is what they should do.
</script>

<template>
  <RouterView v-slot="{ Component }">
    <KeepAlive :include="KEEP_ALIVE_VIEWS" :max="8">
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>
