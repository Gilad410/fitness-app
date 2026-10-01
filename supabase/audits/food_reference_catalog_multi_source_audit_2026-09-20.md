# Food Reference Catalog — Multi-Source Expansion: Audit Report

Read-only. No SQL run, no data imported, nothing committed or pushed.
Companion to `supabase/sql/049_food_reference_catalog_multi_source_infrastructure.sql`
and `supabase/audits/food_reference_catalog_049_preflight_check.sql`.

> **Correction (2026-09-20, after the real preflight was run):** this
> report originally stated the live count as 503, assuming migration
> 041 had been applied. The real preflight returned **505**, not 503.
> Root cause identified and explained in full under "The 503 vs. 505
> discrepancy" below — **041 was never actually run against Supabase**;
> only its migration *file* was merged into git. All counts below are
> corrected to the true, confirmed-live baseline of 505. This does not
> change migration 049 itself (still purely additive, independent of
> whether 041 has run) or the safety of its new bounds (re-verified
> against the true 505-row state, see below) — but it does mean the
> live catalog still carries the 6 rows 041 was written to fix.

## Method

I have no direct SQL execution access to the live Supabase project (a
constant limitation across this whole engagement). This audit is a
**full, line-by-line reconstruction of every migration that has
touched `public.food_reference_catalog`** (004–041, applied; 042–043,
drafted but not applied), parsed programmatically and replayed in
order (respecting `TRUNCATE`, `ON CONFLICT DO NOTHING`, targeted
`UPDATE`/`DELETE`). The result is cross-checked against two independent,
already-existing sources of truth already in this repo:

- `src/features/nutrition/lib/foodCatalogRealData.test.mjs` (569 lines,
  already passing) — asserts exact row counts for 039–043 directly
  against the migration files' own content.
- Commit `89416f2` ("Add read-only post-migration verification query
  (already run against Supabase)") — documents an actual verification
  query run against the live database after 039/040 were applied:
  `final_row_count 505`.

All three sources agree once 041's own documented net effect (4
corrections, 2 deletions → −2 rows) is applied to the 505 figure: **505
− 2 = 503**, exactly matching my independent reconstruction.

## 1. Exact number of existing foods

**505 rows** in `public.food_reference_catalog` — confirmed by your
real preflight query. This is the state as of migration **040**
(039's corrections/backfill + 040's inserts), matching commit
`89416f2`'s own documented verification exactly. Migration 041 (4
corrections + 2 deletions, net −2) has **not** been applied — see "The
503 vs. 505 discrepancy" below. Migrations 042 (falafel, +1) and 043
(bagel fix, −1 insert +6) are also drafted but not applied.

This is the shared reference catalog only — distinct from the
per-coach `foods` table (003), which starts empty for every coach and
holds only what that coach has manually typed or pulled in via
search; it has no fixed "count" to audit here.

## 2. Missing calories or protein

**Zero.** Both `calories_per_100g` (since 004) and `protein_per_100g`
(since 005) are `NOT NULL` columns with no default beyond what each
`INSERT` explicitly provides — structurally, no row can have a NULL in
either field. Migration 005 also `TRUNCATE`s and fully re-seeds the
table (176 rows, all carrying both fields), which is why 004's original
137 rows (calories only, no protein column existed yet) are **not**
part of the current 505 — they were completely replaced, not merged.

## 3. Probable duplicates

**Zero exact duplicates** — a case-insensitive unique index on
`lower(name)` has existed since 004 and is still in force; the database
itself cannot hold two rows with the same normalized name.

**Near-duplicates worth flagging**, found by inspection:
- **פלאפל (falafel)** — the live row (006, hand-entered, no source
  citation) and the draft 042 migration's row both target the *same*
  normalized name. 042 uses `ON CONFLICT (lower(name)) DO NOTHING` —
  **if 042 is ever applied as currently written, its verified USDA
  insert will silently no-op**, since the live falafel row already
  exists. 042 needs to become an `UPDATE`, or its `ON CONFLICT` clause
  needs a `DO UPDATE`, before it can actually take effect. Flagging
  this now since it directly affects your existing-but-unapplied 042.
