-- 2026-11-13 Home page switch (Admin → Settings → Home page).
-- 'pitch'  = logged-out home page is the pitch to businesses (default while
--            VaiBook signs up businesses), with a "Find a business" link.
-- 'search' = the customer search home page.
-- The app already defaults to 'pitch' when this column doesn't exist, so
-- this only adds the admin switch.
alter table public.platform_settings
  add column if not exists home_mode text not null default 'pitch'
  check (home_mode in ('pitch', 'search'));
