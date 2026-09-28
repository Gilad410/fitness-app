---
name: Electric Coach
description: A command-center visual system for Israeli fitness coaches — navy authority, electric-blue energy, RTL-native — shared by the coach and trainee portals.
colors:
  ink-navy: "#12153a"
  accent-blue: "#2f6fed"
  accent-blue-deep: "#1d4ed8"
  electric-violet: "#8b5cf6"
  signal-mint: "#17b892"
  ink-soft: "#5b6178"
  border-soft: "#e2e5f5"
  surface-lavender: "#eef0fb"
  surface-white: "#ffffff"
  status-caution: "#d97706"
  status-coral: "#c8362a"
typography:
  title:
    fontFamily: "'Heebo', 'Rubik', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.3"
  body:
    fontFamily: "'Heebo', 'Rubik', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5"
  label:
    fontFamily: "'Heebo', 'Rubik', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: "1.2"
  stat:
    fontFamily: "'Heebo', 'Rubik', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
rounded:
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  2xl: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.accent-blue}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-blue-deep}"
    textColor: "{colors.surface-white}"
  card:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.2xl}"
    padding: "1.25rem"
  badge-active:
    backgroundColor: "{colors.accent-blue}"
    textColor: "{colors.accent-blue-deep}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.5rem"
---

# Design System: Electric Coach

## Overview

**Creative North Star: "The Command Center"**

Electric Coach reads like a focused control panel: a navy anchor, one confident electric-blue action color, and a violet-tipped moment of energy at the single place that deserves it. It exists to make an independent coach feel like they're running a real business from a clear, decisive cockpit — not filling out a form. The voice is energetic, confident, and no-nonsense: color carries meaning (one action color, one warning color, two narrowly-scoped accents) rather than decoration.

The system is mobile-first and RTL-native by construction — Hebrew is the primary reading direction, not a mirrored afterthought, and CSS logical properties keep layout correct automatically. Its one deliberate structural move is dual navigation, chosen by device capability rather than screen size alone: a fixed five-slot bottom nav on phone-class touch devices, a navy header + drawer everywhere else.

Electric Coach is a confirmed rejection of the generic, sterile, spreadsheet-gray enterprise dashboard look. The electric-blue/navy/lavender palette and the one colored-glow moment (the mobile Add action) exist specifically so a small-business coaching tool doesn't feel like faceless B2B software — while staying restrained enough that it never tips into a playful consumer app either.

**Key Characteristics:**
- Electric-blue authority accent anchored by an ink-navy header and text color
- RTL-native, mobile-first, with a capability-driven (not width-only) nav split
- Ambient-lift cards; a heavier colored shadow is earned by exactly one action per screen
- One typographic flourish: tabular, weight-800 stat numerals
- Border-shift focus on inputs instead of an outline ring

## Colors

A cool, confident palette anchored in navy and electric blue over a soft lavender ground, with two narrowly-scoped accents each reserved for exactly one surface.

### Primary
- **Electric Blue** (`#2f6fed`): the one primary action/authority color — primary buttons, active nav state, links.
- **Deep Blue** (`#1d4ed8`): Electric Blue's hover/pressed state, and the higher-contrast text used for an active nav label.

### Secondary
- **Ink Navy** (`#12153a`): primary text color across both portals, and — its one surface role — the solid background of the top header bar.

### Tertiary
- **Electric Violet** (`#8b5cf6`): reserved exclusively for the blue→violet gradient on the mobile bottom nav's central Add action. Not yet a general secondary accent.
- **Signal Mint** (`#17b892`): reserved exclusively for the "goal met / positive progress" trend line in progress charts.

### Neutral
- **Soft Ink** (`#5b6178`): secondary text, captions.
- **Soft Border** (`#e2e5f5`): hairline borders, dividers, chip strokes.
- **Lavender Surface** (`#eef0fb`): page background and soft callout boxes — the ambient ground white cards sit on.
- **Pure White** (`#ffffff`): card/surface background, text-on-navy, the ring around the elevated Add button.

