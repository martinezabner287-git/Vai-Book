-- VaiBook — automatic downgrade for non-payment (2026-10-30)
-- Due date passes → 7-day grace (everything still works) → plan drops to
-- Starter overnight. Skipped while a payment is waiting for admin review.
-- Data is never touched; only paid features switch off (the existing
-- feature triggers do that when plan becomes 'starter'), and staff logins
-- are paused and come back automatically when the plan is restored.

alter table public.provider_profiles
  add column if not exists downgraded_at timestamptz,
  add column if not exists downgraded_from_plan text;
alter table public.provider_staff
  add column if not exists paused_for_nonpayment boolean not null default false;

create or replace function public.plan_display_name(p text) returns text
language sql immutable as $$ select case p when 'pro' then 'Solo' when 'business' then 'Team' else 'Free' end $$;

-- Belize "today"
create or replace function public.belize_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'America/Belize')::date
$$;

-- Restoring a paid plan (payment confirmed, or admin restore) clears the
-- downgrade markers and reactivates staff that were paused by it.
create or replace function public.trg_restore_after_downgrade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.plan, 'starter') in ('pro', 'business')
     and coalesce(old.plan, 'starter') not in ('pro', 'business')
     and old.downgraded_at is not null then
    update provider_profiles set downgraded_at = null, downgraded_from_plan = null where id = new.id;
    if new.plan = 'business' then
      update provider_staff set is_active = true, paused_for_nonpayment = false
       where provider_id = new.id and paused_for_nonpayment;
    end if;
    if new.user_id is not null then
      insert into notifications (user_id, title, body, type)
      values (new.user_id, 'Your ' || plan_display_name(new.plan) || ' plan is back ✅',
              'Thanks for your payment — all your ' || plan_display_name(new.plan) || ' features are switched back on.',
              'billing_restored');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists restore_after_downgrade on public.provider_profiles;
create trigger restore_after_downgrade after update of plan on public.provider_profiles
  for each row execute function public.trg_restore_after_downgrade();

-- Daily job: reminders before/after the due date, then the downgrade.
create or replace function public.run_billing_enforcement()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := belize_today();
  r record;
  v_kind text; v_title text; v_body text;
  v_downgraded int := 0;
  v_plan_name text;
  v_pay_by text;
begin
  for r in
    select p.id, p.user_id, p.plan, p.next_payment_due_date as due, p.business_name,
           exists (select 1 from provider_payments pp where pp.provider_id = p.id and pp.status = 'pending') as has_pending
      from provider_profiles p
     where p.plan in ('pro', 'business')
       and not coalesce(p.is_trial, false)
       and p.next_payment_due_date is not null
  loop
    v_plan_name := plan_display_name(r.plan);
    v_pay_by := to_char(r.due + 7, 'FMMon FMDD');
    v_kind := null;

    if r.due < v_today - 7 then
      -- Grace is over.
      if r.has_pending then
        continue;                         -- waiting on admin review: never punish for that
      end if;
      update provider_profiles
         set plan = 'starter', downgraded_at = now(), downgraded_from_plan = r.plan
       where id = r.id;
      update provider_staff set is_active = false, paused_for_nonpayment = true
       where provider_id = r.id and is_active;
      v_downgraded := v_downgraded + 1;
      if r.user_id is not null then
        insert into notifications (user_id, title, body, type)
        values (r.user_id, 'Your ' || v_plan_name || ' plan is paused',
                'We didn''t receive your payment, so your account moved to the free plan. Your bookings, clients and history are all safe. Pay anytime in Billing to switch ' || v_plan_name || ' back on.',
                'billing_downgraded');
      end if;
      continue;
    elsif r.due = v_today + 3 then
      v_kind := 'billing_due_3d';
      v_title := 'Your ' || v_plan_name || ' payment is due in 3 days';
      v_body := 'Due ' || to_char(r.due, 'FMMon FMDD') || '. Pay in Billing to keep your ' || v_plan_name || ' features.';
    elsif r.due = v_today + 1 then
      v_kind := 'billing_due_1d';
      v_title := 'Your ' || v_plan_name || ' payment is due tomorrow';
      v_body := 'Pay in Billing to keep your ' || v_plan_name || ' features without interruption.';
    elsif r.due = v_today - 1 and not r.has_pending then
      v_kind := 'billing_overdue';
      v_title := 'Payment overdue';
      v_body := 'Your ' || v_plan_name || ' payment is overdue. Pay by ' || v_pay_by || ' to keep your ' || v_plan_name || ' features.';
    elsif r.due = v_today - 5 and not r.has_pending then
      v_kind := 'billing_last_call';
      v_title := '2 days left to keep ' || v_plan_name;
      v_body := 'Pay by ' || v_pay_by || ' or your account moves to the free plan. Your data stays safe either way.';
    end if;

    if v_kind is not null and r.user_id is not null
       and not exists (select 1 from notifications n where n.user_id = r.user_id and n.type = v_kind
                         and n.created_at > now() - interval '5 days') then
      insert into notifications (user_id, title, body, type) values (r.user_id, v_title, v_body, v_kind);
    end if;
  end loop;
  return v_downgraded;
end $$;
revoke execute on function public.run_billing_enforcement() from public, anon, authenticated;
revoke execute on function public.trg_restore_after_downgrade() from public, anon, authenticated;

-- Admin: give a business more time (moves the due date, so the grace moves too).
create or replace function public.admin_extend_payment_due(p_provider_id uuid, p_days integer default 7)
returns provider_profiles language plpgsql security definer set search_path = public as $$
declare result provider_profiles; v_days int := greatest(1, least(coalesce(p_days, 7), 60));
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED: admin only'; end if;
  update provider_profiles
     set next_payment_due_date = greatest(coalesce(next_payment_due_date, belize_today()), belize_today() - 7) + v_days
   where id = p_provider_id and plan in ('pro', 'business') and not coalesce(is_trial, false)
  returning * into result;
  if result.id is null then raise exception 'NOT_ON_PAID_PLAN'; end if;
  return result;
end $$;

-- Admin: switch a downgraded business back on now, with 7 days to pay.
create or replace function public.admin_restore_downgraded_plan(p_provider_id uuid, p_days integer default 7)
returns provider_profiles language plpgsql security definer set search_path = public as $$
declare result provider_profiles; v_plan text; v_days int := greatest(1, least(coalesce(p_days, 7), 60));
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED: admin only'; end if;
  select downgraded_from_plan into v_plan from provider_profiles where id = p_provider_id and downgraded_at is not null;
  if v_plan is null then raise exception 'NOT_DOWNGRADED'; end if;
  update provider_profiles set plan = v_plan, is_trial = false where id = p_provider_id;
  -- sync_plan_billing_cycle sets a 30-day due date on plan change; give them p_days instead.
  update provider_profiles set next_payment_due_date = belize_today() + v_days
   where id = p_provider_id returning * into result;
  return result;
end $$;
revoke execute on function public.admin_extend_payment_due(uuid, integer) from public, anon;
revoke execute on function public.admin_restore_downgraded_plan(uuid, integer) from public, anon;
grant execute on function public.admin_extend_payment_due(uuid, integer) to authenticated;
grant execute on function public.admin_restore_downgraded_plan(uuid, integer) to authenticated;

-- Run daily at 07:10 UTC (1:10 AM Belize).
select cron.unschedule(jobid) from cron.job where jobname = 'vaibook-billing-enforcement';
select cron.schedule('vaibook-billing-enforcement', '10 7 * * *', 'select public.run_billing_enforcement();');
