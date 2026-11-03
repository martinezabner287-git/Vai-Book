-- 2026-11-03 Expense tracking for every business: manual entries or a receipt photo, for a profit view.
create table if not exists public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  spent_on date not null default ((now() at time zone 'America/Belize')::date),
  amount numeric(12,2) not null check (amount > 0 and amount < 10000000),
  category text not null default 'other' check (length(category) between 1 and 40),
  vendor text check (vendor is null or length(vendor) <= 120),
  note text check (note is null or length(note) <= 500),
  receipt_path text check (receipt_path is null or length(receipt_path) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists business_expenses_provider_date on public.business_expenses (provider_id, spent_on desc);
alter table public.business_expenses enable row level security;

drop policy if exists "expenses owner all" on public.business_expenses;
create policy "expenses owner all" on public.business_expenses for all to authenticated
  using (provider_id in (select id from public.provider_profiles where user_id = auth.uid()))
  with check (provider_id in (select id from public.provider_profiles where user_id = auth.uid()));
drop policy if exists "expenses admin read" on public.business_expenses;
create policy "expenses admin read" on public.business_expenses for select to authenticated using (is_current_user_admin());
grant select, insert, update, delete on public.business_expenses to authenticated;
revoke all on public.business_expenses from anon;

-- Receipt photos: private, each owner only sees their own folder (<user id>/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 8388608, array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;
drop policy if exists "expense receipts owner read" on storage.objects;
create policy "expense receipts owner read" on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "expense receipts owner write" on storage.objects;
create policy "expense receipts owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "expense receipts owner delete" on storage.objects;
create policy "expense receipts owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
