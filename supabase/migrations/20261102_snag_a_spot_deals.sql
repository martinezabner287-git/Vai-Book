-- 2026-11-02 — Snag a Spot: last-minute deals (applied live as snag_a_spot_deals).
alter table public.provider_profiles add column if not exists lastmin_deal_pct integer not null default 0;
alter table public.provider_profiles add constraint provider_lastmin_deal_check check (lastmin_deal_pct between 0 and 50);
grant select (lastmin_deal_pct) on public.provider_profiles to anon, authenticated;
grant update (lastmin_deal_pct) on public.provider_profiles to authenticated;
alter table public.platform_settings add column if not exists snag_include_free boolean not null default true;

-- % off for a paid business's bookings that start within the next 3 hours (Belize time).
create or replace function public.lastmin_deal_applies(p_provider provider_profiles, p_date date, p_time time)
returns boolean language sql stable set search_path = public as $$
  select coalesce(p_provider.lastmin_deal_pct, 0) > 0
     and coalesce(p_provider.plan, 'starter') in ('pro', 'business')
     and p_date = (now() at time zone 'America/Belize')::date
     and (p_date + p_time) >= (now() at time zone 'America/Belize') - interval '5 minutes'
     and (p_date + p_time) <= (now() at time zone 'America/Belize') + interval '3 hours'
$$;
-- create_booking_safe: after the membership check, applies the deal:
--   if v_total > 0 and lastmin_deal_applies(v_provider, p_booking_date, p_booking_time) then
--     v_total := round(v_total * (100 - v_provider.lastmin_deal_pct) / 100.0, 2);
--   end if;
-- (full body as applied live)
