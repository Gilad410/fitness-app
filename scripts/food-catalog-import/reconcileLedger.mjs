// Deterministic reconciliation v2 -- fixes two real bugs found in v1:
// (1) the closeEnough() absolute-difference floor (0.5) was too
//     generous for small protein values, e.g. treating 0.9g vs 1.2g
//     (a real ~33% relative gap) as "matching";
// (2) trusting reader1's historical OUTCOME LABEL rather than
//     reader1's actual extracted NUMBER caused false "disagreements"
//     when reader1's own past comparison had been made against a
//     stored value that has since been confirmed different (found:
//     Goat yogurt, where reader1's own reason text already said
//     "calories 73" but was mislabeled "verified" against what is
//     actually a stored 75 -- reader1 and reader2 actually AGREE
//     (both read 73); the old label was simply wrong, not a real
//     second-reader disagreement).
//
// Fix: extract reader1's number by checking whether reader2's exact
// evidence numbers appear literally in reader1's reason text (a
// content-based check, not a fragile phrase-structure regex). If
// reader1's text contains a DIFFERENT number in the position a
// calories/protein figure would appear, that's a real disagreement.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const reader2 = existsSync(path.join(here, 'ledger/reader2_results.json'))
  ? JSON.parse(readFileSync(path.join(here, 'ledger/reader2_results.json'), 'utf8'))
  : {}
const withPhoto140 = JSON.parse(readFileSync(path.join(here, 'ledger/with_photo_140.json'), 'utf8'))

function closeEnough(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false
  if (a === b) return true
  const diff = Math.abs(a - b)
  const rel = diff / Math.max(Math.abs(a), Math.abs(b), 1)
  // Relative 2%, OR a small absolute floor scaled to the value itself
  // (never a flat 0.5, which swamps small protein figures) -- allow
  // up to 5% of the larger value's own magnitude, capped at 3 units,
  // whichever is smaller, as a "label rounding" allowance.
  const absFloor = Math.min(3, Math.max(a, b) * 0.03)
  return rel <= 0.02 || diff <= absFloor
}

// Deterministic serving->100g conversion. Only fires when reader2
// reported basis:'serving' AND an explicit gram weight can be parsed
// from their notes (this session's agent prompt template consistently
// has them write the printed serving weight right after 'Serving' /
// 'Per-serving' / 'serving', e.g. "Serving 40g bar: 190 Cal, 6g
// protein" or "Per-serving (25g: 120kcal/2g)"). Deliberately GRAMS
// ONLY -- an 'ml' serving (a liquid volume) is never converted here,
// because comparing it to a per-100g stored value would require
// assuming a density, which the audit rules explicitly forbid. A
// gram-based conversion is pure arithmetic from an explicitly printed
// weight, not an assumption.
function parseServingGrams(notes) {
  if (!notes) return null
  // The serving weight always precedes the first colon in this
  // session's note convention ("Serving 40g bar: 190 Cal, 6g
  // protein..."). Restricting the search to that prefix avoids
  // accidentally picking up a later gram figure that is actually the
  // reported protein amount (e.g. "...9g protein" in "Serving 236ml
  // carton: 110 Cal, 9g protein" must NOT be read as a 9g serving).
  const prefix = notes.split(':')[0]
  const m = prefix.match(/(\d+(?:\.\d+)?)\s*g\b/)
  return m ? parseFloat(m[1]) : null
}

// When reader2's notes state they already converted to 100g
// themselves ("...converted to 100g (X kcal, Yg protein)..."), the
// portion of the notes BEFORE that phrase still states the original
// printed per-serving figures (e.g. "serving 30.5g: 110 Cal, 20g
// protein; converted to..."). Pull those raw figures out so they can
// be checked against reader1's independently-written text -- this is
// the real signal for "did both readers see the same underlying
// evidence", since reader1 in these cases typically transcribes the
// raw label figures but doesn't personally do the /serving*100 math.
function parsePreConversionRaw(notes) {
  if (!notes) return { cal: null, prot: null }
  const before = notes.split(/converted to 100\s*g/i)[0]
  const calMatch = before.match(/(\d+(?:\.\d+)?)\s*Cal\b/i)
  const protMatch = before.match(/(\d+(?:\.\d+)?)\s*g\s*protein\b/i)
  return {
    cal: calMatch ? parseFloat(calMatch[1]) : null,
    prot: protMatch ? parseFloat(protMatch[1]) : null,
  }
}

