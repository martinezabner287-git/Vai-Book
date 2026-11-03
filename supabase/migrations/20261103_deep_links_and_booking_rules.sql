-- 2026-11-03 Booking links, add-ons, per-service rules, plan limits.
-- Applied live as two migrations: deep_links_schema, booking_rules_per_staff_service_hours.

-- ── Part 1: deep_links_schema ───────────────────────────────────────────
-- Short IDs (slugs), add-ons, per-service hours and daily limits, plan caps and allowances.
create or replace function public.slugify(p text) returns text language sql immutable as $$
  select nullif(left(trim(both '-' from regexp_replace(lower(translate(coalesce(p, ''),
    'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^a-z0-9]+', '-', 'g')), 40), '')
$$;

alter table public.services add column if not exists slug text;
alter table public.services add column if not exists is_addon boolean not null default false;
alter table public.services add column if not exists addon_for uuid[];
alter table public.services add column if not exists avail_from time;
alter table public.services add column if not exists avail_until time;
alter table public.services add column if not exists daily_limit integer;
alter table public.membership_plans add column if not exists slug text;
alter table public.membership_plans add column if not exists max_members integer;
alter table public.membership_plans add column if not exists allowances jsonb;
alter table public.provider_profiles add column if not exists slug text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'services_slug_format') then
    alter table public.services add constraint services_slug_format check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 40);
    alter table public.services add constraint services_daily_limit_check check (daily_limit is null or daily_limit between 1 and 500);
    alter table public.services add constraint services_avail_check check (avail_from is null or avail_until is null or avail_from < avail_until);
    alter table public.membership_plans add constraint plans_slug_format check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 40);
    alter table public.membership_plans add constraint plans_max_members_check check (max_members is null or max_members between 1 and 10000);
    alter table public.membership_plans add constraint plans_allowances_check check (allowances is null or (jsonb_typeof(allowances) = 'array' and jsonb_array_length(allowances) <= 10));
    alter table public.provider_profiles add constraint provider_slug_format check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40);
  end if;
end $$;
create unique index if not exists services_provider_slug_uq on public.services (provider_id, slug) where slug is not null;
create unique index if not exists plans_provider_slug_uq on public.membership_plans (provider_id, slug) where slug is not null;
create unique index if not exists provider_slug_uq on public.provider_profiles (slug) where slug is not null;

grant select (slug, is_addon, addon_for, avail_from, avail_until, daily_limit) on public.services to anon, authenticated;
grant insert (slug, is_addon, addon_for, avail_from, avail_until, daily_limit), update (slug, is_addon, addon_for, avail_from, avail_until, daily_limit) on public.services to authenticated;
grant select (slug, max_members, allowances) on public.membership_plans to anon, authenticated;
grant insert (slug, max_members, allowances), update (slug, max_members, allowances) on public.membership_plans to authenticated;
grant select (slug) on public.provider_profiles to anon, authenticated;
grant update (slug) on public.provider_profiles to authenticated;

create or replace function public.trg_fill_item_slug() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; cand text; i int := 1;
begin
  if new.slug is not null then
    new.slug := slugify(new.slug);
  end if;
  if new.slug is null then
    base := coalesce(slugify(new.name), 'item');
    cand := base;
    while exists (select 1 from services where provider_id = new.provider_id and slug = cand and id <> new.id)
       or exists (select 1 from membership_plans where provider_id = new.provider_id and slug = cand and id <> new.id) loop
      i := i + 1; cand := left(base, 36) || '-' || i;
    end loop;
    new.slug := cand;
  elsif exists (select 1 from services where provider_id = new.provider_id and slug = new.slug and id <> new.id)
     or exists (select 1 from membership_plans where provider_id = new.provider_id and slug = new.slug and id <> new.id) then
    raise exception 'SLUG_TAKEN: "%" is already used by another service or plan', new.slug using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists fill_service_slug on public.services;
create trigger fill_service_slug before insert or update of slug, name on public.services for each row execute function public.trg_fill_item_slug();
drop trigger if exists fill_plan_slug on public.membership_plans;
create trigger fill_plan_slug before insert or update of slug, name on public.membership_plans for each row execute function public.trg_fill_item_slug();

