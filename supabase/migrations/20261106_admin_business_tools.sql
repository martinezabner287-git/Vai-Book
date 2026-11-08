-- STATUS: tested on a local Postgres; waiting for Abner's OK to apply to the live database.
-- 2026-11-06: Admin → Providers "Manage" panel.
-- Quick stats, contact, badges, prices, hours, photo and modules for any
-- business — every function checks is_current_user_admin() first.

alter table public.provider_profiles add column if not exists is_verified boolean not null default false;

-- 3. Quick stats + owner contact for every business, in one call.
create or replace function public.admin_provider_overview()
returns table (provider_id uuid, owner_email text, owner_last_login timestamptz,
               bookings_this_month int, bookings_total int, last_booking_at timestamptz,
               last_payment_at timestamptz, last_payment_amount numeric, last_payment_status text)
language plpgsql security definer set search_path to 'public', 'auth' as $$
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query
  select p.id,
         a.email::text,
         a.last_sign_in_at,
         (select count(*)::int from bookings b where b.provider_id = p.id
            and b.booking_date >= date_trunc('month', (now() at time zone 'America/Belize'))::date
            and b.status not in ('cancelled', 'rejected')),
         (select count(*)::int from bookings b where b.provider_id = p.id and b.status not in ('cancelled', 'rejected')),
         (select max(b.created_at) from bookings b where b.provider_id = p.id),
         pay.submitted_at, pay.amount, pay.status
    from provider_profiles p
    left join auth.users a on a.id = p.user_id
    left join lateral (select pp.submitted_at, pp.amount, pp.status from provider_payments pp
                        where pp.provider_id = p.id order by pp.submitted_at desc limit 1) pay on true;
end $$;

-- 6. Badges.
create or replace function public.admin_set_provider_badges(p_provider_id uuid, p_verified boolean default null,
                                                            p_founding boolean default null, p_featured boolean default null)
returns provider_profiles language plpgsql security definer set search_path to 'public' as $$
declare r provider_profiles;
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  update provider_profiles set
    is_verified = coalesce(p_verified, is_verified),
    founding_partner = coalesce(p_founding, founding_partner),
    is_featured = coalesce(p_featured, is_featured)
  where id = p_provider_id returning * into r;
  return r;
end $$;

-- 5. Photo (admin uploads it to their own folder, then points the business at it).
create or replace function public.admin_set_provider_photo(p_provider_id uuid, p_url text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if p_url is not null and p_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/provider-photos/' then
    raise exception 'BAD_URL';
  end if;
  update provider_profiles set profile_photo_url = p_url where id = p_provider_id;
end $$;

-- 5. Services incl. paused ones (customers only ever see active ones).
create or replace function public.admin_list_provider_services(p_provider_id uuid)
returns setof services language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query select * from services where provider_id = p_provider_id order by is_addon, created_at;
end $$;

create or replace function public.admin_update_service(p_service_id uuid, p_price numeric default null,
                                                       p_duration_min int default null, p_is_active boolean default null)
returns services language plpgsql security definer set search_path to 'public' as $$
declare r services;
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if p_price is not null and p_price < 0 then raise exception 'BAD_PRICE'; end if;
  if p_duration_min is not null and p_duration_min <= 0 then raise exception 'BAD_DURATION'; end if;
  update services set
    price = coalesce(p_price, price),
    duration_min = coalesce(p_duration_min, duration_min),
    is_active = coalesce(p_is_active, is_active)
  where id = p_service_id returning * into r;
  return r;
end $$;

-- 5. Opening hours: p_days = [{day_of_week, is_open, open_time, close_time}, …]
create or replace function public.admin_set_working_hours(p_provider_id uuid, p_days jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare d jsonb;
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  for d in select * from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) loop
    insert into working_hours (provider_id, day_of_week, is_open, open_time, close_time)
    values (p_provider_id, (d->>'day_of_week')::int, coalesce((d->>'is_open')::boolean, false),
            nullif(d->>'open_time', '')::time, nullif(d->>'close_time', '')::time)
    on conflict (provider_id, day_of_week) do update
      set is_open = excluded.is_open, open_time = excluded.open_time, close_time = excluded.close_time;
  end loop;
end $$;

-- Extras: read + flip a business's modules.
create or replace function public.admin_get_feature_overrides(p_provider_id uuid)
returns setof provider_feature_overrides language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query select * from provider_feature_overrides where provider_id = p_provider_id;
end $$;

create or replace function public.admin_set_feature_override(p_provider_id uuid, p_feature text, p_enabled boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  insert into provider_feature_overrides (provider_id, feature_key, enabled, updated_at)
  values (p_provider_id, p_feature, p_enabled, now())
  on conflict (provider_id, feature_key) do update set enabled = excluded.enabled, updated_at = now();
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_provider_overview()', 'admin_set_provider_badges(uuid,boolean,boolean,boolean)',
    'admin_set_provider_photo(uuid,text)', 'admin_list_provider_services(uuid)',
    'admin_update_service(uuid,numeric,integer,boolean)', 'admin_set_working_hours(uuid,jsonb)',
    'admin_get_feature_overrides(uuid)', 'admin_set_feature_override(uuid,text,boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
