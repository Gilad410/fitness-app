// Isolated, hand-written DEMO data for the visual-direction preview only.
// Nothing here is fetched from Supabase, no store is imported, and
// nothing in this feature folder writes anywhere -- see
// DesignPreviewFoodSheet.vue's own header for how "adding" a food is
// kept entirely local. Shapes loosely mirror the real schema (grams OR
// servings, calories/protein only -- no other macro, matching the real
// app's actual scope) purely so the preview reads as authentic, not
// because anything here is wired to real tables.

export const DEMO_TRAINEE_NAME = 'נועה'

export const DEMO_CALORIE_GOAL = 2400
export const DEMO_PROTEIN_GOAL = 140

export const DEMO_MEALS = [
  {
    id: 'm1',
    label: 'בוקר',
    items: [
      { id: 'i1', name: 'שיבולת שועל עם בננה', quantity: '320 גרם', calories: 420, protein: 14 },
    ],
  },
  {
    id: 'm2',
    label: 'צהריים',
    items: [
      { id: 'i2', name: 'חזה עוף בגריל', quantity: '180 גרם', calories: 297, protein: 56 },
      { id: 'i3', name: 'אורז מלא', quantity: '200 גרם', calories: 260, protein: 5 },
      { id: 'i4', name: 'סלט ירקות', quantity: '150 גרם', calories: 60, protein: 2 },
    ],
  },
  {
    id: 'm3',
    label: 'ביניים',
    items: [{ id: 'i5', name: 'יוגורט יווני 5%', quantity: '200 גרם', calories: 190, protein: 20 }],
  },
]

// Shared so the home screen's ring and the nutrition screen's ring never
// disagree about "today so far" -- both derive it from the same demo log
// instead of two independent hardcoded numbers.
export function demoMealsTotals(meals) {
  return meals.reduce(
    (totals, meal) => {
      for (const item of meal.items) {
        totals.calories += item.calories
        totals.protein += item.protein
      }
      return totals
    },
    { calories: 0, protein: 0 },
  )
}

export const DEMO_NOTIFICATIONS = [
  { id: 'n1', title: 'תוכנית אימונים עודכנה', message: 'המאמן שלך עדכן את תוכנית השבוע.', isRead: false },
  { id: 'n2', title: 'יעד חלבון', message: 'קרובה ליעד החלבון היומי שלך — כל הכבוד.', isRead: true },
]

// Mirrors the real app's three food sources (own coach catalog / shared
// reference catalog / restaurant items) and their real quantity rules
// (grams for the first two, servings for the third) -- same concept,
// demo rows only.
export const DEMO_FOOD_SOURCES = [
  { id: 'coach', label: 'מהמאמן' },
  { id: 'catalog', label: 'מאגר מאכלים' },
  { id: 'restaurant', label: 'רשתות' },
]

export const DEMO_FOODS = {
  coach: [
    { id: 'f1', name: 'חזה עוף בגריל', unit: 'grams', caloriesPer100: 165, proteinPer100: 31 },
    { id: 'f2', name: 'אורז מלא מבושל', unit: 'grams', caloriesPer100: 130, proteinPer100: 2.7 },
    { id: 'f3', name: 'ביצת חופש', unit: 'grams', caloriesPer100: 143, proteinPer100: 13 },
    { id: 'f4', name: 'שקדים', unit: 'grams', caloriesPer100: 579, proteinPer100: 21 },
  ],
  catalog: [
    { id: 'f5', name: 'סלמון אפוי', unit: 'grams', caloriesPer100: 208, proteinPer100: 20 },
    { id: 'f6', name: 'קוואקר', unit: 'grams', caloriesPer100: 379, proteinPer100: 13 },
    { id: 'f7', name: 'גבינת קוטג׳ 5%', unit: 'grams', caloriesPer100: 106, proteinPer100: 11 },
  ],
  restaurant: [
    { id: 'f8', name: 'סלט קינואה — קפה גרג', unit: 'servings', caloriesPerServing: 410, proteinPerServing: 18 },
    { id: 'f9', name: 'שייק חלבון — קפה גרג', unit: 'servings', caloriesPerServing: 260, proteinPerServing: 30 },
  ],
}
