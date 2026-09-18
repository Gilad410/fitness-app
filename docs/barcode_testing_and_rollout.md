# Barcode Feature — Phone Testing Steps & Rollout Runbook (PR #3)

**Nothing in this document has been executed.** Migration `045` has not been run, PR #3 has not been merged, Supabase is untouched, nothing has been deployed. Part 2 is a plan to execute *after* you confirm the phone test passes — not a set of actions taken now.

---

## Part 1 — Exact phone-testing steps

### Before you start: getting the PR branch onto your phone

Camera access (`BarcodeDetector` + `getUserMedia`) only works in a **secure context** — `https://` or `localhost`. A plain `http://<your-computer's-LAN-IP>:5173` URL will load the page but the camera will silently refuse to start, which looks like a bug but isn't. Pick one:

- **Option A — check Vercel first.** If this repo's Vercel project has PR preview deployments enabled, GitHub will show a preview URL directly on PR #3 (`https://github.com/Gilad410/fitness-app/pull/3`) or in Vercel's dashboard. That URL is HTTPS by default — the simplest path if it exists. I can't confirm from here whether preview deploys are enabled for this repo; check the PR page for a Vercel bot comment/status check.
- **Option B — local dev server + HTTPS tunnel (reliable, works regardless of Vercel settings).**
  1. `git checkout barcode-food-logging && npm run dev -- --host`
  2. In a second terminal: `npx cloudflared tunnel --url http://localhost:5173` (or `npx ngrok http 5173` if you have an ngrok account) — either gives you a temporary public `https://...` URL.
  3. Open that HTTPS URL on your phone's browser.
- **Option C — plain LAN IP, manual-entry paths only.** `npm run dev -- --host`, then `http://<computer-IP>:5173` on the phone, same WiFi network. Fine for testing manual barcode entry, the lookup, and the calculation preview (none of which need the camera) — **camera scan will not initialize this way**, so don't use this option for the camera tests specifically.

### What needs Supabase, and what doesn't

Everything through "review" (product found, grams entered, calculated preview shown) is **pure client-side** — camera, Open Food Facts lookup, and the calculation all happen in the browser, no database involved. Only the final **save** touches Supabase, and since migration `045` hasn't been applied yet, **the save is expected to fail** with a database error at that exact point (missing columns) — that's correct behavior right now, not a bug. Test everything up through review now; the save itself gets validated in Part 2, step 2, after `045` is applied.

### Log in and find the feature

1. Log in as a coach account.
2. Open any trainee's page, scroll to the "תזונה" (Nutrition) section.
3. Confirm you see two buttons: "הוסף מאכל" (existing, unchanged) and **"סרוק ברקוד"** (new).

### Test A — Camera scan happy path (Android + Chrome, or desktop Chrome/Edge with a webcam)

1. Tap "סרוק ברקוד" → "סרוק עם המצלמה".
2. Grant the camera permission when prompted.
3. Point the camera at a real packaged product's barcode.
4. **Expect:** it auto-detects within a second or two (no manual "capture" tap needed) and moves straight to "מחפש..." then either the product card or a not-found message.

### Test B — Camera permission denied

1. Tap "סרוק ברקוד" → "סרוק עם המצלמה".
2. **Deny** the permission prompt.
3. **Expect:** falls back to the manual barcode entry screen with the message "לא ניתן לגשת למצלמה. ניתן להזין את הברקוד ידנית." — not a blank screen or stuck spinner.

### Test C — Unsupported browser (iPhone Safari, or Firefox on any device)

1. Open the same URL on Safari/iOS or Firefox.
2. Tap "סרוק ברקוד".
3. **Expect:** no "סרוק עם המצלמה" button at all — a note explaining the browser doesn't support camera scanning, and the manual-barcode-entry button is offered directly.

### Test D — Manual barcode entry, a real product

1. Tap "סרוק ברקוד" → "הזן ברקוד ידנית".
2. Type a real barcode you can read off a product at home (usually 12-13 digits under the barcode lines).
3. Tap "חפש".
4. **Expect:** "מחפש..." then the product card: name, "מקור: Open Food Facts", calories and protein per 100g.

### Test E — Invalid barcode format

1. Same manual-entry screen, type something like `123` or `abcdef`.
2. Tap "חפש".
3. **Expect:** a validation message appears immediately (no network call, no "מחפש..." delay) — "הברקוד שהוזן אינו תקין...".

