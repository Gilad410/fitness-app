# Barcode-Based Food Logging — Proposal & Implementation Report

**Branch: `barcode-food-logging`, off `main` — kept entirely separate from the food-catalog work (`food-catalog-expansion-proposal` / PR #1).** No Supabase changes applied, no migration run, no merge, no deployment.

## 1. Existing nutrition logging flow (inspected first)

`trainee_nutrition_logs` already supports **two** mutually-exclusive sources per row, enforced by a check constraint and computed server-side by a `before insert` trigger (`set_nutrition_log_calories()`):

- `food_id` + `grams` (a coach's own `public.foods` catalog, gram-based) — original design, `003_nutrition.sql`.
- `restaurant_food_item_id` + `servings` (a shared `restaurant_food_items` table, fixed-serving-based) — added later, `011_restaurant_nutrition_logs.sql`, as a **second branch on the same table and trigger**, not a new feature bolted on separately.

The client side never computes or sends `calories`/`protein` — the trigger is the sole source of truth, snapshotting the value at log time so a later edit to a food's stored `calories_per_100g` never retroactively rewrites history. `nutritionLogsStore.addLog(traineeId, payload)` is fully generic — it spreads whatever payload it's given into the insert, with zero knowledge of which source is being used. `entryDisplay.js` branches on which fields are present to render the log list; `FoodQuantityPicker.vue` (shared with the coach's meal-*planning* flow, a different table) owns selecting a source and returning a plain payload object.

**This is exactly the pattern I extended** — a barcode entry is a **third branch**, added the same additive, non-destructive way `011` added the second one.

## 2. Smallest safe implementation chosen

- **A third source directly on `trainee_nutrition_logs`**, not a new table and not a write into `public.foods`. A barcode product's name/calories/protein are snapshotted straight onto the log row at scan time. This is what makes requirement #10 ("do not automatically add barcode products to the verified food catalog") trivially true by construction — there is no code path that writes to `food_reference_catalog` or `public.foods` for a barcode entry at all.
- **A separate, self-contained Vue component** (`BarcodeFoodEntry.vue`), not a third tab on the shared `FoodQuantityPicker.vue`. That picker is also used by the coach's nutrition-*plan* builder (a different table, `trainee_nutrition_plan_meal_items`); reusing it would have pulled barcode support into meal planning too, which was never asked for and would need its own separate schema/trigger work. Keeping it separate means **zero changes to the plan-builder code path**.
- **Native `BarcodeDetector` Web API**, not a new npm dependency. Smallest footprint, but narrower browser support (see §5) — flagged explicitly as a trade-off, with a graceful fallback that already covers the gap.
- **Zero changes needed to `nutritionLogsStore.js`** — its `addLog()`/`fetchForTrainee()` (`select('*', ...)`) are already fully generic and pass the new columns through untouched.

## 3. Proposed / changed files

```
NEW
  src/features/nutrition/lib/barcodeCalculation.js            -- pure calc: calories/protein = per_100g * grams / 100
  src/features/nutrition/lib/barcodeCalculation.test.mjs       -- 9 tests
  src/features/nutrition/lib/barcodeLookup.js                  -- Open Food Facts client, DI-injectable fetch, never throws
  src/features/nutrition/lib/barcodeLookup.test.mjs             -- 12 tests, every lookup state
  src/features/nutrition/lib/barcodeCameraSupport.js            -- feature detection (BarcodeDetector + getUserMedia)
  src/features/nutrition/lib/barcodeCameraSupport.test.mjs      -- 5 tests
  src/features/nutrition/lib/barcodeMigration.test.mjs          -- 10 tests, reads the real 045 SQL file (I/O, same convention as foodCatalogRealData.test.mjs)
  src/features/nutrition/components/BarcodeFoodEntry.vue        -- scan/manual-entry/lookup/review/save UI
  supabase/sql/045_trainee_nutrition_logs_barcode_source.sql    -- draft migration, NOT applied
  docs/barcode_food_logging_proposal.md                         -- this report

MODIFIED (small, additive)
  src/features/nutrition/lib/entryDisplay.js                    -- +1 branch: barcode entries show "<name> (ברקוד)"
  src/features/nutrition/lib/entryDisplay.test.mjs               -- +4 tests for that branch
  src/features/nutrition/components/NutritionSection.vue         -- +1 button ("סרוק ברקוד"), +1 handler, wires BarcodeFoodEntry to the existing addLog() call

UNCHANGED
  FoodQuantityPicker.vue, NutritionPlanSection.vue, nutritionLogsStore.js, nutritionLogsCore.js, foods.js, restaurantFoodItems.js, and every food-catalog-branch file
```

## 4. Data flow

```
[Camera scan via BarcodeDetector]  OR  [manual barcode digits typed in]
                    |
                    v
        barcodeLookup.lookupBarcode(barcode)
                    |
     GET world.openfoodfacts.org/api/v2/product/{barcode}.json
     (no API key -- public read endpoint; descriptive User-Agent sent)
                    |
        +-----------+-----------+---------------------+
        |           |           |                     |
     found    not_found   no_nutrition_data   error / invalid_barcode
        |           |___________|_____________________|
        |                       |
        v                       v
  show name/source/     show a clear message +
  cal+protein per 100g  "הזן פרטים ידנית" (manual
        |                nutrition entry, name+cal+
        v                protein typed by hand)
  user enters grams               |
        |                         v
        v                  user enters grams
  barcodeCalculation.calculateBarcodeNutrition()  (live client-side preview only)
        |                         |
        +-----------+-------------+
                    v
        review step (shown values, explicit save button)
                    v
    emit('resolved', { barcode, barcode_source, barcode_product_name,
                        barcode_calories_per_100g, barcode_protein_per_100g, grams })
                    v
    NutritionSection.vue -> nutritionLogsStore.addLog(traineeId, { ...resolved, logged_at: today })
                    v
    INSERT trainee_nutrition_logs  ->  trigger computes calories/protein
    server-side from the SAME formula (source of truth), stores barcode +
    barcode_source + barcode_product_name + the two snapshotted per-100g
    values alongside the row
                    v
    Existing log list (unchanged code path) renders it via entryDisplay.js's
    new barcode branch: "<product name> (ברקוד)" / "<grams> גרם"
```

`barcode_source` is `'open_food_facts'` for an API match, `'manual'` for the fully-typed fallback — both stored, satisfying requirement #9 (store barcode + source metadata).

## 5. External source: Open Food Facts — terms & license

- **What it is**: a free, open, community-maintained product database (world.openfoodfacts.org), explicitly designed for third-party integration — this is normal, encouraged usage, not a workaround.
- **License**: data under the **Open Database License (ODbL)**; images/free text under **CC-BY-SA**. Both require **attribution** when their data is used/displayed. The `BarcodeFoodEntry.vue` "found" screen shows "מקור: Open Food Facts" for exactly this reason — attribution is already in the minimal implementation, not deferred.
- **No API key required** for the read-only product-lookup endpoint used here (`GET /api/v2/product/{barcode}.json`) — confirmed nothing resembling a key exists anywhere in the new code (grepped).
- **Fair-use guidance**: OFF's own docs ask integrators to send a descriptive `User-Agent` identifying the calling app, which `barcodeLookup.js` does (`FitnessApp-BarcodeLogging/1.0 (nutrition log feature)`) — not a restriction we're working around, just what they ask for.
- **What we do NOT do, by design**: we never store or redistribute their database — only a single product's calories/protein/name is snapshotted onto one log row at the moment a user scans it, for that user's own history. We never write it into `public.foods` or `food_reference_catalog` (requirement #10) — this also keeps us clear of ODbL's share-alike obligations, which apply to redistributing a derived *database*, not to live point-of-use lookups with attribution.
- **Before any production use of this branch**: worth a final read of OFF's current terms page yourself, since terms can change — I have not sought or received separate written permission beyond what their public API already documents as intended usage, and this report should not be read as a substitute for that check.

## 6. Database changes needed (drafted, NOT applied)

`supabase/sql/045_trainee_nutrition_logs_barcode_source.sql` — additive only, same transaction-safe pattern (`begin;`/`commit;`, `add column if not exists`, a non-aborting report `select` before `commit;`) established by the food-catalog migrations:

- 5 new nullable columns on `trainee_nutrition_logs`: `barcode`, `barcode_source`, `barcode_product_name`, `barcode_calories_per_100g`, `barcode_protein_per_100g`.
- The existing `trainee_nutrition_logs_source_check` constraint (currently 2-way: food_id XOR restaurant_food_item_id) is replaced with a 3-way version.
- `set_nutrition_log_calories()` gets a third `elsif` branch computing `calories = barcode_calories_per_100g * grams / 100` / `protein = barcode_protein_per_100g * grams / 100`, rounded to 1 decimal — the exact formula requested, and byte-for-byte the same rounding convention the other two branches already use.
- No RLS policy changes needed (existing `coach_id = auth.uid()` policies don't reference the new columns).
- No changes to `public.foods`, `public.food_reference_catalog`, or `public.restaurant_food_items`.
- Numbered `045` deliberately, past the food-catalog branch's `039`–`044` range, to avoid a filename collision whichever branch merges first.

## 7. Requirements checklist

| # | Requirement | Status |
|---|---|---|
| 1 | Scan EAN/UPC with camera | `BarcodeDetector`, formats `ean_13/ean_8/upc_a/upc_e` |
| 2 | Manual barcode entry fallback | Always offered from the "choose" step, and automatically reached on unsupported browser / permission denial |
| 3 | Licensed barcode-food source | Open Food Facts — free, open, ODbL/CC-BY-SA, no key required (see §5) |
| 4 | Display product, source, cal/protein per 100g | `BarcodeFoodEntry.vue` "found" screen |
| 5 | Grams entry | Yes |
| 6 | `calories = cal/100g * grams/100`, `protein = protein/100g * grams/100` | `barcodeCalculation.js` (client preview) + the migration's trigger branch (server source of truth) — identical formula in both, tested |
| 7 | Review before save | Explicit "המשך לשמירה" review step, no auto-save on scan |
| 8 | Clear message + manual entry if nothing found | 4 distinct lookup-failure states, each with its own message, all routing to a manual name+cal+protein entry form |
| 9 | Store barcode + source metadata | `barcode`, `barcode_source`, `barcode_product_name` columns |
| 10 | Never auto-add to the verified catalog | No code path writes to `foods` or `food_reference_catalog` for a barcode entry — verified by a dedicated migration test |

## 8. Known gaps / follow-ups (not blockers for review, but worth naming)

- `BarcodeDetector` browser support is currently Chrome/Edge (desktop + Android) only — **not** Safari/iOS, **not** Firefox. Every unsupported browser falls back to manual entry automatically (tested via `barcodeCameraSupport.test.mjs`), so the feature degrades gracefully rather than breaking, but a large share of mobile users (iPhone Safari) will only ever see the manual-entry path in this version. A follow-up could add a JS-based decoder library (e.g. `@zxing/browser`) for broader coverage — deliberately not included here to keep this "the smallest safe implementation."
- The actual camera capture loop (`getUserMedia`/`BarcodeDetector.detect()` inside `BarcodeFoodEntry.vue`) is inherently not unit-testable under `node --test` (no real camera/DOM) — this is a real coverage gap, consistent with how camera code is untestable-by-unit-test everywhere; would need an E2E/manual device test pass before shipping, not something this review can close.
- No date field on the barcode flow (always logs against today) — a deliberate minimal-scope choice, not a bug; a past-dated barcode log would need a small follow-up if wanted.

## 9. Verification

- `node --test` across all 20 `*.test.mjs` files (existing suite + 6 new files): **239/239 passing** (36 new tests: 9 calculation, 12 lookup, 5 camera-support, 10 migration-structure).
- `npm run lint`: clean.
- `npm run build`: succeeds.
- `045`'s SQL verified parseable under `pglast` (11 statements).
- Confirmed by grep: no API key, secret, or token anywhere in the new code.

No SQL has been run, nothing has been applied to Supabase, nothing merged, nothing deployed.
