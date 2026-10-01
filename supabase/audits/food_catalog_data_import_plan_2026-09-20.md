# Food Reference Catalog — Multi-Source Data Import Plan (proposal only)

**Nothing has been imported. No Supabase writes have been made. No
credentials have been created or stored.** This document is the
pre-import plan requested before any data-import work begins, per your
explicit instruction: *"Do not run the import yet. Do not modify
existing foods."*

The only network activity performed while writing this plan: two
read-only, public GET requests (documented under "Grounding checks"
below) to confirm the exact endpoint shapes and get realistic scale
numbers instead of guessing. Neither call wrote, cached, or imported
anything.

Builds on the completed and pushed infrastructure phase —
commit `df4393bba905bb3112815a48a7bf5f42888c7f6b` on
`food-catalog-expansion-proposal` (049's new columns: `source`,
`external_id`, `barcode`, `name_he`, `name_en`, `brand`,
`preparation_state`, `verification_status`, `last_verified_at`; the
0–900 kcal / 0–100g protein bounds; the partial unique indexes on
`(source, external_id)` and `barcode`). Live catalog is currently
**504 rows**.

---

## 1. Sources, exact endpoints, and filters

### 1a. USDA FoodData Central

- **Endpoint:** `GET https://api.nal.usda.gov/fdc/v1/foods/search`
- **Required params:** `api_key=<USDA_FDC_API_KEY>`, `query=<term>`,
  `pageSize` (≤200), `pageNumber`.
- **Critical filter — `dataType`, passed as a REPEATED query param**
  (not comma-joined — a comma-joined value returns HTTP 400, confirmed
  below): `dataType=Foundation&dataType=SR%20Legacy&dataType=Survey%20(FNDDS)`.
  **`Branded` is never included** — this is what keeps the import from
  "filling the database with irrelevant American branded products"
  (requirement 4). Branded/commercial products are Open Food Facts'
  job (1b), not USDA's, in this plan.
- **Detail fetch:** `GET https://api.nal.usda.gov/fdc/v1/food/{fdcId}`
  for the full nutrient panel when a search result needs
  protein/energy confirmed at the per-nutrient level rather than the
  search endpoint's summary fields.
- **Query terms:** one targeted search per real food/category, not a
  single broad crawl — see the category table in section 2.

### 1b. Open Food Facts

- **Endpoint:** `GET https://world.openfoodfacts.org/cgi/search.pl`
  (legacy search — confirmed working; the newer `/api/v2/search`
  returned HTTP 503 at request time, see "Grounding checks" — will
  re-check both at actual import time and use whichever responds).
