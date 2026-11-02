-- 2026-11-02 — 24-hour reminders with "what to bring" (applied live as reminders_24h_with_prep_notes).
alter table public.services add column if not exists prep_note text;
alter table public.services add constraint services_prep_note_check check (prep_note is null or length(prep_note) <= 500);
grant select (prep_note) on public.services to anon, authenticated;
grant insert (prep_note), update (prep_note) on public.services to authenticated;
-- send_booking_reminders(): hourly; bookings starting 2-24 hours from now (Belize),
-- not yet reminded, made >30 min ago -> notification (type 'reminder', also a push):
-- title '⏰ <service> today/tomorrow at <time>', body '<business> is expecting you … 📍 <location>.
-- What to bring / how to prepare: <prep notes of the booked services>'; sets reminder_sent_at.
-- cron: 'vaibook-booking-reminders-hourly' at '5 * * * *' replaces 'vaibook-send-reminders-daily'.
-- (Full body as applied live.)
