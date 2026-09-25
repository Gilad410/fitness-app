# Open Food Facts (Israel) Import — Full 976-Product Audit (67.8% fetched, 53.5% reviewed)

**No database write has happened. Nothing committed, pushed, merged,
or deployed. All previously-generated SQL batches remain marked
OUTDATED and blocked from execution.**

## Status: major sustained progress this session, not yet complete

Used parallel review agents throughout (5 dispatched across 2 rounds,
each independently reviewing a disjoint batch of already-downloaded
photos — no network/rate-limit involvement, since Phase A fetch stays
one sequential process respecting the source's rate limit). One agent
did real, valuable extra-scrutiny work on a flagged implausible value
("Lowfat Milk" at 380 kcal/100g) and confirmed it as a genuine data
error, not just illegible evidence.

**FETCHED vs REVIEWED, exactly distinguished, every time:**

| | Count | % of 976 |
|---|---|---|
| **FETCHED** (Phase A — network call made) | 662 | 67.8% |
| **REVIEWED** (any recorded outcome) | 522 | 53.5% |
| — no photo evidence exists at all (mechanical UNRESOLVED) | 391 | |
| — personally/agent visually reviewed | 131 | |
| Not yet fetched | 314 | 32.2% |
| Fetched with photo, review pending right now | 0 | |

### The 131 visually-reviewed break down as:

| Outcome | Count |
|---|---|
| VERIFIED | 60 |
| CORRECTION PROPOSED | 22 |
| UNRESOLVED (photo existed, not fully legible/comparable) | 49 |
| **Total** | **131** |

**Total blocked from import right now: 481** (20 from the earlier
100-item sample pass + 461 from this full-audit pass: 391 no-evidence
+ 70 correction/unresolved from the visually-reviewed set), tracked
programmatically in `blocked_from_import.json`.

## 1. All 22 CORRECTION PROPOSED items this pass (cumulative, barcode-level)

| Barcode | Name | Stored | Finding |
|---|---|---|---|
| 8715700419732 | מתבל עגבניות | 102/1.2 | Protein 0.9g on label (~33% off) |
| 7290000416021 | קרם מובחר למריחה | 504/3.6 | Stored protein matches the 25g column, not 100g (14.2) |
| 7290000063140 | Osem Soup Cereals | 510/9 | Label: 522/9.2 (~2.2-2.3%) |
| 7290003075102 | לבנה טמרה | 155/12 | Label protein: 6g — ~2x mismatch |
| 7290106663183 | צ'יטוס Crunchy | 538/5.4 | Label: 550 kcal (~2.2%) |
| 7290100700396 | Classic Jasmin Rice | 333/7.2 | Label ~350 kcal (~5%, moderate confidence) |
| 7290000416045 | קרם שוקולד למריחה | 504/3.6 | Same 25g-vs-100g defect as above |
| 8690777206051 | Roasted Eggplant | 34/1 | Label protein: 0g vs 1g stored |
| 7290107879521 | לה פרוטה תות שדה | 106.67/0 | Label 100g: 102 kcal; no protein row at all |
| 7290119370955 | יוגורט וניל עוגיות | 56/10 | Label 100g: 112/20 — stored matches the serving column |
| 7290003078066 | Minced Garlic | 322/3.8 | Label: 332 kcal (~3%) |
| 7290016877021 | לחם הרים שחום ורך | 72/2.8 | Label 100g: 179/1.8 — matches neither column |
| 7290019816331 | Crunch caramel waffle | 317.2/3.55 | Protein 3.6 vs 3.5 rounded — small real gap |
| 72918388 | טוויסט | 480/4.7 | Protein 9g on label vs 4.7g — ~2x |
| 7394376616778 | Oat milk | 61/1.1 | Label: 59 kcal (~3.3%) / 1.0g (~9%) |
| 7290006337993 | Beef dumplings | 214/10.4 | Label: 294 kcal — ~37% mismatch |
| 0856591000062 | עוגיוצ מזרחי | 452/10.7 | Per-serving-only label scales to 480/8, not matching |
| 7290002026440 | Hot Pretzel | 300/7.5 | Label: 280 kcal (~7%) |
| 0075442100229 | Puffed rice | 55/0 | Stored value matches the 10g-serving figure, not 100g |
| 0026400298960 | Lowfat Milk | 380/8.2 | Label confirms ordinary liquid milk — 380 kcal/100g is implausible and wrong |
| 04725600 | גבינה סקנדינבית | 373/23.5 | Protein exact; label calories ~395, not 373 |
| 5902670052028 | פרוסות לטוסט | 290/12.8 | Calories exact; protein 7.8g on label vs 12.8g stored |

**Two real, recurring defect classes now well-established across
multiple independent products**: (1) stored protein matching a
smaller-serving label column instead of the 100g column (5+ instances:
spread creams, יוגורט וניל עוגיות, טוויסט, etc.), and (2) US-style
products with per-serving-only labels and no printed 100g figure at
all, where the pipeline's stored "100g" value cannot be verified from
the label as printed (several Kirkland/Trader-Joe's-style US barcodes
that entered the Israel-tagged pool).

## 2. Full detail
- `scripts/food-catalog-import/out/audit_outcomes.json` — all 131
  visually-reviewed products.
- `scripts/food-catalog-import/out/audit_phase_a.json` — all 662
  fetched records including the 391 mechanical no-evidence ones.
- `scripts/food-catalog-import/out/blocked_from_import.json` — full
  current blocklist (481 barcodes), regenerated programmatically.

## 3. The earlier 24 verified products — kept separate, unaffected

## 4. What's next
314 of 976 not yet fetched. Phase A fetch continues in the background.
Work continues using parallel review agents for photo batches as they
accumulate.

**No SQL run, no commit, no merge, no deploy. No corrections applied —
only proposed and blocked, pending your review.**
