-- 2026-11-07 APPLIED to the live database after Abner said "apply all"; verified with a rolled-back test.
-- 2026-11-06: "Send a temporary password" from Admin → Messages.
-- An admin sets a one-time temporary password on someone's account (email or
-- WhatsApp-number login). The account is flagged so the next time they log
-- in, VaiBook makes them choose their own password before anything else.
-- Works for accounts that only ever used Google too (they then also log in
-- with email + password, which is the only business login now).

alter table public.users add column if not exists must_change_password boolean not null default false;

create or replace function public.admin_set_temp_password(p_login text)
returns jsonb language plpgsql security definer
set search_path to 'public', 'extensions', 'auth' as $$
declare
  v_login text := lower(trim(coalesce(p_login, '')));
  v_digits text; v_email text; v_uid uuid; v_name text; v_temp text := 'VB';
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(8); i int;
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if v_login like '%@%' then
    v_email := v_login;
  else
    v_digits := regexp_replace(v_login, '\D', '', 'g');
    if left(v_digits, 2) = '00' then v_digits := substr(v_digits, 3); end if;
    if length(v_digits) = 7 then v_digits := '501' || v_digits; end if;
    if length(v_digits) < 7 then raise exception 'NO_ACCOUNT'; end if;
    v_email := 'p' || v_digits || '@phone.vaibook.bz';
  end if;
  select id into v_uid from auth.users where lower(email) = v_email limit 1;
  if v_uid is null then raise exception 'NO_ACCOUNT'; end if;
  for i in 0..7 loop
    v_temp := v_temp || substr(v_chars, (get_byte(v_bytes, i) % length(v_chars)) + 1, 1);
    if i = 3 then v_temp := v_temp || '-'; end if;
  end loop;
  update auth.users
     set encrypted_password = extensions.crypt(v_temp, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = v_uid;
  update public.users set must_change_password = true where id = v_uid;
  select full_name into v_name from public.users where id = v_uid;
  return jsonb_build_object(
    'name', coalesce(nullif(trim(v_name), ''), split_part(v_email, '@', 1)),
    'email', case when v_email like '%@phone.vaibook.bz' then null else v_email end,
    'phone', case when v_email like '%@phone.vaibook.bz' then v_digits else null end,
    'temp', v_temp);
end $$;
revoke all on function public.admin_set_temp_password(text) from public, anon;
grant execute on function public.admin_set_temp_password(text) to authenticated;

-- The signed-in person clears their own flag after choosing a new password.
create or replace function public.clear_must_change_password()
returns void language sql security definer set search_path to 'public' as $$
  update public.users set must_change_password = false where id = auth.uid();
$$;
revoke all on function public.clear_must_change_password() from public, anon;
grant execute on function public.clear_must_change_password() to authenticated;
