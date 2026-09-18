import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'
import { lookupCachedProduct, withCachedProduct } from '../lib/barcodeProductCache.js'
import { normalizeBarcode } from '../lib/barcodeLookup.js'

// Per-coach cache of barcode products the coach has manually approved
// calories/protein for (see 046_coach_barcode_products.sql) -- checked
// by BarcodeFoodEntry.vue BEFORE calling Open Food Facts, so a barcode
// a coach already approved once is never asked for again, and doesn't
// re-hit the external API either.
//
// Every barcode that enters or leaves this store's byBarcode state
// goes through normalizeBarcode() first -- found via a real
// investigation (barcode 7622202268298: approved and saved, but not
// reused on the next scan) that nothing previously *guaranteed* the
// save-time key and the lookup-time key were byte-identical, even
// though they traced out equal for the specific path tested. Real
// Supabase storage throughout -- this cache is a client-side read
// optimization over the real table, never a substitute for it (an
// empty/stale cache always safely falls through to fetchAll() or,
// beyond that, to Open Food Facts -- it can make a lookup slower or
// redundant, never silently wrong).
export const useCoachBarcodeProductsStore = defineStore('coachBarcodeProducts', {
  state: () => ({
    byBarcode: {},
    loadPromise: null,
  }),

  actions: {
    // Fetches once and caches the in-flight/resolved promise -- fine
    // for the very first load (e.g. on component mount), but NOT what
    // a lookup that needs the current truth should rely on afterward;
    // see refresh() below for that.
    ensureLoaded() {
      if (this.loadPromise) return this.loadPromise
      this.loadPromise = this.fetchAll()
      return this.loadPromise
    },

    // Always re-reads from Supabase, ignoring any cached promise --
    // unlike ensureLoaded(), which fetches once and never again for
    // the lifetime of the store. A barcode scan is an infrequent,
    // deliberate action (not a hot loop), so paying for a fresh fetch
    // every time is cheap, and it removes the exact staleness window
    // that let a real approval go unnoticed: save() already updates
    // byBarcode locally and correctly the moment it succeeds, but if
    // the approval happened in an earlier mount of the barcode-entry
    // flow (closed and reopened, a backgrounded tab, etc.) a later
    // lookup relying only on ensureLoaded()'s frozen promise could
    // still be looking at a byBarcode snapshot from before that save.
    // Call this -- not ensureLoaded() -- immediately before any lookup
    // whose answer decides "ask the coach again" vs. "reuse the
    // approved value."
    async refresh() {
      this.loadPromise = this.fetchAll()
      return this.loadPromise
    },

    async fetchAll() {
      const { data, error } = await supabase.from('coach_barcode_products').select('*')
      if (error) throw error
      const byBarcode = {}
      for (const row of data) byBarcode[normalizeBarcode(row.barcode)] = row
      this.byBarcode = byBarcode
    },

    lookup(barcode) {
      return lookupCachedProduct(this.byBarcode, normalizeBarcode(barcode))
    },

    // Approves (or re-approves, on conflict) a barcode's nutrition
    // values for this coach. onConflict targets the (coach_id, barcode)
    // unique index from the migration -- a re-scan-and-re-approve of
    // the same barcode updates the existing row in place rather than
    // erroring or creating a duplicate.
    async save({ barcode, productName, caloriesPer100g, proteinPer100g }) {
      const normalizedBarcode = normalizeBarcode(barcode)
      const authStore = useAuthStore()
      const { data, error } = await supabase
        .from('coach_barcode_products')
        .upsert(
          {
            coach_id: authStore.user.id,
            barcode: normalizedBarcode,
            product_name: productName,
            calories_per_100g: caloriesPer100g,
            protein_per_100g: proteinPer100g,
          },
          { onConflict: 'coach_id,barcode' },
        )
        .select()
        .single()
      if (error) throw error
      // Keyed by data.barcode (the row Supabase actually stored and
      // returned), not the input parameter -- the two are expected to
      // be identical (a plain text column, no server-side
      // transformation), but this is the authoritative value, so it's
      // the one used to key the cache, removing even a hypothetical
      // gap between "what we sent" and "what's actually in the row."
      this.byBarcode = withCachedProduct(this.byBarcode, normalizeBarcode(data.barcode), data)
      return data
    },
  },
})