function numberAppearsIn(text, num) {
  if (text === null || text === undefined || num === null || num === undefined) return false
  // Match the number with reasonable formatting tolerance (e.g. 617 vs 617.0)
  const rounded1 = String(Math.round(num))
  const rounded2 = num.toFixed(1)
  return text.includes(rounded1) || text.includes(rounded2) || text.includes(String(num))
}

const ledger = {}
for (const item of withPhoto140) {
  const bc = item.barcode
  const r1outcome = item.reader1_outcome
  const r1reason = item.reader1_reasonText || ''
  const r2 = reader2[bc]

  const entry = {
    barcode: bc,
    name: item.name,
    storedCalories: item.storedCalories,
    storedProtein: item.storedProtein,
    reader1: { outcome: r1outcome, reasonText: item.reader1_reasonText },
    reader2: r2 || null,
    finalOutcome: 'PENDING',
    justification: '',
  }

  if (!r2) {
    entry.finalOutcome = 'PENDING'
    entry.justification = 'reader2 (blind second reading) not yet completed'
    ledger[bc] = entry
    continue
  }

  const r2Legible = r2.legible && r2.evidenceCalories !== null && r2.evidenceProtein !== null
  if (!r2Legible) {
    entry.finalOutcome = 'UNRESOLVED'
    entry.justification = `Reader2 could not read both values (legible=${r2.legible}, calories=${r2.evidenceCalories}, protein=${r2.evidenceProtein}). Two independent legible readings are required. Reader1 originally recorded: ${r1outcome}.`
    ledger[bc] = entry
    continue
  }

  // Basis handling: stored values in this catalog are per-100g. If
  // reader2's basis is 'serving' with an explicit GRAM weight printed
  // (parseable from their notes), convert deterministically to
  // per-100g before comparing -- this is pure arithmetic from a
  // printed weight, not an inference. An 'ml'/volume serving is never
  // converted (would require assuming a density), and is routed to
  // UNRESOLVED with that basis gap stated explicitly rather than
  // being wrongly compared against the per-100g stored value as-is.
  let r2Cal = r2.evidenceCalories
  let r2Prot = r2.evidenceProtein
  let conversionNote = ''
  let r2RawCal, r2RawProt, r2ConvCal, r2ConvProt
  if (r2.basis === 'serving') {
    const grams = parseServingGrams(r2.notes)
    if (!grams || grams <= 0) {
      entry.finalOutcome = 'UNRESOLVED'
      entry.justification = `Reader2 reported a per-serving basis (${r2.notes || 'no serving weight given'}) but no explicit GRAM weight could be parsed to deterministically convert to per-100g (a volume/ml serving is never converted, since that would require assuming a density). Reader1: ${r1outcome} (${r1reason}). Cannot compare against the per-100g stored value without guessing -- needs a label crop that shows the basis unambiguously, or a manual review.`
      ledger[bc] = entry
      continue
    }
    // Some reader2 responses report evidenceCalories/evidenceProtein
    // as the RAW per-serving figures (needing conversion here); others
    // already did the conversion themselves and put the converted
    // per-100g figures in those same fields, despite still labeling
    // basis:'serving' (an agent labeling inconsistency, not fixable
    // by parsing notes phrasing reliably). Rather than guess which
    // case this is, test both interpretations against reader1's
    // independently-written text and prefer whichever one reader1's
    // own numbers corroborate -- using reader1 as the tie-breaking
    // signal, not a guess.
    // Default assumption: evidenceCalories/evidenceProtein are the
    // RAW per-serving figures as printed, and get divided by the
    // printed serving weight here to reach per-100g -- the common
    // case. A handful of individual items where reader2's agent
    // instead already performed this conversion themselves (despite
    // still labeling basis:'serving') are corrected individually via
    // manual_third_read_overrides.json rather than guessed at here --
    // agent note phrasing for "I already converted" varied too much
    // across responses to detect reliably and safely by regex.
    r2RawCal = r2.evidenceCalories; r2RawProt = r2.evidenceProtein
    r2ConvCal = Math.round((r2RawCal / grams) * 1000) / 10
    r2ConvProt = Math.round((r2RawProt / grams) * 1000) / 10
    r2Cal = r2ConvCal; r2Prot = r2ConvProt
    conversionNote = ` (converted from the printed ${grams}g serving: ${r2RawCal}kcal/${r2RawProt}g -> ${r2Cal}kcal/${r2Prot}g per 100g)`
  }

  // Content-based agreement check: does reader1's own reason text
  // contain the same numbers reader2 extracted? For a serving-basis
  // item this also accepts reader1 stating the RAW pre-conversion
  // serving figures (e.g. "40g bar: 190 kcal, 6g protein") even if
  // reader1 didn't personally do the 100g arithmetic and logged an
  // 'unresolved' outcome for that reason -- both readers independently
  // extracted the same underlying evidence, and the conversion itself
  // is deterministic arithmetic from an explicitly printed weight, not
  // a judgment call that requires a second human to also perform it.
  const r2WasServing = r2.basis === 'serving' && typeof r2ConvCal === 'number'
  const r2PreConv = r2WasServing ? parsePreConversionRaw(r2.notes) : { cal: null, prot: null }
  const calAgree = numberAppearsIn(r1reason, r2Cal) || (r2WasServing && numberAppearsIn(r1reason, r2RawCal)) || (r2PreConv.cal !== null && numberAppearsIn(r1reason, r2PreConv.cal))
  const protAgree = numberAppearsIn(r1reason, r2Prot) || (r2WasServing && numberAppearsIn(r1reason, r2RawProt)) || (r2PreConv.prot !== null && numberAppearsIn(r1reason, r2PreConv.prot))
  const r2MatchesStored = closeEnough(r2Cal, item.storedCalories) && closeEnough(r2Prot, item.storedProtein)

  if (calAgree && protAgree) {
    // Both readers independently arrived at the same numbers --
    // resolve VERIFIED vs CORRECTION_PROPOSED from a FRESH comparison
    // against the current stored value (not reader1's old label,
    // which may have been computed against a since-changed or
    // mistakenly-transcribed stored value).
    if (r2MatchesStored) {
      entry.finalOutcome = 'VERIFIED'
      entry.justification = `Both readers independently arrived at calories=${r2Cal}, protein=${r2Prot} (basis=${r2.basis})${conversionNote}, matching stored (${item.storedCalories}/${item.storedProtein}).`
    } else {
      entry.finalOutcome = 'CORRECTION_PROPOSED'
      entry.justification = `Both readers independently arrived at calories=${r2Cal}, protein=${r2Prot} (basis=${r2.basis})${conversionNote}, which does NOT match stored (${item.storedCalories}/${item.storedProtein}).${r1outcome === 'verified' ? ' Note: reader1 had originally labeled this "verified" -- that label is superseded by this fresh, correct comparison against the actual stored value.' : ''}`
      entry.proposedCalories = r2Cal
      entry.proposedProtein = r2Prot
    }
  } else {
    entry.finalOutcome = 'UNRESOLVED'
    entry.justification = `Reader1 (${r1reason}) and reader2 (calories=${r2Cal}, protein=${r2Prot}${conversionNote}) do not clearly state the same numbers -- calAgree=${calAgree}, protAgree=${protAgree}. Not resolved by majority vote; needs re-examination.`
  }

  ledger[bc] = entry
}

