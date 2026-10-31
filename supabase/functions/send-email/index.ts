import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// send-email — hardened 2026-10-30.
// Before: any signed-in account could send any HTML to any address under
// VaiBook's name (an open relay). Now the server decides who may be emailed:
//   • signed in → only VaiBook admins, yourself, or the other side of one of
//     your own bookings (checked in email_recipient_allowed); admins → anyone.
//   • not signed in → only VaiBook admins, or a fixed "we got your
//     application" note to an address that just applied (server template).
// Plus: 30 emails/hour per account (10/hour per IP when logged out), size
// limits, and script/handler stripping.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = Deno.env.get("VAIBOOK_EMAIL_FROM") || "VaiBook <onboarding@resend.dev>";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|iframe|object|embed|form|input|button|meta|link|base)\b[\s\S]*?(<\s*\/\s*\1\s*>|\/?>)/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '$1="#"');
}
const esc = (s: string) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

async function rateLimit(bucket: string, key: string, max: number, window: string): Promise<boolean> {
  const { error } = await admin.rpc("enforce_rate_limit", { p_bucket: bucket, p_key: key, p_max: max, p_window: window });
  return !error;
}

async function isAdminAddress(to: string): Promise<boolean> {
  const { data } = await admin.from("admins").select("email");
  return (data || []).some((r: { email: string }) => (r.email || "").toLowerCase() === to);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let payload: { to?: string; subject?: string; html?: string };
  try { payload = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const to = String(payload.to || "").trim().toLowerCase();
  let subject = String(payload.subject || "").replace(/[\r\n]+/g, " ").slice(0, 200);
  let html = String(payload.html || "");
  if (!EMAIL_RE.test(to)) return json({ ok: false, error: "bad_recipient" }, 400);
  if (!subject || !html) return json({ ok: false, error: "missing_fields" }, 400);
  if (html.length > 60000) return json({ ok: false, error: "too_large" }, 413);

  // Who is calling? A real user session, or nobody.
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  let uid: string | null = null;
  if (token && token.split(".").length === 3) {
    const { data } = await admin.auth.getUser(token);
    uid = data?.user?.id || null;
  }

  if (uid) {
    if (!(await rateLimit("send_email", uid, 30, "1 hour"))) return json({ ok: false, error: "rate_limited" }, 429);
    const { data: allowed, error } = await admin.rpc("email_recipient_allowed", { p_caller: uid, p_to: to });
    if (error || !allowed) return json({ ok: false, error: "recipient_not_allowed" }, 403);
  } else {
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    if (!(await rateLimit("send_email_anon", ip, 10, "1 hour"))) return json({ ok: false, error: "rate_limited" }, 429);
    if (!(await isAdminAddress(to))) {
      // The only other logged-out email: confirming a business application
      // that was just submitted for this address — with OUR wording, never
      // the caller's, and once per address.
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: app } = await admin.from("provider_applications")
        .select("business_name, owner_name").ilike("email", to).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!app) return json({ ok: false, error: "recipient_not_allowed" }, 403);
      if (!(await rateLimit("send_email_applicant", to, 1, "1 day"))) return json({ ok: false, error: "rate_limited" }, 429);
      subject = "We got your VaiBook application";
      html = `<p>Hi ${esc(app.owner_name || "there")},</p><p>Thanks for applying to list <strong>${esc(app.business_name || "your business")}</strong> on VaiBook. We review every application by hand and will email you as soon as you're approved.</p><p>— The VaiBook team</p>`;
    }
  }

  if (!RESEND_API_KEY) return json({ ok: false, error: "not_configured" }, 500);
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html: sanitizeHtml(html) }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) console.error("resend_failed", resp.status, JSON.stringify(data).slice(0, 300));
  return json({ ok: resp.ok, id: (data as { id?: string }).id || null }, resp.ok ? 200 : 502);
});
