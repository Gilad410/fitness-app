import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { resolveCoachId } from '../lib/resolveCoachId.js'
import { normalizeBarcode } from '../lib/barcodeLookup.js'
import { lookupCachedProduct, withCachedProduct } from '../lib/barcodeProductCache.js'

// Per-user (coach OR trainee) cache of which nutrition basis (as-sold
// vs. cooked-per-package, with the exact typed cooked figures) was
// chosen LAST for a given barcode -- see
// 048_barcode_nutrition_basis_preferences.sql. Checked by
// BarcodeFoodEntry.vue whenever a scan is eligible for the
// cooked-package choice (needsManualCookedPackageEntry,
// barcodeNutritionBasis.js), so a repeat scan can PRE-FILL an explicit
// confirmation instead of asking the coach/trainee to retype the same
// package figures. The confirmation itself is ALWAYS shown, never
// skipped, regardless of which basis was saved last -- this store only
// ever supplies what to pre-fill, never a reason to skip asking (a
// real, explicit correction made during this investigation: an earlier
// version of this design would have silently defaulted to a saved
// as_sold preference without asking again).
//
// resolveCoachId() (resolveCoachId.js) is reused here despite its name
// -- it resolves whichever user is currently authenticated via a fresh
// supabase.auth.getUser() call (never a Pinia store's cached session,
// same reasoning as coachBarcodeProducts.js's own use of it), coach or
// trainee alike; this table's RLS (user_id = auth.uid()) is satisfied
// identically either way, with no role-based branching needed here.
//
// lookupCachedProduct/withCachedProduct (barcodeProductCache.js) are
// pure, already-tested { [barcode]: row } cache mechanics -- reused
// verbatim rather than reimplemented, exactly as coachBarcodeProducts.js
// already does for its own byBarcode state.
export const useBarcodeNutritionBasisPreferencesStore = defineStore('barcodeNutritionBasisPreferences', {
  state: () => ({
    byBarcode: {},
    loadPromise: null,
  }),

  actions: {
    // Fetches once and caches the in-flight/resolved promise -- fine for
    // a mount-time warm-up, but NOT what a lookup that needs the current
    // truth should rely on afterward; see refresh() below.
    ensureLoaded() {
      if (this.loadPromise) return this.loadPromise
      this.loadPromise = this.fetchAll()
      return this.loadPromise
    },

    // Always re-reads from Supabase, ignoring any cached promise --
    // called immediately before checking whether a barcode has a saved
    // preference, same reasoning as coachBarcodeProducts.js's own
    // refresh(): a scan is infrequent enough that paying for a fresh
    // read every time is cheap, and it removes any staleness window
    // between an earlier save and this lookup.
    async refresh() {
      this.loadPromise = this.fetchAll()
      return this.loadPromise
    },

    async fetchAll() {
      const { data, error } = await supabase.from('barcode_nutrition_basis_preferences').select('*')
      if (error) throw error
      let byBarcode = {}
      for (const row of data) byBarcode = withCachedProduct(byBarcode, normalizeBarcode(row.barcode), row)
      this.byBarcode = byBarcode
    },

    lookup(barcode) {
      return lookupCachedProduct(this.byBarcode, normalizeBarcode(barcode))
    },

    // Saves (or updates, on re-choosing/re-editing) this user's basis
    // preference for one barcode. basis: 'as_sold' | 'cooked_package'.
    // cookedCaloriesPer100g/cookedProteinPer100g: the EXACT figures the
    // coach/trainee typed off the physical package -- both required
    // when basis is 'cooked_package' (enforced by the table's own check
    // constraint too, not just client-side), both null for 'as_sold'
    // (Open Food Facts' own as-sold data is always read fresh; there is
    // nothing this table needs to add for that case).
    async save({ barcode, basis, cookedCaloriesPer100g = null, cookedProteinPer100g = null }) {
      const normalizedBarcode = normalizeBarcode(barcode)
      const userId = resolveCoachId(await supabase.auth.getUser())
      const { data, error } = await supabase
        .from('barcode_nutrition_basis_preferences')
        .upsert(
          {
            user_id: userId,
            barcode: normalizedBarcode,
            basis,
            cooked_calories_per_100g: cookedCaloriesPer100g,
            cooked_protein_per_100g: cookedProteinPer100g,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,barcode' },
        )
        .select()
        .single()
      if (error) throw error
      this.byBarcode = withCachedProduct(this.byBarcode, normalizeBarcode(data.barcode), data)
      return data
    },
  },
})
