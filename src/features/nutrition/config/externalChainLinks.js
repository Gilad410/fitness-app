// Official-source external links for chains we intentionally do NOT seed
// into `restaurant_food_items` (no in-app item picker, no local nutrition
// data). Purely a pointer to the chain's own official nutrition page --
// no logos/branding, no partnership implied. To add another chain, add
// one entry here; no other file needs to change.
export const externalChainLinks = [
  {
    chainName: "McDonald's",
    label: "McDonald's — מחשבון תזונה רשמי",
    note: "המידע והתזונה מוצגים באתר הרשמי של McDonald's.",
    url: 'https://order.mcdonalds.co.il/nutrition-calculator',
  },
]
