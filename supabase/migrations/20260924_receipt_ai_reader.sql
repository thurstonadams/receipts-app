-- AI receipt reader (2026-09-24): why a card is yellow, whether AI filled it,
-- and a full before/after audit of every AI change (rollback source).
-- Applied to xfix-receipts (nvefrdnafsplxlawmmmb) via Supabase MCP on 2026-09-24.
alter table public.receipts
  add column if not exists review_reason text,
  add column if not exists ai_extracted boolean not null default false;

create table if not exists public.receipt_ai_audit (
  id bigint generated always as identity primary key,
  receipt_id text not null,
  user_id uuid not null references auth.users(id),
  mode text not null check (mode in ('backfill','inbound','capture')),
  model text not null,
  before jsonb,
  after jsonb not null,
  raw_reply text,
  created_at timestamptz not null default now()
);
create index if not exists receipt_ai_audit_receipt_idx on public.receipt_ai_audit(receipt_id);
create index if not exists receipt_ai_audit_user_idx on public.receipt_ai_audit(user_id);

alter table public.receipt_ai_audit enable row level security;
drop policy if exists receipt_ai_audit_select_own on public.receipt_ai_audit;
create policy receipt_ai_audit_select_own on public.receipt_ai_audit
  for select using ((select auth.uid()) = user_id);
-- No insert/update/delete policies: only the service role (edge functions) writes.

-- Rollback of the 2026-09-24 backfill (restores the pre-AI values):
--   update public.receipts r set vendor=a.before->>'vendor', date=a.before->>'date',
--     total=(a.before->>'total')::numeric, currency=a.before->>'currency',
--     category=a.before->>'category', category_code=a.before->>'category_code',
--     status=a.before->>'status', review_reason=null, ai_extracted=false
--   from public.receipt_ai_audit a where a.receipt_id=r.id and a.mode='backfill';