create or replace function public.trg_fill_provider_slug() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; cand text; i int := 1;
begin
  if new.slug is not null then new.slug := slugify(new.slug); end if;
  if new.slug is not null and length(new.slug) < 3 then new.slug := null; end if;
  if new.slug is null and (tg_op = 'INSERT' or old.slug is null) then
    base := coalesce(slugify(new.business_name), 'business');
    if length(base) < 3 then base := base || '-bz'; end if;
    cand := base;
    while exists (select 1 from provider_profiles where slug = cand and id <> new.id) loop
      i := i + 1; cand := left(base, 36) || '-' || i;
    end loop;
    new.slug := cand;
  elsif new.slug is null then
    new.slug := old.slug;
  elsif exists (select 1 from provider_profiles where slug = new.slug and id <> new.id) then
    raise exception 'SLUG_TAKEN: "%" is already used by another business', new.slug using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists fill_provider_slug on public.provider_profiles;
create trigger fill_provider_slug before insert or update of slug, business_name on public.provider_profiles for each row execute function public.trg_fill_provider_slug();

update public.services set slug = null where slug is null;
update public.membership_plans set slug = null where slug is null;
update public.provider_profiles set slug = null where slug is null;

create or replace function public.provider_id_for(p_key text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from provider_profiles
   where is_active is not false and (slug = lower(p_key) or id::text = lower(p_key))
   limit 1
$$;
grant execute on function public.provider_id_for(text) to anon, authenticated;

create or replace function public.provider_capacity(p_provider_id uuid) returns integer
language sql stable security definer set search_path = public as $$
  select greatest(1, (select count(*) from provider_staff where provider_id = p_provider_id and coalesce(is_active, true) and not coalesce(paused_for_nonpayment, false)))::int
$$;
grant execute on function public.provider_capacity(uuid) to anon, authenticated;

-- ── Part 2: booking_rules_per_staff_service_hours ──────────────────────
-- create_booking_safe: one client at a time per team member (auto-assigns a
-- free one), the service's own hours (SERVICE_HOURS), a daily limit
-- (DAILY_FULL), and add-ons can't be booked alone (ADDON_NEEDS_MAIN).
drop function if exists public.create_booking_safe(text, uuid, uuid, uuid, date, time without time zone, numeric, numeric, text, integer);

create or replace function public.create_booking_safe(p_order_number text, p_customer_id uuid, p_provider_id uuid, p_service_id uuid, p_booking_date date, p_booking_time time without time zone, p_total_amount numeric, p_downpayment_amount numeric, p_notes text, p_party_size integer default 1, p_staff_id uuid default null)
returns setof bookings language plpgsql security definer set search_path = public as $function$
declare
  v_duration integer; v_end_time time; v_overlap int; v_cap int; v_staff uuid := p_staff_id; v_mine int;
  v_service services%rowtype; v_provider provider_profiles%rowtype;
  v_total numeric; v_deposit numeric; v_member boolean := false;
  v_party integer := least(greatest(coalesce(p_party_size, 1), 1), 10);
  v_today date := (now() at time zone 'America/Belize')::date;
  v_class boolean; v_taken integer; v_day int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHORIZED: please log in to book' using errcode = 'P0001';
  end if;
  if p_customer_id is distinct from auth.uid() and not is_current_user_admin() then
    raise exception 'NOT_AUTHORIZED: you can only book for your own account' using errcode = 'P0001';
  end if;
  select * into v_provider from provider_profiles where id = p_provider_id;
  if v_provider.id is null or v_provider.is_active is false then
    raise exception 'PROVIDER_UNAVAILABLE: this business is not taking bookings right now' using errcode = 'P0001';
  end if;
  select * into v_service from services where id = p_service_id and provider_id = p_provider_id;
  if v_service.id is null or v_service.is_active is false then
    raise exception 'SERVICE_UNAVAILABLE: this service is not available' using errcode = 'P0001';
  end if;
  if coalesce(v_service.is_addon, false) then
    raise exception 'ADDON_NEEDS_MAIN: add this to a main service' using errcode = 'P0001';
  end if;
  if p_booking_date < v_today then
    raise exception 'PAST_DATE: please pick a date from today onward' using errcode = 'P0001';
  end if;
  v_duration := coalesce(v_service.duration_min, 30);
  v_end_time := p_booking_time + make_interval(mins => v_duration);
  if (v_service.avail_from is not null and p_booking_time < v_service.avail_from)
     or (v_service.avail_until is not null and v_end_time > v_service.avail_until) then
    raise exception 'SERVICE_HOURS: this service isn''t offered at that time' using errcode = 'P0001';
  end if;
  if v_staff is not null and not exists (select 1 from provider_staff where id = v_staff and provider_id = p_provider_id and coalesce(is_active, true)) then
    v_staff := null;
  end if;
  v_class := coalesce(v_service.capacity, 1) > 1;
  v_total := coalesce(v_service.price, 0) * v_party;
  if coalesce(p_total_amount, 0) < v_total and v_total > 0 then
    select exists (
      select 1 from customer_memberships m join membership_plans pl on pl.id = m.plan_id
      where m.customer_id = p_customer_id and m.provider_id = p_provider_id and m.status = 'active'
        and (m.period_end is null or m.period_end >= v_today)
        and (pl.included_service_ids is null or cardinality(pl.included_service_ids) = 0 or p_service_id = any(pl.included_service_ids))
    ) into v_member;
    if v_member then v_total := coalesce(v_service.price, 0) * (v_party - 1); end if;
  end if;
  if v_total > 0 and lastmin_deal_applies(v_provider, p_booking_date, p_booking_time) then
    v_total := round(v_total * (100 - v_provider.lastmin_deal_pct) / 100.0, 2);
  end if;
  if v_provider.downpayment_required and v_total > 0 then
    v_deposit := round(v_total * coalesce(v_provider.downpayment_pct, 50) / 100.0, 2);
  else
    v_deposit := null;
  end if;
  perform pg_advisory_xact_lock(hashtext(p_provider_id::text || p_booking_date::text));

  if v_service.daily_limit is not null then
    select count(*) into v_day from bookings b
     where b.provider_id = p_provider_id and b.booking_date = p_booking_date
       and b.status in ('pending', 'awaiting_payment', 'confirmed', 'completed')
       and (b.service_id = p_service_id or (b.service_ids is not null and jsonb_typeof(b.service_ids) = 'array' and b.service_ids ? p_service_id::text));
    if v_day >= v_service.daily_limit then
      raise exception 'DAILY_FULL: this service is fully booked for that day' using errcode = 'P0001';
    end if;
  end if;

  v_cap := provider_capacity(p_provider_id);
  select count(*), count(*) filter (where b.staff_id = v_staff) into v_overlap, v_mine
    from bookings b left join services s on s.id = b.service_id
   where b.provider_id = p_provider_id and b.booking_date = p_booking_date
     and b.status in ('pending','awaiting_payment','confirmed')
     and b.booking_time < v_end_time
     and (b.booking_time + make_interval(mins => coalesce(b.total_duration_min, s.duration_min, 30))) > p_booking_time
     and not (v_class and b.service_id = p_service_id and b.booking_time = p_booking_time
              and coalesce(jsonb_array_length(b.service_ids), 0) <= 1);
  if v_overlap >= v_cap or (v_staff is not null and v_mine > 0) then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end if;
  if v_staff is null and v_cap > 1 then
    select st.id into v_staff from provider_staff st
     where st.provider_id = p_provider_id and coalesce(st.is_active, true) and not coalesce(st.paused_for_nonpayment, false)
       and not exists (select 1 from bookings b left join services s on s.id = b.service_id
                        where b.staff_id = st.id and b.booking_date = p_booking_date
                          and b.status in ('pending','awaiting_payment','confirmed')
                          and b.booking_time < v_end_time
                          and (b.booking_time + make_interval(mins => coalesce(b.total_duration_min, s.duration_min, 30))) > p_booking_time)
     order by st.created_at limit 1;
  end if;
  if v_class then
    select coalesce(sum(greatest(coalesce(b.party_size, 1), 1)), 0) into v_taken
      from bookings b
     where b.provider_id = p_provider_id and b.booking_date = p_booking_date
       and b.service_id = p_service_id and b.booking_time = p_booking_time
       and b.status in ('pending','awaiting_payment','confirmed');
    if v_taken + v_party > v_service.capacity then
      raise exception 'CLASS_FULL: only % spot(s) left', greatest(v_service.capacity - v_taken, 0) using errcode = 'P0001';
    end if;
  end if;
  return query
  insert into bookings (order_number, customer_id, provider_id, service_id, booking_date, booking_time, status, total_amount, downpayment_amount, payment_status, notes, party_size, staff_id)
  values (p_order_number, p_customer_id, p_provider_id, p_service_id, p_booking_date, p_booking_time,
          case when v_deposit is null then 'confirmed' else 'pending' end, v_total, v_deposit, 'unpaid', p_notes, v_party, v_staff)
  returning *;
end;
$function$;
grant execute on function public.create_booking_safe(text, uuid, uuid, uuid, date, time without time zone, numeric, numeric, text, integer, uuid) to authenticated;

-- Add-ons ride on a main booking: extra price and minutes, re-checked.
create or replace function public.attach_booking_addons(p_booking_id uuid, p_addon_ids uuid[])
returns bookings language plpgsql security definer set search_path = public as $$
declare b bookings; v_host services; v_add_price numeric := 0; v_add_min int := 0; v_n int; v_end time; v_cap int; v_overlap int; v_prov provider_profiles;
begin
  select * into b from bookings where id = p_booking_id for update;
  if b.id is null then raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001'; end if;
  if b.customer_id is distinct from auth.uid() then raise exception 'NOT_YOUR_BOOKING' using errcode = 'P0001'; end if;
  if b.created_at < now() - interval '10 minutes' then raise exception 'TOO_LATE' using errcode = 'P0001'; end if;
  if p_addon_ids is null or cardinality(p_addon_ids) = 0 then return b; end if;
  select * into v_host from services where id = b.service_id;
  select count(*), coalesce(sum(price), 0), coalesce(sum(duration_min), 0) into v_n, v_add_price, v_add_min
    from services a
   where a.id = any(p_addon_ids) and a.provider_id = b.provider_id and a.is_addon and a.is_active is not false
     and (a.addon_for is null or cardinality(a.addon_for) = 0 or b.service_id = any(a.addon_for));
  if v_n <> cardinality(p_addon_ids) then raise exception 'ADDON_NOT_ALLOWED: one of these add-ons doesn''t go with this service' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(b.provider_id::text || b.booking_date::text));
  v_end := b.booking_time + make_interval(mins => coalesce(v_host.duration_min, 30) + v_add_min);
  if v_host.avail_until is not null and v_end > v_host.avail_until then
    raise exception 'SERVICE_HOURS: with the add-ons this runs past the service''s hours' using errcode = 'P0001';
  end if;
  if v_add_min > 0 then
    v_cap := provider_capacity(b.provider_id);
    select count(*) into v_overlap from bookings o left join services s on s.id = o.service_id
     where o.provider_id = b.provider_id and o.booking_date = b.booking_date and o.id <> b.id
       and o.status in ('pending','awaiting_payment','confirmed')
       and o.booking_time < v_end
       and (o.booking_time + make_interval(mins => coalesce(o.total_duration_min, s.duration_min, 30))) > b.booking_time;
    if v_overlap >= v_cap or (b.staff_id is not null and exists (
         select 1 from bookings o left join services s on s.id = o.service_id
          where o.staff_id = b.staff_id and o.id <> b.id and o.booking_date = b.booking_date
            and o.status in ('pending','awaiting_payment','confirmed') and o.booking_time < v_end
            and (o.booking_time + make_interval(mins => coalesce(o.total_duration_min, s.duration_min, 30))) > b.booking_time)) then
      raise exception 'SLOT_TAKEN' using errcode = 'P0001';
    end if;
  end if;
  select * into v_prov from provider_profiles where id = b.provider_id;
  update bookings
     set service_ids = to_jsonb(array_prepend(b.service_id, p_addon_ids)),
         total_duration_min = coalesce(v_host.duration_min, 30) + v_add_min,
         total_amount = coalesce(total_amount, 0) + v_add_price * greatest(coalesce(party_size, 1), 1),
         downpayment_amount = case when downpayment_amount is null then null
           else round((coalesce(total_amount, 0) + v_add_price * greatest(coalesce(party_size, 1), 1)) * coalesce(v_prov.downpayment_pct, 50) / 100.0, 2) end
   where id = b.id returning * into b;
  return b;
