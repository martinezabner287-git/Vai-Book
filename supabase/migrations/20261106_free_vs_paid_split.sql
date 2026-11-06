-- 2026-11-06 Free = get booked (up to the monthly cap). Automatic 24-hour
-- reminders are a Solo/Team feature (the 14-day trial runs on plan 'pro',
-- so trial businesses still get them). Applied live as free_vs_paid_split.
do $m$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.send_booking_reminders()'::regprocedure);
  if position('p.plan in (''pro'', ''business'')' in v_def) = 0 then
    v_def := replace(v_def, 'and b.customer_id is not null', 'and b.customer_id is not null and p.plan in (''pro'', ''business'')');
    execute v_def;
  end if;
end $m$;

-- Turn on the free plan's monthly booking cap.
update public.platform_settings set free_cap_enforced = true where id;

-- The Recovery Room: Solo, complimentary for a year as VaiBook's showcase.
update public.provider_profiles
   set plan = 'pro', is_trial = false, next_payment_due_date = date '2027-11-06'
 where id = '29f5cb1f-d1e3-4d11-b42d-2c502d655c0a';
