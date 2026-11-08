-- 2026-11-08 APPLIED after Abner said "apply billing emails"; send-billing-emails deployed and a test email delivered.
-- 2026-11-08: payment reminders go out in the morning (about 9:10 AM Belize
-- instead of 1:10 AM), and every trial/billing notification is also emailed
-- to the business (send-billing-emails edge function, hourly).

alter table public.notifications add column if not exists emailed_at timestamptz;

-- Hands out each billing/trial notification for emailing exactly once.
create or replace function public.claim_billing_emails(p_limit int default 50)
returns table (id uuid, type text, title text, body text, email text, business_name text)
language plpgsql security definer set search_path to 'public' as $$
begin
  return query
  with picked as (
    select n.id from notifications n
     where n.emailed_at is null
       and n.created_at > now() - interval '2 days'
       and n.type in ('trial_ending', 'billing_paused', 'billing_due_3d', 'billing_due_1d', 'billing_due_today',
                      'billing_restored', 'challenge_complete')
     order by n.created_at
     limit greatest(1, least(coalesce(p_limit, 50), 200))
     for update skip locked
  ), claimed as (
    update notifications n set emailed_at = now() from picked where n.id = picked.id
    returning n.id, n.type, n.title, n.body, n.user_id
  )
  select c.id, c.type, c.title, c.body, u.email::text,
         (select pp.business_name from provider_profiles pp where pp.user_id = c.user_id limit 1)
    from claimed c left join users u on u.id = c.user_id;
end $$;
revoke all on function public.claim_billing_emails(int) from public, anon, authenticated;
grant execute on function public.claim_billing_emails(int) to service_role;

-- 15:10 UTC = 9:10 AM Belize.
select cron.schedule('vaibook-billing-enforcement', '10 15 * * *', 'select public.run_billing_enforcement();');

select cron.schedule('vaibook-billing-emails-hourly', '40 * * * *', $cron$
  select net.http_post(
    url := 'https://nvfpdkpzrtpmvmgzvdca.supabase.co/functions/v1/send-billing-emails',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer sb_publishable_zpAA2Gdcm_BJhu1D56tsTw_sBpZXiNA'),
    body := '{}'::jsonb);
$cron$);
