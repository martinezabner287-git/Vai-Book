-- 2026-11-06 NOT YET APPLIED — waiting for Abner's OK.
-- Dry-run tested (rolled back) against the live database: closes three ways a
-- taken time could be booked twice.
--  1) A customer could edit their own booking's time directly (bypassing checks).
--  2) A business adding a walk-in could land it on a time already booked online.
--  3) A business moving a booking could put it on a taken time.

-- Last line of defence on every insert/update, under the same per-business-
-- per-day lock the booking functions use, so two people tapping the same
-- slot at once can't both win. One client per team member; a group class
-- shares its start time up to its spots.
create or replace function public.trg_booking_no_overlap() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_dur int; v_end time; v_cap int; v_overlap int; v_class boolean; v_svc services; v_taken int;
begin
  if new.status not in ('pending', 'awaiting_payment', 'confirmed') or new.booking_date is null or new.booking_time is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.status in ('pending', 'awaiting_payment', 'confirmed')
     and new.booking_date is not distinct from old.booking_date
     and new.booking_time is not distinct from old.booking_time
     and new.total_duration_min is not distinct from old.total_duration_min
     and new.service_id is not distinct from old.service_id
     and new.staff_id is not distinct from old.staff_id
     and new.party_size is not distinct from old.party_size then
    return new; -- nothing about its time changed
  end if;
  perform pg_advisory_xact_lock(hashtext(new.provider_id::text || new.booking_date::text));
  select * into v_svc from services where id = new.service_id;
  v_dur := coalesce(new.total_duration_min, v_svc.duration_min, 30);
  v_end := new.booking_time + make_interval(mins => v_dur);
  v_class := coalesce(v_svc.capacity, 1) > 1 and coalesce(jsonb_array_length(new.service_ids), 0) <= 1;
  v_cap := provider_capacity(new.provider_id);
  select count(*) into v_overlap
    from bookings b left join services s on s.id = b.service_id
   where b.provider_id = new.provider_id and b.booking_date = new.booking_date and b.id <> new.id
     and b.status in ('pending', 'awaiting_payment', 'confirmed')
     and b.booking_time < v_end
     and (b.booking_time + make_interval(mins => coalesce(b.total_duration_min, s.duration_min, 30))) > new.booking_time
     and not (v_class and b.service_id = new.service_id and b.booking_time = new.booking_time
              and coalesce(jsonb_array_length(b.service_ids), 0) <= 1);
  if v_overlap >= v_cap then
    raise exception 'SLOT_TAKEN: that time is already booked' using errcode = 'P0001';
  end if;
  if new.staff_id is not null and exists (
       select 1 from bookings b left join services s on s.id = b.service_id
        where b.staff_id = new.staff_id and b.id <> new.id and b.booking_date = new.booking_date
          and b.status in ('pending', 'awaiting_payment', 'confirmed') and b.booking_time < v_end
          and (b.booking_time + make_interval(mins => coalesce(b.total_duration_min, s.duration_min, 30))) > new.booking_time) then
    raise exception 'SLOT_TAKEN: that team member is already booked then' using errcode = 'P0001';
  end if;
  if v_class then
    select coalesce(sum(greatest(coalesce(b.party_size, 1), 1)), 0) into v_taken from bookings b
     where b.provider_id = new.provider_id and b.booking_date = new.booking_date and b.id <> new.id
       and b.service_id = new.service_id and b.booking_time = new.booking_time
       and b.status in ('pending', 'awaiting_payment', 'confirmed');
    if v_taken + greatest(coalesce(new.party_size, 1), 1) > v_svc.capacity then
      raise exception 'CLASS_FULL: only % spot(s) left', greatest(v_svc.capacity - v_taken, 0) using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists zz_booking_no_overlap on public.bookings;
create trigger zz_booking_no_overlap before insert or update on public.bookings
  for each row execute function public.trg_booking_no_overlap();

