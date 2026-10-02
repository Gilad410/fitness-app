const DAY_MS = 24 * 60 * 60 * 1000

function parseIsoDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? '')
  if (!match) throw new TypeError('Expected an ISO calendar date.')
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new TypeError('Expected a valid ISO calendar date.')
  }
  return date
}

export function isoDateToUtcDate(isoDate) {
  return parseIsoDate(isoDate)
}

export function shiftIsoDate(isoDate, dayOffset) {
  if (!Number.isInteger(dayOffset)) throw new TypeError('Expected an integer day offset.')
  const shifted = new Date(parseIsoDate(isoDate).getTime() + dayOffset * DAY_MS)
  return shifted.toISOString().slice(0, 10)
}

export function buildNutritionDateStrip(todayIso, dayCount = 7) {
  if (!Number.isInteger(dayCount) || dayCount < 1) {
    throw new TypeError('Expected a positive day count.')
  }
  return Array.from({ length: dayCount }, (_, index) =>
    shiftIsoDate(todayIso, index - (dayCount - 1)),
  )
}
