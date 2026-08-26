-- Optional Workout Name milestone -- lets a coach create/rename a
-- workout with NO custom name at all, so the frontend can display it as
-- a bare automatic "אימון N" with nothing appended (018_training_programs.sql
-- previously required every workout to carry a non-empty name). Purely
-- additive on top of 018: one column-nullability change and its matching
-- CHECK constraint, on one table. 018 itself, and every other migration,
-- is untouched.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 031_trainee_submission_coach_note.sql (order
-- relative to 019-031 doesn't actually matter -- this only touches
-- trainee_program_workouts.name, which none of them reference -- but it
-- keeps the numbering sequential). Wrapped in a single transaction so it
-- applies entirely or not at all. Safe to rerun: DROP NOT NULL is a
-- harmless no-op if the column is already nullable, and the constraint is
-- dropped-if-exists before being re-added (the same idiom 011/027/030
-- already use for a table CHECK constraint).
--
-- =====================================================================
-- Workout numbering is NOT stored here -- and never should be
-- =====================================================================
-- This migration adds no workout-number column and touches display_order
-- nowhere. Per the investigation this follows: create() always appends at
-- max(display_order)+1, move() swaps display_order between array-adjacent
-- workouts, and remove() does NOT compact the survivors' display_order --
-- so a stored "workout number" would need constant renumbering to stay
-- correct, while the array POSITION of an already-order-sorted fetch
-- (workouts.js's own fetchForProgram, unmodified) is always correct with
-- zero maintenance. The frontend computing "אימון {index + 1}" from that
-- position (not from raw display_order, which can have gaps after a
-- delete) remains entirely a Stage 2 (frontend) concern -- deliberately
-- out of scope for this file.
--
-- =====================================================================
-- What changes, precisely
-- =====================================================================
-- Before this migration:
--   name text not null check (char_length(trim(name)) > 0)
-- After this migration:
--   name text check (name is null or char_length(trim(name)) > 0)
-- i.e. NOT NULL is dropped, and the CHECK is restated to explicitly allow
-- null while still rejecting an empty or whitespace-only string whenever
-- a name IS supplied. No maximum-length rule exists on this column in
-- 018 (or anywhere since) to preserve -- there is nothing to carry
-- forward on that front.
--
-- Note on why the CHECK is restated at all: Postgres CHECK constraints
-- already pass (do not reject a row) when the check expression evaluates
-- to null rather than false -- char_length(trim(null)) > 0 evaluates to
-- null, not false, so the ORIGINAL constraint text would technically
-- already tolerate a null name the moment NOT NULL is dropped, with no
-- constraint change at all. This migration restates it explicitly anyway
-- (name is null or ...) purely so the allowed shape is self-evident from
-- reading the constraint itself, not something a reader has to already
-- know Postgres's three-valued CHECK semantics to infer -- matching this
-- schema's general preference for explicit constraints over relying on
-- an implicit rule (e.g. 030/031's coach_note length check spells out
-- "coach_note is null or ..." the same way, for the same reason).
--
-- =====================================================================
-- Existing data -- fully preserved, nothing touched
-- =====================================================================
-- Every existing trainee_program_workouts row already has a real,
-- non-empty name (the only shape 018 ever allowed) -- relaxing NOT NULL
-- and widening the CHECK can only ever ADMIT a new state (null) that no
-- existing row is in; it cannot invalidate, alter, or require rewriting
-- any row that already exists. No UPDATE statement of any kind appears
-- anywhere in this file.
--
-- =====================================================================
-- Nothing else changes
-- =====================================================================
-- display_order, created_at, updated_at, notes, coach_id, program_id: all
-- untouched. No RPC (trainee_get_active_training_program() already
-- passes `name` through as-is, null included, with no special-casing
-- needed -- jsonb_build_object('name', w.name, ...) handles a null value
-- exactly like any other). No RLS policy, no other table, no Storage
-- object, no frontend file. Workout create/rename/reorder/delete
-- behavior (workouts.js) is unaffected by this migration -- the "make
-- the name field optional in the add/edit form" part of this feature is
-- explicitly a later, separate frontend stage.

begin;

alter table public.trainee_program_workouts
  alter column name drop not null;

alter table public.trainee_program_workouts
  drop constraint if exists trainee_program_workouts_name_check;
alter table public.trainee_program_workouts
  add constraint trainee_program_workouts_name_check
  check (name is null or char_length(trim(name)) > 0);

commit;
