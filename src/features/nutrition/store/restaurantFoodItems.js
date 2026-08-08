import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

export const useRestaurantFoodItemsStore = defineStore('restaurantFoodItems', {
  state: () => ({
    // Distinct chain names (e.g. 'ארומה'), driven entirely by whatever is
    // in restaurant_food_items -- no chain is ever hard-coded, so a new
    // chain seeded later just appears here automatically.
    chains: [],
    chainsLoadPromise: null,

    // Items are loaded and cached per chain, since a coach only ever
    // browses one chain's menu at a time.
    itemsByChain: {},
    itemsLoadPromises: {},

    error: null,
  }),

  getters: {
    itemsFor: (state) => (chainName) => state.itemsByChain[chainName] ?? [],
  },

  actions: {
    ensureChainsLoaded() {
      if (this.chainsLoadPromise) return this.chainsLoadPromise
      this.chainsLoadPromise = this.fetchChains()
      return this.chainsLoadPromise
    },

    async fetchChains() {
      this.error = null
      const { data, error } = await supabase
        .from('restaurant_food_items')
        .select('chain_name')
        .order('chain_name', { ascending: true })
      if (error) {
        this.error = error.message
        throw error
      }
      this.chains = [...new Set(data.map((row) => row.chain_name))]
    },

    ensureItemsLoaded(chainName) {
      if (this.itemsLoadPromises[chainName]) return this.itemsLoadPromises[chainName]
      this.itemsLoadPromises[chainName] = this.fetchItemsForChain(chainName)
      return this.itemsLoadPromises[chainName]
    },

    async fetchItemsForChain(chainName) {
      this.error = null
      const { data, error } = await supabase
        .from('restaurant_food_items')
        .select('id, chain_name, item_name, serving_description, calories_per_serving, protein_per_serving')
        .eq('chain_name', chainName)
        .order('item_name', { ascending: true })
      if (error) {
        this.error = error.message
        throw error
      }
      this.itemsByChain[chainName] = data
    },
  },
})
