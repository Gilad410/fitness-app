// Integration test: reads the ACTUAL supabase/sql/046 migration file
// (not a fixture) and validates its structural safety properties.
// Same convention as barcodeMigration.test.mjs / foodCatalogRealData.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const sqlDir = path.resolve(here, '../../../../supabase/sql')

function migrationText() {
  return readFileSync(path.join(sqlDir, '046_coach_barcode_products.sql'), 'utf8')
}

test('046 is transaction-safe: opens with begin; and closes with commit;', () => {
  const text = migrationText()
  const withoutComments = text.replace(/--.*$/gm, '')
  assert.match(withoutComments.trimStart(), /^\s*begin;/)
  assert.match(withoutComments.trimEnd(), /commit;\s*$/)
})

test('046 creates the table with "if not exists" (idempotent, safe to re-run)', () => {
  const text = migrationText()
  assert.match(text, /create table if not exists public\.coach_barcode_products/)
})

test('046 enables row level security and defines select/insert/update policies scoped to coach_id = auth.uid()', () => {
  const text = migrationText()
  assert.match(text, /alter table public\.coach_barcode_products enable row level security/)
  const policies = [...text.matchAll(/create policy (\w+) on public\.coach_barcode_products/g)].map((m) => m[1])
  assert.deepEqual(policies.sort(), [
    'coach_barcode_products_insert_own',
    'coach_barcode_products_select_own',
    'coach_barcode_products_update_own',
  ])
  // Every policy must actually scope to the caller's own rows.
  for (const line of text.split('\n')) {
    if (line.includes('using (') || line.includes('with check (')) {
      assert.match(line, /coach_id = auth\.uid\(\)/, `policy clause does not scope to coach_id: ${line}`)
    }
  }
})

test('046 has a unique index on (coach_id, barcode) -- one approved value per coach per barcode', () => {
  const text = migrationText()
  assert.match(text, /create unique index if not exists coach_barcode_products_coach_barcode_idx\s*\n\s*on public\.coach_barcode_products \(coach_id, barcode\);/)
})

test('046 requires calories_per_100g but allows protein_per_100g to be null -- unknown-protein products are supported here too, not an error', () => {
  const text = migrationText()
  const createBlock = text.slice(text.indexOf('create table'), text.indexOf('-- One approved value'))
  assert.match(createBlock, /calories_per_100g numeric\(7, 2\) not null/)
  assert.match(createBlock, /protein_per_100g numeric\(6, 2\) check \(protein_per_100g is null or protein_per_100g >= 0\)/)
})

test('046 does not touch public.foods, public.food_reference_catalog, public.restaurant_food_items, or trainee_nutrition_logs in its actual SQL -- a new, independent table only (the header comments discuss the relationship in prose, which is fine -- only executable SQL matters here)', () => {
  const withoutComments = migrationText().replace(/--.*$/gm, '')
  assert.doesNotMatch(withoutComments, /\bpublic\.foods\b/)
  assert.doesNotMatch(withoutComments, /\bfood_reference_catalog\b/)
  assert.doesNotMatch(withoutComments, /\brestaurant_food_items\b/)
  assert.doesNotMatch(withoutComments, /\btrainee_nutrition_logs\b/)
})

test('046 has no delete/truncate/drop-table statements -- purely additive', () => {
  const withoutComments = migrationText().replace(/--.*$/gm, '')
  assert.doesNotMatch(withoutComments, /\bdelete\s+from\b/i)
  assert.doesNotMatch(withoutComments, /\btruncate\b/i)
  assert.doesNotMatch(withoutComments, /\bdrop\s+table\b/i)
})