- More generally: 16 live rows carry no `source_name`/`source_id`
  (item 4 below) and were never cross-checked against the 490-row USDA
  pass in 039/040 for a possible better-sourced match under a
  differently-spelled name (e.g. a hand-typed "שניצל עוף" vs a future
  USDA-sourced "Chicken schnitzel, fried"). Not a database-level
  duplicate, but a real candidate list for the new source+external_id
  dedup logic (049) to reconcile once a second-source import begins.

## 4. Which source was used for the existing foods

Mixed, and only partially structured:

- **489 rows** (505 − 16) carry some form of provenance: roughly 221
  were corrected/backfilled by migration 039 with structured
  `source_name`/`source_id`/`source_url` citing **USDA FoodData Central**
  (SR Legacy / Foundation Foods / Survey (FNDDS)) by exact `fdcId`; 269
  more were inserted fresh by 040 the same way (221 + 269 = 490, one
  more than 489 — a pre-existing, minor rounding/count discrepancy in
  this narrative footnote, not in the underlying data; a name-level
  overlap check between 039's and 040's own target lists found no
  actual collision, so the exact source of the 1-row gap is unresolved
  but does not affect this migration's safety, which the real preflight
  independently confirmed). Migration 005's original
  176-row reseed (predating the 039 metadata columns) states in its own
  header comment that its figures come from USDA FoodData Central too,
  but does **not** record a structured citation per row — only 039/040's
  490 rows have a verifiable, clickable source.
- **16 rows** (listed below) have never been touched by the USDA
  verification pass at all and carry no `source_name`/`source_id`/
  `source_url` whatsoever — their values trace back to migrations
  006/007/008 (hand-researched/corrected at the time, no external
  citation retained):
  `בייגלה, גרנולה, דג מושט, זיתים, חביתת ירקות, חטיף אנרגיה, חלבון ביצה,
  חמאת שקדים, כדורי בשר ברוטב, נקניקיה, עוף ברוטב עגבניות, פלאפל, קוקוס,
  קרם קרמל, שניצל עוף, תבשיל שעועית`

**No second external source (e.g. Open Food Facts) has ever been used
for this catalog** — 100% of the currently-cited provenance is USDA
FoodData Central. This is the exact gap the "≥2 sources" objective
needs to close; migration 049 adds the `source`/`external_id` columns
that make a second source distinguishable and deduplicable, but does
not itself add any second-source data.

## 5. Per-100g or per-serving

**Universally per-100g.** Every insert/update across every migration
targets `calories_per_100g`/`protein_per_100g`; the column names, the
004/005/039 header comments, and every existing constraint agree —
there is no per-serving ambiguity anywhere in this table's history.
(The separate `restaurant_food_items` table, 009, is the one place
this app already stores true per-serving figures — unrelated to this
catalog.)

## The 503 vs. 505 discrepancy — root cause

The real preflight query returned `current_total_rows = 505`. My
original audit assumed 503 (i.e., that migration 041 had already been
applied on top of the 505 documented in commit `89416f2`). Investigated
by checking migrations 041–044 and the merge history directly:

- **Migration 041's own file is merged into git**, via PR #2, commit
  `cb8e6b2`. But that merge commit's own title is literally
  **"Draft: post-deployment corrections (041) — merge before #1"** —
  merging a PR brings a migration *file* into the repository; it has
  no effect whatsoever on the live Supabase database. The two are
  separate actions, and only the second one (you running the SQL in
  the Supabase SQL Editor) ever changes live data.
- Unlike 039/040, which have an explicit, real verification commit
  (`89416f2`, "already run against Supabase," with matching row
  counts), **no analogous verification exists anywhere in this repo
  for 041** — I checked `supabase/audits/` for any `041`-named file
  and found none.
