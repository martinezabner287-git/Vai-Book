-- 2026-10-31 — Admin controls: settings the admin can change for everyone
-- without a code change. Prices, free-plan cap, trial and grace days,
-- payment details, site banner, broadcasts, customers (block), reviews
-- (hide), service categories, districts and morning verses.

-- ── 1. Platform settings (one row) ────────────────────────────────────
create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  solo_monthly numeric(10,2) not null default 69.90 check (solo_monthly >= 0),
  solo_six_month numeric(10,2) not null default 417.90 check (solo_six_month >= 0),
  team_monthly numeric(10,2) not null default 174.90 check (team_monthly >= 0),
  team_six_month numeric(10,2) not null default 1047.90 check (team_six_month >= 0),
  team_free_seats integer not null default 2 check (team_free_seats between 0 and 100),
  team_seat_price numeric(10,2) not null default 20 check (team_seat_price >= 0),
  setup_fee numeric(10,2) not null default 99 check (setup_fee >= 0),
  free_booking_cap integer not null default 30 check (free_booking_cap between 1 and 100000),
  free_cap_enforced boolean not null default false,
  trial_days integer not null default 14 check (trial_days between 1 and 365),
  grace_days integer not null default 7 check (grace_days between 3 and 60),
  pay_bank text not null default '' check (length(pay_bank) <= 400),
  pay_digiwallet text not null default '' check (length(pay_digiwallet) <= 400),
  pay_ekyash text not null default '' check (length(pay_ekyash) <= 400),
  banner_on boolean not null default false,
  banner_kind text not null default 'info' check (banner_kind in ('info', 'warning', 'promo')),
  banner_audience text not null default 'everyone' check (banner_audience in ('everyone', 'customers', 'businesses')),
  banner_en text not null default '' check (length(banner_en) <= 300),
  banner_es text not null default '' check (length(banner_es) <= 300),
  banner_link text not null default '' check (banner_link = '' or banner_link ~* '^(https://|#)'),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.platform_settings (id) values (true) on conflict do nothing;
alter table public.platform_settings enable row level security;
drop policy if exists "anyone reads platform settings" on public.platform_settings;
create policy "anyone reads platform settings" on public.platform_settings for select to anon, authenticated using (true);
drop policy if exists "admins update platform settings" on public.platform_settings;
create policy "admins update platform settings" on public.platform_settings for update to authenticated
  using (is_current_user_admin()) with check (is_current_user_admin());
grant select on public.platform_settings to anon, authenticated;
grant update on public.platform_settings to authenticated;

create or replace function public.trg_stamp_platform_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := true;
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by);
  return new;
end $$;
drop trigger if exists stamp_platform_settings on public.platform_settings;
create trigger stamp_platform_settings before update on public.platform_settings
  for each row execute function public.trg_stamp_platform_settings();

-- ── 2. Trials use the trial length from settings ──────────────────────
create or replace function public.platform_trial_days() returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select trial_days from platform_settings where id), 14)
$$;

create or replace function public.admin_start_provider_trial(p_provider_id uuid)
returns provider_profiles language plpgsql security definer set search_path = public as $$
declare result provider_profiles;
begin
  if not exists (select 1 from admins where email = auth.jwt()->>'email') then raise exception 'NOT_AUTHORIZED'; end if;
  perform set_config('vaibook.trusted_rpc', 'true', true);
  update provider_profiles
     set plan = 'pro', is_trial = true, trial_ends_at = now() + make_interval(days => platform_trial_days()),
         trial_used = true, next_payment_due_date = null
   where id = p_provider_id returning * into result;
  if result.id is null then raise exception 'PROVIDER_NOT_FOUND'; end if;
  return result;
end $$;

