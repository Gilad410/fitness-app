// Pure validation for public.food_reference_catalog seed data (SQL migration
// files under supabase/sql/) -- no Supabase/DOM import, so it can run
// directly under plain Node (see foodCatalogValidation.test.mjs) the same
// way every other pure nutrition module in this feature does.
//
// Two responsibilities:
//   1. parseCatalogValues() -- extract (name, calories, protein, category,
//      basis) tuples out of a migration file's raw SQL text, tolerant of
//      the handful of literal-tuple shapes actually used across
//      004-008/039/040 (2, 3, 4 or 6 columns; trailing inline comments;
//      Hebrew text with escaped '' apostrophes).
//   2. validateCatalogRows() -- the actual uniqueness/nutrition-field
//      checks a coach- or trainee-facing catalog needs to hold before it's
//      safe to apply: no duplicate name (case-insensitive, matching the
//      DB's own `lower(name)` unique index), calories/protein present as
//      finite non-negative numbers, category/basis (when present) drawn
//      from the same enum the 039 migration's CHECK constraints enforce.

export const CATEGORIES = new Set([
  'fruit', 'vegetable', 'grain_carb', 'bread_bakery', 'meat_poultry',
  'fish_seafood', 'egg', 'dairy', 'plant_milk', 'legume', 'nuts_seeds_fats',
  'sweets_snacks', 'sauce_condiment', 'spice_herb', 'beverage',
  'prepared_dish', 'soup_salad', 'sandwich', 'supplement',
])

export const BASIS_VALUES = new Set([
  'raw', 'cooked', 'grilled', 'roasted', 'fried', 'boiled', 'baked',
  'steamed', 'dried', 'canned_drained', 'as_sold',
])

function unescapeSql(s) {
  return s.replace(/''/g, "'").trim()
}

// Splits a captured `, col2, col3, ...` remainder into individual field
// strings, respecting quoted commas (a source_name column can itself
// contain a comma).
function splitFields(rest) {
  const fields = []
  let inStr = false
  let current = ''
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i]
    if (c === "'" && rest[i + 1] === "'" && inStr) {
      current += "''"
      i++
      continue
    }
    if (c === "'") {
      inStr = !inStr
      current += c
      continue
    }
    if (!inStr && c === ',') {
      fields.push(current.trim())
      current = ''
      continue
    }
    current += c
  }
  if (current.trim() !== '') fields.push(current.trim())
  return fields.filter((f) => f !== '')
}

function parseField(raw) {
  const trimmed = raw.trim()
  if (trimmed.startsWith("'")) {
    return unescapeSql(trimmed.slice(1, -1))
  }
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : trimmed
}

// Finds every top-level `(...)` tuple in the text whose first field is a
// quoted string -- i.e. every `('name', ...)` literal tuple, the shape
// every insert/backfill in 004-008/039/040 uses -- balanced-paren aware,
// so a later field containing its own literal parens (e.g. a source_name
// like "USDA FoodData Central (SR Legacy / Foundation Foods)") doesn't
// truncate the match the way a single non-nesting regex would. Explicitly
// does NOT match a bare `lower('name')` inside a WHERE clause: that is a
// one-field call, not a `('name', ...)` tuple with a following comma.
function findTuples(sqlText) {
  const tuples = []
  let i = 0
  const n = sqlText.length
  while (i < n) {
    if (sqlText[i] !== '(') {
      i++
      continue
    }
    // Peek past whitespace for a quote -- otherwise this '(' isn't the
    // start of a `('name', ...)` tuple (e.g. it's `lower(name)`).
    let j = i + 1
    while (j < n && /\s/.test(sqlText[j])) j++
    if (sqlText[j] !== "'") {
      i++
      continue
    }
    // Scan for the matching close paren, tracking string state so a
    // paren or comma inside a quoted field is never mistaken for
    // structure.
    let depth = 1
    let k = i + 1
    let inStr = false
    while (k < n && depth > 0) {
      const c = sqlText[k]
      if (c === "'") {
        if (inStr && sqlText[k + 1] === "'") {
          k += 2
          continue
        }
        inStr = !inStr
        k++
        continue
      }
      if (!inStr) {
        if (c === '(') depth++
        else if (c === ')') depth--
      }
      k++
    }
    if (depth === 0) {
      tuples.push(sqlText.slice(i + 1, k - 1))
      i = k
    } else {
      i++
    }
  }
  return tuples
}