### Status
- **Caution Amber** (`#d97706`): pending/caution state — deliberately left at Tailwind's default so it stays visually distinct from the coral below.
- **Alert Coral** (`#c8362a`): destructive/warning/notification-count meaning only. Deepened one step from an earlier reference tone specifically for AA contrast on white at 12–14px text.

### Named Rules
**The One Warning Color Rule.** Coral is the only color that means destructive/warning/alert — on badges, error text, the alerts-count pill — and is never repurposed as a decorative or general accent anywhere else.

**The Narrow Accent Rule.** Electric Violet and Signal Mint each answer to exactly one surface. Reaching for either elsewhere requires a deliberate decision to widen its role, not an ad hoc reuse.

## Typography

**Body/UI Font:** Heebo (weights 400/500/600/800), falling back to Rubik, Segoe UI, system-ui.

**Character:** One typeface carried across its full weight range rather than paired with a second display face — utilitarian and confident, energized by a single typographic move: tabular, heavy numerals wherever a number is the point.

### Hierarchy
- **Title** (600, ~1.125rem): section and card headings.
- **Body** (400, 1rem, 1.5 line-height): default paragraph and field text.
- **Label** (500, 0.6875rem–0.8125rem): nav labels (11px in the bottom nav specifically), badge text, captions.
- **Stat** (800, tabular numerals, -0.01em tracking, sized contextually — e.g. 1.5rem on a dashboard card): calorie, protein, and weight figures — the system's one raised typographic voice.

### Named Rules
**The One Numeral Rule.** Every stat figure — calories, protein, weight, measurements — renders tabular at weight 800 with tight tracking, consistently, rather than being styled per screen.

## Layout

Mobile-first and RTL-native: `dir="rtl"` at the document root, with CSS logical properties (`margin-inline-start`, not `margin-left`) throughout so layout mirrors automatically instead of being hand-flipped per component.

Two navigation shells serve the same route tree, chosen by a capability check rather than screen width alone: a phone-class touch viewport (`max-width: 640px` **and** `pointer: coarse`) gets a fixed five-slot bottom nav; everything else — including a narrow desktop window with a mouse — keeps the navy header with a hamburger-triggered off-canvas drawer. Page content reserves `5.5rem + env(safe-area-inset-bottom)` of bottom padding so nothing sits underneath the fixed nav.

Spacing follows Tailwind's default 4px-based scale, which already matches the product's agreed xs/sm/md/lg/xl/2xl steps (4/8/16/24/32/48px) — no custom spacing tokens were introduced on top of it.

### Named Rules
**The Capability, Not Width Rule.** The bottom-nav/drawer split is decided by viewport width **and** pointer coarseness together, never by width alone or user-agent sniffing — a narrow desktop window with a mouse must still get the familiar hamburger menu.

## Elevation & Depth

Ambient lift, rare emphasis. Most surfaces — cards — rest on a barely-there shadow that only deepens slightly on hover; depth is a light suggestion, not a strong material cue. The system saves a heavier, more deliberate shadow for the one action per screen that has earned it: the mobile bottom nav's central Add button gets a colored glow tied to its own blue, and an open bottom sheet gets a dark directional lift.

### Shadow Vocabulary
- **Ambient card** (`shadow-sm` at rest → `shadow-md` on hover): default resting state for content cards.
- **Emphasis glow** (`0 6px 16px rgba(47,111,237,0.4)`): the one elevated primary action per screen — the mobile Add button.
- **Sheet lift** (`0 -8px 24px rgba(16,20,51,0.16)`): a bottom sheet/overlay lifting above page content.

### Named Rules
**The Rare Emphasis Rule.** A heavier, colored shadow is earned by exactly one element per screen — an add action, or an open sheet. Everything else stays on the ambient `shadow-sm`/`shadow-md` pair.

## Shapes

- **`rounded-lg`** (0.5rem/8px) — the default radius for buttons, inputs, and most interactive controls.
- **`rounded-2xl`** (1rem/16px) — marks a content surface: cards, sheets, panels.
- **`rounded-xl`** (0.75rem/12px) — marks a smaller element contained inside a card: icon chips, sheet list rows.
- **`rounded-full`** — marks anything binary or symbolic rather than a content container: status badges, the "coming soon" pill, the logout button, the bottom-nav active-state dot, the Add button's circular lift.
- Borders are hairline (1px, Soft Border) and used sparingly, mainly on cards and inputs — never doubled up with a heavy shadow on the same element.

