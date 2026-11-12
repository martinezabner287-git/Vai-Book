-- 2026-11-12 WhatsApp codes for customer phone accounts.
--
-- Abner's rule: a customer's WhatsApp number must be confirmed with a code
-- sent to that WhatsApp before the account can be used. Confirmed once
-- (when the account is created, or on the first login of an older account);
-- after that, number + password like before. Forgot password = a new code.
--
-- NOT APPLIED until Abner says "apply phone codes".
-- Everything stays OFF (platform_settings.phone_codes_on = false) until the
-- Meta WhatsApp sender is set up; until then the app behaves exactly as now.

-- 1. Switch + verified flag -------------------------------------------------
alter table public.platform_settings add column if not exists phone_codes_on boolean not null default false;
alter table public.users add column if not exists phone_verified_at timestamptz;

-- Nobody can mark themselves verified from the app: only the database's own
-- functions (running as the owner) or the service role may change it.
-- (The app's role has no column grant on phone_verified_at for UPDATE/INSERT
-- either; this trigger is a second lock.)
-- Also, once codes are on, a phone account's contact number is always its
-- confirmed login number, so nobody can verify their own number and then
-- show businesses someone else's.
-- Login digits for an account, if it's a phone account (needs auth.users).
create or replace function public.phone_login_digits(p_uid uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select substring(lower(email) from '^p([0-9]+)@phone\.vaibook\.bz$') from auth.users where id = p_uid and p_uid = auth.uid()
$$;
revoke all on function public.phone_login_digits(uuid) from public, anon;
grant execute on function public.phone_login_digits(uuid) to authenticated;

create or replace function public.trg_users_phone_verified_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_d text;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.phone_verified_at := null;
  elsif new.phone_verified_at is distinct from old.phone_verified_at then
    new.phone_verified_at := old.phone_verified_at;
  end if;
  if public.phone_codes_enabled() then
    v_d := public.phone_login_digits(new.id);
    if v_d is not null then
      new.whatsapp_number := case when length(v_d) = 10 and left(v_d, 3) = '501'
        then '+501 ' || substr(v_d, 4, 3) || '-' || substr(v_d, 7) else '+' || v_d end;
      new.phone := new.whatsapp_number;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists users_phone_verified_guard on public.users;
create trigger users_phone_verified_guard before insert or update on public.users
  for each row execute function public.trg_users_phone_verified_guard();
-- Businesses can see the "verified" mark on their own customers (row access
-- is still limited by the existing users policies).
grant select (phone_verified_at) on public.users to authenticated;

-- 2. Codes table (only reachable through the functions below) ------------------
create table if not exists public.phone_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,               -- digits only, e.g. 5016221234
  purpose text not null check (purpose in ('verify', 'reset')),
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists phone_codes_lookup on public.phone_codes (phone, purpose, created_at desc);
alter table public.phone_codes enable row level security;
revoke all on public.phone_codes from anon, authenticated;

-- 3. Helpers -------------------------------------------------------------------
create or replace function public.phone_digits(p_phone text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when length(d) = 7 then '501' || d
    else d end
  from (select case when left(x, 2) = '00' then substr(x, 3) else x end as d
          from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as x) a) b
$$;

create or replace function public.phone_codes_enabled()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select phone_codes_on from platform_settings limit 1), false)
$$;
grant execute on function public.phone_codes_enabled() to anon, authenticated;

-- What the app needs to know about the signed-in person.
create or replace function public.my_phone_status()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'enabled', public.phone_codes_enabled(),
    'phone_account', coalesce(lower(auth.email()) like '%@phone.vaibook.bz', false),
    'verified', exists (select 1 from users u where u.id = auth.uid() and u.phone_verified_at is not null)
  )
$$;
grant execute on function public.my_phone_status() to authenticated;