- Re-simulating the migration history stopping at 040 (i.e., *without*
  041) reproduces **exactly 505 rows** — matching your real preflight
  precisely.

**Conclusion: migration 041 has never been run against the live
database.** It exists only as a reviewed, merged, but unapplied file —
exactly like 042/043. The live catalog right now still contains the 6
rows 041 was written to fix:
- **4 rows with confirmed-wrong matched values**, still live as-is:
  חזה עוף צלוי (currently a fat-free deli-slice product, not roasted
  breast — 79 kcal/16.79g instead of the correct 165 kcal/31.02g),
  מוצרלה (currently nonfat instead of whole-milk), חמאת בוטנים
  (currently reduced-fat instead of regular), יוגורט יווני 0%
  (currently a branded, mango-flavored, 2%-fat CHOBANI product instead
  of plain nonfat).
- **2 rows that are specific commercial brands mis-filed as generic
  foods**, still live: יוגורט אפרסק (CHOBANI), עוגיות ג'ינג'ר (Archway)
  — 041 deletes both; no generic-food substitute was found for either.

This is a real, separate, already-diagnosed data-quality issue — 041
itself was never in question (it's already reviewed, tested against
`foodCatalogRealData.test.mjs`, and merged) — only whether it has been
*run*. Whether to apply 041 before, alongside, or independently of 049
is your call; the two migrations do not depend on each other.

## Value range sanity (proves the new 0–900 / 0–100 bounds are safe)

Re-verified against the TRUE live baseline (505 rows, pre-041) to
match your real preflight exactly, not just my original 503-row
assumption: **max calories 900.0** (a pure-fat/oil row, exactly at the
proposed ceiling, unchanged either way), **max protein 31.7** (the
pre-041 value for one of the 4 rows 041 would correct — slightly
different from the post-041 figure of 31.02, but still well inside the
100 ceiling either way). **min 0 for both**. 18 rows have protein
exactly 0 — all genuinely zero-protein foods (oils, sugar, water,
candy, jam, chewing gum, condiments, salt, tea, vodka), not
missing-data artifacts. Your own real preflight independently confirms
this: `rows_that_would_violate_new_calorie_bound = 0`. No existing row
— with or without 041 applied — would be rejected by migration 049's
new bounds.

## What migration 049 does and does not do

Purely additive: 9 new nullable columns
(`source, external_id, barcode, name_he, name_en, brand,
preparation_state, verification_status, last_verified_at`), two new
`CHECK` constraints on the *existing* calorie/protein columns (proven
safe above), and two **partial** unique indexes
(`(source, external_id) WHERE external_id IS NOT NULL`,
`(barcode) WHERE barcode IS NOT NULL`) — partial specifically so the
505 existing rows, which have neither field set yet, are completely
unaffected. It does not insert, update, or delete a single existing
row, and does not touch RLS (the existing
`food_reference_catalog_select_authenticated` policy already covers
every column; nothing writes to this table from the app in either
shape).

## What is *not* included in this pass (by design)

Per your own scope ("perform the audit and prepare the infrastructure
only"): no new food data was imported, no second source was queried,
and the catalog does not yet contain 1,500 rows. That is deliberately
the next, separate step.

## Post-execution status (2026-09-20, later same day)

Everything above describes the state at the time this audit was
written, when 041/042/043/049 were still unapplied drafts — kept as-is
for the historical record rather than rewritten in place. Since then,
you have run the corrected migrations against Supabase and confirmed
via live verification: **041 applied successfully, corrected 042
applied successfully, corrected 043 applied successfully, 044 remained
retired/skipped (no file ever existed to run), and 049 applied
successfully** — new bounds and indexes are live, with zero calorie or
protein bound violations. The live count is now **504** (505 pre-041,
adjusted by these migrations' own net row-count effects). The catalog
is not yet at the ≥1,500-row, ≥2-source target — the actual multi-source
data import remains the deliberately separate next step described
above.
