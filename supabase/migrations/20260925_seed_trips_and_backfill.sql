-- Applied 2026-09-25 (data, not schema). Kept here as the record of what ran.
--
-- 1. Seeded the two KAI trips found in the receipts (flagged in the app for
--    Thurston to confirm): India 2026-08-15 → 08-26, Frankfurt 09-07 → 09-10.
insert into public.trips (id, user_id, name, start_date, end_date, entity_id, notes, created_at, updated_at)
select v.id, u.user_id, v.name, v.s, v.e, 'kai', 'Added by Claude from your receipts — please confirm the dates.',
       (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint
  from (select distinct user_id from public.receipts) u
  cross join (values
    ('t_seed_india_202608', 'India (Pune / Delhi)', '2026-08-15', '2026-08-26'),
    ('t_seed_frankfurt_202609', 'Frankfurt', '2026-09-07', '2026-09-10')
  ) as v(id, name, s, e)
on conflict (id) do nothing;

-- 2. History backfill. Billing NOT touched (billable_to unchanged everywhere).
--    Every change has a receipt_ai_audit row (model 'rules (filing.ts step 2)')
--    with the before values, so it can be reversed:
--      update receipts r set entity_id = a.before->>'entity_id', duplicate_of = null,
--             review_reason = a.before->>'review_reason'
--        from receipt_ai_audit a where a.receipt_id = r.id and a.model = 'rules (filing.ts step 2)';
--   r_mt9vq0tb_l6xlt  Uber EUR 47.18 Aug 26 (KAI book)  → duplicate of r_mtconh9n_7455n (billed KAI-2026-08)
--   r_mt8n4od6_adax3  Conrad Pune INR 177,736.62         → duplicate of r_mtd09qar4_kuipf (Hilton Conrad Pune USD 1,861.97, billed)
--   r_msyr5kok_lnnn8  JW Marriott INR 22,420             → duplicate of r_mtd05erc2_31mka (Marriott USD 234.87, billed)
--                     (both INR folios convert at the same card rate, 95.46 INR/USD)
--   r_ms0ivst4_4lfl8  HotelTonight EUR 873 (Moxy Frankfurt, Sep 7; prepaid Jul 24) → KAI book
