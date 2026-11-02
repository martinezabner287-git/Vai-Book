-- 2026-11-02 — Business portal colour (applied live as provider_portal_theme).
alter table public.provider_profiles add column if not exists portal_theme text not null default 'violet';
alter table public.provider_profiles add constraint provider_portal_theme_check
  check (portal_theme in ('violet', 'ocean', 'jungle', 'caribbean', 'sunset', 'rose', 'gold', 'midnight'));
grant select (portal_theme) on public.provider_profiles to authenticated;
grant update (portal_theme) on public.provider_profiles to authenticated;
