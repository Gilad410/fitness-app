import { defineStore } from 'pinia'
import { useAuthStore } from '../../../stores/auth'
import { readSelectedTrainee, writeSelectedTrainee, clearSelectedTrainee } from './selectedTraineeStorage'

// Remembers which trainee the coach was last looking at, so navigating
// between trainee-scoped main areas (Progress / Nutrition / Training --
// see TheSidebar.vue / TheBottomNavElectric.vue) jumps straight back into
// THAT trainee's workspace instead of dropping back to the picker list
// every time. "לקוחות" (the full roster, TraineesListView) is
// deliberately NOT one of these -- it's a manage-everyone view with its
// own coach-level actions (invite/add), not a per-trainee workspace, so
// it always stays a plain list.
//
// Purely a navigation convenience -- carries NO authorization weight of
// its own. Every workspace view still resolves the trainee via
// useTraineesStore().getById(route.params.id) (RLS-scoped to this coach's
// own roster already), so a stale/foreign id remembered here can never
// expose another coach's trainee -- at worst it fails "trainee not
// found", exactly like typing a bad id into the URL already does today.
//
// The actual storage read/write/clear/per-coach-keying logic lives in
// selectedTraineeStorage.js (no Pinia/window import there -- unit-tested
// directly under plain Node, see its own test file); this store is a
// thin wrapper that supplies the current coach's id and keeps a reactive
// in-memory mirror of it.
export const useSelectedTraineeStore = defineStore('selectedTrainee', {
  state: () => ({
    traineeId: null,
  }),

  actions: {
    // Restores whatever was remembered for the CURRENTLY signed-in coach.
    // Safe to call more than once (AppLayout.vue calls it on every mount,
    // and it remounts on every navigation, see TheSidebar.vue's own
    // comment) -- always re-reads storage keyed to the current coach id,
    // so it can never leak a stale in-memory value from a previous
    // coach's session in the same tab.
    restore() {
      const coachUserId = useAuthStore().user?.id
      this.traineeId = readSelectedTrainee(coachUserId)
    },

    // Called by a workspace view once it has resolved a VALID trainee
    // from its own route (never with an unvalidated/raw route param) --
    // see each view's own onMounted. This is what makes an explicit
    // trainee id in the URL take precedence over whatever was previously
    // remembered: visiting /nutrition/:id (or /progress/:id, etc.)
    // directly overwrites the remembered selection with that id, so the
    // NEXT nav-link click carries this trainee forward too.
    select(traineeId) {
      this.traineeId = traineeId
      writeSelectedTrainee(useAuthStore().user?.id, traineeId)
    },

    // Explicit clear -- called on sign-out (TheHeader.vue) and by a
    // workspace view whenever the remembered id turns out not to resolve
    // to a real, currently-accessible trainee (deleted, or never existed)
    // -- so a stale id is never kept around to be offered again.
    clear() {
      this.traineeId = null
      clearSelectedTrainee(useAuthStore().user?.id)
    },
  },
})
