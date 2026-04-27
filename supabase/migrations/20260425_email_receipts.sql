-- Email-to-receipt feature. Adds the columns the inbound-email Edge Function
-- writes to and provisions a private bucket for the original .eml/PDF so the
-- mobile app can offer a "View original" action for audit.
--
-- Idempotent — safe to re-run.

-- 1. Receipts table additions ------------------------------------------------
alter table public.receipts
  add column if not exists source text default 'capture'
    check (source in ('capture', 'email')),
  add column if not exists source_email text,    -- e.g. 'billing@anthropic.com'
  add column if not exists source_subject text,  -- e.g. 'Your receipt from Anthropic, PBC #2944-7901-6440'
  add column if not exists attachment_path text; -- Storage key under receipt-attachments bucket

create index if not exists receipts_source_idx
  on public.receipts (source);

-- 2. receipt-attachments bucket (private, mirrors receipts bucket pattern) --
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipt-attachments',
  'receipt-attachments',
  false,
  20971520,  -- 20 MB ceiling for PDFs / .eml files
  array[
    'application/pdf',
    'message/rfc822',
    'application/octet-stream',
    'text/html',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do nothing;

-- Storage RLS — only the owner can read/write their folder.
drop policy if exists "receipt_attachments_select" on storage.objects;
create policy "receipt_attachments_select" on storage.objects
  for select
  using (
    bucket_id = 'receipt-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "receipt_attachments_insert" on storage.objects;
create policy "receipt_attachments_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'receipt-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "receipt_attachments_update" on storage.objects;
create policy "receipt_attachments_update" on storage.objects
  for update
  using (
    bucket_id = 'receipt-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "receipt_attachments_delete" on storage.objects;
create policy "receipt_attachments_delete" on storage.objects
  for delete
  using (
    bucket_id = 'receipt-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3. Inbound sender allowlist -----------------------------------------------
-- The Edge Function uses this to map a verified sender address to the
-- internal user_id receipts get filed against. Default-on policy: a sender
-- not in this table is rejected.
create table if not exists public.email_inbound_senders (
  email text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  notes text
);

alter table public.email_inbound_senders enable row level security;

-- Each user can only see and edit their own allowlist entries.
drop policy if exists "email_inbound_senders_select_own" on public.email_inbound_senders;
create policy "email_inbound_senders_select_own" on public.email_inbound_senders
  for select using (auth.uid() = user_id);

drop policy if exists "email_inbound_senders_insert_own" on public.email_inbound_senders;
create policy "email_inbound_senders_insert_own" on public.email_inbound_senders
  for insert with check (auth.uid() = user_id);

drop policy if exists "email_inbound_senders_update_own" on public.email_inbound_senders;
create policy "email_inbound_senders_update_own" on public.email_inbound_senders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "email_inbound_senders_delete_own" on public.email_inbound_senders;
create policy "email_inbound_senders_delete_own" on public.email_inbound_senders
  for delete using (auth.uid() = user_id);

-- The Edge Function itself uses the service-role key, which bypasses RLS,
-- so it can read this table for any sender during webhook handling.
