-- 2026-11-03 Payment receipts, refund proofs and payment proofs: only the
-- people on that booking/payment (and admins) can open them. Every upload the
-- app makes already has its own narrow insert policy, so the catch-all ones go.
drop policy if exists "vaibook public read" on storage.objects;
drop policy if exists "vaibook authenticated write" on storage.objects;
drop policy if exists "vaibook authenticated update" on storage.objects;
-- Unused 'receipts' bucket: any business could read every file in it.
drop policy if exists "receipts providers read" on storage.objects;