### Test F — Grams entry and calculation preview (verify the math by hand)

1. With a found product showing (e.g. 250 kcal / 10g protein per 100g), enter grams = 40.
2. **Expect preview:** 100 kcal (250 × 40 / 100) and 4g protein (10 × 40 / 100). Check the actual numbers shown against this by hand for whatever product you found.

### Test G — Unknown-protein product

1. Scan/enter a barcode for a product likely to have incomplete data (small/obscure brands are more likely to be missing fields on Open Food Facts).
2. **Expect:** if protein is genuinely missing, the product card shows "חלבון לא ידוע" — not "0 ג' חלבון".

### Test H — No match / no nutrition data → manual fallback

1. Enter a barcode you're confident isn't a real product (e.g. `00000000000`).
2. **Expect:** "המוצר לא נמצא במאגר. ניתן להזין את הפרטים ידנית." with a "הזן פרטים ידנית" button.
3. Tap it, fill in a name, calories, protein (protein optional), and grams.
4. **Expect:** same live calculation preview as Test F, using your typed-in values.

### Test I — Cancel mid-flow releases the camera

1. Start a camera scan, let it run a few seconds, then tap "ביטול".
2. **Expect:** your phone's camera-in-use indicator (the green dot on iOS, the camera icon in Android's status bar) turns off immediately — confirms the video stream actually stopped, not just the UI hiding it.

### Test J — Save (expected to fail cleanly right now)

1. Get to the review step (Test D or H) and tap "המשך לשמירה".
2. **Expect right now, before `045` is applied:** a clear error message (a database error surfaced as `err.message`, e.g. mentioning a missing column) — not a white screen, not a silent no-op, not a JS crash in the console. This confirms the save path is wired correctly and fails safely, not that it's broken.
3. This step gets re-tested for real success in Part 2, step 2.

---

## Part 2 — Runbook for after the phone test passes

**Update:** the phone test has confirmed barcode lookup, product review, grams calculation, and the UI all work correctly. The save step failed exactly as predicted in Test J above — `"Could not find the barcode column"` — because migration `045` has not been applied yet. That confirms the pre-migration behavior is correct (fails cleanly with a real error, not a crash or a silent no-op), not a new bug. **Steps 1–2 below are the exact next actions. Neither has been run yet — I don't have direct Supabase access; you run these yourself in the SQL Editor, in order.**

### Step 1 — Preflight check (run this FIRST, before 045)

1. Open the Supabase Dashboard → SQL Editor for this project.
2. Paste and run the full contents of `supabase/audits/trainee_nutrition_logs_045_preflight_check.sql` — 4 read-only `select`s, no transaction, safe to run any number of times, references only columns/objects that already exist today (schema-agnostic, can't fail because of anything 045 would add).
3. **What to check in the results:**
   - Query 1 (columns): confirm none of `barcode`, `barcode_source`, `barcode_product_name`, `barcode_calories_per_100g`, `barcode_protein_per_100g` already appear in the list — they shouldn't, but this rules out a name collision before 045 tries to add them.
   - Query 2 (constraint): confirm a row named `trainee_nutrition_logs_source_check` appears — this is the constraint 045 is about to drop and replace; if it's missing or named differently, stop and report back rather than running 045.
   - Query 3 (row check): confirm `neither_source_rows = 0` and `total_rows = food_id_rows + restaurant_item_rows`. **If `neither_source_rows` is anything but 0, stop — do not run 045** — report the exact numbers back; it would mean a pre-existing gap unrelated to this change, not something 045 should paper over.
   - Query 4 (trigger function): confirm `set_nutrition_log_calories` appears — the function 045 is about to replace.
4. All four passing as expected means it's safe to proceed to the actual migration.

### Step 2 — Show and run migration 045

1. Full contents to review before running: `supabase/sql/045_trainee_nutrition_logs_barcode_source.sql` (169 lines, unchanged since it was drafted — reproduced here for this review):
   - Adds 5 nullable columns to `trainee_nutrition_logs`: `barcode`, `barcode_source`, `barcode_product_name`, `barcode_calories_per_100g` (checked `>= 0`), `barcode_protein_per_100g` (checked `>= 0`, nullable — an unknown-protein product is not an error).
   - Drops and replaces `trainee_nutrition_logs_source_check` with a 3-way version (food_id-only / restaurant_food_item_id-only / barcode-only, each requiring exactly its own fields and nothing from the other two branches).
   - Replaces `set_nutrition_log_calories()` with a 3-branch version — the food_id and restaurant_food_item_id branches are byte-for-byte unchanged from `011_restaurant_nutrition_logs.sql`; the new barcode branch computes `calories = barcode_calories_per_100g * grams / 100`, `protein = barcode_protein_per_100g * grams / 100` (null-safe), both rounded to 1 decimal.
   - The barcode branch's constraint requires `barcode_source is not null` but never checks it against a specific value — `'open_food_facts'` and `'manual'` both satisfy it identically, so **the manual nutrition fallback path keeps working after this migration exactly as it does for `'open_food_facts'` matches** — confirmed by a dedicated test (`barcodeMigration.test.mjs`), not just asserted.
   - Wrapped in `begin;`/`commit;`; ends with its own built-in read-only report (see step 3) as the last statement before `commit;` — it cannot abort the migration, only inform you.
2. Open the Supabase Dashboard → SQL Editor, paste the full file contents, run it.

### Step 3 — Verify the result

1. **Expect:** `Success. No rows returned` for the `alter table`/`create or replace function` statements, plus one real result row from the migration's own final `select` — check that it reads **`rows_failing_source_check = 0`**.
2. If it's anything other than 0, the transaction still committed (this is a report, not a guard — see the migration's own comment on why), so **stop and report the exact number back immediately** rather than continuing to step 4 — don't assume it's fine.
3. No existing data was deleted or rewritten either way — only nullable columns were added and the constraint/trigger function bodies were replaced.

