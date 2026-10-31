-- VaiBook launch blockers (2026-10-30). Applied to production via the
-- Supabase MCP as: launch_fix1_booking_requires_login,
-- launch_fix2_email_recipient_check, launch_fix3_server_side_booking_alerts.
-- launch_fix4_client_errors is below (crash log table).
--
-- fix1: create_booking_safe requires auth.uid(); execute revoked from
--       PUBLIC/anon on create_booking_safe, create_vip_booking_safe,
--       attach_booking_services, get_provider_notify_email; and from all
--       client roles on _provider_audience, _rebook_due, enforce_rate_limit.
-- fix2: email_recipient_allowed(caller, to) — service_role only; used by
--       the send-email edge function (deployed v3, verify_jwt=false, does
--       its own auth + rate limiting).
-- fix3: trg_notify_provider_booking — AFTER INSERT (new booking) and AFTER
--       UPDATE OF status (customer cancel) on bookings → notifications row
--       for the business (push follows via trg_notification_push).

create table if not exists public.client_errors (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  message text check (char_length(message) <= 1000),
  stack text check (char_length(stack) <= 4000),
  url text check (char_length(url) <= 500),
  user_agent text check (char_length(user_agent) <= 300),
  app_version text check (char_length(app_version) <= 40)
);
alter table public.client_errors enable row level security;
drop policy if exists "anyone can report a crash" on public.client_errors;
create policy "anyone can report a crash" on public.client_errors for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
drop policy if exists "admins read crashes" on public.client_errors;
create policy "admins read crashes" on public.client_errors for select to authenticated using (is_current_user_admin());
grant insert on public.client_errors to anon, authenticated;
grant select on public.client_errors to authenticated;
grant usage on sequence public.client_errors_id_seq to anon, authenticated;
create or replace function public.trg_client_errors_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform enforce_rate_limit('client_error', coalesce(auth.uid()::text, client_ip()), 20, interval '10 minutes');
  return new;
end $$;
revoke execute on function public.trg_client_errors_guard() from public, anon, authenticated;
drop trigger if exists guard_client_errors on public.client_errors;
create trigger guard_client_errors before insert on public.client_errors
  for each row execute function public.trg_client_errors_guard();

-- review_after_appointment_and_client_errors (applied): before_review_insert
-- now also allows a review once a confirmed booking's end time has passed
-- (Belize time); no_show/cancelled/rejected stay ineligible. The
-- client_errors block above was applied in the same migration.

-- vaiplaza_store_link (applied): provider_profiles.vaiplaza_url + column
-- grants + trg_vaiplaza_url_guard (Solo/Team only; https on vaiplaza or
-- vaibuyandsell .com/.bz).

-- admin_platform_stats (applied): admin-only jsonb of platform totals by role,
-- money/bookings, 30-day sign-ups and per-district counts (customers counted
-- in the district where they book most).