- **Required filters:**
  `tagtype_0=countries&tag_contains_0=contains&tag_0=israel` (Israeli
  market products — requirement 5's priority), `json=1`, `page_size`
  (≤100 per request, paginated).
- **No API key required** for public read search — Open Food Facts'
  product database is open data (ODbL). Attribution requirement
  (requirement 5) is satisfied by recording `source = 'openfoodfacts'`
  and the OFF `code` (barcode) on every imported row, and by adding a
  short attribution note to the audit report and, if you want it
  user-facing, the search UI's source label — I'll draft exact wording
  for your review before the import migration, not silently pick one.
- **Post-fetch filtering (client-side, not an API param):** keep only
  products where `nutriments['energy-kcal_100g']` AND
  `nutriments['proteins_100g']` are both present and numeric,
  `code` (barcode) is present, `product_name` is non-empty, and the
  record is not a duplicate barcode already in the live catalog.

### Explicitly excluded this phase

**FatSecret is not used** — per your instruction, the Israeli dataset,
caching permissions, and licensing have not been approved.

---

## 2. Category breakdown (USDA), mapped to existing plausibility categories

Reusing the exact `CATEGORIES` enum already in
`foodCatalogPlausibility.js` (no new taxonomy invented). Each row below
is one or more targeted `query=` searches, restricted to
Foundation/SR Legacy/Survey(FNDDS), chosen for relevance to Israeli
fitness-coaching diets — not an exhaustive USDA crawl:

| Category | Example query terms | Preparation states to keep separate |
|---|---|---|
| `grain_carb` | rice (basmati, white, brown), pasta, bread, oats, quinoa, couscous, bulgur, potato | raw / cooked / baked, kept as distinct rows |
| `protein` | chicken breast/thigh, turkey, beef cuts, salmon, tuna, cod, tilapia, shrimp, egg, tofu, seitan | raw / cooked / grilled / roasted / fried / boiled, kept separate |
| `dairy` | milk (fat %), yogurt (plain/Greek), cottage cheese (fat %), hard/soft cheese | as_sold (dairy has no raw/cooked axis) |
| `legume` (falls under `grain_carb` bounds currently — will confirm against `foodCatalogPlausibility.js`) | chickpeas, lentils, beans, peas | raw / cooked / canned_drained, kept separate |
| `nuts_seeds_fats` | tahini, peanut butter, almonds, walnuts, sunflower/pumpkin seeds, olive oil | raw / as_sold |
| `fruit` / `vegetable` | common Israeli produce already partially seeded (tomato, cucumber, pepper, eggplant, zucchini, citrus, etc.) — only added where a name doesn't already exist live | raw / cooked, kept separate |
| `prepared_dish` | only where a clean, non-branded, non-restaurant USDA match exists (matching the standard already applied to falafel in 042) — schnitzel, shakshuka-adjacent generic components, etc. | as_sold |

**Deliberately not targeted:** exotic/rare USDA entries with no
relevance to an Israeli trainee's actual diet (the "irrelevant"
concern requirement 4 raises) — every query term above is chosen for
plausible real-world logging use, not to maximize row count.

---

## 3. Proposed batch size and migration-file chunking

- **Fetch batch:** up to `pageSize=200` per USDA query, but only the
  curated, relevant subset of each result set is kept (see "Grounding
  checks" — "chicken breast" alone returns 886 raw hits inside
  F/SRL/FNDDS; a curated pass keeps a handful of genuinely distinct,
  useful preparations from that, not all 886).
- **OFF fetch:** `page_size=100`, paginated, filtered client-side as
  described in 1b.
- **Migration file size:** ~150–250 accepted rows per file, matching
  the existing precedent (040 inserted 269 rows in one file). Proposed
  numbering, continuing after 049: **050+ for USDA batches** (grouped
  by category, e.g. `050_..._usda_grains_legumes.sql`,
  `051_..._usda_proteins_dairy.sql`, `052_..._usda_nuts_produce.sql`),
  **then 053+ for Open Food Facts batches**
  (`053_..._openfoodfacts_israel_batch1.sql`, etc.). Exact count of
  files depends on how many rows actually pass validation — reported
  honestly per batch, not padded to hit a round number.
- Every migration file follows the established pattern from 040-043:
  `begin;`/`commit;`, `on conflict (...) do update set <every column>
  = excluded.<column>` (not `do nothing` — that silent-no-op defect
  class was already found and fixed once this session for 042/043; the
  new import will never reintroduce it), and a guard that verifies the
  batch's own expected row count/effect before allowing commit.

---

## 4. Expected accepted/rejected counts — estimates, explicitly labeled

These are **estimates from the grounding checks below and category
scope above, not measured final numbers** — the real, final counts
will be in the post-import verification report (per your requirement
6), not guessed in advance.

