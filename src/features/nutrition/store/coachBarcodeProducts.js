import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'
import { lookupCachedProduct, withCachedProduct } from '../lib/barcodeProductCache.js'

// Per-coach cache of barcode products the coach has manually approved
// calories/protein for (see 046_coach_barcode_products.sql) -- checked
// by BarcodeFoodEntry.vue BEFORE calling Open Food Facts, so a barcode
// a coach already approved once is never asked for again, and doesn't
// re-hit the external API either. Same ensureLoaded()-once /
// state-shape convention as foodsStore (foods.js) -- the one
// difference is keying by `barcode` (a string) rather than `id`, since
// that's what a scan/manual-entry actually has in hand to look up with.
export const useCoachBarcodeProductsStore = defineStore('coachBarcodeProducts', {
  state: () => ({
    byBarcode: {},
    loadPromise: null,
  }),

  actions: {
    ensureLoaded() {
      if (this.loadPromise) return this.loadPromise
      this.loadPromise = this.fetchAll()
      return this.loadPromise
    },

    async fetchAll() {
      const { data, error } = await supabase.from('coach_barcode_products').select('*')
      if (error) throw error
      const byBarcode = {}
      for (const row of data) byBarcode[row.barcode] = row
      this.byBarcode = byBarcode
    },

    lookup(barcode) {
      return lookupCachedProduct(this.byBarcode, barcode)
    },

    // Approves (or re-approves, on conflict) a barcode's nutrition
    // values for this coach. onConflict targets the (coach_id, barcode)
    // unique index from the migration -- a re-scan-and-re-approve of
    // the same barcode updates the existing row in place rather than
    // erroring or creating a duplicate.
    async save({ barcode, productName, caloriesPer100g, proteinPer100g }) {
      const authStore = useAuthStore()
      const { data, error } = await supabase
        .from('coach_barcode_products')
        .upsert(
          {
            coach_id: authStore.user.id,
            barcode,
            product_name: productName,
            calories_per_100g: caloriesPer100g,
            protein_per_100g: proteinPer100g,
          },
          { onConflict: 'coach_id,barcode' },
        )
        .select()
        .single()
      if (error) throw error
      this.byBarcode = withCachedProduct(this.byBarcode, barcode, data)
      return data
    },
  },
})