end $$;
revoke all on function public.attach_booking_addons(uuid, uuid[]) from public, anon;
grant execute on function public.attach_booking_addons(uuid, uuid[]) to authenticated;

drop function if exists public.get_busy_windows_v2(uuid, date);
create or replace function public.get_busy_windows_v2(p_provider_id uuid, p_date date)
returns table (start_time time, end_time time, service_id uuid, spots integer, capacity integer, staff_id uuid, service_ids jsonb)
language sql stable security definer set search_path = public as $$
  select b.booking_time,
         (b.booking_time + make_interval(mins => coalesce(b.total_duration_min, s.duration_min, 30))),
         b.service_id,
         greatest(coalesce(b.party_size, 1), 1),
         coalesce(s.capacity, 1),
         b.staff_id,
         b.service_ids
    from bookings b
    left join services s on s.id = b.service_id
   where b.provider_id = p_provider_id
     and b.booking_date = p_date
     and b.status in ('pending', 'awaiting_payment', 'confirmed');
$$;
grant execute on function public.get_busy_windows_v2(uuid, date) to anon, authenticated;

-- Membership plans: a member limit, and per-service allowances such as
-- "1 sauna a week" or "2 deep tissue per period".
create or replace function public.subscribe_to_membership_plan(p_plan_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_plan membership_plans; v_existing uuid; v_new_id uuid; v_count int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_plan from membership_plans where id = p_plan_id and is_active = true;
  if v_plan.id is null then raise exception 'Plan not found or inactive'; end if;
  select id into v_existing from customer_memberships
   where customer_id = auth.uid() and provider_id = v_plan.provider_id and status in ('pending', 'active') limit 1;
  if v_existing is not null then raise exception 'ALREADY_SUBSCRIBED'; end if;
  if v_plan.max_members is not null then
    perform pg_advisory_xact_lock(hashtext('plan' || p_plan_id::text));
    select count(*) into v_count from customer_memberships where plan_id = p_plan_id and status in ('pending', 'active');
    if v_count >= v_plan.max_members then raise exception 'PLAN_FULL: this plan has no spots left' using errcode = 'P0001'; end if;
  end if;
  insert into customer_memberships (customer_id, provider_id, plan_id, status)
  values (auth.uid(), v_plan.provider_id, p_plan_id, 'pending') returning id into v_new_id;
  return v_new_id;
end $$;

create or replace function public.plan_spots_left(p_plan_id uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case when mp.max_members is null then null
              else greatest(0, mp.max_members - (select count(*) from customer_memberships cm where cm.plan_id = mp.id and cm.status in ('pending', 'active')))::int end
    from membership_plans mp where mp.id = p_plan_id
$$;
grant execute on function public.plan_spots_left(uuid) to anon, authenticated;

create or replace function public.redeem_membership_visit_for(p_membership_id uuid, p_service_id uuid, p_date date)
returns boolean language plpgsql security definer set search_path = public as $$
declare cm customer_memberships; mp membership_plans; a jsonb; v_used int; v_from date; v_to date;
begin
  select * into cm from customer_memberships where id = p_membership_id for update;
  if cm.id is null or cm.customer_id <> auth.uid() then raise exception 'Not authorized'; end if;
  if cm.status <> 'active' or (cm.period_end is not null and cm.period_end < (now() at time zone 'America/Belize')::date) then return false; end if;
  select * into mp from membership_plans where id = cm.plan_id;
  if mp.included_service_ids is not null and cardinality(mp.included_service_ids) > 0 and not (p_service_id = any(mp.included_service_ids)) then return false; end if;
  if mp.visit_limit is not null and cm.visits_used >= mp.visit_limit then return false; end if;
  for a in select * from jsonb_array_elements(coalesce(mp.allowances, '[]'::jsonb)) loop
    if (a ->> 'service_id') = p_service_id::text then
      if a ->> 'per' = 'week' then
        v_from := date_trunc('week', coalesce(p_date, current_date))::date; v_to := v_from + 6;
      else
        v_from := coalesce(cm.period_start, '-infinity'::date); v_to := coalesce(cm.period_end, 'infinity'::date);
      end if;
      select count(*) into v_used from bookings b
       where b.customer_id = cm.customer_id and b.provider_id = cm.provider_id and b.covered_by_membership
         and b.service_id = p_service_id and b.booking_date between v_from and v_to
         and b.status in ('pending', 'awaiting_payment', 'confirmed', 'completed');
      if v_used >= coalesce((a ->> 'count')::int, 0) then return false; end if;
    end if;
  end loop;
  update customer_memberships set visits_used = visits_used + 1 where id = p_membership_id;
  return true;
end $$;
grant execute on function public.redeem_membership_visit_for(uuid, uuid, date) to authenticated;