-- 4. Issue a code (called only by the phone-code edge function) ---------------
-- Returns jsonb { ok, code, phone } or { error }.
create or replace function public.phone_code_issue(p_phone text, p_purpose text, p_user uuid, p_ip text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_phone text := public.phone_digits(p_phone);
  v_email text;
  v_uid uuid;
  v_code text;
begin
  if p_purpose not in ('verify', 'reset') then return jsonb_build_object('error', 'BAD_PURPOSE'); end if;
  if length(v_phone) < 10 or length(v_phone) > 15 then return jsonb_build_object('error', 'BAD_PHONE'); end if;
  v_email := 'p' || v_phone || '@phone.vaibook.bz';
  select id into v_uid from auth.users where lower(email) = v_email limit 1;

  if p_purpose = 'verify' then
    -- You can only confirm the number your own account is under.
    if p_user is null or v_uid is distinct from p_user then return jsonb_build_object('error', 'NOT_YOUR_NUMBER'); end if;
  else
    if v_uid is null then return jsonb_build_object('error', 'NO_ACCOUNT'); end if;
  end if;

  begin
    perform enforce_rate_limit('phone_code_15m', v_phone, 3, interval '15 minutes');
    perform enforce_rate_limit('phone_code_day', v_phone, 8, interval '1 day');
    perform enforce_rate_limit('phone_code_ip', coalesce(nullif(p_ip, ''), 'unknown'), 20, interval '1 hour');
  exception when others then
    return jsonb_build_object('error', 'TOO_MANY');
  end;

  -- Older unused codes for this number stop working.
  update phone_codes set consumed_at = now()
   where phone = v_phone and purpose = p_purpose and consumed_at is null;

  v_code := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into phone_codes (phone, purpose, code_hash, expires_at)
  values (v_phone, p_purpose, crypt(v_code, gen_salt('bf')), now() + interval '10 minutes');
  return jsonb_build_object('ok', true, 'code', v_code, 'phone', v_phone);
end $$;
revoke all on function public.phone_code_issue(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.phone_code_issue(text, text, uuid, text) to service_role;

-- 5. Check a code (called only by the phone-code edge function) ----------------
-- verify: marks the caller's number confirmed.
-- reset:  sets the new password and marks the number confirmed (whoever owns
--         the WhatsApp owns the account — this is also how a real owner takes
--         back a number someone else registered).
create or replace function public.phone_code_check(p_phone text, p_purpose text, p_code text, p_user uuid, p_new_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_phone text := public.phone_digits(p_phone);
  v_email text := 'p' || public.phone_digits(p_phone) || '@phone.vaibook.bz';
  v_uid uuid;
  r phone_codes;
begin
  select * into r from phone_codes
   where phone = v_phone and purpose = p_purpose and consumed_at is null
   order by created_at desc limit 1
   for update;
  if r.id is null or r.expires_at < now() then return jsonb_build_object('error', 'CODE_EXPIRED'); end if;
  if r.attempts >= 5 then
    update phone_codes set consumed_at = now() where id = r.id;
    return jsonb_build_object('error', 'TOO_MANY_TRIES');
  end if;
  if r.code_hash <> crypt(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), r.code_hash) then
    update phone_codes set attempts = attempts + 1 where id = r.id;
    return jsonb_build_object('error', 'WRONG_CODE', 'tries_left', 4 - r.attempts);
  end if;

  select id into v_uid from auth.users where lower(email) = v_email limit 1;
  if v_uid is null then return jsonb_build_object('error', 'NO_ACCOUNT'); end if;

  if p_purpose = 'verify' then
    if p_user is distinct from v_uid then return jsonb_build_object('error', 'NOT_YOUR_NUMBER'); end if;
  else
    if char_length(coalesce(p_new_password, '')) < 8 then return jsonb_build_object('error', 'PASSWORD_TOO_SHORT'); end if;
    update auth.users set encrypted_password = crypt(p_new_password, gen_salt('bf')), updated_at = now() where id = v_uid;
    -- Log out every other phone signed in to this account.
    delete from auth.refresh_tokens where user_id = v_uid::text;
    delete from auth.sessions where user_id = v_uid;
  end if;

  update phone_codes set consumed_at = now() where id = r.id;
  insert into users (id, whatsapp_number, phone, oauth_provider, phone_verified_at)
  values (v_uid,
          case when length(v_phone) = 10 and left(v_phone, 3) = '501' then '+501 ' || substr(v_phone, 4, 3) || '-' || substr(v_phone, 7) else '+' || v_phone end,
          case when length(v_phone) = 10 and left(v_phone, 3) = '501' then '+501 ' || substr(v_phone, 4, 3) || '-' || substr(v_phone, 7) else '+' || v_phone end,
          'phone', now())
  on conflict (id) do update set phone_verified_at = now();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.phone_code_check(text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.phone_code_check(text, text, text, uuid, text) to service_role;

-- 6. Server-side rule: an unconfirmed phone account can't book --------------------
-- (so skipping the app's screens gets nobody anywhere).
create or replace function public.trg_booking_requires_verified_phone()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.phone_codes_enabled()
     and new.customer_id is not null and new.customer_id = auth.uid()
     and lower(coalesce(auth.email(), '')) like '%@phone.vaibook.bz'
     and not exists (select 1 from users where id = auth.uid() and phone_verified_at is not null) then
    raise exception 'PHONE_NOT_VERIFIED: confirm your WhatsApp number with the code we send you before booking.';
  end if;
  return new;
end $$;
drop trigger if exists booking_requires_verified_phone on public.bookings;
create trigger booking_requires_verified_phone before insert on public.bookings
  for each row execute function public.trg_booking_requires_verified_phone();

-- 7. Admin can turn it on/off (Admin → Settings) ------------------------------------
create or replace function public.admin_set_phone_codes(p_on boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  update platform_settings set phone_codes_on = p_on, updated_at = now() where id = true;
  return p_on;
end $$;
revoke all on function public.admin_set_phone_codes(boolean) from public, anon;
grant execute on function public.admin_set_phone_codes(boolean) to authenticated;
