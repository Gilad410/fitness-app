// Builds the consolidated final audit deliverable (point 10 of the governing
// instructions): a summary table, a complete per-product table, a corrections
// table, and an unresolved/pending table -- as both Markdown and UTF-8 CSV,
// covering the 976-cohort and the separate earlier-24 cohort, WITHOUT
// touching the existing 504-item production catalog in any way.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const rd = (p) => JSON.parse(readFileSync(path.join(here, p), 'utf8'))

const bucket2 = rd('out/bucket2_remaining.json')
const bucketArr = Array.isArray(bucket2) ? bucket2 : (bucket2.items || Object.values(bucket2))

const withPhotoArr = rd('ledger/reconciled_with_photo.json')
const withPhotoByBarcode = new Map((Array.isArray(withPhotoArr) ? withPhotoArr : Object.values(withPhotoArr)).map(r => [r.barcode, r]))

const noPhoto = rd('ledger/search_results.json') // keyed by barcode

const the24Worklist = rd('ledger/the24_worklist.json')
const the24Reconciled = rd('ledger/the24_reconciled.json')
const the24ReconciledByBarcode = new Map((Array.isArray(the24Reconciled) ? the24Reconciled : Object.values(the24Reconciled)).map(r => [r.barcode, r]))

function csvEscape(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}
// Force barcodes to be treated as text in Excel/Sheets, preserving leading zeros
function csvBarcode(bc) {
  return '="' + String(bc) + '"'
}

const rows = [] // complete product table rows

// --- 976 cohort ---
for (const item of bucketArr) {
  const bc = item.barcode
  const wp = withPhotoByBarcode.get(bc)
  const np = noPhoto[bc]
  let row
  if (wp) {
    const firstDone = !!wp.reader1
    const secondDone = !!wp.reader2
    row = {
      cohort: '976',
      barcode: bc,
      name: wp.name || item.name,
      brand: item.brand || '',
      storedCalories: wp.storedCalories ?? item.calories,
      storedProtein: wp.storedProtein ?? item.protein,
      storedBasis: '100g',
      evidenceCalories: wp.reader2?.evidenceCalories ?? wp.reader1?.evidenceCalories ?? '',
      evidenceProtein: wp.reader2?.evidenceProtein ?? wp.reader1?.evidenceProtein ?? '',
      evidenceBasis: wp.reader2?.basis || '',
      prepState: wp.reader2?.prepState || wp.reader1?.prepState || 'unclear',
      conversion: '',
      outcome: (wp.finalOutcome || 'PENDING').toUpperCase(),
      firstReadingComplete: firstDone,
      secondReadingComplete: secondDone,
      evidenceLinks: '',
      explanation: wp.justification || '',
      track: 'with_photo',
    }
  } else if (np) {
    const firstDone = !!np._firstRead || !!np.evidenceCalories || np.outcome !== 'pending'
    const secondDone = !!np.secondRead
    row = {
      cohort: '976',
      barcode: bc,
      name: item.name,
      brand: item.brand || '',
      storedCalories: item.calories,
      storedProtein: item.protein,
      storedBasis: '100g',
      evidenceCalories: np.evidenceCalories,
      evidenceProtein: np.evidenceProtein,
      evidenceBasis: np.basis || '',
      prepState: np.prepState || 'unclear',
      conversion: /deterministic|conversion|scal/i.test(np.notes || '') ? 'yes -- see explanation' : '',
      outcome: (np.outcome || 'pending').toUpperCase(),
      firstReadingComplete: firstDone,
      secondReadingComplete: secondDone,
      evidenceLinks: np.sourceUrl || '',
      explanation: np.notes || '',
      track: 'no_photo',
    }
  } else {
    row = {
      cohort: '976', barcode: bc, name: item.name, brand: item.brand || '',
      storedCalories: item.calories, storedProtein: item.protein, storedBasis: '100g',
      evidenceCalories: '', evidenceProtein: '', evidenceBasis: '', prepState: '',
      conversion: '', outcome: 'PENDING', firstReadingComplete: false, secondReadingComplete: false,
      evidenceLinks: '', explanation: 'ABSENT from both with_photo and no_photo ledgers -- structural gap, unreviewed', track: 'UNKNOWN',
    }
  }
  row.importEligible = row.outcome === 'VERIFIED' && row.firstReadingComplete && row.secondReadingComplete
  rows.push(row)
}

