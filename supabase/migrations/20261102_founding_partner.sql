-- 2026-11-02 — Founding Partner badge (applied live as founding_partner_badge).
alter table public.platform_settings add column if not exists founding_partner_limit integer not null default 50;
alter table public.platform_settings add constraint platform_settings_founding_limit_check check (founding_partner_limit between 0 and 10000);
alter table public.provider_profiles add column if not exists founding_partner boolean not null default false;
grant select (founding_partner) on public.provider_profiles to anon, authenticated;
update public.provider_profiles set founding_partner = true where not founding_partner;  -- everyone already on VaiBook

create or replace function public.trg_founding_partner() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_count int;
begin
  if tg_op = 'INSERT' then
    select coalesce(founding_partner_limit, 50) into v_limit from platform_settings where id;
    select count(*) into v_count from provider_profiles where founding_partner;
    new.founding_partner := v_count < coalesce(v_limit, 50);
  elsif new.founding_partner is distinct from old.founding_partner and not is_current_user_admin() then
    new.founding_partner := old.founding_partner;
  end if;
  return new;
end $$;
drop trigger if exists founding_partner on public.provider_profiles;
create trigger founding_partner before insert or update of founding_partner on public.provider_profiles
  for each row execute function public.trg_founding_partner();
