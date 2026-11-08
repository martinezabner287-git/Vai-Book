-- STATUS: waiting for Abner's OK to apply to the live database.
-- 2026-11-07 — Abner: "no free plan, just the 14 day free trial for Solo and
-- Teams", "once I accept, their 14 days immediately start", a reminder 24
-- hours before, trade license with the application, and a launch challenge:
-- finish it during the trial → 2 months at half price.
--
-- 1) Applications carry a photo/PDF of the trade license (private; only the
--    applicant can upload into their folder, only admins can open it).
-- 2) The trial is on the plan they applied for (Solo or Team) and counts
--    from the moment an admin approves the application.
-- 3) No free plan: when a trial ends unpaid, or a paid plan is more than the
--    grace days overdue, the business is paused — hidden from search, no new
--    bookings — until a payment is confirmed. Nothing is deleted.
-- 4) 24-hour "trial ends tomorrow" notice (bell + phone push).
-- 5) The launch challenge (5 tasks) and its reward (first 2 monthly
--    payments at half price).

------------------------------------------------------------------ 1
alter table public.provider_applications add column if not exists trade_license_path text;

drop policy if exists "trade license applicant upload" on storage.objects;
create policy "trade license applicant upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vaibook'
              and (storage.foldername(name))[1] = 'trade-licenses'
              and (storage.foldername(name))[2] = (auth.uid())::text);

------------------------------------------------------------------ columns
alter table public.provider_profiles add column if not exists paused_unpaid boolean not null default false;
alter table public.provider_profiles add column if not exists challenge_shared_at timestamptz;
alter table public.provider_profiles add column if not exists challenge_completed_at timestamptz;
alter table public.provider_profiles add column if not exists challenge_discount_left int not null default 0;

------------------------------------------------------------------ 2
-- When a newly approved business logs in for the first time, its profile is
-- created with the plan it applied for, already on trial, ending 14 days
-- after approval. (Only the INSERT branch changed.)
create or replace function public.trg_provider_profile_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_email text := auth.jwt() ->> 'email';
  v_is_admin boolean := false;
  v_trusted boolean := coalesce(current_setting('vaibook.trusted_rpc', true), '') = 'true';
  v_app_plan text; v_approved timestamptz; v_end timestamptz;
begin
  if auth.uid() is null then
    return new;
  end if;
  if v_email is not null then
    select exists (select 1 from admins where email = v_email) into v_is_admin;
  end if;
  if v_is_admin or v_trusted then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select a.plan, a.trial_start_date into v_app_plan, v_approved
      from provider_applications a
     where lower(a.email) = lower(coalesce(v_email, '')) and a.status = 'active'
     order by a.created_at desc limit 1;
    if not found then
      new.plan := 'starter';
      new.is_trial := false;
      return new;
    end if;
    new.plan := case when v_app_plan = 'business' then 'business' else 'pro' end;
    v_end := coalesce(v_approved, now()) + make_interval(days => platform_trial_days());
    new.is_trial := v_end > now();
    new.trial_used := true;
    new.trial_ends_at := v_end;
    new.next_payment_due_date := null;
    new.challenge_shared_at := null;
    new.challenge_completed_at := null;
    new.challenge_discount_left := 0;
    new.paused_unpaid := not (v_end > now());
    if new.paused_unpaid then
      new.is_active := false;   -- approved long ago, trial already over
    end if;
  else
    new.plan      := old.plan;
    new.is_active := old.is_active;
    new.is_trial  := old.is_trial;
    new.trial_ends_at := old.trial_ends_at;
    new.trial_used := old.trial_used;
    new.paused_unpaid := old.paused_unpaid;
    new.challenge_completed_at := old.challenge_completed_at;
    new.challenge_discount_left := old.challenge_discount_left;
    new.challenge_shared_at := old.challenge_shared_at;
    new.next_payment_due_date := old.next_payment_due_date;
    if new.plan is distinct from 'business' then
      new.is_featured := false;
    end if;
    if coalesce(new.plan, 'starter') not in ('pro', 'business') then
      new.loyalty_enabled       := false;
      new.downpayment_required  := false;
      new.auto_confirm_bookings := false;
    end if;
  end if;

  return new;
end;
$$;

