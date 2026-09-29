# Coach dashboard — mobile design alternatives

Three competing visual directions for the coach dashboard, built for a
side-by-side decision on a phone. **Nothing here is wired into the app.**

## What these are

Self-contained HTML files. No build step, no framework, no imports from
`src/`. Open one directly in a browser, or open the hosted copies on a
phone (links below). They exist to be compared and then thrown away —
only the chosen direction gets implemented.

| Direction | File | Hosted |
|---|---|---|
| א׳ · נקי ובהיר (clean & light) | `alternative-a-clean-light.html` | https://claude.ai/artifact/8nEasY7DUqnTZVPz82PnxY |
| ב׳ · אתלטי ואנרגטי (athletic) | `alternative-b-athletic.html` | https://claude.ai/artifact/Qz8tqikVE9KG73DqruVU6k |
| ג׳ · כהה ואלגנטי (dark & elegant) | `alternative-c-dark-elegant.html` | https://claude.ai/artifact/TAY8DdXKetRA8AS169uYvW |

## Ground rules these follow

- **Mock data only.** No Pinia store, no `supabaseClient`, no network
  call of any kind — the same rule the existing `/design-preview` routes
  follow. There is nothing here that could read or write real data.
- **Identical sample data in all three**, so the comparison is about
  design and not about content: coach יוסי, 18 active trainees, 3 alerts,
  three named demo trainees.
- **No invented capabilities or metrics.** The four areas are the four the
  dashboard actually has (לקוחות · התקדמות · תזונה · התראות), and the only
  figures shown are the two the real `DashboardView.vue` actually fetches
  (`traineesStore.activeCount`, `alertsStore.totalCount`). התקדמות and
  תזונה show `—` here because they show `—` in the real product; a
  plausible-looking number there would have been fabricated.
- **Hebrew, RTL, mobile-first.** `dir="rtl"` on the root, CSS logical
  properties throughout (`margin-inline`, `inset-inline`,
  `border-inline-start`), fluid from 360px to 430px with no horizontal
  scroll.
- **Touch targets** are ≥44px; bottom nav and primary actions sit in the
  thumb zone.

## Interactions to try

- Tap **עוד** in the bottom nav → bottom sheet opens (scrim, Esc to close,
  focus moves in and returns to the trigger).
- Tap an alert row → marks it handled (visual only, nothing is stored).
- Tap an area row/tile → single-select "selected" state.

## Known, deliberate detector warnings

`impeccable detect` reports 4 remaining warnings, down from 25. Both are
intentional:

- **`tiny-text` — 11.5px** on the bottom-nav labels and the demo banner.
  11.5px clears the 11px functional floor; bottom-nav labels at this size
  are conventional, and the banner is preview chrome, not product UI.
- **`dark-glow`** on direction B's Add button. This is DESIGN.md's own
  `emphasis-glow` token, which the system explicitly reserves for "the one
  elevated primary action per screen". It was already softened from
  violet/0.55 to blue/0.38; removing it would contradict the committed
  design system.
