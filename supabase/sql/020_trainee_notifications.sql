-- Manual Coach-to-Trainee Notifications milestone -- lets a coach send a
-- one-off, in-app-only notification (title + message) to a single one of
-- their own trainees. This is the coach-side half only: composing and
-- sending. The trainee-side half (a trainee reading and marking their own
-- notifications as read) is deliberately NOT wired up by this migration --
-- see "Why there is no trainee-facing RLS policy yet" below, which also
-- documents exactly what a later migration needs to add to enable it
-- safely.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 019_exercise_reference_catalog.sql.
--
-- Purely additive: ONE new table, no existing table/column/policy/data is
-- touched. The existing automatic coach alerts (missing weight for 3 days,
-- no active training program -- both computed client-side by
-- src/features/alerts/store/alerts.js straight off trainees /
-- trainee_progress_logs / trainee_training_programs) are untouched by this
-- migration: they don't read this table, and this table introduces no
-- nutrition alert of any kind.
--
-- Ownership model: same one-level-deep shape as trainee_progress_logs /
-- trainee_circumference_logs -- trainees (existing) -> trainee_notifications.
-- coach_id is denormalized onto this table (same convention as every other
-- coach-owned table in this schema) AND the RLS policies below re-verify
-- ownership against the parent trainees row on every operation, not just
-- coach_id alone -- coach_id alone would let a coach point a notification
-- row at a trainee_id that exists but isn't actually theirs, since a
-- foreign key only requires the parent row to exist, not that it's owned
-- by the same coach. Same reasoning as trainee_training_programs
-- (018_training_programs.sql) and trainee_circumference_logs
-- (016_circumference_logs.sql).
--
-- Append-only from the coach's side: a sent notification's title/message
-- can't be edited or deleted by the coach once sent (no update/delete
-- policy for the coach role) -- same "history, not a draft" posture as
-- trainee_progress_logs. The only field that ever changes after insert is
-- is_read/read_at, and that's a trainee action (see below), not a coach
-- one.

create table public.trainee_notifications (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0 and char_length(trim(title)) <= 120),
  message text not null check (char_length(trim(message)) > 0 and char_length(trim(message)) <= 2000),
  -- Read/unread support. Two columns instead of just a boolean so a
  -- trainee inbox can show *when* a notification was read, not just that
  -- it was -- both are kept in lockstep by the check constraint below
  -- (never true+null or false+non-null).
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint trainee_notifications_read_state_consistent check (
    (is_read = false and read_at is null) or
    (is_read = true and read_at is not null)
  )
);

-- Primary access pattern once the trainee side exists: "this trainee's
-- notifications, newest first" -- same shape as
-- trainee_progress_logs_trainee_id_idx.
create index trainee_notifications_trainee_id_idx
  on public.trainee_notifications (trainee_id, created_at desc);

-- Secondary access pattern: a coach's own sent history, and the column the
-- ownership-check policies below filter on first.
create index trainee_notifications_coach_id_idx
  on public.trainee_notifications (coach_id, created_at desc);

-- Partial index sized for the one query an unread badge needs
-- ("how many/which of this trainee's notifications are still unread") --
-- kept small by only indexing the unread rows, which is also the subset
-- that stays small over time (read notifications accumulate, unread ones
-- don't, in a healthy inbox).
create index trainee_notifications_trainee_unread_idx
  on public.trainee_notifications (trainee_id)
  where is_read = false;

alter table public.trainee_notifications enable row level security;

-- Coach: can see notifications for trainees they own. Re-verifies
-- ownership against trainees on every check (see "Ownership model" above)
-- rather than trusting coach_id alone.
create policy trainee_notifications_select_own on public.trainee_notifications
  for select
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_notifications.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

-- Coach: can send (insert) a notification only to a trainee they own.
create policy trainee_notifications_insert_own on public.trainee_notifications
  for insert
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_notifications.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

-- No coach update or delete policy -- see "Append-only from the coach's
-- side" above. No trainee-facing policy of any kind yet -- see below.
-- With RLS enabled and no matching policy, every one of these operations
-- is simply denied, for everyone, by default. That's the safe state this
-- migration leaves the table in until the trainee side is built.

-- =====================================================================
-- Why there is no trainee-facing RLS policy yet
-- =====================================================================
-- public.trainees currently has no link to Supabase Auth at all: a
-- trainee is just a row a coach manages (full_name/email/phone/notes),
-- not something that can itself sign in and authenticate as auth.uid().
-- Every existing table in this schema (including this one) can therefore
-- only ever safely check "does this row's coach match auth.uid()?" --
-- there is no "does this row's trainee match auth.uid()?" check possible
-- today, because no column anywhere ties a trainees row to a specific
-- auth.users id for that trainee.
--
-- Writing a trainee-facing policy against today's schema would have to
-- either:
--   (a) fake it with something like `trainee_id = auth.uid()` -- wrong on
--       its face, since trainee_id is a trainees.id, not an auth.users id,
--       so this would never match any real trainee session and either
--       denies everyone (harmless but useless) or, if trainee_id and
--       auth.uid() ever accidentally collided in value, could leak a row
--       to a completely unrelated authenticated user; or
--   (b) grant access by some other unverified means (an email match, a
--       trainee_id passed in from the client, etc.) -- exactly the kind
--       of "coach_id alone" gap this schema's convention (see "Ownership
--       model" above) has consistently closed everywhere else, and here
--       it would be worse: it would leak one trainee's notifications to
--       anyone who can guess/observe another trainee's id or email.
-- Neither is acceptable, so this migration adds no trainee policy at all
-- rather than an insecure one. RLS default-deny means trainees simply
-- have zero access via the API until that identity link exists --
-- correct and safe, just not yet featureful.
--
-- What a future migration needs to add, in order, once the trainee-side
-- app is actually being built:
--   1. `alter table public.trainees add column auth_user_id uuid
--       references auth.users(id) unique;` -- nullable, since every
--       existing trainee row predates having its own login and won't
--       have one until that trainee is invited/onboarded. Unique so one
--       auth account can't be linked to more than one trainee row.
--   2. Whatever invite/onboarding flow creates that auth.users account
--      for a trainee (e.g. Supabase invite-by-email) sets
--      trainees.auth_user_id to that new user's id.
--   3. Only then can a trainee-facing select policy be added safely:
--        using (
--          exists (
--            select 1 from public.trainees
--            where trainees.id = trainee_notifications.trainee_id
--              and trainees.auth_user_id = auth.uid()
--          )
--        )
--      -- i.e. the same ownership-reverification shape used by every
--      coach policy in this schema, just anchored on auth_user_id instead
--      of coach_id.
--   4. And a narrow trainee-facing update policy, restricted to *only*
--      the is_read/read_at columns (e.g. via a `with check` that pins
--      trainee_id/coach_id/title/message unchanged, or a dedicated
--      security-definer RPC instead of a raw table update) so a trainee
--      can mark a notification read but can't rewrite its content or
--      reassign it to a different trainee.
-- None of this is done here -- it's out of scope for this migration and
-- depends on a trainee auth/invite flow that doesn't exist yet -- but the
-- table, columns, and indexes above (auth_user_id-shaped ownership check,
-- is_read/read_at already present and already indexed) are already the
-- right shape to make that a small, additive follow-up instead of a
-- redesign.
