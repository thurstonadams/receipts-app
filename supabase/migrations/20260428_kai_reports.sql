-- KAI expense reports / passthrough invoices.
--
-- Thurston operates Kalyani Aftermarket and bills KAI LLC for
-- expenses incurred on KAI's behalf. The mobile app captures receipts
-- across all books; a `billable_to` tag on each receipt marks it as
-- "billable to KAI." Periodically (default monthly), the app assembles
-- those receipts into a `report`, generates a PDF that mirrors the
-- Kalyani invoice template, and emails it.
--
-- Receipts are NEVER mutated when they're billed. Traceability lives
-- in `report_receipts` — a join row per (report, receipt) — so a
-- receipt can be looked up to find what report it appeared on, and
-- vice versa, without destructive ops.
--
-- Idempotent — safe to re-run.

-- 1. receipts.billable_to ----------------------------------------------------
-- Nullable text; only valid value today is 'kai'. Future clients (e.g.
-- another billing relationship) just add to the enum.
alter table public.receipts
  add column if not exists billable_to text
    check (billable_to is null or billable_to in ('kai'));

create index if not exists receipts_billable_to_idx
  on public.receipts (user_id, billable_to)
  where billable_to is not null;

-- 2. reports table ----------------------------------------------------------
create table if not exists public.reports (
  id              text primary key,        -- e.g. 'KAI-2026-05'
  user_id         uuid not null references auth.users(id) on delete cascade,
  client          text not null,           -- 'kai' (matches receipts.billable_to)
  period_start    date not null,
  period_end      date not null,
  status          text not null default 'draft'
    check (status in ('draft','ready','sent','paid','overdue','void')),
  invoice_number  text not null,           -- human-friendly; same as id today
  invoice_date    date,                    -- date the invoice was finalized/sent
  due_date        date,                    -- typically invoice_date + 30
  recipient_email text,                    -- cached recipient
  cc_email        text,
  total_cents     bigint not null default 0,
  line_count      integer not null default 0,
  pdf_path        text,                    -- Storage key in 'reports' bucket
  sent_at         timestamptz,
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists reports_user_period_idx
  on public.reports (user_id, period_start desc);

create index if not exists reports_status_idx
  on public.reports (user_id, status);

alter table public.reports enable row level security;

drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own" on public.reports
  for select using (auth.uid() = user_id);

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "reports_update_own" on public.reports;
create policy "reports_update_own" on public.reports
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "reports_delete_own" on public.reports;
create policy "reports_delete_own" on public.reports
  for delete using (auth.uid() = user_id);

-- 3. report_receipts join ---------------------------------------------------
-- Snapshot fields capture the values *as billed* so a later edit to the
-- underlying receipt (correcting a typo, etc.) doesn't silently mutate a
-- sent invoice.
create table if not exists public.report_receipts (
  report_id        text not null references public.reports(id) on delete cascade,
  receipt_id       text not null,
  user_id          uuid not null references auth.users(id) on delete cascade,
  line_no          integer not null,
  -- Snapshot at time of billing
  snap_date        date,
  snap_vendor      text,
  snap_category    text,
  snap_notes       text,
  snap_total_cents bigint,
  primary key (report_id, receipt_id)
);

create index if not exists report_receipts_receipt_idx
  on public.report_receipts (receipt_id);

create index if not exists report_receipts_user_idx
  on public.report_receipts (user_id);

alter table public.report_receipts enable row level security;

drop policy if exists "report_receipts_select_own" on public.report_receipts;
create policy "report_receipts_select_own" on public.report_receipts
  for select using (auth.uid() = user_id);

drop policy if exists "report_receipts_insert_own" on public.report_receipts;
create policy "report_receipts_insert_own" on public.report_receipts
  for insert with check (auth.uid() = user_id);

drop policy if exists "report_receipts_update_own" on public.report_receipts;
create policy "report_receipts_update_own" on public.report_receipts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "report_receipts_delete_own" on public.report_receipts;
create policy "report_receipts_delete_own" on public.report_receipts
  for delete using (auth.uid() = user_id);

-- 4. reports storage bucket -------------------------------------------------
-- Private bucket holding the generated PDF for each invoice. Path shape:
--   <userId>/<reportId>.pdf
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reports',
  'reports',
  false,
  10485760,  -- 10 MB ceiling per invoice PDF
  array['application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "reports_pdf_select" on storage.objects;
create policy "reports_pdf_select" on storage.objects
  for select using (
    bucket_id = 'reports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "reports_pdf_insert" on storage.objects;
create policy "reports_pdf_insert" on storage.objects
  for insert with check (
    bucket_id = 'reports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "reports_pdf_update" on storage.objects;
create policy "reports_pdf_update" on storage.objects
  for update using (
    bucket_id = 'reports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "reports_pdf_delete" on storage.objects;
create policy "reports_pdf_delete" on storage.objects
  for delete using (
    bucket_id = 'reports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 5. updated_at trigger for reports ----------------------------------------
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists reports_touch_updated_at on public.reports;
create trigger reports_touch_updated_at
  before update on public.reports
  for each row
  execute function public.touch_updated_at();