------------------------------------------------------------------ 3
-- Pause / un-pause. Pausing hides the business (is_active = false), pauses
-- Team staff logins, and says so in the bell + a phone push.
create or replace function public.pause_provider_for_payment(p_provider_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r provider_profiles;
begin
  perform set_config('vaibook.trusted_rpc', 'true', true);
  update provider_profiles
     set is_active = false, paused_unpaid = true, is_trial = false,
         downgraded_at = now(), downgraded_from_plan = plan
   where id = p_provider_id and not paused_unpaid
  returning * into r;
  if r.id is null then return; end if;
  update provider_staff set is_active = false, paused_for_nonpayment = true
   where provider_id = p_provider_id and is_active;
  if r.user_id is not null then
    insert into notifications (user_id, title, body, type)
    values (r.user_id,
            case when p_reason = 'trial' then 'Your free trial has ended' else 'Your business is paused' end,
            case when p_reason = 'trial'
                 then 'Your business is hidden from VaiBook until you pay. Your bookings, clients and history are all safe — pay in My plan & billing and you''re back on as soon as we confirm it.'
                 else 'We didn''t receive your payment, so your business is hidden from VaiBook for now. Your bookings, clients and history are all safe — pay in My plan & billing to switch it back on.' end,
            'billing_paused');
  end if;
end $$;
revoke all on function public.pause_provider_for_payment(uuid, text) from public, anon, authenticated;

create or replace function public.expire_provider_trials()
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  for r in select id from provider_profiles
            where is_trial = true and trial_ends_at is not null and trial_ends_at < now()
  loop
    -- Last chance to count a challenge finished during the trial.
    perform challenge_eval(r.id, true);
    perform pause_provider_for_payment(r.id, 'trial');
  end loop;
end $$;

create or replace function public.run_billing_enforcement()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_today date := belize_today();
  v_grace int := coalesce((select grace_days from platform_settings where id), 7);
  r record;
  v_kind text; v_title text; v_body text;
  v_paused int := 0;
  v_plan_name text;
  v_pay_by text;
begin
  for r in
    select p.id, p.user_id, p.plan, p.next_payment_due_date as due, p.business_name,
           exists (select 1 from provider_payments pp where pp.provider_id = p.id and pp.status = 'pending') as has_pending
      from provider_profiles p
     where p.plan in ('pro', 'business')
       and not coalesce(p.is_trial, false)
       and not p.paused_unpaid
       and p.next_payment_due_date is not null
  loop
    v_plan_name := plan_display_name(r.plan);
    v_pay_by := to_char(r.due + v_grace, 'FMMon FMDD');
    v_kind := null;

    if r.due < v_today - v_grace then
      if r.has_pending then
        continue;
      end if;
      perform pause_provider_for_payment(r.id, 'overdue');
      v_paused := v_paused + 1;
      continue;
    elsif r.due = v_today + 3 then
      v_kind := 'billing_due_3d';
      v_title := 'Your ' || v_plan_name || ' payment is due in 3 days';
      v_body := 'Due ' || to_char(r.due, 'FMMon FMDD') || '. Pay in My plan & billing to keep your business live on VaiBook.';
    elsif r.due = v_today + 1 then
      v_kind := 'billing_due_1d';
      v_title := 'Your ' || v_plan_name || ' payment is due tomorrow';
      v_body := 'Pay in My plan & billing to keep your business live without interruption.';
    elsif r.due = v_today - 1 and not r.has_pending then
      v_kind := 'billing_overdue';
      v_title := 'Payment overdue';
      v_body := 'Your ' || v_plan_name || ' payment is overdue. Pay by ' || v_pay_by || ' to keep your business live on VaiBook.';
    elsif r.due = v_today - (v_grace - 2) and not r.has_pending then
      v_kind := 'billing_last_call';
      v_title := '2 days left to keep your business live';
      v_body := 'Pay by ' || v_pay_by || ' or your business is hidden from VaiBook until you do. Your data stays safe either way.';
    end if;

    if v_kind is not null and r.user_id is not null
       and not exists (select 1 from notifications n where n.user_id = r.user_id and n.type = v_kind
                         and n.created_at > now() - interval '5 days') then
      insert into notifications (user_id, title, body, type) values (r.user_id, v_title, v_body, v_kind);
    end if;
  end loop;
  return v_paused;
end $$;

-- Confirming a payment switches a paused business back on, and uses up one
-- half-price month from the challenge reward.
create or replace function public.admin_review_provider_payment(p_payment_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_provider_id uuid; v_plan text; v_amount numeric; v_months int; v_paid_months int;
  v_prev_status text; v_half boolean := false; v_price numeric; v_was_paused boolean;
begin
  if not exists (select 1 from admins where email = auth.email()) then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('confirmed', 'rejected', 'pending') then
    raise exception 'Invalid status';
  end if;

  select status into v_prev_status from provider_payments where id = p_payment_id;
  update provider_payments
  set status = p_status,
      admin_note = coalesce(p_note, admin_note),
      reviewed_at = now(),
      reviewed_by = auth.email()
  where id = p_payment_id
  returning provider_id, plan, amount, coalesce(months_covered, 1) into v_provider_id, v_plan, v_amount, v_months;

  if p_status <> 'confirmed' or v_prev_status = 'confirmed' or v_provider_id is null then
    return;
  end if;

  select paused_unpaid, (v_months = 1 and challenge_discount_left > 0)
    into v_was_paused, v_half from provider_profiles where id = v_provider_id;

  v_paid_months := case when v_months = 7 then 6 else 1 end;
  v_price := case v_plan when 'business' then 120 when 'pro' then 50 else 0 end;
  if v_months = 7 and (v_amount is null or v_amount < 6 * v_price) then
    v_months := 1; v_paid_months := 1;
  end if;
  if v_amount is null or v_amount < v_paid_months * v_price * (case when v_half then 0.5 else 1 end) then
    v_plan := null;
  end if;

  perform set_config('vaibook.trusted_rpc', 'true', true);
  update provider_profiles
  set next_payment_due_date = (greatest(coalesce(next_payment_due_date, current_date), current_date) + make_interval(months => v_months))::date,
      payment_reminder_3d_sent_at = null,
      payment_reminder_1d_sent_at = null,
      payment_reminder_due_sent_at = null,
      plan = coalesce(v_plan, plan),
      is_trial = false,
      challenge_discount_left = case when v_half then challenge_discount_left - 1 else challenge_discount_left end,
      is_active = case when paused_unpaid or coalesce(next_payment_due_date, current_date) < current_date then true else is_active end,
      paused_unpaid = false,
      downgraded_at = null,
      downgraded_from_plan = null
  where id = v_provider_id;

  if v_was_paused then
    update provider_staff set is_active = true, paused_for_nonpayment = false
     where provider_id = v_provider_id and paused_for_nonpayment;
    insert into notifications (user_id, title, body, type)
    select user_id, 'Your business is live again ✅',
           'Thanks for your payment — customers can find and book you on VaiBook again.', 'billing_restored'
      from provider_profiles where id = v_provider_id and user_id is not null;
  end if;
end $$;

-- Paused = no new bookings of any kind (only the PAUSED check is new).
create or replace function public.trg_booking_platform_rules() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  s platform_settings;
  v_plan text; v_owner uuid; v_is_business boolean; v_used int;
  v_times jsonb; v_cap int;
begin
  if is_current_user_admin() then return new; end if;
  -- A paused (unpaid) business can't take or enter any bookings — not even
  -- walk-ins or past visits — until a payment is confirmed.
  if exists (select 1 from provider_profiles where id = new.provider_id and paused_unpaid) then
    raise exception 'BUSINESS_PAUSED: this business is not taking bookings right now' using errcode = 'P0001';
  end if;
  select coalesce(plan, 'starter'), user_id into v_plan, v_owner from provider_profiles where id = new.provider_id;
  v_is_business := auth.uid() is not null and (auth.uid() = v_owner
    or exists (select 1 from provider_staff st where st.provider_id = new.provider_id and st.user_id = auth.uid()));
  -- A business entering its own walk-in or manual booking is never blocked.
  if v_is_business then return new; end if;

  if is_user_blocked(coalesce(new.customer_id, auth.uid())) then
    raise exception 'ACCOUNT_BLOCKED: this account can''t make bookings' using errcode = 'P0001';
  end if;

  -- Group classes with set times only take bookings at those times.
  select class_times, coalesce(capacity, 1) into v_times, v_cap from services where id = new.service_id;
  if v_cap > 1 and v_times is not null and jsonb_array_length(v_times) > 0
     and not (v_times ? to_char(new.booking_time, 'HH24:MI')) then
    raise exception 'SLOT_TAKEN: this class doesn''t run at that time' using errcode = 'P0001';
  end if;

  select * into s from platform_settings where id;
  if s.id is not null and s.free_cap_enforced and v_plan = 'starter' then
    select count(*) into v_used from bookings b
     where b.provider_id = new.provider_id
       and (b.created_at at time zone 'America/Belize') >= date_trunc('month', now() at time zone 'America/Belize')
       and b.status not in ('cancelled', 'rejected')
       and not b.entered_later;
    if v_used >= s.free_booking_cap then
      raise exception 'STARTER_LIMIT_REACHED: this business reached its free plan limit for this month' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

------------------------------------------------------------------ 4
create or replace function public.send_trial_ending_notices() returns int
language plpgsql security definer set search_path to 'public' as $$
declare r record; n int := 0; v_when text; v_extra text;
begin
  for r in
    select p.id, p.user_id, p.trial_ends_at, p.challenge_completed_at from provider_profiles p
     where p.is_trial and p.user_id is not null
       and p.trial_ends_at > now() and p.trial_ends_at <= now() + interval '24 hours'
       and not exists (select 1 from notifications x where x.user_id = p.user_id and x.type = 'trial_ending'
                         and x.created_at > now() - interval '5 days')
  loop
    v_when := to_char(r.trial_ends_at at time zone 'America/Belize', 'FMDay at FMHH12:MI AM');
    v_extra := case when r.challenge_completed_at is not null
                    then ' You finished the challenge, so your first 2 months are half price.'
                    else ' Finish the challenge before then to get your first 2 months at half price.' end;
    insert into notifications (user_id, title, body, type)
    values (r.user_id, 'Your free trial ends tomorrow',
            'It ends ' || v_when || '. Pay in My plan & billing to stay live on VaiBook — our payment details are there now. If you don''t, your business is hidden until you pay; your bookings and clients stay safe.' || v_extra,
            'trial_ending');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.send_trial_ending_notices() from public, anon, authenticated;

select cron.schedule('vaibook-trial-ending-hourly', '20 * * * *', 'select public.send_trial_ending_notices();');
-- Trials now end to the hour, so check hourly instead of once a night.
select cron.schedule('vaibook-expire-provider-trials', '25 * * * *', 'select public.expire_provider_trials();');

------------------------------------------------------------------ 5
-- The challenge. Tasks are worked out live from what the business has done.
-- Finishing all 5 while still on the trial stamps the reward (once).
create or replace function public.challenge_eval(p_provider_id uuid, p_stamp boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  p provider_profiles; v_start timestamptz;
  t_page boolean; v_svc int; v_bk int; v_rev int; v_all boolean;
begin
  select * into p from provider_profiles where id = p_provider_id;
  if p.id is null then return null; end if;
  v_start := coalesce(p.trial_ends_at - make_interval(days => platform_trial_days()), p.created_at);

  t_page := coalesce(p.profile_photo_url, '') <> ''
        and coalesce(trim(p.bio), '') <> ''
        and coalesce(jsonb_array_length(case when jsonb_typeof(to_jsonb(p.portfolio_urls)) = 'array' then to_jsonb(p.portfolio_urls) else '[]'::jsonb end), 0) > 0
        and exists (select 1 from working_hours w where w.provider_id = p.id and w.is_open);
  select count(*) into v_svc from services s
   where s.provider_id = p.id and coalesce(s.is_active, true) and not coalesce(s.is_addon, false) and coalesce(s.price, 0) > 0;
  select count(*) into v_bk from bookings b
   where b.provider_id = p.id and b.customer_id is not null and not coalesce(b.created_by_provider, false)
     and not coalesce(b.entered_later, false)
     and b.status not in ('cancelled', 'rejected') and b.created_at >= v_start;
  select count(*) into v_rev from reviews r
   where r.provider_id = p.id and not coalesce(r.is_hidden, false) and r.created_at >= v_start;

  v_all := t_page and v_svc >= 3 and p.challenge_shared_at is not null and v_bk >= 5 and v_rev >= 1;
  if v_all and p_stamp and p.challenge_completed_at is null and p.trial_ends_at is not null
     and (p.is_trial or now() <= p.trial_ends_at) then
    perform set_config('vaibook.trusted_rpc', 'true', true);
    update provider_profiles set challenge_completed_at = now(), challenge_discount_left = 2 where id = p.id
      returning * into p;
    if p.user_id is not null then
      insert into notifications (user_id, title, body, type)
      values (p.user_id, '🏆 Challenge complete!',
              'You did it — your first 2 monthly payments are half price. It shows automatically in My plan & billing.',
              'challenge_complete');
    end if;
  end if;

  return jsonb_build_object(
    'page', t_page, 'services', v_svc, 'shared', p.challenge_shared_at is not null,
    'bookings', v_bk, 'reviews', v_rev,
    'completed_at', p.challenge_completed_at, 'discount_left', p.challenge_discount_left,
    'ends_at', p.trial_ends_at, 'is_trial', p.is_trial);
end $$;
revoke all on function public.challenge_eval(uuid, boolean) from public, anon, authenticated;

create or replace function public.my_challenge(p_provider_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not (coalesce(is_current_user_admin(), false)
          or exists (select 1 from provider_profiles where id = p_provider_id and user_id = auth.uid())) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return challenge_eval(p_provider_id, true);
end $$;
revoke all on function public.my_challenge(uuid) from public, anon;
grant execute on function public.my_challenge(uuid) to authenticated;

create or replace function public.mark_challenge_shared(p_provider_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform set_config('vaibook.trusted_rpc', 'true', true);
  update provider_profiles set challenge_shared_at = coalesce(challenge_shared_at, now())
   where id = p_provider_id and user_id = auth.uid();
end $$;
revoke all on function public.mark_challenge_shared(uuid) from public, anon;
grant execute on function public.mark_challenge_shared(uuid) to authenticated;

------------------------------------------------------------------ admin tools
-- "End trial now" pauses (there's no free plan to drop to).
create or replace function public.admin_end_provider_trial(p_provider_id uuid)
returns provider_profiles language plpgsql security definer set search_path to 'public' as $$
declare result provider_profiles;
begin
  if not exists (select 1 from admins where email = auth.jwt()->>'email') then raise exception 'NOT_AUTHORIZED'; end if;
  if not exists (select 1 from provider_profiles where id = p_provider_id and is_trial) then raise exception 'NOT_IN_TRIAL'; end if;
  perform pause_provider_for_payment(p_provider_id, 'trial');
  select * into result from provider_profiles where id = p_provider_id;
  return result;
end $$;

-- "Extend trial" also works on a business whose trial already ended and is
-- paused — it switches them back on with the extra days.
create or replace function public.admin_extend_provider_trial(p_provider_id uuid, p_days integer)
returns provider_profiles language plpgsql security definer set search_path to 'public' as $$
declare result provider_profiles; v_days int := greatest(1, least(coalesce(p_days, 0), 60));
begin
  if not exists (select 1 from admins where email = auth.jwt()->>'email') then raise exception 'NOT_AUTHORIZED'; end if;
  update provider_profiles
     set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => v_days),
         is_trial = true, is_active = true, paused_unpaid = false, downgraded_at = null, downgraded_from_plan = null
   where id = p_provider_id
     and (is_trial or (paused_unpaid and next_payment_due_date is null))
  returning * into result;
  if result.id is null then raise exception 'NOT_IN_TRIAL'; end if;
  update provider_staff set is_active = true, paused_for_nonpayment = false
   where provider_id = p_provider_id and paused_for_nonpayment;
  return result;
end $$;

-- "Give more days" on a paused (overdue) business switches it back on.
create or replace function public.admin_restore_downgraded_plan(p_provider_id uuid, p_days integer default 7)
returns provider_profiles language plpgsql security definer set search_path to 'public' as $$
declare result provider_profiles; v_plan text; v_days int := greatest(1, least(coalesce(p_days, 7), 60));
begin
  if not is_current_user_admin() then raise exception 'NOT_AUTHORIZED: admin only'; end if;
  select coalesce(downgraded_from_plan, plan) into v_plan from provider_profiles
   where id = p_provider_id and (downgraded_at is not null or paused_unpaid);
  if v_plan is null then raise exception 'NOT_DOWNGRADED'; end if;
  update provider_profiles
     set plan = case when v_plan in ('pro', 'business') then v_plan else 'pro' end, is_trial = false,
         is_active = true, paused_unpaid = false, downgraded_at = null, downgraded_from_plan = null,
         next_payment_due_date = belize_today() + v_days
   where id = p_provider_id returning * into result;
  update provider_staff set is_active = true, paused_for_nonpayment = false
   where provider_id = p_provider_id and paused_for_nonpayment;
  return result;
end $$;