| Source | Raw candidates considered (est.) | Expected accepted (est.) | Expected rejected (est.) | Main rejection reasons expected |
|---|---|---|---|---|
| USDA FDC | ~1,200–1,500 (across ~20–25 targeted category queries, curated) | **~750–950** | ~350–550 | Duplicate preparation/product variant of an already-selected food; category-implausible value (same check as 042's falafel case); missing protein on a search-summary result that needs a detail-fetch to resolve, and doesn't; not relevant to Israeli fitness-coaching use |
| Open Food Facts (Israel) | ~2,000–3,000 sampled from the ~8,403 Israel-tagged pool (see grounding check) | **~400–600** | ~1,400–2,400 | Missing `energy-kcal_100g` or `proteins_100g` (common in crowd-sourced data), missing/placeholder barcode, duplicate barcode, unclear measurement basis, name/brand too generic or incomplete to be useful |
| **Total new rows (est.)** | | **~1,150–1,550** | | |
| **Projected final catalog** | | **~1,650–2,050** (504 existing + new) | | Comfortably clears 1,500 — but see note below |

**If live validation lands below 1,500 total**, per your requirement 7:
I will stop, report the exact shortfall and its cause, and not lower
any validation threshold or import questionable data to close the gap.

---

## 5. Validation pipeline (reusing existing code, one addition)

Every candidate row goes through `validateImportCandidate()` in the
already-built, already-tested
`src/features/nutrition/lib/foodCatalogImportValidation.js` (26 passing
tests) before it is ever written into a migration file:

- Calories 0–900, protein 0–100 (`validateCalories`/`validateProtein`).
- Protein = 0 accepted only when the source explicitly reports zero
  (`validateProteinZeroClaim`) — USDA's own nutrient records
  distinguish a real 0 from a missing field; OFF candidates missing
  `proteins_100g` are rejected outright, never defaulted to 0.
- Calorie/macro consistency check against the Atwater formula when
  carbs+fat are available (`checkCalorieMacroConsistency`) — an
  inconsistent row is flagged `needsReview`, never auto-imported or
  auto-corrected.
- Per-serving values only convert to per-100g with an explicit serving
  weight in grams (`perServingToPer100g`) — otherwise rejected, not
  guessed.
- Dedup key: `barcode` for OFF, `source:external_id` (`usda_fdc:<fdcId>`)
  for USDA (`candidateDedupeKey`) — never the bare name, so legitimate
  raw/cooked and branded variants are preserved as separate rows
  (requirement 4/7's own concern).

**One new check, not yet in the module** (will add with its own test
before the first real import migration is drafted): a **live-name
collision check against the current 504-row catalog**, the same
technique that caught 042/043's `ON CONFLICT DO NOTHING` bug — every
candidate's normalized name is checked against a real export of the
live catalog's names before insertion, and every new insert uses
`ON CONFLICT ... DO UPDATE`, not `DO NOTHING`, so a name collision with
an old hand-entered row converges to the new sourced/verified value
instead of silently no-op'ing (exactly the fix already applied to
042/043, made the standing default for every future insert into this
table).

Preparation-state separation (raw/cooked/baked/fried never merged),
same-product-same-source calorie+protein pairing, and
never-invent-a-value are structural guarantees of this pipeline, not
manual review steps — see the module's own header comment.

---

## 6. Credentials — what's needed and how they stay out of the repo

**Only one credential is needed: a free USDA FoodData Central API
key.** Open Food Facts requires none for public reads.

**Exact instructions, since you asked me to stop and give them:**

1. Go to **https://fdc.nal.usda.gov/api-key-signup** (or
   https://api.data.gov/signup/ — the same api.data.gov key works for
   both).
2. Sign up with your name/email — it's free, immediate, no approval
   wait (unlike FatSecret, which is why this plan can proceed while
   that one is still blocked).
3. You'll receive a key by email, e.g. `a1B2c3D4e5...`.
4. Add it to **`.env.local`** at the repo root (already gitignored via
   the `*.local` pattern — confirmed in `.gitignore`; never add it to
   `.env.example`, which is the tracked template):
   ```
   USDA_FDC_API_KEY=a1B2c3D4e5...
   ```
   Deliberately **not** prefixed `VITE_` — Vite only inlines
   `VITE_`-prefixed variables into the browser bundle, so naming it
   this way means it can never leak into frontend code even by
   accident.
5. That's the only setup needed on your side. The import script (built
   in the next step, not yet) reads `process.env.USDA_FDC_API_KEY` via
   Node — it is never referenced from any `src/` (frontend) file.

**No Supabase service-role key is needed for this import**, and I
won't ask you to create or expose one. The import script's job ends at
producing reviewed `.sql` migration files, exactly like every prior
migration in this catalog (004–049) — you run them yourself in the
Supabase Dashboard → SQL Editor, using your own already-authenticated
session. The script itself never connects to Supabase at all, so there
is no database credential to manage, secure, or accidentally commit.

