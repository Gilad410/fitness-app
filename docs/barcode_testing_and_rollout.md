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

## Part 2 — Runbook for after the phone test passes (NOT executed yet)

Only proceed here once you've confirmed Tests A–I above behave as expected. This is the exact sequence I'd follow, laid out for your review and go-ahead at each step — none of it runs automatically.

### Step 1 — Apply migration 045 to Supabase

1. Open the Supabase Dashboard → SQL Editor for this project.
2. Paste the full contents of `supabase/sql/045_trainee_nutrition_logs_barcode_source.sql` (drafted, currently sitting in PR #3, untouched since review).
3. Run it. Expected result: `Success. No rows returned` for most of it, plus one real result set from the migration's own built-in read-only check — a single row, `rows_failing_source_check = 0`. If that number is anything other than 0, stop and report back before doing anything else; it means some existing row doesn't cleanly satisfy the new 3-way constraint, which shouldn't happen given every current row is food_id- or restaurant_food_item_id-based, but the migration checks for it explicitly rather than assuming.
4. This only adds nullable columns, replaces one check constraint, and replaces the trigger function body — no data is deleted or rewritten for any existing row.

### Step 2 — Re-run Test J for real

1. On the phone, repeat Test J (get to review, tap "המשך לשמירה").
2. **Expect now:** it saves successfully, the form/modal closes, and the new entry appears in the log list as `"<product name> (ברקוד)"` with the correct grams and calculated calories/protein — using the exact same display format the existing food/restaurant entries already use.
3. Delete the test log entry afterward (the existing "מחק" button already works on any entry, including this one — no barcode-specific code needed there).

### Step 3 — Merge PR #3

1. This requires your explicit go-ahead at the time — merging is treated as a high-risk action I don't take unilaterally even when asked in advance (the same reason PR #2's merge earlier in this session needed you to click merge on GitHub yourself after my attempt was blocked). Most likely path: you merge PR #3 on GitHub directly (https://github.com/Gilad410/fitness-app/pull/3), or explicitly authorize the specific action in the moment and I retry.
2. PR #3's base is `main` at `cb8e6b2` (still current as of the last audit) — a clean merge is expected, no conflicts, since this branch never touched any file the food-catalog branch/PR #1 touches.

### Step 4 — Deployment

1. Merging to `main` triggers Vercel's existing GitHub integration automatically (the same mechanism that deployed the food-catalog work previously) — no separate deploy step needed on my end, and none will be taken beyond the merge itself.
2. I can't directly observe Vercel's build/deploy status from here (no `.vercel` link, no CLI) — confirming the deploy went out is on you, the same limitation noted for prior deployments this session.

### Step 5 — Production smoke test

1. Repeat a short version of Tests A, D, F, H, J against the real production URL, on a real phone, once deployed — confirming the feature works end-to-end in production, not just in the tunnel/preview environment from Part 1.

---

## Constraint reaffirmed

Nothing above has been run. `045` has not been applied, PR #3 has not been merged, nothing has been deployed. PR #1 and the food-catalog branch (`food-catalog-expansion-proposal`) remain completely untouched by this document and this session — no file either branch owns was read, edited, or referenced for anything beyond confirming they stay separate.
