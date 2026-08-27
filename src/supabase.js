-- ============================================================
-- VaiBook: provider subscription/plan payments
-- ============================================================
-- Run this in Supabase → SQL Editor. Safe to re-run.
--
-- Lets a Pro/Business provider upload proof they paid their monthly
-- VaiBook plan fee (bank transfer receipt, same idea as the existing
-- customer booking-deposit receipt upload), and lets admin review and
-- confirm/reject each submission — separate from anything a customer
-- pays for a booking.
--
-- Mirrors the existing admin_list_providers / admin_update_provider
-- pattern: SECURITY DEFINER RPCs that check the caller's email against
-- the `admins` table server-side, so the client never needs elevated
-- privileges of its own.

create table if not exists provider_payments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles(id) on delete cascade,
  plan text not null,
  amount numeric not null,
  period_label text not null,
  receipt_url text,
  status text not null default 'pending',
  admin_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

alter table provider_payments enable row level security;

drop policy if exists "providers insert own payments" on provider_payments;
create policy "providers insert own payments"
on provider_payments
for insert
to authenticated
with check (
  provider_id in (select id from provider_profiles where user_id = auth.uid())
);

drop policy if exists "providers read own payments" on provider_payments;
create policy "providers read own payments"
on provider_payments
for select
to authenticated
using (
  provider_id in (select id from provider_profiles where user_id = auth.uid())
);
-- No update/delete policy for providers on purpose — once submitted, only
-- an admin (via the SECURITY DEFINER RPC below) can change its status.

-- Admin: list every submission, newest first, with the provider's business
-- name attached so the admin panel doesn't need a second round trip.
create or replace function admin_list_provider_payments()
returns table (
  id uuid,
  provider_id uuid,
  business_name text,
  plan text,
  amount numeric,
  period_label text,
  receipt_url text,
  status text,
  admin_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from admins where email = auth.email()) then
    raise exception 'Not authorized';
  end if;

  return query
    select pp.id, pp.provider_id, prov.business_name, pp.plan, pp.amount, pp.period_label,
           pp.receipt_url, pp.status, pp.admin_note, pp.submitted_at, pp.reviewed_at, pp.reviewed_by
    from provider_payments pp
    join provider_profiles prov on prov.id = pp.provider_id
    order by pp.submitted_at desc;
end;
$$;

grant execute on function admin_list_provider_payments() to authenticated;

-- Admin: confirm or reject one submission.
create or replace function admin_review_provider_payment(p_payment_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from admins where email = auth.email()) then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('confirmed', 'rejected', 'pending') then
    raise exception 'Invalid status';
  end if;

  update provider_payments
  set status = p_status,
      admin_note = coalesce(p_note, admin_note),
      reviewed_at = now(),
      reviewed_by = auth.email()
  where id = p_payment_id;
end;
$$;

grant execute on function admin_review_provider_payment(uuid, text, text) to authenticated;

-- Receipts reuse the existing `vaibook` storage bucket (same one booking
-- deposit receipts already use), under a provider-payments/ prefix — no
-- new bucket or storage policy needed.
