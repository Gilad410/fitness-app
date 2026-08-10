-- Progress Photos milestone -- private, dated front/side/back photos per
-- trainee. Photos are sensitive: stored in a private Storage bucket
-- (never public), and both the metadata row and the underlying file are
-- scoped to the owning coach *and* verified against real trainee
-- ownership via RLS. No trainee-facing access yet -- the storage path
-- layout (coach_id, then trainee_id) is deliberately structured so a
-- trainee-scoped policy can be added later without moving any existing
-- file.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 016_circumference_logs.sql.

-- Metadata row per photo. storage_path points into the private
-- 'progress-photos' bucket, as {coach_id}/{trainee_id}/{id}.{ext}.
-- Unique per (trainee_id, logged_at, angle): only one front/side/back
-- photo per trainee per day -- re-shooting an angle for that day means
-- deleting the existing entry first (delete + re-add), same convention
-- as every other progress table here.
create table public.trainee_progress_photos (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  angle text not null check (angle in ('front', 'side', 'back')),
  storage_path text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  logged_at date not null default current_date,
  created_at timestamptz not null default now(),
  constraint trainee_progress_photos_one_per_angle_per_day
    unique (trainee_id, logged_at, angle)
);

create index trainee_progress_photos_trainee_id_idx
  on public.trainee_progress_photos (trainee_id, logged_at desc);

alter table public.trainee_progress_photos enable row level security;

-- Same coach_id + real-trainee-ownership double-check as
-- trainee_circumference_logs (016_circumference_logs.sql), on select,
-- insert, and delete.
create policy trainee_progress_photos_select_own on public.trainee_progress_photos
  for select
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_progress_photos.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

-- Insert additionally verifies storage_path is actually namespaced under
-- this same coach_id/trainee_id -- a coach can't write a metadata row
-- for one trainee that secretly points at a file path under a different
-- trainee_id (their own or otherwise).
create policy trainee_progress_photos_insert_own on public.trainee_progress_photos
  for insert
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_progress_photos.trainee_id
        and trainees.coach_id = auth.uid()
    )
    and storage_path like (coach_id::text || '/' || trainee_id::text || '/%')
  );

create policy trainee_progress_photos_delete_own on public.trainee_progress_photos
  for delete
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_progress_photos.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

-- No update policy: a wrong photo is deleted and re-uploaded, not
-- replaced in place.

-- Private bucket -- public = false, so files are only reachable through
-- short-lived signed URLs generated for the authenticated coach, never a
-- public URL. Server-side MIME/size limits back up the client-side checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'progress-photos',
  'progress-photos',
  false,
  8388608, -- 8 MB
  array['image/jpeg', 'image/png', 'image/webp']
);

-- storage.objects RLS: every object name is namespaced
-- {coach_id}/{trainee_id}/{filename}. Both segments are checked --
-- segment 1 must be the caller's own auth uid, AND segment 2 must be a
-- trainee_id that actually belongs to that same coach (not just "looks
-- like a uuid"). Text comparison throughout avoids a cast exception on a
-- malformed path.
create policy progress_photos_select_own on storage.objects
  for select
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.trainees
      where trainees.id::text = (storage.foldername(name))[2]
        and trainees.coach_id = auth.uid()
    )
  );

create policy progress_photos_insert_own on storage.objects
  for insert
  with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.trainees
      where trainees.id::text = (storage.foldername(name))[2]
        and trainees.coach_id = auth.uid()
    )
  );

create policy progress_photos_delete_own on storage.objects
  for delete
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.trainees
      where trainees.id::text = (storage.foldername(name))[2]
        and trainees.coach_id = auth.uid()
    )
  );

-- No update policy on storage.objects either, for the same delete +
-- re-upload reason as above.
