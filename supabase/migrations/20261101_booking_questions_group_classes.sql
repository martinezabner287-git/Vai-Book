-- 2026-11-01 — Booking questions (like Fresha's consultation forms) and
-- group classes (like Mindbody's spots). Applied to the live project as
-- migrations booking_questions_and_group_classes + group_class_times.

-- Group classes: a service with more than 1 spot, optionally at set times.
alter table public.services add column if not exists capacity integer not null default 1;
alter table public.services add constraint services_capacity_check check (capacity between 1 and 200);
alter table public.services add column if not exists class_times jsonb;   -- ["06:00","17:30"]
alter table public.services add constraint services_class_times_check
  check (class_times is null or (jsonb_typeof(class_times) = 'array' and jsonb_array_length(class_times) <= 12));
grant select (capacity, class_times) on public.services to anon, authenticated;
grant insert (capacity, class_times), update (capacity, class_times) on public.services to authenticated;

-- Questions a business asks at checkout; answers stored on each booking.
alter table public.provider_profiles add column if not exists booking_questions jsonb;
alter table public.provider_profiles add constraint provider_booking_questions_check
  check (booking_questions is null or (jsonb_typeof(booking_questions) = 'array' and jsonb_array_length(booking_questions) <= 10 and length(booking_questions::text) <= 8000));
grant select (booking_questions) on public.provider_profiles to anon, authenticated;
grant update (booking_questions) on public.provider_profiles to authenticated;
alter table public.bookings add column if not exists answers jsonb;
grant select (answers) on public.bookings to authenticated;

-- set_booking_answers(p_booking_id, p_answers): the customer who made the
--   booking, within 15 minutes, max 10 answers / 6000 chars.
-- get_busy_windows_v2(p_provider_id, p_date): start, end, service_id, spots,
--   capacity — lets the app let class bookings share a start time.
-- create_booking_safe: other bookings for the same class at the same start
--   time no longer block the slot; raises CLASS_FULL when spots run out.
-- trg_booking_platform_rules: for classes with class_times, customers can
--   only book those times (the business itself can add anyone, any time).
-- (Full function bodies as applied live; see pg_get_functiondef.)