// --- earlier-24 cohort (kept fully separate) ---
for (const item of the24Worklist) {
  const bc = item.barcode
  const rec = the24ReconciledByBarcode.get(bc)
  const row = {
    cohort: 'earlier_24',
    barcode: bc,
    name: item.name,
    brand: item.brand || '',
    storedCalories: item.storedCalories,
    storedProtein: item.storedProtein,
    storedBasis: '100g',
    // Prefer the manually-resolved proposed* values when present (set when a
    // tie-break determined one reader was actually wrong, e.g. a column-
    // selection error) -- falling back to raw reader2/reader1 only when no
    // resolved value exists. Using a raw reader field unconditionally here
    // was a real bug: it could silently re-surface a reader's column-
    // selection error instead of the tie-break's corrected reading.
    evidenceCalories: rec?.proposedCalories ?? rec?.reader2?.evidenceCalories ?? rec?.reader1?.evidenceCalories ?? '',
    evidenceProtein: rec?.proposedProtein ?? rec?.reader2?.evidenceProtein ?? rec?.reader1?.evidenceProtein ?? '',
    evidenceBasis: rec?.reader2?.basis || rec?.reader1?.basis || '',
    prepState: rec?.reader2?.prepState || rec?.reader1?.prepState || 'unclear',
    conversion: '',
    outcome: (rec?.finalOutcome || 'PENDING').toUpperCase(),
    firstReadingComplete: !!rec?.reader1,
    secondReadingComplete: !!rec?.reader2,
    evidenceLinks: item.imagePath || '',
    explanation: rec?.justification || 'Not yet recovered/reviewed',
    track: 'earlier_24_recovered',
  }
  row.importEligible = row.outcome === 'VERIFIED' && row.firstReadingComplete && row.secondReadingComplete
  rows.push(row)
}

// ===== A. SUMMARY TABLE =====
function summarize(cohortRows) {
  const c = { total: cohortRows.length, VERIFIED: 0, CORRECTION_PROPOSED: 0, UNRESOLVED: 0, PENDING: 0, eligible: 0 }
  for (const r of cohortRows) {
    c[r.outcome] = (c[r.outcome] || 0) + 1
    if (r.importEligible) c.eligible++
  }
  return c
}
const cohort976Rows = rows.filter(r => r.cohort === '976')
const cohort24Rows = rows.filter(r => r.cohort === 'earlier_24')
const s976 = summarize(cohort976Rows)
const s24 = summarize(cohort24Rows)

const summaryMd = `## A. טבלת סיכום (Summary Table)

קבוצה (Cohort) | סה"כ (Total) | מאומת (Verified) | תיקון מוצע (Correction Proposed) | לא נפתר (Unresolved) | ממתין (Pending) | כשיר לייבוא (Eligible for import)
---|---|---|---|---|---|---
976 מועמדים חדשים (976-cohort) | ${s976.total} | ${s976.VERIFIED || 0} | ${s976.CORRECTION_PROPOSED || 0} | ${s976.UNRESOLVED || 0} | ${s976.PENDING || 0} | ${s976.eligible}
24 המועמדים המוקדמים (earlier-24) | ${s24.total} | ${s24.VERIFIED || 0} | ${s24.CORRECTION_PROPOSED || 0} | ${s24.UNRESOLVED || 0} | ${s24.PENDING || 0} | ${s24.eligible}
**סה"כ מועמדים חדשים (both new-product cohorts)** | **${s976.total + s24.total}** | **${(s976.VERIFIED||0)+(s24.VERIFIED||0)}** | **${(s976.CORRECTION_PROPOSED||0)+(s24.CORRECTION_PROPOSED||0)}** | **${(s976.UNRESOLVED||0)+(s24.UNRESOLVED||0)}** | **${(s976.PENDING||0)+(s24.PENDING||0)}** | **${s976.eligible + s24.eligible}**

**הערה:** 504 המוצרים הקיימים כבר בקטלוג הפרודקשן **אינם** בהיקף ביקורת זו ולא נבדקו, לא שונו ולא יובאו מחדש. הספירות לעיל מתייחסות אך ורק למועמדים החדשים משתי הקבוצות הנפרדות.
(The existing 504 production-catalog items are OUT OF SCOPE of this audit -- not reviewed, not modified, not reimported. Counts above cover only the two new-product cohorts.)
`