// Extracts every literal `('name', ...)` tuple from a chunk of SQL text
// (a single migration file's content, or just its `values (...)` block).
// Returns { name, calories, protein, category, basis, fields } rows --
// `fields` is every column after the name, in order, for callers that
// need a shape this function doesn't know about ahead of time (039's
// backfill tuples are (name, category, basis, source_name); 040's insert
// tuples are (name, calories, protein, category, basis, source_name)). A
// bare one-field `lower('name')` (as used in every 007/008 UPDATE ...
// WHERE clause) is never matched -- it has no following comma, so it
// isn't a tuple with a "rest" to parse. Requires at least one field after
// the name (a WHERE/lower() call with nothing else never matches).
export function parseCatalogValues(sqlText) {
  const rows = []
  for (const inner of findTuples(sqlText)) {
    const quoteEnd = findClosingQuote(inner, 0)
    if (quoteEnd === -1) continue
    const name = unescapeSql(inner.slice(1, quoteEnd))
    const rest = inner.slice(quoteEnd + 1)
    if (!rest.trimStart().startsWith(',')) continue // not a `(name, ...)` tuple
    const fields = splitFields(rest.slice(rest.indexOf(',') + 1)).map(parseField)
    const numericFields = fields.filter((f) => typeof f === 'number')
    const stringFields = fields.filter((f) => typeof f === 'string')
    rows.push({
      name,
      calories: numericFields.length >= 1 ? numericFields[0] : null,
      protein: numericFields.length >= 2 ? numericFields[1] : null,
      // category/basis only make sense for tuples that actually carry
      // them (039's backfill, 040's insert) -- identified by having at
      // least 2 string fields after the name (category, basis[, source]).
      category: stringFields.length >= 2 ? stringFields[0] : null,
      basis: stringFields.length >= 2 ? stringFields[1] : null,
      // source_name/source_id, when present, are always the 3rd/4th
      // string field in this catalog's column order (category, basis,
      // source_name, source_id[, source_url, source_checked_at]).
      sourceName: stringFields.length >= 3 ? stringFields[2] : undefined,
      sourceId: stringFields.length >= 4 ? stringFields[3] : undefined,
      fields,
    })
  }
  return rows
}

// Given a string starting with `'` at `start`, returns the index of the
// matching (un-escaped) closing quote, honoring '' as an escaped literal
// quote within the string.
function findClosingQuote(s, start) {
  let i = start + 1
  while (i < s.length) {
    if (s[i] === "'") {
      if (s[i + 1] === "'") {
        i += 2
        continue
      }
      return i
    }
    i++
  }
  return -1
}

// Matches a named restaurant chain anywhere in a source_name/description
// string. Kept in sync with the same list used to build the USDA-verified
// migration (build_final_dataset.py's content gate, scratchpad-only
// tooling not checked into this repo) -- the catalog must never carry a
// specific chain's product as if it were a generic food.
export const RESTAURANT_BRAND_PATTERN =
  /MCDONALD|KFC|SUBWAY|DENNY|WENDY|BURGER KING|POPEYES|TACO BELL|PIZZA HUT|STARBUCKS|DUNKIN|ARBY|HARDEE|SONIC DRIVE|CHICK-FIL-A|IHOP|APPLEBEE|CHILI'S|OLIVE GARDEN|RED LOBSTER|OUTBACK|DAIRY QUEEN|DOMINO|PAPA JOHN|LONG JOHN|JACK IN THE BOX|CARL'S JR|EL POLLO|WHATABURGER|WAFFLE HOUSE|CRACKER BARREL|BOSTON MARKET|PANERA|CHIPOTLE|FIVE GUYS|SHAKE SHACK/i

