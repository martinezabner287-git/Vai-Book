-- STATUS: waiting for Abner's OK to apply to the live database.
-- 2026-11-07: "Add a past booking" — a business records visits that already
-- happened (before they used VaiBook, or while they couldn't log in): who,
-- what, when, what they actually paid, and the discount if any. Saved as a
-- completed, paid visit so it counts in Earnings, Clients and the monthly
-- review. Never notifies anyone and never blocks a real future booking.

alter table public.bookings add column if not exists list_price numeric;      -- the service's normal price at the time
alter table public.bookings add column if not exists paid_with text;          -- cash / transfer / card / other
alter table public.bookings add column if not exists entered_later boolean not null default false;

-- Entering a stack of old visits shouldn't trip the "too many walk-ins in 15
-- minutes" spam guard; record_past_booking sets the trusted flag below.
create or replace function public.trg_bookings_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_key text;
begin
  if is_maintenance_mode() or is_site_offline() then
    raise exception 'MAINTENANCE_MODE: new bookings are temporarily paused. Please try again shortly.';
  end if;

  if current_setting('vaibook.trusted_booking_change', true) = '1' then
    return new;
  end if;

  if new.customer_id is not null then
    v_key := coalesce(auth.uid()::text, new.customer_id::text);
    perform enforce_rate_limit('booking_customer', v_key, 8, interval '15 minutes');
  else
    v_key := coalesce(auth.uid()::text, new.provider_id::text, client_ip());
    perform enforce_rate_limit('booking_walkin', v_key, 60, interval '15 minutes');
  end if;

  return new;
end;
$$;

create or replace function public.record_past_booking(
  p_provider_id uuid, p_service_id uuid, p_booking_date date, p_booking_time time,
  p_customer_name text, p_customer_phone text default null,
  p_amount_paid numeric default null, p_paid_with text default null, p_note text default null,
  p_extra_service_ids uuid[] default null)  -- combos: the other services done in the same visit
returns bookings language plpgsql security definer set search_path to 'public' as $$
declare
  v_svc services; v_row bookings; v_paid numeric; v_today date := (now() at time zone 'America/Belize')::date;
  v_month date; v_extra uuid[] := coalesce(p_extra_service_ids, '{}'); v_n int;
  v_list numeric; v_dur int;
begin
  if not (coalesce(is_current_user_admin(), false) or exists (select 1 from provider_profiles where id = p_provider_id and user_id = auth.uid())) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_booking_date is null or p_booking_date > v_today then
    raise exception 'PAST_ONLY: past bookings must be today or earlier' using errcode = 'P0001';
  end if;
  if p_booking_date < v_today - 3650 then
    raise exception 'TOO_OLD' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'NAME_REQUIRED' using errcode = 'P0001';
  end if;
  select * into v_svc from services where id = p_service_id and provider_id = p_provider_id;
  if v_svc.id is null then raise exception 'SERVICE_NOT_FOUND' using errcode = 'P0001'; end if;
  v_extra := array(select distinct x from unnest(v_extra) x where x <> p_service_id);
  select count(*), coalesce(sum(price), 0), coalesce(sum(duration_min), 0) into v_n, v_list, v_dur
    from services where id = any(v_extra) and provider_id = p_provider_id;
  if v_n <> cardinality(v_extra) then raise exception 'SERVICE_NOT_FOUND' using errcode = 'P0001'; end if;
  v_list := coalesce(v_svc.price, 0) + v_list;
  v_dur := coalesce(v_svc.duration_min, 30) + v_dur;
  v_paid := coalesce(p_amount_paid, v_list);
  if v_paid < 0 then raise exception 'BAD_AMOUNT' using errcode = 'P0001'; end if;

  perform set_config('vaibook.trusted_booking_change', '1', true);
  insert into bookings (
    customer_id, provider_id, service_id, service_ids, booking_date, booking_time, total_duration_min,
    total_amount, downpayment_amount, list_price, paid_with, entered_later,
    notes, status, payment_status, walkin_customer_name, walkin_customer_phone,
    created_by_provider, checked_in_at
  ) values (
    null, p_provider_id, p_service_id,
    case when cardinality(v_extra) > 0 then to_jsonb(array_prepend(p_service_id, v_extra)) end,
    p_booking_date, coalesce(p_booking_time, '12:00'), v_dur,
    v_paid, 0, v_list, nullif(trim(coalesce(p_paid_with, '')), ''), true,
    nullif(left(trim(coalesce(p_note, '')), 500), ''), 'completed', 'paid',
    left(trim(p_customer_name), 120), nullif(left(trim(coalesce(p_customer_phone, '')), 40), ''),
    true, (p_booking_date + coalesce(p_booking_time, '12:00')) at time zone 'America/Belize'
  ) returning * into v_row;
  perform set_config('vaibook.trusted_booking_change', '', true);

  -- A month that's already been summed up gets re-summed so Insights and
  -- the monthly review include the visit.
  v_month := date_trunc('month', p_booking_date)::date;
  if v_month < date_trunc('month', v_today)::date then
    perform refresh_provider_monthly_stats(p_provider_id, v_month);
  end if;
  return v_row;
end $$;
revoke all on function public.record_past_booking(uuid, uuid, date, time, text, text, numeric, text, text, uuid[]) from public, anon;
grant execute on function public.record_past_booking(uuid, uuid, date, time, text, text, numeric, text, text, uuid[]) to authenticated;

-- Past visits a business types in don't use up the Free plan's monthly
-- online-booking allowance (only the "and not b.entered_later" line is new).
create or replace function public.trg_booking_platform_rules() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  s platform_settings;
  v_plan text; v_owner uuid; v_is_business boolean; v_used int;
  v_times jsonb; v_cap int;
begin
  if is_current_user_admin() then return new; end if;
  select coalesce(plan, 'starter'), user_id into v_plan, v_owner from provider_profiles where id = new.provider_id;
  v_is_business := auth.uid() is not null and (auth.uid() = v_owner
    or exists (select 1 from provider_staff st where st.provider_id = new.provider_id and st.user_id = auth.uid()));
  -- A business entering its own walk-in or manual booking is never blocked.
  if v_is_business then return new; end if;

  if is_user_blocked(coalesce(new.customer_id, auth.uid())) then
    raise exception 'ACCOUNT_BLOCKED: this account can''t make bookings' using errcode = 'P0001';
  end if;

  -- Group classes with set times only take bookings at those times.
  select class_times, coalesce(capacity, 1) into v_times, v_cap from services where id = new.service_id;
  if v_cap > 1 and v_times is not null and jsonb_array_length(v_times) > 0
     and not (v_times ? to_char(new.booking_time, 'HH24:MI')) then
    raise exception 'SLOT_TAKEN: this class doesn''t run at that time' using errcode = 'P0001';
  end if;

  select * into s from platform_settings where id;
  if s.id is not null and s.free_cap_enforced and v_plan = 'starter' then
    select count(*) into v_used from bookings b
     where b.provider_id = new.provider_id
       and (b.created_at at time zone 'America/Belize') >= date_trunc('month', now() at time zone 'America/Belize')
       and b.status not in ('cancelled', 'rejected')
       and not b.entered_later;
    if v_used >= s.free_booking_cap then
      raise exception 'STARTER_LIMIT_REACHED: this business reached its free plan limit for this month' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
