-- STATUS: waiting for Abner's OK to apply to the live database.
-- 2026-11-07:
-- 1) Applications carry a photo/PDF of the business's trade license.
--    Stored privately in the vaibook bucket under
--    trade-licenses/<applicant's user id>/…; only that person can upload
--    there, and only VaiBook admins can open it (existing admin read rule).
-- 2) The 14-day Solo trial counts from the moment an admin approves the
--    application, not from the business's first log-in.
-- 3) A notification 24 hours before the trial ends (bell + phone push).

alter table public.provider_applications add column if not exists trade_license_path text;

drop policy if exists "trade license applicant upload" on storage.objects;
create policy "trade license applicant upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vaibook'
              and (storage.foldername(name))[1] = 'trade-licenses'
              and (storage.foldername(name))[2] = (auth.uid())::text);

-- 2) Trial clock starts at approval. Used only for the automatic trial a
--    newly approved business gets; the "Start free trial" button and the
--    admin trial tools keep using start_solo_trial (a fresh 14 days).
create or replace function public.start_solo_trial_from_approval(p_provider_id uuid)
returns provider_profiles language plpgsql security definer set search_path to 'public' as $$
declare result provider_profiles; v_email text; v_approved timestamptz; v_end timestamptz;
begin
  if auth.uid() is null or auth.uid() is distinct from (select user_id from provider_profiles where id = p_provider_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select a.trial_start_date into v_approved
    from provider_applications a
   where lower(a.email) = v_email and a.status = 'active' and a.trial_start_date is not null
   order by a.trial_start_date desc limit 1;
  v_end := coalesce(v_approved, now()) + make_interval(days => platform_trial_days());
  perform set_config('vaibook.trusted_rpc', 'true', true);
  if v_end <= now() then
    -- Approved long ago and only logging in now: the trial already ran out.
    raise exception 'TRIAL_ALREADY_ENDED';
  end if;
  update provider_profiles
     set plan = 'pro', is_trial = true, trial_ends_at = v_end,
         trial_used = true, next_payment_due_date = null
   where id = p_provider_id and coalesce(plan, 'starter') = 'starter' and coalesce(trial_used, false) = false
  returning * into result;
  if result.id is null then raise exception 'TRIAL_NOT_ELIGIBLE'; end if;
  return result;
end $$;
revoke all on function public.start_solo_trial_from_approval(uuid) from public, anon;
grant execute on function public.start_solo_trial_from_approval(uuid) to authenticated;

-- 3) 24-hour warning, checked every hour.
create or replace function public.send_trial_ending_notices() returns int
language plpgsql security definer set search_path to 'public' as $$
declare r record; n int := 0; v_when text;
begin
  for r in
    select p.id, p.user_id, p.trial_ends_at from provider_profiles p
     where p.is_trial and p.user_id is not null
       and p.trial_ends_at > now() and p.trial_ends_at <= now() + interval '24 hours'
       and not exists (select 1 from notifications x where x.user_id = p.user_id and x.type = 'trial_ending'
                         and x.created_at > now() - interval '5 days')
  loop
    v_when := to_char(r.trial_ends_at at time zone 'America/Belize', 'FMDay at FMHH12:MI AM');
    insert into notifications (user_id, title, body, type)
    values (r.user_id, 'Your free Solo trial ends tomorrow',
            'It ends ' || v_when || '. To keep reminders, deposits, memberships and the rest of Solo, pay in My plan & billing — our payment details are there now. If you don''t, you move to the free plan; your bookings and clients stay safe.',
            'trial_ending');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.send_trial_ending_notices() from public, anon, authenticated;

select cron.schedule('vaibook-trial-ending-hourly', '20 * * * *', 'select public.send_trial_ending_notices();');
