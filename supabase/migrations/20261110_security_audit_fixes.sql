-- 2026-11-10 security audit fixes (checked against the "20 mistakes" list).
-- APPLIED to production 2026-11-10 (Abner: "apply security fixes").

-- 1. The admins table was readable by anyone (even logged out), which
--    exposed the admin email address. Now each admin can only see their own
--    row, which is all the RLS checks (`admins.email = auth.email()`) need.
--    is_current_user_admin() and the admin_* functions are SECURITY DEFINER,
--    so they are unaffected. Tested in a rolled-back transaction: anon 0,
--    other users 0, admin 1, admin RPCs and application review still work.
drop policy if exists "Anyone can read admins" on public.admins;
drop policy if exists "Admins read own row" on public.admins;
create policy "Admins read own row" on public.admins
  for select to authenticated using (email = auth.email());

-- 2. The old 'receipts' bucket (unused, private) had no size or file-type
--    limit. Give it the same limits as the other upload buckets.
update storage.buckets
   set file_size_limit = 8388608,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
 where id = 'receipts';

-- 3. Pin search_path on the 12 SECURITY DEFINER functions that lacked it
--    (stops a lookalike table/function in another schema being picked up).
--    Their net.http_post calls are already schema-qualified.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f.sig);
  end loop;
end $$;
