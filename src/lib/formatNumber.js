// Display-only formatting for nutrition quantities (calories/protein
// totals). Summing floats client-side (e.g. 3.6 + 24.8) can land on a value
// like 28.400000000000002 instead of 28.4 -- this never changes what's
// stored or how totals are calculated, it only rounds the number shown to
// at most one decimal place and drops a trailing ".0" so whole numbers
// still read as "283" rather than "283.0".
export function formatNutritionAmount(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return value
  const rounded = Math.round(num * 10) / 10
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1)
}
