// Client-side guardrails using Zod.
//
// IMPORTANT — what this does and doesn't protect against: VaiBook has no
// API routes or server actions (it's a static React app talking straight
// to Supabase), so client-side validation can never be the real security
// boundary — anyone can skip the browser entirely and call the Supabase
// RPCs directly with the public anon key. The actual trust boundary is
// Postgres itself: RLS policies, the SECURITY DEFINER RPCs' own internal
// checks, and the CHECK constraints added in
// 5_security_hardening.sql (no negative prices/amounts, no negative or
// zero durations, etc.).
//
// What THIS file is for: catching bad input from an honest client before
// it's sent — a stale form, a bug, a manually-edited date field the
// browser's own <input min=""> didn't actually stop — with a clear error
// message instead of a cryptic Postgres rejection (or, worse, silently
// wrong data reaching a table's CHECK constraint and failing there instead
// of at the form).
import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Pick a valid time.");
const uuid = z.string().uuid("That doesn't look like a valid selection — please try again.");

function isTodayOrLater(value) {
  // Compared as plain "YYYY-MM-DD" strings against the browser's local
  // date — matches localDateStr() elsewhere in the app, so this agrees
  // with what the date-picker itself already limits you to.
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return value >= localToday;
}

// A real customer booking request — this should never be for a date that
// has already passed (unlike a provider logging a walk-in after the fact,
// which is a deliberate, separate feature — see 5_security_hardening.sql's
// notes on why that flow is intentionally NOT date-restricted).
export const bookingRequestSchema = z.object({
  service_id: uuid,
  service_ids: z.array(uuid).min(1).optional(),
  date: dateStr.refine(isTodayOrLater, "That date has already passed — please pick a date from today onward."),
  time: timeStr,
  notes: z.string().max(1000, "Notes are limited to 1000 characters.").optional().nullable(),
});

// A provider proposing a new time for an existing booking (reschedule) —
// same "not in the past" rule as a fresh booking.
export const rescheduleProposalSchema = z.object({
  date: dateStr.refine(isTodayOrLater, "That date has already passed — please pick a date from today onward."),
  time: timeStr,
});

// Runs a schema and returns { ok: true, data } or { ok: false, message } —
// a small wrapper so call sites don't need to know Zod's own result shape.
export function validate(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const message = result.error.issues[0]?.message || "Please check your entries and try again.";
  return { ok: false, message };
}