// A record explicitly qualified "restaurant" (e.g. "Pasta with tomato
// sauce, restaurant") or an industry-wide "Fast foods, X" average -- both
// out of scope for a generic-food catalog per instruction, regardless of
// whether they name one specific chain.
export const RESTAURANT_WORD_PATTERN = /\brestaurant\b/i
export const FAST_FOOD_PATTERN = /(^|--\s*)fast[- ]?foods?,/i

// Validates a merged, final-state list of { name, calories, protein,
// category, basis, sourceId, sourceName } catalog rows. Returns { errors,
// warnings } -- both plain string arrays, empty when the catalog is
// clean. Every check here mirrors a real constraint the 004/005/039
// migrations enforce in the database itself (the unique lower(name)
// index, the calories/protein >= 0 checks, the category/basis CHECK
// constraints added by 039) so a problem this function catches would
// otherwise only surface as a failed migration in Supabase.
// `sourceId`/`sourceName` are optional -- only rows from 039/040 onward
// carry them; passing rows without them simply skips those checks for
// that row (never reads as a false failure for older-shaped fixtures).
export function validateCatalogRows(rows) {
  const errors = []
  const warnings = []
  const seenNames = new Map() // lower(name) -> first index seen

  rows.forEach((row, index) => {
    const label = row.name || `(row ${index})`

    if (!row.name || row.name.trim() === '') {
      errors.push(`Row ${index}: empty/missing name`)
      return
    }

    const key = row.name.trim().toLowerCase()
    if (seenNames.has(key)) {
      errors.push(`Duplicate name (case-insensitive): "${row.name}" (rows ${seenNames.get(key)} and ${index})`)
    } else {
      seenNames.set(key, index)
    }

    if (row.calories === null || row.calories === undefined) {
      errors.push(`${label}: missing calories_per_100g`)
    } else if (typeof row.calories !== 'number' || !Number.isFinite(row.calories) || row.calories < 0) {
      errors.push(`${label}: calories_per_100g must be a finite number >= 0, got ${row.calories}`)
    }

    if (row.protein === null || row.protein === undefined) {
      errors.push(`${label}: missing protein_per_100g`)
    } else if (typeof row.protein !== 'number' || !Number.isFinite(row.protein) || row.protein < 0) {
      errors.push(`${label}: protein_per_100g must be a finite number >= 0, got ${row.protein}`)
    }

    if (row.category != null && !CATEGORIES.has(row.category)) {
      errors.push(`${label}: invalid category "${row.category}"`)
    }
    if (row.basis != null && !BASIS_VALUES.has(row.basis)) {
      errors.push(`${label}: invalid basis "${row.basis}"`)
    }

    if (row.sourceId !== undefined) {
      if (!row.sourceId || String(row.sourceId).trim() === '') {
        errors.push(`${label}: missing source_id`)
      }
    }
    if (row.sourceName !== undefined) {
      if (!row.sourceName || row.sourceName.trim() === '') {
        errors.push(`${label}: missing source_name`)
      } else {
        if (RESTAURANT_BRAND_PATTERN.test(row.sourceName)) {
          errors.push(`${label}: source_name names a specific restaurant chain -- "${row.sourceName}"`)
        }
        if (RESTAURANT_WORD_PATTERN.test(row.sourceName)) {
          errors.push(`${label}: source_name is qualified "restaurant" -- "${row.sourceName}"`)
        }
        if (FAST_FOOD_PATTERN.test(row.sourceName)) {
          errors.push(`${label}: source_name is a "Fast foods, ..." industry-wide average -- "${row.sourceName}"`)
        }
      }
    }
  })

  return { errors, warnings }
}
