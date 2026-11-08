-- 2026-11-07 APPLIED to the live database after Abner said "apply"; verified with a rolled-back test.
-- 2026-11-07: "Where businesses pay you" becomes a list, so VaiBook can show
-- several banks and several mobile wallets (Admin → Settings & prices).
-- Each item: {"kind":"bank"|"wallet","name","account_name","account_number","note"}.
-- The old single pay_bank / pay_digiwallet / pay_ekyash fields are copied in
-- once and kept as they are (the app uses the list when it has anything).
alter table public.platform_settings add column if not exists pay_methods jsonb not null default '[]'::jsonb;

update public.platform_settings set pay_methods =
  (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
     select jsonb_build_object('kind', 'bank', 'name', 'Bank transfer', 'account_name', '', 'account_number', '', 'note', trim(pay_bank)) x where coalesce(trim(pay_bank), '') <> ''
     union all
     select jsonb_build_object('kind', 'wallet', 'name', 'DigiWallet', 'account_name', '', 'account_number', trim(pay_digiwallet), 'note', '') where coalesce(trim(pay_digiwallet), '') <> ''
     union all
     select jsonb_build_object('kind', 'wallet', 'name', 'E-Kyash', 'account_name', '', 'account_number', trim(pay_ekyash), 'note', '') where coalesce(trim(pay_ekyash), '') <> ''
   ) s)
 where id and pay_methods = '[]'::jsonb;
