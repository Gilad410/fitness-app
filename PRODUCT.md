# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two paying/operating roles plus one served role:

- **Owner** — operates the platform itself. Administers coach accounts: sets each coach's `access_status` (pending/active/suspended) and tracks `payment_status` (unpaid/trial/paid/overdue) informationally. Payment status never itself gates access — only an explicit owner action changes what a coach can do.
- **Coach** — the customer. An independent personal trainer/fitness coach in Israel who manages a roster of trainees: training programs, nutrition plans, progress tracking, alerts. This is the primary day-to-day user the product is built for.
- **Trainee** — the coach's client. Uses a separate, simpler portal to view training/nutrition plans, log progress and measurements, and receive notifications. Not a buyer; invited by their coach (no public self-signup).

## Product Purpose

A multi-tenant SaaS platform that lets independent Israeli personal trainers/coaches run their coaching business from one tool instead of spreadsheets, WhatsApp, and disconnected apps: assign and track training programs, build and log nutrition plans, record client progress/measurements, and get alerted to what needs attention. Success is measured by coaches actively running real client relationships through it, and trainees actually logging into their portal rather than the coach re-entering data on their behalf.

## Positioning

Hebrew-first, RTL-native UX plus a curated Israeli food/product reference catalog (built from OpenFoodFacts Israel imports and USDA-verified data, manually audited batch-by-batch for correctness) — the combination that generic international coaching platforms (e.g. TrueCoach, Trainerize) do not offer an Israeli coach or client.

## Operating Context

- A coach manages many trainees; a trainee belongs to one coach.
- Trainees interact through their own portal (`/trainee/*` routes) to view plans and log nutrition, training, progress, and measurements — they are not just viewed by the coach, they participate directly.
- Training, nutrition, and coach-notes logs are **append-only**: historical entries are never edited or deleted, only added to.
- Coaches are onboarded out-of-band today — there is no public coach self-signup (`/signup` is deliberately unregistered as a route); a real coach-invite flow is a known, not-yet-built need.
- The owner manages coach lifecycle (suspend/reactivate, payment tracking) through a separate administration layer, independent of the coach/trainee product surfaces.

## Capabilities and Constraints

- Multi-tenant role model enforced at the database layer (Supabase RLS): `owner`, `coach`, `trainee`, via `is_owner()` / `is_coach()` / `is_trainee()` security-definer checks.
- Coach `access_status` (pending/active/suspended) is the single enforcement point for whether a coach can use the product; `payment_status` is informational only and must never be read by any access-control policy.
- Food reference catalog is actively under construction: multi-source import (OpenFoodFacts Israel, USDA) with a deliberate manual-audit step before each batch is trusted — not a one-shot bulk import.
- RTL/Hebrew-first is a structural requirement, not a locale add-on: CSS logical properties (`margin-inline-start`, etc.) are required over physical ones so layout mirrors automatically.
- Backend is Supabase (Postgres + Auth + Storage); frontend is Vue 3 + Vite + Pinia + Vue Router (an existing codebase — stack is not an open decision).

## Brand Commitments

None confirmed yet. The current page title, "ניהול כושר" (Hebrew for "fitness management"), is explicitly marked in the code as a temporary Phase -1 placeholder, not a chosen product name. Treat naming and identity as undecided.

## Evidence on Hand

- A visual design system ("Electric Coach") is already implemented in `src/style.css`, shared across both the coach and trainee portals: navy header, pale lavender page background, white surfaces, blue as primary accent, violet as secondary, red reserved strictly for alerts/warnings. This exists in code today even though it has not been separately documented.
- Food reference catalog import/audit work is actively in progress (OpenFoodFacts Israel batches, USDA-verified items) — see `supabase/sql/050`–`054`.
- No real coaches or trainees are using the product yet (pre-launch) — there is no live-usage evidence, testimonials, or case studies to draw on, and none should be fabricated.

## Product Principles

1. Hebrew/RTL is first-class engineering, not a translation layer bolted onto an LTR design.
2. Historical logs are append-only — the integrity of the record is part of the coach-client trust relationship the product exists to support.
3. Billing state can never silently change product access — only an explicit, auditable owner action (access_status) can suspend or restore a coach.
4. Food-catalog accuracy is earned through manual audit per batch, not bulk-imported and trusted — wrong nutrition data undermines the product's core value.
5. Pre-launch priority is coach-facing correctness and completeness over growth mechanics (e.g. self-serve signup is deliberately not yet exposed).

## Accessibility & Inclusion

No formal accessibility standard has been established. The one confirmed, non-negotiable requirement is full RTL/Hebrew support as described above.
