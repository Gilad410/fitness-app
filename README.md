# Fitness Management App

A coach/client fitness management web app (Hebrew-first, RTL, mobile-first). Vue 3 + Vite + Pinia + Vue Router on the frontend, Supabase (Postgres + Auth + Storage) as the backend.

This README covers setup and conventions only — the full roadmap, PRD, and Phase -1 design system were agreed separately and aren't checked into this repo yet.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase project URL + anon key
npm run dev
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run preview` — preview a production build locally
- `npm run lint` — run ESLint
- `npm run format` — run Prettier

## Project structure

A feature-first convention, established before real features land so every phase follows the same shape:

- `src/features/<domain>/` — one folder per product domain (e.g. `auth`, `training`, `nutrition`), each with its own `views/`, `components/`, and `store/` as needed. Created as each domain is actually built, starting with `auth` in Phase 1 — no empty placeholder domains.
- `src/shared/` — UI primitives and utilities reused across more than one feature (buttons, cards, loading/error states). Populated starting Phase 2.
- `src/lib/` — thin wrappers around external services, e.g. the single Supabase client instance (`src/lib/supabaseClient.js`, added in Phase 0).
- `src/router/` — the route tree and navigation guards.
- `src/stores/` — cross-cutting Pinia stores that aren't specific to one feature (e.g. `auth`, added in Phase 1).

## Conventions

- RTL/Hebrew-first: use CSS logical properties (`margin-inline-start`, not `margin-left`) so layout mirrors automatically.
- Design tokens (colors, typography) live in `src/style.css`'s Tailwind `@theme` block — don't hardcode colors/fonts in components.
- Logs (training, nutrition, coach notes) are append-only: never edit or delete a historical entry, only add new ones.
