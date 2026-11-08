// VaiBook — billing & trial emails (2026-11-08).
//
// Every bell notification about money or the free trial (trial ends
// tomorrow, payment due in 3 days / tomorrow / today, business paused,
// live again, challenge complete) also goes to the business by email, so
// nobody misses it just because they didn't turn on phone alerts.
//
// Run every hour by the `vaibook-billing-emails-hourly` pg_cron job. Each
// notification is claimed once in the database (claim_billing_emails), so
// calling this again — by mistake or by anyone outside — never sends a
// second copy. Phone-number accounts have no real email and are skipped.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FROMS = [
  Deno.env.get("VAIBOOK_EMAIL_FROM") || "VaiBook <bookings@vaibook.bz>",
  "VaiBook <onboarding@resend.dev>",
];

async function sendViaResend(to: string, subject: string, html: string): Promise<{ ok: boolean; text: string }> {
  let last = { ok: false, text: "" };
  for (const from of FROMS) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const text = await res.text();
    last = { ok: res.ok, text };
    if (res.ok) return last;
    if (!(res.status === 403 || res.status === 422) || !/domain|verif/i.test(text)) return last;
  }
  return last;
}

const esc = (s: string) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function emailHtml(title: string, body: string, businessName: string, cta: string) {
  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #17141F;">
    <div style="background: #4C3DC4; padding: 22px 28px; border-radius: 10px 10px 0 0;">
      <span style="font-size: 20px; font-weight: 700; color: #FAF9FE;">vai<span style="color: #F2B705;">book</span></span>
    </div>
    <div style="background: #ffffff; border: 1px solid #E5E0D3; border-top: none; border-radius: 0 0 10px 10px; padding: 28px;">
      ${businessName ? `<p style="margin: 0 0 6px; font-size: 13px; color: #6B6578;">${esc(businessName)}</p>` : ""}
      <h2 style="margin: 0 0 12px; font-size: 20px; color: #4C3DC4;">${esc(title)}</h2>
      <p style="margin: 0 0 22px; font-size: 15px; line-height: 1.55;">${esc(body)}</p>
      <a href="https://vaibook.bz/#provider" style="display: inline-block; background: #17141F; color: #ffffff; text-decoration: none; font-weight: 700; padding: 12px 22px; border-radius: 999px; font-size: 14px;">${esc(cta)}</a>
      <p style="font-size: 12px; color: #6B6578; margin-top: 24px;">— The VaiBook Team</p>
    </div>
  </div>`;
}

Deno.serve(async () => {
  if (!RESEND_API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "not configured" }), { status: 500 });
  }
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: rows, error } = await db.rpc("claim_billing_emails", { p_limit: 50 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let sent = 0, skipped = 0, failed = 0;
  for (const r of (rows || []) as any[]) {
    const email = String(r.email || "").trim();
    if (!email || /@phone\.vaibook\.bz$/i.test(email)) { skipped++; continue; }
    const cta = /restored|challenge/.test(r.type) ? "Open VaiBook" : "Go to My plan & billing";
    const res = await sendViaResend(email, r.title, emailHtml(r.title, r.body, r.business_name || "", cta));
    if (res.ok) sent++; else { failed++; console.error("billing email failed", r.id, res.text.slice(0, 200)); }
  }
  return new Response(JSON.stringify({ sent, skipped, failed }), { headers: { "Content-Type": "application/json" } });
});
