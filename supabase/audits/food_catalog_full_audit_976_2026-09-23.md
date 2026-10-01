# Open Food Facts (Israel) Import — Full 976-Product Audit: Final Consolidated Report

**No database write has happened. Nothing has been committed, pushed, merged, or deployed. All previously-generated SQL batches (050–054) remain marked OUTDATED and blocked from execution. No corrections in this report have been applied to any table — every one is proposed only, pending your review.**

## 1. SUPERSEDED — corrected below

**This section, and several counts in this file, were corrected in a follow-up continuation round. The claim below ("100% reviewed") conflated "every barcode has a ledger entry" with "every review is complete" — those are not the same thing, and a subsequent structural check found a real compliance gap (single-reader-only determinations on the no-photo track) that reopened 196 records. See the addendum at the end of this file for the corrected, final state. The tables and counts in the body of this file below reflect the state at first-pass completion and are preserved for the audit trail, but are NOT the final numbers — use the addendum.**

The original (now-superseded) framing: "The 976-barcode cohort is now 100% reviewed at least once — every barcode has a recorded, evidence-based outcome." That claim is corrected as follows: 976/976 barcodes have a **ledger entry** (100%). Of those, only 403 (235 VERIFIED + 32 CORRECTION_PROPOSED + 136 UNRESOLVED) represent a **completed review** at first pass (41.3%) — the other 573 are PENDING, meaning the evidence-gathering step itself was blocked, not that a review concluded with no evidence. A further structural check (see addendum) found that 196 of the 403 "completed reviews" (the no-photo track's VERIFIED + CORRECTION_PROPOSED) did not actually meet the required two-independent-readings standard and have been reopened.

Two tracks make up the 976:
- **With-photo track (140 items)**: had a cached Open Food Facts label image. Fully reconciled via **two independent blind readings** of the same image plus, for every case where the two readers disagreed, a third tie-breaking read I performed personally — never resolved by majority vote.
- **No-photo track (836 items)**: had no cached image. Reviewed via a single evidence-gathering agent per item (OpenFoodFacts API/live images first, then WebSearch/WebFetch where available), not the double-reading protocol — this is a **materially weaker verification standard** than the with-photo track, and is called out explicitly for that reason in every VERIFIED/CORRECTION_PROPOSED entry's evidence field.

## 2. Exact reconciled counts (verified directly from the ledger files, not narrated from memory)

| Outcome | With-photo (140) | No-photo search (836) | **Combined (976)** |
|---|---:|---:|---:|
| VERIFIED | 60 | 175 | **235** |
| CORRECTION_PROPOSED | 11 | 21 | **32** |
| UNRESOLVED | 69 | 67 | **136** |
| PENDING | 0 | 573 | **573** |
| **Total** | **140** | **836** | **976** |

235 + 32 + 136 + 573 = 976. ✓

**PENDING (573) is not "reviewed and inconclusive" — it means the evidence-gathering step itself was blocked**, overwhelmingly because the WebSearch tool was unavailable for most of this session (a persistent, session-wide budget exhaustion that recurred across roughly 30 consecutive dispatch rounds and did not clear). A smaller number (48, now resolved) were lost to two separate session-wide Claude API rate limits that did recover on retry. Every PENDING entry carries an explicit `blocker` field naming the specific cause — see `scripts/food-catalog-import/ledger/search_results.json`.

UNRESOLVED (136) means a review **was** completed but the evidence itself did not support a determination — no nutrition photo existed anywhere reachable, the photo was illegible, the product identity could not be confirmed, or the printed basis (raw/cooked, per-serving/per-100g) didn't match what would be needed to compare against the stored value without guessing.

## 3. New work this pass vs. the last checkpoint

| Checkpoint | Fetched | Reviewed (any outcome) | % of 976 |
|---|---:|---:|---:|
| Earlier interim report (2026-09-20) | 662 | 522 | 53.5% |
| **This final pass** | 976 | **976** | **100%** |

454 additional products received a first genuine review this session (976 − 522), on top of re-verifying and correcting several race conditions and calculation bugs found in the reconciliation tooling itself (documented in section 7).

## 4. Complete product-by-product audit file

One consolidated file, all 976 barcodes, keyed by barcode:

**`scripts/food-catalog-import/out/MASTER_AUDIT_976.json`**

Each entry carries: barcode, name, track, stored calories/protein, final outcome, proposed calories/protein (if a correction), and the evidence/justification text (including source URLs for the no-photo track). Underlying per-track ledgers, kept as the audit trail:
- `scripts/food-catalog-import/ledger/reconciled_with_photo.json` (140 items, with `reader1`/`reader2`/manual-third-read fields preserved)
- `scripts/food-catalog-import/ledger/search_results.json` (836 items, with `sourceUrl` per item)
- `scripts/food-catalog-import/ledger/manual_third_read_overrides.json` (the 15 cases requiring my own tie-breaking read, each with full reasoning)

## 5. Correction table — 32 items (evidence-backed, NOT applied)

All calorie/protein values are **per 100g** unless noted. Full machine-readable version: `scripts/food-catalog-import/out/CORRECTION_TABLE.json`.

| Barcode | Name | Stored (kcal/protein) | Proposed (kcal/protein) | Note |
|---|---|---:|---:|---|
| 72917589 | מקופלת | 536 / 6.8 | 536 / 6.6 | Photo; small protein discrepancy |
| 8715700419732 | מתבל עגבניות | 102 / 1.2 | 103 / 0.9 | Photo |
| 7290000063140 | Osem Soup Cereals | 510 / 9 | 522 / 9.2 | Photo |
| 7290003075102 | לבנה טמרה | 155 / 12 | 155 / 6 | Photo; reader2 misread carbs row as protein — confirmed by my own third read |
| 7290000416045 | קרם שוקולד למריחה | 504 / 3.6 | 504 / 14.2 | Photo; stored value used the 25g-serving column instead of the 100g column |
| 8690777206051 | Roasted Eggplant | 34 / 1 | 34 / 0 | Photo, triply confirmed (both readers + my third read) |
| 7290119370955 | יוגורט בטעם וניל עוגיות | 56 / 10 | 112 / 20 | Photo; stored value used the per-cup (200g) column instead of per-100g |
| 7394376616778 | Oat milk | 61 / 1.1 | 59 / 1 | Photo |
| 7290006337993 | Beef dumplings | 214 / 10.4 | 294 / 7.5 | Photo, ~37% calorie gap, confirmed by both readers + my third read |
| 7290002026440 | Hot Pretzel | 300 / 7.5 | 280 / 7.5 | Photo |
| 0815871010009 | Potato chips | 564 / 7.05 | 535.7 / 7.1 | Deterministic conversion from a printed 28g serving |
| 6942836720216 | Cookies 'n' Mint | 527 / 5.7 | 527 / 20.8 | Photo; stored protein wrong by ~3.6x, confirmed by my own direct read |
| 7290119372997 | יוגורט בטעם רול קינמון | 56 / 10 | 112 / 20 | Same per-cup vs per-100g column error as above |
| 7290112965684 | חטיף דגנים עם עשבי תיבול | 478 / 6.5 | 439 / 6.5 | Photo (no-photo-track evidence, single-reader) |
| 7290000066141 | ביסלי גריל | 507 / 10 | 492 / 11 | Photo |
| 7290012001994 | Moutarde ancienne | 166 / 7.7 | 158 / **unconfirmed** | Protein row cropped out of the available photo — calorie correction only, protein still needs evidence |
| 7290110558284 | MULTI Yogurt 3% fat | 71.5 / 6.5 | 71 / 2 | Photo; protein off by >3x, plausible for a non-protein-fortified yogurt |
| 7290114969284 | אבקת חלבון בטעם וניל | 376.5 / 73.5 | 387 / 77 | Photo; stored value used an incorrect 34g serving weight vs the printed 33g |
| 5740900403215 | Lurpak spread | 706 / 0.5 | 679 / 0.5 | Photo (two independent crops agree) |
| 7296073205616 | medjool dates semi dry | 0.267 / 2.2 | 267 / 2.2 | **Confirmed decimal error — stored value off by exactly 1000x** |
| 7290002986218 | עוגיות יין חצי מצופות | 468 / 6.6 | 544 / 5.5 | Photo, product name/brand match confirmed on the package |
| 7290016392531 | Vegan Protein Complex | 384.4 / 75.3 | 373 / 73.3 | Stored value used an incorrect 32g serving weight vs the printed 33g |
| 7290002769347 | Kaak (Ugiot HaZahav) | 505 / 9.7 | 453 / 4.8 | Photo, sharp/clear |
| 0613008753351 | Arizona Pomegranate | 21 / 0 | 34 / 0 | Photo; calories-only correction, protein already correct |
| 7290112340122 | Rice cakes (Energy) | 411 / 8.8 | 388 / 7.5 | Photo |
| 0065633280267 | Nature Valley granola bar | 363 / 5 | **basis mismatch — see note** | Printed label is per-42g-serving (190kcal/3g); a naive ×(100/42) scaling does NOT land near the stored value — flagged for manual review, not a clean same-basis correction |
| 7290000467511 | ביסלי ברביקיו | 501 / 11 | 528 / 10 | Photo |
| 7290000490601 | גלידל בטעם וניל | 100 / 4.3 | 71 / 4.3 | Photo; likely confusion with a regular (non-reduced-calorie) sibling product |
| 7290010065332 | מחית תפוח עץ ובננה | 68 / 0.5 | 56 / 0.5 | Photo |
| 7290018237373 | פסטרמה עוף טוב גריל | 99 / 18 | 99 / 16 | Photo, barcode visible on the exact package photographed |
| 7290111566103 | Falafel vegan | 160 / 8.9 | 220 / 7.8 | Photo, ~37% calorie gap |
| 7290119373369 | פריכיות תפוחי אדמה | 387.6 / 7.75 | 386 / 7.0 | Manufacturer's own printed 100g column read directly, vs. what looks like a back-calculation from a smaller per-unit figure in the stored value |

**All 32 are evidence-backed proposals only.** None have been written to any database table.

## 6. Unresolved (136) and Pending (573) — categorized, with sources attempted

Not listed individually here (709 rows) — full detail with per-item reasoning is in `MASTER_AUDIT_976.json`. Category counts:

**UNRESOLVED (136) — review completed, evidence did not support a determination:**
| Reason category | Count |
|---|---:|
| No usable evidence found at all (various — see per-item notes) | 98 |
| No nutrition photo exists anywhere on OpenFoodFacts | 21 |
| Only a front-of-package photo exists, no nutrition panel | 8 |
| Genuine product-identity conflict (label doesn't match catalog name/brand) | 6 |
| Basis mismatch (raw-vs-cooked, or serving-vs-100g that couldn't be reconciled without guessing) | 3 |

**PENDING (573) — evidence-gathering step itself was blocked, not a completed review:**
| Reason category | Count |
|---|---:|
| OpenFoodFacts has no nutrition photo for the item, AND the WebSearch step that might have found manufacturer evidence was blocked | 287 |
| Only a front photo exists, AND WebSearch was blocked | 132 |
| WebSearch explicitly blocked with no other cause noted | 145 |
| Other (e.g. basis concerns noted alongside the search block) | 9 |

Every PENDING item's `sourceUrl`/`blocker` field in `search_results.json` names the exact OpenFoodFacts URL checked and the specific reason the search step could not complete — this is a genuine, itemized execution gap, not a vague catch-all.

## 7. Real bugs found and fixed in the audit tooling itself this session

These affected correctness, not just coverage, and are documented here because they changed prior interim counts:
1. **Per-serving vs per-100g comparison bug**: the reconciliation script originally compared raw per-serving label numbers directly against per-100g stored values with no conversion. Fixed with deterministic gram-weight parsing from an explicitly printed serving weight — never a guessed density or portion.
2. **Double-conversion bug**: some readers had already converted their own reading to per-100g before recording it; the script divided by the serving weight a second time. Caught via cross-checking against the second reader's independent number; the ~4 affected items were resolved individually with the arithmetic shown explicitly in `manual_third_read_overrides.json`.
3. **Two OFF-attached "nutrition" photos were actually for the wrong product** (barcode confirmed via a separate front photo showing a different item) — both correctly resolved to UNRESOLVED rather than accepted as evidence.
4. **One raw-vs-cooked basis mismatch** (barcode 7290017406367: catalog says cooked Persian rice, the only photographed label was explicitly for the pre-cooking/raw state) — reported as found, not converted, left UNRESOLVED.
5. **A 16-digit malformed barcode** (2210252540925832, not standard EAN-13/UPC-12) verified numerically but is flagged for a manual barcode-format review regardless.
6. **Two open, unresolved implausible-value flags** for follow-up (no evidence found either way yet): barcode 7290110327804 ("Go tnuva cookie dough" yogurt, stored protein 33.5g/100g — far outside normal range for a flavored yogurt) and barcode 7290112331281 (Quaker Oat flakes, stored protein 6.2g/100g — notably lower than typical rolled oats ~13g/100g).

## 8. Import-eligible counts — now vs. hypothetical after corrections (no double-counting)

| | Count |
|---|---:|
| **Import-eligible right now** (VERIFIED only, per the standing rule that only VERIFIED products may be import-eligible) | **235** |
| CORRECTION_PROPOSED (blocked pending your review of each proposed value — NOT counted as eligible) | 32 |
| UNRESOLVED (blocked) | 136 |
| PENDING (blocked) | 573 |
| **If every one of the 32 corrections were individually reviewed and accepted** (hypothetical only — nothing has been applied) | up to 267 |

Total blocklist (`scripts/food-catalog-import/out/blocked_from_import.json`): **761** = 741 non-verified from this 976 cohort (976 − 235) + 20 from the earlier, separate 100-item-sample-pass exclusion list, confirmed to have **zero barcode overlap** between the two pools (741 + 20 = 761 exactly, no double-counting).

## 9. The earlier 24 fully-verified products

These were verified in an earlier phase of this project, before the 976-product audit began, and were kept structurally separate throughout — the 976-item cohort (`bucket2_remaining.json`) explicitly excludes them (976 + 24 = 1,000, the full original candidate pool in `accepted_candidates.json`).

**Honest gap to report**: I searched this session's persisted files exhaustively (the reconciliation scripts, `out/`, `ledger/`, and both dated audit markdown reports) for the specific list of 24 barcodes, and could not locate one — only a reference confirming they exist and are excluded, in `supabase/audits/food_catalog_openfoodfacts_dry_run_2026-09-20.md` section 3, which was left as an empty heading. If that list was established in conversation earlier than this session's persisted files capture, it is not recoverable from disk right now. I am not fabricating a list to fill this gap — if you have it recorded elsewhere, it should be merged in before any import decision is finalized; otherwise it needs to be re-derived.

## 10. Confirmation

- No production SQL has been run.
- No commit, push, merge, or deploy has occurred.
- No correction in section 5 has been applied to any table — all 32 are proposals only.
- SQL batches 050–054 remain marked OUTDATED and blocked.
- All work is saved incrementally in the files listed in section 4; nothing exists only in this conversation.

---

## ADDENDUM (2026-09-23, continuation round) — corrected final state, supersedes the body above

**This addendum is the authoritative source. Sections 1–10 above reflect the first-pass state and are preserved only for audit-trail history.**

### A.0 What "100%" actually means here — three different things, not one

| Claim | True for | NOT the same as |
|---|---|---|
| "Every barcode has a ledger entry" | ✅ 976/976 + 24/24 = 1000/1000 | ≠ every review is complete |
| "Every review is complete" | Only for the 236+17+159 = 412 non-PENDING 976-items + all 24 of the earlier-24 | ≠ every product is verified |
| "Every product is verified" | Only 236 (976-cohort) + 20 (earlier-24) = **256 products, import-eligible** | The only number that matters for import |

Nothing in this document claims 100% verification. The 976-cohort still has **564 genuinely PENDING** items (evidence-gathering step blocked, not reviewed-and-inconclusive) and **159 UNRESOLVED** (evidence gathered, inconclusive).

### A.1 Reconciled counts, both cohorts, no double-counting

| Cohort | Total | VERIFIED | CORRECTION_PROPOSED | UNRESOLVED | PENDING | Import-eligible |
|---|---:|---:|---:|---:|---:|---:|
| 976-cohort (`bucket2_remaining.json`) | 976 | 236 | 17 | 159 | 564 | 236 |
| Earlier-24 (recovered separately, see A.4) | 24 | 20 | 3 | 1 | 0 | 20 |
| **Both new-product cohorts, combined** | **1000** | **256** | **20** | **160** | **564** | **256** |

The existing **504 production-catalog items are entirely out of scope** — not reviewed, not touched, not reimported by anything in this document. Import-eligible = VERIFIED **and** `twoReaderConfirmed: true` only (positive allowlist — see A.6). Full machine-readable exports: `scripts/food-catalog-import/out/FINAL_PRODUCT_TABLE.csv` (1000 rows, one per new-product candidate), `out/CORRECTION_TABLE_FINAL.csv`, `out/UNRESOLVED_PENDING_TABLE.csv`.

### A.2 What changed this continuation round

1. **Structural deficiency fixed**: all 196 no-photo-track VERIFIED/CORRECTION_PROPOSED records that had only a single reader (not the required two independent readings) were reopened, preserving the original reading in `_firstRead`, and put through a genuine blind second reading. Final split of the 196: the large majority reconciled cleanly; several genuine corrections and several downgrades to UNRESOLVED came out of this pass — full detail in `scripts/food-catalog-import/ledger/CHANGE_LOG.json`.
2. **The earlier-24 products were actually recovered and verified from scratch this round** — see A.4. They were never previously verified in any recoverable record, despite an earlier (incorrect) claim to that effect.
3. **A positive import allowlist replaced blocklist-only logic** (`generateAllowlist.mjs`): a barcode absent from the ledger is never eligible, regardless of blocklist state. Verified zero overlap between this cohort and both the earlier-20-sample-pass exclusions and the recovered-24.
4. **WebSearch confirmed hard-capped** (200/200 this session, not a recovering rate limit) — all further evidence gathering pivoted to WebFetch/direct-image-read only.
5. **A session-wide model usage limit hit mid-round** (separate from the WebSearch cap), interrupting 3 in-flight agents; recovered cleanly after the stated reset — verified via a fresh capability check, not assumed, before resuming dispatch. No data was lost (confirmed no partial files existed from the interrupted attempts).
6. **A lightweight evidence-screening step was added** ahead of full two-reader dispatch, per a mid-round process improvement: one focused pass judges whether evidence is even usable before committing two full readers to it. This immediately paid off — it caught a **total OpenFoodFacts image-CDN outage** (`images.openfoodfacts.org` refusing all connections, confirmed independently via direct `curl` and via `WebFetch`, while the separate API host stayed reachable) with one lightweight dispatch instead of a wasted two-agent dispatch. All further photo-based evidence work for the 976-cohort's remaining PENDING items is currently blocked by this outage, not by lack of effort — will not be repeatedly retried against a confirmed-down host.
7. **Two real tooling bugs found and fixed this round**:
   - `buildFinalReport.mjs` (this report's own generator) was ignoring a manually-resolved `proposedCalories`/`proposedProtein` field for one earlier-24 correction (barcode 7290119377404), instead re-surfacing a reader's column-selection error. Fixed and verified.
   - Four records missing a `blocker` field despite being PENDING (a no-op line in an inline fix script) — corrected.
8. **An open methodology question flagged, not unilaterally resolved**: barcode 72917589 (and 3 similar cases) are marked VERIFIED where the evidence reading differs slightly from the stored value (e.g. 6.6g vs 6.8g protein), accepted via an automated tolerance formula in `reconcileSecondReads.mjs`. This tolerance formula is used across several reconciliation scripts in this pipeline. A parallel read-only review of `reconcileSecondReads.mjs`, `regenerateMasterAudit.mjs`, and `generateAllowlist.mjs` is in progress (assigned separately) specifically because per-session instructions now explicitly prohibit inventing percentage tolerances to paper over mismatches. **This document does not reclassify those 4 records** pending that coordinated review — flagging them here so they are not silently treated as settled: `72917589`, `7290118426202`, `7290019816331`, `7290006775405`.

### A.3 Corrections — fully supported (20 total, all two-reader-confirmed)

All 20 corrections below (17 from the 976-cohort + 3 from the earlier-24) have two independent readings (or a documented, checkable manual tie-break resolving a genuine reader disagreement) and a deterministic conversion shown wherever a basis change was involved. **None have been applied to any table.** Full table with basis/evidence/reasoning: `scripts/food-catalog-import/out/CORRECTION_TABLE_FINAL.csv` and `out/REPORT_SUMMARY.md` section C. No correction in this batch was held back for insufficient evidence — every one currently in CORRECTION_PROPOSED status is ready for review; none are ambiguous.

### A.4 The earlier-24 — recovered and verified this round

Identity recovered via `accepted_candidates.json` (1000) minus `bucket2_remaining.json` (976) = 24, with cached label photos located locally for all 24. **This set-difference alone does NOT establish verification** — a genuine from-scratch two-independent-reader verification (plus manual tie-breaks for 2 disagreements) was performed this round. Result: **20 VERIFIED, 3 CORRECTION_PROPOSED, 1 UNRESOLVED** (barcode 7290011498917 — genuine brand/identity conflict on the label, not corrected). Full ledger: `scripts/food-catalog-import/ledger/the24_reconciled.json`. Kept structurally and numerically separate from the 976-cohort throughout — verified zero barcode overlap.

### A.5 Unresolved and Pending — breakdown, not a black box

**PENDING (564, 976-cohort)** — every record names the exact blocked step, never conflated with "no evidence exists":

| Blocker | Count |
|---|---:|
| WebSearch unavailable (session-capped 200/200); OFF has no nutrition photo at all for this barcode | 509 |
| Dual-blind-read confirmed no nutrition panel in any accessible image (front/lid/ingredients photos only) | 30 |
| Nutrition-photo URL exists but was found illegible even after a genuine second attempt (screening step) | 21 |
| Protein value physically obscured (price-tag, crease, frame cutoff) in the only accessible image; calories partially read | 4 |

**UNRESOLVED (159, 976-cohort)** — evidence was gathered but did not support a determination: illegible second reads needing both values, genuine reader disagreements not resolved even after a manual third read, identity conflicts (barcode mismatch or wrong-product-photo confirmed on the label), and 4 confirmed cases this round where OpenFoodFacts has the **wrong image mapped to the barcode entirely** (a data-quality issue in the source, not a reading failure) — flagged distinctly rather than lumped in with ordinary missing evidence.

Full row-by-row table: `scripts/food-catalog-import/out/UNRESOLVED_PENDING_TABLE.csv`.

### A.6 Import eligibility — positive allowlist, final

`scripts/food-catalog-import/out/IMPORT_ALLOWLIST.json`: **236** entries (976-cohort), `outcome === 'VERIFIED' && twoReaderConfirmed === true` only. `out/IMPORT_NOT_ELIGIBLE.json` gives an explicit per-barcode reason for all other 740, including `ABSENT_FROM_LEDGER` for any theoretical gap (none currently exist — 0 missing). Combined with the earlier-24's 20 VERIFIED (tracked separately, `the24_reconciled.json`): **256 products are currently import-eligible across both new-product cohorts**, zero double-counting, zero overlap with the earlier-20-sample-pass exclusions. **No import has been executed.**

### A.7 Confirmation

- No production SQL has been run this round; SQL batches 050–054 remain OUTDATED/blocked.
- No commit, push, merge, or deploy has occurred.
- No correction has been applied to any table — all 20 (A.3) are proposals only, pending review.
- The existing 504 production-catalog foods were not read, checked, or modified by anything in this round.
- All work saved incrementally to `scripts/food-catalog-import/ledger/` and `out/`; full change history in `ledger/CHANGE_LOG.json`.
- Open items, explicitly not claimed as resolved: the tolerance-methodology question (A.2.8), 564 PENDING items blocked mainly by a capped WebSearch budget and a currently-down OpenFoodFacts image CDN, 159 UNRESOLVED items.

---

## ADDENDUM B (2026-09-24) — confirmed approval defect fixed, counts recalculated

**This is now the authoritative state, superseding Addendum A's counts (which were computed before this fix).**

### B.1 The confirmed defect

Codex's read-only review (files could not be read directly this round due to a macOS folder-permission restriction on `~/Documents/Codex/...` — findings verified independently against live code instead) and the user both flagged barcode **72917589**: both saved readers independently read **6.6g protein**, but `IMPORT_ALLOWLIST.json` exported the original **6.8g** marked VERIFIED. Confirmed directly against the code:

- `reconcileSecondReads.mjs` set `outcome='verified'` the instant two readers agreed with each other, with a comment that the actual comparison to the stored database value would happen "in the master-rebuild step."
- `regenerateMasterAudit.mjs` never actually performed that comparison — it copies the `outcome` field verbatim.
- Net effect: **reader agreement was silently treated as agreement with the stored value.** Wherever a stored-comparison *was* performed (`reconcilePendingDualRead.mjs`), it used an invented tolerance (relative ≤2% OR absolute ≤ min(3, 3%)) — exactly the kind of percentage-fudging the governing instructions prohibit.

### B.2 The fix

New shared module `scripts/food-catalog-import/nutritionReconcile.mjs`:
- `readersAgree()` — a **tight, transcription-noise-only** check (protein diff ≤0.1g, calories diff ≤1kcal), used only to decide whether two readers are transcribing the same printed digits.
- `matchesStored()` — a **strict, rounded-exact** comparison at label-printing precision (whole kcal, 0.1g protein), **no percentage tolerance**. Absorbs genuine floating-point/repeating-decimal artifacts in stored data (e.g. 250/85×100 = 294.117647...) without papering over a real printed discrepancy (6.6 vs 6.8 stays a mismatch).
- `checkApprovalGate()` — blocks VERIFIED/CORRECTION_PROPOSED outright on: an identity conflict, a basis that isn't 100g/100ml and wasn't deterministically converted, an unestablished ("unclear") preparation state, or a missing calories/protein value.

`scripts/food-catalog-import/nutritionReconcile.test.mjs` — 16 regression tests (plain Node, no framework was configured in this project), all passing, pinning the 72917589 scenario explicitly plus every gate. All three reconciler scripts (`reconcileSecondReads.mjs`, `reconcileThe24.mjs`, `reconcilePendingDualRead.mjs`) now use this shared logic. All three also gained a **merge guard**: a batch result can no longer silently overwrite an already-confirmed (`twoReaderConfirmed: true`) record — a repeated real failure mode this session (duplicate/stale agent retries).

### B.3 Recalculation — from existing saved evidence, no new reviews

Every existing VERIFIED/CORRECTION_PROPOSED record across all three sources (976-cohort no-photo + with-photo, and the earlier-24) was recalculated against its **already-saved evidence** with the fixed logic — no new agent dispatches, no re-review of unaffected products. **70 classifications changed** (full list: `ledger/RECALCULATION_CHANGES.json`), **0** in the earlier-24 (it was already computed this session with careful manual identity/basis checks and needed no correction).

| | Before fix | After fix |
|---|---:|---:|
| VERIFIED (976-cohort) | 236 | **169** |
| CORRECTION_PROPOSED | 17 | **67** |
| UNRESOLVED | 159 | **176** |
| PENDING | 564 | 564 (unchanged) |

Most of the 70 changes are VERIFIED→CORRECTION_PROPOSED (a real numeric gap the old tolerance had hidden) or VERIFIED→UNRESOLVED (basis never actually converted from "serving," or preparation state never actually established — both previously ungated). A genuine **pre-existing catalog data bug** surfaced in the process: barcode `7296073205616` (medjool dates) has **stored calories = 0.267** — almost certainly a 1000× decimal-shift error in the original data (evidence reads 267kcal, a normal value for dried dates); flagged distinctly, not folded into an ordinary correction.

### B.4 Updated final counts (this addendum supersedes Addendum A's)

| Cohort | Total | VERIFIED | CORRECTION_PROPOSED | UNRESOLVED | PENDING | Import-eligible |
|---|---:|---:|---:|---:|---:|---:|
| 976-cohort | 976 | **169** | **67** | **176** | 564 | **169** |
| Earlier-24 | 24 | 20 | 3 | 1 | 0 | 20 |
| **Combined** | **1000** | **189** | **70** | **177** | **564** | **189** |

### B.5 Remaining blockers, current

- **WebSearch**: still hard-capped (200/200), confirmed this session — has not recovered.
- **OpenFoodFacts image CDN** (`images.openfoodfacts.org`): confirmed still down as of this addendum (connection refused; the separate API host is unaffected). **37** PENDING records are specifically blocked by this (not by lack of evidence or the WebSearch cap) — will be retried when the host is reachable again, not repeatedly hammered in the meantime.
- Two of the 64-item "pending-with-photo" worklist's three chunks are reconciled (0 new VERIFIED — evidence was too sparse); the third chunk (21 items) is blocked entirely by the CDN outage above.

### B.6 Confirmation

No production SQL, commit, push, merge, or deploy occurred. No correction was applied to any table. The existing 504 production foods were not read, checked, or modified.