### Step 4 — Retest saving the basmati product

1. On the phone (same preview URL as before), repeat the barcode flow for the same basmati product that failed to save during the phone test: scan or manually enter its barcode, confirm the product card shows the same name/source/calories/protein per 100g as before, enter the same grams, tap "המשך לשמירה".
2. **Expect now:** it saves successfully — no `"Could not find the barcode column"` error, the form closes, and the entry appears in the log list as `"<basmati product name> (ברקוד)"` with the correct grams and calculated calories/protein (verify against the `calories_per_100g × grams / 100` / `protein_per_100g × grams / 100` formula by hand, same check as Test F).
3. Also spot-check the manual-nutrition fallback still works: trigger it on a barcode Open Food Facts doesn't recognize, fill in a name/calories/protein by hand, save, confirm it appears in the list the same way with `(ברקוד)` and `barcode_source = 'manual'` under the hood.
4. Delete both test log entries afterward (the existing "מחק" button already works on any entry, including these — no barcode-specific code needed there).

### Step 5 — Merge PR #3

1. This requires your explicit go-ahead at the time — merging is treated as a high-risk action I don't take unilaterally even when asked in advance (the same reason PR #2's merge earlier in this session needed you to click merge on GitHub yourself after my attempt was blocked). Most likely path: you merge PR #3 on GitHub directly (https://github.com/Gilad410/fitness-app/pull/3), or explicitly authorize the specific action in the moment and I retry.
2. PR #3's base is `main` at `cb8e6b2` (still current as of the last audit) — a clean merge is expected, no conflicts, since this branch never touched any file the food-catalog branch/PR #1 touches.

### Step 6 — Deployment

1. Merging to `main` triggers Vercel's existing GitHub integration automatically (the same mechanism that deployed the food-catalog work previously) — no separate deploy step needed on my end, and none will be taken beyond the merge itself.
2. I can't directly observe Vercel's build/deploy status from here (no `.vercel` link, no CLI) — confirming the deploy went out is on you, the same limitation noted for prior deployments this session.

### Step 7 — Production smoke test

1. Repeat a short version of Tests A, D, F, H, J against the real production URL, on a real phone, once deployed — confirming the feature works end-to-end in production, not just in the tunnel/preview environment from Part 1.

---

## Constraint reaffirmed

Nothing above has been run. `045` has not been applied, PR #3 has not been merged, nothing has been deployed. PR #1 and the food-catalog branch (`food-catalog-expansion-proposal`) remain completely untouched by this document and this session — no file either branch owns was read, edited, or referenced for anything beyond confirming they stay separate.
