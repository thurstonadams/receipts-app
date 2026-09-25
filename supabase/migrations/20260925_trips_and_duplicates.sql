-- Step 2 (2026-09-25): trips decide the book; duplicates are linked, not deleted.
--
-- trips: date ranges Thurston enters in the app. A receipt whose charge date
-- (or stay/travel date) falls in a trip is filed in that trip's book.
-- receipts.duplicate_of: set when the same charge arrives twice (e.g. an Uber
-- "charge summary" + the trip receipt, or a hotel folio in INR + the card
-- charge in USD). The row stays for the paper trail but is hidden from lists,
-- totals and the KAI export.
--
-- Rollback:
--   create or replace view kai_export.receipts_kai as <previous definition, without the duplicate_of filter>;
--   alter table public.receipts drop column duplicate_of;
--   drop table public.trips;

create table if not exists public.trips (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  start_date  text not null check (start_date ~ '^\d{4}-\d{2}-\d{2}$'),
  end_date    text not null check (end_date ~ '^\d{4}-\d{2}-\d{2}$'),
  entity_id   text not null check (entity_id in ('xfix', 'kai', 'personal')),
  notes       text not null default '',
  created_at  bigint not null,
  updated_at  bigint not null,
  check (end_date >= start_date)
);
create index if not exists trips_user_dates on public.trips (user_id, start_date, end_date);

alter table public.trips enable row level security;
drop policy if exists "Users manage own trips" on public.trips;
create policy "Users manage own trips" on public.trips
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.receipts add column if not exists duplicate_of text;
create index if not exists receipts_duplicate_of on public.receipts (duplicate_of) where duplicate_of is not null;

-- The KAI month-end skill must never see a duplicate.
create or replace view kai_export.receipts_kai as
  select id, user_id, entity_id, vendor, date, total, currency, payment, category,
         category_code, project, notes, status, thumb_tone, photo_uri, created_at,
         updated_at, photo_path, source, source_email, source_subject,
         attachment_path, billable_to
    from public.receipts
   where billable_to = 'kai' and duplicate_of is null;

-- Realtime for the app's Trips screen.
do $$ begin
  alter publication supabase_realtime add table public.trips;
exception when duplicate_object then null; when undefined_object then null; end $$;