create or replace function public.start_solo_trial(p_provider_id uuid)
returns provider_profiles language plpgsql security definer set search_path = public as $$
declare result provider_profiles;
begin
  if auth.uid() is null or auth.uid() is distinct from (select user_id from provider_profiles where id = p_provider_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  perform set_config('vaibook.trusted_rpc', 'true', true);
  update provider_profiles
     set plan = 'pro', is_trial = true, trial_ends_at = now() + make_interval(days => platform_trial_days()),
         trial_used = true, next_payment_due_date = null
   where id = p_provider_id and coalesce(plan, 'starter') = 'starter' and coalesce(trial_used, false) = false
  returning * into result;
  if result.id is null then raise exception 'TRIAL_NOT_ELIGIBLE'; end if;
  return result;
end $$;

-- ── 3. Billing grace period from settings ─────────────────────────────
create or replace function public.run_billing_enforcement()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := belize_today();
  v_grace int := coalesce((select grace_days from platform_settings where id), 7);
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
    v_pay_by := to_char(r.due + v_grace, 'FMMon FMDD');
    v_kind := null;

    if r.due < v_today - v_grace then
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
    elsif r.due = v_today - (v_grace - 2) and not r.has_pending then
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

-- ── 4. Blocked customers ──────────────────────────────────────────────
create table if not exists public.blocked_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text check (length(reason) <= 300),
  blocked_at timestamptz not null default now(),
  blocked_by text
);
alter table public.blocked_customers enable row level security;
drop policy if exists "admins read blocks" on public.blocked_customers;
create policy "admins read blocks" on public.blocked_customers for select to authenticated using (is_current_user_admin());