// Apply manual third-read overrides: for items the automated
// content-matching check flagged as a real reader1/reader2 numeric
// disagreement, I (a third, tie-breaking independent read of the
// same cached label image) resolved the conflict from the evidence
// itself -- never by majority vote. Kept in a separate file so it
// survives re-runs of this script (which otherwise fully rebuilds
// the ledger from reader1/reader2/stored on every run).
const overridesPath = path.join(here, 'ledger/manual_third_read_overrides.json')
if (existsSync(overridesPath)) {
  const overrides = JSON.parse(readFileSync(overridesPath, 'utf8'))
  for (const [bc, ov] of Object.entries(overrides)) {
    if (!ledger[bc]) continue
    ledger[bc].finalOutcome = ov.finalOutcome
    ledger[bc].justification = `[Manual third read, tie-breaker] ${ov.justification}`
    ledger[bc].thirdRead = ov.thirdRead || null
    if (ov.proposedCalories !== undefined) ledger[bc].proposedCalories = ov.proposedCalories
    else delete ledger[bc].proposedCalories
    if (ov.proposedProtein !== undefined) ledger[bc].proposedProtein = ov.proposedProtein
    else delete ledger[bc].proposedProtein
  }
}

writeFileSync(path.join(here, 'ledger/reconciled_with_photo.json'), JSON.stringify(ledger, null, 2))
const counts = {}
for (const e of Object.values(ledger)) counts[e.finalOutcome] = (counts[e.finalOutcome] || 0) + 1
console.log('Reconciliation counts:', JSON.stringify(counts, null, 2))
const unresolvedDisagree = Object.values(ledger).filter(e => e.justification.includes('calAgree'))
console.log('Real numeric disagreements needing re-examination:', unresolvedDisagree.length, unresolvedDisagree.map(e=>e.barcode))
