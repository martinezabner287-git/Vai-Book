-- 2026-11-08 (Abner): "remove all the grace period days. if they don't pay
-- they are out." No days after the due date: the day after it, an unpaid
-- business is paused (hidden, billing page only) until a payment is
-- confirmed. A receipt already uploaded and waiting for review still counts
-- as paid, so they're not paused while you check it.
-- Reminders: 3 days before, 1 day before, and on the due date.
-- platform_settings.grace_days is no longer used.
create or replace function public.run_billing_enforcement()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_today date := belize_today();
  r record;
  v_kind text; v_title text; v_body text;
  v_paused int := 0;
  v_plan_name text;
begin
  for r in
    select p.id, p.user_id, p.plan, p.next_payment_due_date as due,
           exists (select 1 from provider_payments pp where pp.provider_id = p.id and pp.status = 'pending') as has_pending
      from provider_profiles p
     where p.plan in ('pro', 'business')
       and not coalesce(p.is_trial, false)
       and not p.paused_unpaid
       and p.next_payment_due_date is not null
  loop
    v_plan_name := plan_display_name(r.plan);
    v_kind := null;

    if r.due < v_today then
      if r.has_pending then continue; end if;
      perform pause_provider_for_payment(r.id, 'overdue');
      v_paused := v_paused + 1;
      continue;
    elsif r.due = v_today + 3 then
      v_kind := 'billing_due_3d';
      v_title := 'Your ' || v_plan_name || ' payment is due in 3 days';
      v_body := 'Due ' || to_char(r.due, 'FMMon FMDD') || '. Pay in My plan & billing to keep your business live on VaiBook. If it isn''t paid by then, your business is hidden the next day.';
    elsif r.due = v_today + 1 then
      v_kind := 'billing_due_1d';
      v_title := 'Your ' || v_plan_name || ' payment is due tomorrow';
      v_body := 'Pay in My plan & billing by tomorrow to stay live. If it isn''t paid, your business is hidden the day after.';
    elsif r.due = v_today and not r.has_pending then
      v_kind := 'billing_due_today';
      v_title := 'Your ' || v_plan_name || ' payment is due today';
      v_body := 'Pay in My plan & billing today. If it isn''t paid, your business is hidden from VaiBook tomorrow until you pay. Your data stays safe.';
    end if;

    if v_kind is not null and r.user_id is not null
       and not exists (select 1 from notifications n where n.user_id = r.user_id and n.type = v_kind
                         and n.created_at > now() - interval '5 days') then
      insert into notifications (user_id, title, body, type) values (r.user_id, v_title, v_body, v_kind);
    end if;
  end loop;
  return v_paused;
end $$;