**Nothing will be committed to GitHub that contains the key** — the
generated migration `.sql` files contain only nutrition data and
public source identifiers (fdcId, barcode), never the API key itself.

---

## 7. What this import does *not* yet cover — flagged, not silently skipped

- **Requirement 7 (search experience — Hebrew/English, aliases,
  typo-tolerance, ranking by verification status/recency, showing
  brand/prep-state/source/status)**: the current search
  (`foodReferenceCatalogStore.search()` — a plain
  `.ilike('name', '%term%')`, 5-row limit, no ranking, no alias table)
  cannot do any of this yet. This needs its **own follow-up migration**
  (likely a `food_reference_catalog_aliases` table, `pg_trgm` for
  typo-tolerant matching, and a ranking search function) plus frontend
  changes to both `FoodQuantityPicker.vue` and `TraineeNutritionView.vue`.
  I'm flagging this now rather than quietly building it into the import
  batch — it's a real, separate scope of work I'd want to show you as
  its own plan once the data side is settled, not bundle in
  unannounced.
- **Requirement 9 (nutritional snapshot in trainee logs)**: **already
  satisfied by existing infrastructure** — `trainee_nutrition_logs`'
  `before insert` trigger (003, extended by 005/011/045) computes and
  stores `calories`/`protein` on the log row at insert time from
  whatever the referenced food's values were *then*. A later catalog
  edit (like 041/042/043's corrections) never retroactively changes an
  already-logged entry. No new migration needed for this requirement —
  confirmed by reading the trigger, not assumed.

---

## 8. Manual verification plan (for after import)

For the required 50-item sample plus the 9 specifically named foods
(raw/cooked basmati rice, raw/cooked chicken breast, egg, 5% cottage
cheese, tuna in water, raw tahini, oats): each accepted row's
`external_id`/`barcode` will be re-fetched from the live USDA/OFF
record post-import and its `calories_per_100g`/`protein_per_100g`
compared directly against the source, the same way 041's corrections
were independently verified this session — not just re-read from what
the import script itself claimed.

The Hebrew search check ("אורז בסמטי" must clearly distinguish raw
from cooked) depends on requirement 7's search work (section 7) to be
genuinely "clear" in the UI — I'll confirm the *data* is correct
(separate raw/cooked rows, both named clearly) as part of this import,
and confirm the *search experience* once that follow-up lands.

---

## 9. Grounding checks performed while writing this plan (read-only, nothing imported)

- `GET .../fdc/v1/foods/search?query=chicken+breast&dataType=Foundation&dataType=SR%20Legacy&dataType=Survey%20(FNDDS)&api_key=DEMO_KEY`
  → **886 total hits** restricted to the three non-Branded data types
  (vs. 21,651 with no dataType filter, almost all `Branded`) — confirms
  both the repeated-param syntax and that the Branded-exclusion filter
  actually works as intended.
- `GET https://world.openfoodfacts.org/cgi/search.pl?...tag_0=israel...`
  → **8,403 total Israel-tagged products** — confirms a real, sizeable
  pool exists to filter down from; the newer `/api/v2/search` endpoint
  returned HTTP 503 at request time (will retry both at actual import
  time).
- Used the public `DEMO_KEY` for the USDA check above (rate-limited,
  shared) — the real import will use your own key once created (step
  6), not `DEMO_KEY`.

---

## What I need from you before I write a single import script line

1. Confirmation to proceed with this plan as scoped (or changes to the
   category list / batch sizes / OFF filters above).
2. Your USDA FDC API key, created per section 6, added to
   `.env.local` on your machine (I cannot create it for you — it's
   tied to your email).
3. A decision on the requirement-7 search-experience follow-up: build
   it as a second, separate proposal after the data import lands, or
   fold a first version into this same phase before any commit? My
   recommendation is the former — it's real, separate schema+frontend
   work and I'd rather show you that plan on its own than have it
   silently ride along inside a data-import commit.

No SQL will be run, no files will be committed, and no import will
start until you confirm.