-- Customers can't move their own booking's time, service, length or party
-- size by editing it directly — only through the checked steps below.
create or replace function public.trg_booking_customer_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_email text := auth.jwt() ->> 'email';
begin
  if auth.uid() is null then return new; end if;
  if current_setting('vaibook.trusted_booking_change', true) = '1' then return new; end if;
  if v_email is not null and exists (select 1 from admins where email = v_email) then return new; end if;
  if exists (select 1 from provider_profiles p where p.id = new.provider_id and p.user_id = auth.uid()) then return new; end if;
  if new.staff_id is not null and exists (select 1 from provider_staff s where s.id = new.staff_id and s.user_id = auth.uid()) then return new; end if;
  -- Anyone else is the customer.
  new.total_amount := old.total_amount; new.downpayment_amount := old.downpayment_amount; new.provider_id := old.provider_id;
  new.booking_date := old.booking_date; new.booking_time := old.booking_time;
  new.service_id := old.service_id; new.service_ids := old.service_ids;
  new.total_duration_min := old.total_duration_min; new.party_size := old.party_size;
  new.customer_id := old.customer_id;
  if new.staff_id is distinct from old.staff_id then
    if not (old.staff_id is null and old.status = 'pending' and new.staff_id is not null
            and exists (select 1 from provider_staff s where s.id = new.staff_id and s.provider_id = old.provider_id and coalesce(s.is_active, true))) then
      new.staff_id := old.staff_id;
    end if;
  end if;
  if new.covered_by_membership is distinct from old.covered_by_membership then
    if not (coalesce(new.covered_by_membership, false) = true
            and exists (select 1 from customer_memberships m where m.customer_id = auth.uid() and m.provider_id = old.provider_id and m.status = 'active')) then
      new.covered_by_membership := old.covered_by_membership;
    end if;
  end if;
  if new.status is distinct from old.status and new.status <> 'cancelled' then new.status := old.status; end if;
  return new;
end $$;

-- Checked step 1: accepting a reschedule the business proposed.
create or replace function public.confirm_booking_reschedule(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if b.customer_id is distinct from auth.uid() then raise exception 'NOT_YOUR_BOOKING'; end if;
  if b.pending_reschedule_date is null or b.pending_reschedule_time is null then raise exception 'NO_PENDING_RESCHEDULE'; end if;
  perform set_config('vaibook.trusted_booking_change', '1', true);
  update bookings
     set booking_date = b.pending_reschedule_date, booking_time = b.pending_reschedule_time,
         pending_reschedule_date = null, pending_reschedule_time = null
   where id = p_booking_id; -- zz_booking_no_overlap raises SLOT_TAKEN if taken
  perform set_config('vaibook.trusted_booking_change', '', true);
end $$;

-- Checked step 2: add-ons right after booking (also fixes add-on prices,
-- which the customer guard was silently resetting).
create or replace function public.attach_booking_addons(p_booking_id uuid, p_addon_ids uuid[])
returns bookings language plpgsql security definer set search_path = public as $$
declare b bookings; v_host services; v_add_price numeric := 0; v_add_min int := 0; v_n int; v_end time; v_prov provider_profiles;
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
  v_end := b.booking_time + make_interval(mins => coalesce(v_host.duration_min, 30) + v_add_min);
  if v_host.avail_until is not null and v_end > v_host.avail_until then
    raise exception 'SERVICE_HOURS: with the add-ons this runs past the service''s hours' using errcode = 'P0001';
  end if;
  select * into v_prov from provider_profiles where id = b.provider_id;
  perform set_config('vaibook.trusted_booking_change', '1', true);
  update bookings
     set service_ids = to_jsonb(array_prepend(b.service_id, p_addon_ids)),
         total_duration_min = coalesce(v_host.duration_min, 30) + v_add_min,
         total_amount = coalesce(total_amount, 0) + v_add_price * greatest(coalesce(party_size, 1), 1),
         downpayment_amount = case when downpayment_amount is null then null
           else round((coalesce(total_amount, 0) + v_add_price * greatest(coalesce(party_size, 1), 1)) * coalesce(v_prov.downpayment_pct, 50) / 100.0, 2) end
   where id = b.id returning * into b; -- zz_booking_no_overlap re-checks the longer booking
  perform set_config('vaibook.trusted_booking_change', '', true);
  return b;
end $$;
revoke all on function public.attach_booking_addons(uuid, uuid[]) from public, anon;
grant execute on function public.attach_booking_addons(uuid, uuid[]) to authenticated;