// ===== B. COMPLETE PRODUCT TABLE (CSV) =====
const csvHeaders = ['Cohort','Barcode','Name','Brand','StoredCalories','StoredProtein','StoredBasis','EvidenceCalories','EvidenceProtein','EvidenceBasis','PrepState','Conversion','Outcome','FirstReadingComplete','SecondReadingComplete','EvidenceLinks','Explanation','ImportEligible']
const csvLines = [csvHeaders.join(',')]
for (const r of rows) {
  csvLines.push([
    csvEscape(r.cohort), csvBarcode(r.barcode), csvEscape(r.name), csvEscape(r.brand),
    csvEscape(r.storedCalories), csvEscape(r.storedProtein), csvEscape(r.storedBasis),
    csvEscape(r.evidenceCalories), csvEscape(r.evidenceProtein), csvEscape(r.evidenceBasis),
    csvEscape(r.prepState), csvEscape(r.conversion), csvEscape(r.outcome),
    csvEscape(r.firstReadingComplete), csvEscape(r.secondReadingComplete),
    csvEscape(r.evidenceLinks), csvEscape(r.explanation), csvEscape(r.importEligible),
  ].join(','))
}
writeFileSync(path.join(here, 'out/FINAL_PRODUCT_TABLE.csv'), '﻿' + csvLines.join('\n'))

// ===== C. CORRECTION TABLE =====
const corrections = rows.filter(r => r.outcome === 'CORRECTION_PROPOSED')
const corrCsv = ['Cohort,Barcode,Name,OriginalCalories,OriginalProtein,ProposedCalories,ProposedProtein,Basis,Evidence,Reason,ReviewReadiness']
for (const r of corrections) {
  corrCsv.push([
    csvEscape(r.cohort), csvBarcode(r.barcode), csvEscape(r.name),
    csvEscape(r.storedCalories), csvEscape(r.storedProtein),
    csvEscape(r.evidenceCalories), csvEscape(r.evidenceProtein),
    csvEscape(r.evidenceBasis), csvEscape(r.evidenceLinks), csvEscape(r.explanation),
    csvEscape(r.secondReadingComplete ? 'Fully supported -- two-reader-confirmed' : 'Needs more evidence -- single reading only'),
  ].join(','))
}
writeFileSync(path.join(here, 'out/CORRECTION_TABLE_FINAL.csv'), '﻿' + corrCsv.join('\n'))

const corrMd = `## C. טבלת תיקונים מוצעים (Correction Table) -- ${corrections.length} מוצרים

ברקוד | שם | ערכים מקוריים | ערכים מוצעים | בסיס | מוכן לסקירה
---|---|---|---|---|---
${corrections.map(r => `${r.barcode} | ${r.name} | ${r.storedCalories}kcal/${r.storedProtein}g | ${r.evidenceCalories}kcal/${r.evidenceProtein}g | ${r.evidenceBasis} | ${r.secondReadingComplete ? '✅ שתי קריאות עצמאיות' : '⚠️ קריאה יחידה'}`).join('\n')}

כל התיקונים לעיל **מוצעים בלבד** -- טרם אושרו ולא הוחלו על שום קטלוג. נדרש אישור ידני.
(All corrections above are PROPOSALS ONLY -- none applied, none approved. Manual review required.)
`

// ===== D. UNRESOLVED / PENDING TABLE =====
const unresolvedPending = rows.filter(r => r.outcome === 'UNRESOLVED' || r.outcome === 'PENDING')
const upCsv = ['Cohort,Barcode,Name,Status,EvidenceGapOrBlocker,SourcesAttempted,NextStep']
for (const r of unresolvedPending) {
  const blocker = r.outcome === 'PENDING'
    ? (r.evidenceLinks ? 'Second reading not yet performed / step blocked' : 'No accessible evidence source found yet')
    : (r.explanation || 'Evidence gathered but inconclusive')
  upCsv.push([
    csvEscape(r.cohort), csvBarcode(r.barcode), csvEscape(r.name), csvEscape(r.outcome),
    csvEscape(blocker), csvEscape(r.evidenceLinks), csvEscape(r.outcome === 'PENDING' ? 'Attempt WebFetch-based evidence gathering (no photo) or dispatch second reading (has photo, first read done)' : 'Seek higher-resolution image or manufacturer page; re-examine if new evidence surfaces'),
  ].join(','))
}
writeFileSync(path.join(here, 'out/UNRESOLVED_PENDING_TABLE.csv'), '﻿' + upCsv.join('\n'))

writeFileSync(path.join(here, 'out/REPORT_SUMMARY.md'), summaryMd + '\n' + corrMd)

console.log('=== SUMMARY ===')
console.log('976-cohort:', s976)
console.log('earlier-24:', s24)
console.log('Total corrections:', corrections.length)
console.log('Total unresolved+pending:', unresolvedPending.length)
console.log('Wrote: out/FINAL_PRODUCT_TABLE.csv, out/CORRECTION_TABLE_FINAL.csv, out/UNRESOLVED_PENDING_TABLE.csv, out/REPORT_SUMMARY.md')