## Components

### Buttons
- **Shape:** `rounded-lg`, minimum 44px height everywhere — a firm touch-target floor, not just a desktop click target.
- **Primary:** Electric Blue background with Ink Navy text at rest; on hover/press the background deepens to Deep Blue and the text flips to white. Disabled drops to 60% opacity.
- **Secondary (pill/outline):** transparent background, `rounded-full`, hairline neutral border; hover shifts both border and text to Electric Blue (used on the portal's logout control).

### Badges / Status Chips
- **Style:** `rounded-full`, small (`text-xs`) — a 10%-opacity tint of a status color paired with that same color at full strength for the text (e.g. active = blue-dark on blue/10, paused = amber on amber/10, archived = neutral gray on neutral/10).
- **Rule:** badge color always maps 1:1 to a real status value; no status gets an ad hoc one-off color.

### Cards / Containers
- **Corner Style:** `rounded-2xl` (1rem).
- **Background:** Pure White, on the Lavender Surface page ground.
- **Border:** hairline Soft Border.
- **Shadow Strategy:** see Elevation & Depth — `shadow-sm` at rest, `shadow-md` on hover.
- **Internal Padding:** 1.25rem, widening to 1.5rem at larger breakpoints.
- **Anatomy:** a tinted icon chip (`rounded-xl`) at the leading edge, an optional status pill at the trailing edge, a title + description body, and an optional Stat-typography value row at the bottom.

### Inputs / Fields
- **Style:** `rounded-lg`, hairline neutral border.
- **Focus:** the border shifts to Electric Blue and the native focus outline is removed. This is a deliberate, load-bearing pattern used on essentially every text input in the app, not a one-off.

### Navigation
- **Header (desktop/tablet):** solid Ink Navy bar, white text/icon, sticky to the top; the hamburger opens an off-canvas drawer.
- **Bottom nav (phone):** fixed, five-slot grid — Home / Trainees / **Add** (visually elevated) / Alerts / More. Active state is color (Deep Blue) plus a quiet 4px dot beneath the icon, so the active tab still reads for a viewer who can't distinguish the color shift alone. The center Add slot deliberately breaks the grid: a circular blue→violet gradient button, lifted above the bar inside a white ring, carrying its own colored glow shadow.
- **"More" overflow:** the bottom nav's fifth slot opens a small bottom sheet — not a new destination type — listing the sections that don't fit the five-slot bar, with focus moving in on open and returning to the trigger on close.

### Motion
- Press feedback on primary actions: a quick 0.1s scale-down on press, nothing decorative or looping.
- Inline panels (e.g. an "add entry" form) fade and ease into place (0.18s) rather than appearing instantly.
- Every transform-based transition above degrades to opacity-only (or nothing) under `prefers-reduced-motion: reduce`, as a standing convention rather than a per-component decision.

## Do's and Don'ts

### Do:
- **Do** treat Electric Blue as the one primary action/authority color; reach for Deep Blue only for its hover/pressed state.
- **Do** keep the border-shift focus treatment (border → Electric Blue, outline removed) as the standard for text inputs.
- **Do** decide bottom-nav-vs-drawer by viewport width **and** pointer coarseness together, never width alone or user-agent sniffing.
- **Do** give every transform-based motion a `prefers-reduced-motion` fallback.
- **Do** keep stat figures in the tabular, weight-800 numeral style, consistently.

### Don't:
- **Don't** use Alert Coral for anything but destructive/warning/notification meaning.
- **Don't** reach for Electric Violet or Signal Mint outside their one reserved surface each without a deliberate decision to widen their role.
- **Don't** let this system drift toward a generic gray, sterile enterprise-dashboard look — the navy/electric-blue/lavender combination is the deliberate alternative to that.
- **Don't** pair a heavy colored shadow with a hairline border on the same element — emphasis comes from one or the other, not both stacked.
- **Don't** introduce a second display typeface; Heebo already carries the full weight range (400–800) the system needs.