create or replace function public.is_user_blocked(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_uid is not null and exists (select 1 from blocked_customers where user_id = p_uid)
$$;
revoke all on function public.is_user_blocked(uuid) from public, anon;
grant execute on function public.is_user_blocked(uuid) to authenticated;

-- ── 5. Booking guard: blocked customers + free-plan monthly cap ───────
create or replace function public.trg_booking_platform_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s platform_settings;
  v_plan text; v_owner uuid; v_is_business boolean; v_used int;
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

  select * into s from platform_settings where id;
  if s.id is not null and s.free_cap_enforced and v_plan = 'starter' then
    select count(*) into v_used from bookings b
     where b.provider_id = new.provider_id
       and (b.created_at at time zone 'America/Belize') >= date_trunc('month', now() at time zone 'America/Belize')
       and b.status not in ('cancelled', 'rejected');
    if v_used >= s.free_booking_cap then
      raise exception 'STARTER_LIMIT_REACHED: this business reached its free plan limit for this month' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists booking_platform_rules on public.bookings;
create trigger booking_platform_rules before insert on public.bookings
  for each row execute function public.trg_booking_platform_rules();

-- ── 6. Customers list + block/unblock (admin) ─────────────────────────
create or replace function public.admin_list_customers(p_search text default '', p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := '%' || lower(coalesce(trim(p_search), '')) || '%';
        d text := regexp_replace(coalesce(trim(p_search), ''), '[^0-9]', '', 'g');
        r jsonb;
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED: admin only' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) into r from (
    select jsonb_build_object(
      'id', u.id, 'full_name', u.full_name,
      'phone', coalesce(nullif(u.whatsapp_number, ''), nullif(u.phone, '')),
      'email', case when u.email ilike '%@phone.vaibook.bz' then null else u.email end,
      'created_at', u.created_at,
      'kind', case
         when exists (select 1 from admins a where lower(a.email) = lower(u.email)) then 'admin'
         when exists (select 1 from provider_profiles p where p.user_id = u.id) then 'business'
         when exists (select 1 from provider_staff st where st.user_id = u.id) then 'team'
         else 'customer' end,
      'bookings', (select count(*) from bookings b where b.customer_id = u.id),
      'no_shows', (select count(*) from bookings b where b.customer_id = u.id and b.status = 'no_show'),
      'cancelled', (select count(*) from bookings b where b.customer_id = u.id and b.status = 'cancelled'),
      'last_booking', (select max(b.booking_date) from bookings b where b.customer_id = u.id),
      'reviews', (select count(*) from reviews rv where rv.customer_id = u.id),
      'blocked', bc.user_id is not null, 'block_reason', bc.reason
    ) as x
    from users u left join blocked_customers bc on bc.user_id = u.id
    where q = '%%'
       or lower(coalesce(u.full_name, '')) like q
       or lower(coalesce(u.email, '')) like q
       or (d <> '' and regexp_replace(coalesce(u.whatsapp_number, '') || ' ' || coalesce(u.phone, '') || ' ' || coalesce(u.email, ''), '[^0-9 ]', '', 'g') like '%' || d || '%')
    order by u.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  ) t;
  return r;
end $$;

create or replace function public.admin_set_customer_blocked(p_user_id uuid, p_blocked boolean, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED: admin only' using errcode = 'P0001'; end if;
  if exists (select 1 from users u join admins a on lower(a.email) = lower(u.email) where u.id = p_user_id) then
    raise exception 'CANNOT_BLOCK_ADMIN' using errcode = 'P0001';
  end if;
  if p_blocked then
    insert into blocked_customers (user_id, reason, blocked_by)
    values (p_user_id, nullif(trim(coalesce(p_reason, '')), ''), auth.jwt() ->> 'email')
    on conflict (user_id) do update set reason = excluded.reason, blocked_at = now(), blocked_by = excluded.blocked_by;
  else
    delete from blocked_customers where user_id = p_user_id;
  end if;
  return p_blocked;
end $$;

-- ── 7. Reviews: hide / unhide ─────────────────────────────────────────
alter table public.reviews add column if not exists is_hidden boolean not null default false;
alter table public.reviews add column if not exists hidden_reason text;
alter table public.reviews add column if not exists hidden_at timestamptz;

-- "Anyone can read reviews" (using true) was OR-ed with the hold-privacy
-- policy, which made held reviews readable by everyone. One policy now.
drop policy if exists "Anyone can read reviews" on public.reviews;
drop policy if exists reviews_hold_privacy on public.reviews;
create policy reviews_hold_privacy on public.reviews for select using (
  (not is_hidden and (hold_until is null or hold_until <= now()))
  or customer_id = auth.uid()
  or (not is_hidden and provider_id in (select id from provider_profiles where user_id = auth.uid()))
  or is_current_user_admin()
);

create or replace function public.trg_review_hide_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_current_user_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if is_user_blocked(auth.uid()) then
      raise exception 'ACCOUNT_BLOCKED: this account can''t post reviews' using errcode = 'P0001';
    end if;
    new.is_hidden := false; new.hidden_reason := null; new.hidden_at := null;
  else
    new.is_hidden := old.is_hidden; new.hidden_reason := old.hidden_reason; new.hidden_at := old.hidden_at;
  end if;
  return new;
end $$;
drop trigger if exists review_hide_guard on public.reviews;
create trigger review_hide_guard before insert or update on public.reviews
  for each row execute function public.trg_review_hide_guard();

create or replace function public.admin_list_reviews(p_filter text default 'all', p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED: admin only' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) into r from (
    select jsonb_build_object(
      'id', rv.id, 'rating', rv.rating, 'comment', rv.comment, 'created_at', rv.created_at,
      'is_hidden', rv.is_hidden, 'hidden_reason', rv.hidden_reason,
      'business_name', p.business_name, 'provider_id', rv.provider_id,
      'customer_name', u.full_name, 'customer_id', rv.customer_id
    ) as x
    from reviews rv
    left join provider_profiles p on p.id = rv.provider_id
    left join users u on u.id = rv.customer_id
    where case coalesce(p_filter, 'all')
            when 'hidden' then rv.is_hidden
            when 'low' then rv.rating <= 2
            else true end
    order by rv.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  ) t;
  return r;
end $$;

create or replace function public.admin_set_review_hidden(p_review_id uuid, p_hidden boolean, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED: admin only' using errcode = 'P0001'; end if;
  update reviews
     set is_hidden = p_hidden,
         hidden_reason = case when p_hidden then nullif(trim(coalesce(p_reason, '')), '') end,
         hidden_at = case when p_hidden then now() end
   where id = p_review_id;
  if not found then raise exception 'REVIEW_NOT_FOUND' using errcode = 'P0001'; end if;
  return p_hidden;
end $$;

-- ── 8. Broadcasts (in-app + push to a whole audience) ─────────────────
create table if not exists public.platform_broadcasts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text,
  audience text not null check (audience in ('everyone', 'businesses', 'team', 'customers')),
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 1000),
  recipients integer not null default 0
);
alter table public.platform_broadcasts enable row level security;
drop policy if exists "admins read broadcasts" on public.platform_broadcasts;
create policy "admins read broadcasts" on public.platform_broadcasts for select to authenticated using (is_current_user_admin());

create or replace function public.admin_broadcast(p_audience text, p_title text, p_body text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int; v_title text := trim(coalesce(p_title, '')); v_body text := trim(coalesce(p_body, ''));
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED: admin only' using errcode = 'P0001'; end if;
  if p_audience not in ('everyone', 'businesses', 'team', 'customers') then raise exception 'BAD_AUDIENCE' using errcode = 'P0001'; end if;
  if v_title = '' or v_body = '' then raise exception 'MISSING_TEXT' using errcode = 'P0001'; end if;
  -- One broadcast a minute at most, so a double tap never sends twice.
  if exists (select 1 from platform_broadcasts where created_at > now() - interval '1 minute' and title = v_title) then
    raise exception 'DUPLICATE_BROADCAST' using errcode = 'P0001';
  end if;
  with owners as (select distinct user_id from provider_profiles where user_id is not null),
       staff as (select distinct user_id from provider_staff where user_id is not null and coalesce(is_active, true)),
       targets as (
         select u.id from users u
          where case p_audience
                  when 'everyone' then true
                  when 'businesses' then u.id in (select user_id from owners)
                  when 'team' then u.id in (select user_id from staff)
                  else u.id not in (select user_id from owners) and u.id not in (select user_id from staff)
                end
       ),
       ins as (
         insert into notifications (user_id, title, body, type)
         select id, left(v_title, 120), left(v_body, 1000), 'vaibook_news' from targets
         returning 1
       )
  select count(*) into v_n from ins;
  insert into platform_broadcasts (created_by, audience, title, body, recipients)
  values (auth.jwt() ->> 'email', p_audience, v_title, v_body, v_n);
  return v_n;
end $$;

create or replace function public.admin_broadcast_audience_sizes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED: admin only' using errcode = 'P0001'; end if;
  return (with owners as (select distinct user_id from provider_profiles where user_id is not null),
               staff as (select distinct user_id from provider_staff where user_id is not null and coalesce(is_active, true))
    select jsonb_build_object(
      'everyone', (select count(*) from users),
      'businesses', (select count(*) from users where id in (select user_id from owners)),
      'team', (select count(*) from users where id in (select user_id from staff)),
      'customers', (select count(*) from users where id not in (select user_id from owners) and id not in (select user_id from staff))));
end $$;

-- ── 9. Service categories (what businesses pick + home page tiles) ────
create table if not exists public.service_categories (
  key text primary key check (key ~ '^[a-zA-Z0-9_-]{2,40}$'),
  service_type text not null unique check (length(service_type) between 2 and 60),
  name_en text not null check (length(name_en) between 1 and 60),
  name_es text not null default '' check (length(name_es) <= 60),
  desc_en text not null default '' check (length(desc_en) <= 80),
  desc_es text not null default '' check (length(desc_es) <= 80),
  icon text not null default '✨' check (length(icon) <= 16),
  search_term text not null default '' check (length(search_term) <= 60),
  module_group text not null default 'general',
  show_on_home boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 100
);
insert into public.service_categories (key, service_type, name_en, name_es, desc_en, desc_es, icon, search_term, module_group, show_on_home, sort_order) values
 ('barbers', 'Barber', 'Barbers', 'Barberías', 'Cuts & styles', 'Cortes y estilos', '✂️', 'Barber', 'hair_salon', true, 10),
 ('hairSalons', 'Hair Salon', 'Hair Salons', 'Salones de belleza', 'Color & styling', 'Color y peinado', '💇', 'Hair Salon', 'hair_salon', true, 20),
 ('nailTechs', 'Nail Tech', 'Nail Techs', 'Manicuristas', 'Nails & art', 'Uñas y arte', '💅', 'Nail Tech', 'hair_salon', true, 30),
 ('spas', 'Spa', 'Spas', 'Spas', 'Full-body relaxation', 'Relajación de cuerpo completo', '🧖', 'Spa', 'spa_massage', true, 40),
 ('medSpas', 'Med Spa / Clinic', 'Med Spas', 'Spas médicos', 'Injectables & clinical', 'Inyectables y clínico', '🩺', 'Med Spa', 'med_spa', true, 50),
 ('massage', 'Massage', 'Massage', 'Masajes', 'Therapeutic & relaxation', 'Terapéutico y relajante', '💆', 'Massage', 'spa_massage', true, 60),
 ('skincareFacials', 'Skincare Studio', 'Skincare & Facials', 'Cuidado facial', 'Cleanses & glow-ups', 'Limpiezas y luminosidad', '🧴', 'Skincare', 'spa_massage', true, 70),
 ('hairRemoval', 'Hair Removal Studio', 'Hair Removal', 'Depilación', 'Waxing & laser', 'Cera y láser', '🪒', 'Hair Removal', 'hair_salon', true, 80),
 ('tattooPiercing', 'Tattoo & Piercing Studio', 'Tattoo & Piercing', 'Tatuajes y perforaciones', 'Ink & piercings', 'Tinta y perforaciones', '🖋️', 'Tattoo', 'tattoo_piercing', true, 90),
 ('wellnessCenters', 'Wellness Center', 'Wellness Centers', 'Centros de bienestar', 'Holistic & recovery', 'Holístico y recuperación', '🌿', 'Wellness', 'general', true, 100),
 ('petGrooming', 'Pet Grooming', 'Pet Grooming', 'Estética de mascotas', 'All breeds', 'Todas las razas', '🐾', 'Pet Grooming', 'general', true, 110),
 ('fitnessRecovery', 'Fitness & Recovery', 'Fitness & Recovery', 'Fitness y recuperación', 'Training & recovery', 'Entrenamiento y recuperación', '🏋️', 'Fitness & Recovery', 'general', true, 120),
 ('physicalTherapy', 'Physical Therapy', 'Physical Therapy', 'Fisioterapia', 'Rehab & mobility', 'Rehabilitación y movilidad', '🦵', 'Physical Therapy', 'med_spa', true, 130),
 ('photography', 'Photography', 'Photography', 'Fotografía', 'Shoots & sessions', 'Sesiones de fotos', '📷', 'Photography', 'general', false, 140),
 ('other', 'Other', 'Other', 'Otro', '', '', '✨', 'Other', 'general', false, 999)
on conflict (key) do nothing;
alter table public.service_categories enable row level security;
drop policy if exists "anyone reads categories" on public.service_categories;
create policy "anyone reads categories" on public.service_categories for select to anon, authenticated using (true);
drop policy if exists "admins manage categories" on public.service_categories;
create policy "admins manage categories" on public.service_categories for all to authenticated
  using (is_current_user_admin()) with check (is_current_user_admin());
grant select on public.service_categories to anon, authenticated;
grant insert, update, delete on public.service_categories to authenticated;

-- ── 10. Districts ─────────────────────────────────────────────────────
create table if not exists public.districts (
  name text primary key check (length(name) between 2 and 40),
  is_active boolean not null default true,
  sort_order integer not null default 100
);
insert into public.districts (name, sort_order) values
 ('Belize City', 10), ('Cayo', 20), ('Corozal', 30), ('Orange Walk', 40), ('Stann Creek', 50), ('Toledo', 60)
on conflict (name) do nothing;
alter table public.districts enable row level security;
drop policy if exists "anyone reads districts" on public.districts;
create policy "anyone reads districts" on public.districts for select to anon, authenticated using (true);
drop policy if exists "admins manage districts" on public.districts;
create policy "admins manage districts" on public.districts for all to authenticated
  using (is_current_user_admin()) with check (is_current_user_admin());
grant select on public.districts to anon, authenticated;
grant insert, update, delete on public.districts to authenticated;

-- ── 11. Morning verses: admins can add / edit / remove ────────────────
alter table public.daily_verses alter column theme set default 'business';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'daily_verses_theme_check') then
    alter table public.daily_verses add constraint daily_verses_theme_check check (theme in ('business', 'wealth', 'health', 'others'));
  end if;
end $$;
drop policy if exists "admins manage verses" on public.daily_verses;
create policy "admins manage verses" on public.daily_verses for all to authenticated
  using (is_current_user_admin()) with check (is_current_user_admin());
grant insert, update, delete on public.daily_verses to authenticated;
select setval('public.daily_verses_id_seq', (select coalesce(max(id), 1) from public.daily_verses));
grant usage on sequence public.daily_verses_id_seq to authenticated;

-- ── 12. Admin bookings list (Command Center → Bookings) ───────────────
create or replace function public.admin_list_bookings(p_days integer default 30, p_limit integer default 300)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED: admin only' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) into r from (
    select jsonb_build_object(
      'id', b.id, 'order_number', b.order_number, 'created_at', b.created_at,
      'booking_date', b.booking_date, 'booking_time', b.booking_time, 'status', b.status,
      'total_amount', b.total_amount, 'business_name', p.business_name, 'district', p.district,
      'service_name', s.name, 'customer_name', u.full_name
    ) as x
    from bookings b
    left join provider_profiles p on p.id = b.provider_id
    left join services s on s.id = b.service_id
    left join users u on u.id = b.customer_id
    where p_days is null or b.created_at > now() - make_interval(days => greatest(p_days, 1))
    order by b.created_at desc
    limit least(greatest(coalesce(p_limit, 300), 1), 1000)
  ) t;
  return r;
end $$;

-- ── 13. Command Center stats: MRR from settings, districts from the
-- districts table, hidden reviews left out of the rating. (Full function
-- as applied; see the live definition of admin_platform_stats.)
-- Changes vs. the 2026-10-30 version:
--   'mrr'       uses platform_settings.solo_monthly / team_monthly
--   'districts' lists active rows of public.districts + any district a business uses
--   'reviews' / 'avg_rating' exclude reviews where is_hidden
--   new keys: 'reviews_hidden', 'blocked_customers'
