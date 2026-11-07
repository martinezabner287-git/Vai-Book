// VaiBook — monthly provider review email.
//
// Invoked once a month by the `vaibook-send-monthly-review-email` pg_cron
// job, 15 minutes after that month's stats are frozen into
// `provider_monthly_stats`. For every active provider with data for last
// month: an in-app notification, plus the same summary by email (Resend).
// 2026-11-06: sends from bookings@vaibook.bz, falling back to Resend's test
// sender until the domain is verified.
// 2026-11-06: runs at most once per business per month — calling it again
// (by mistake or by someone outside) sends nothing new.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FROMS = [
  Deno.env.get("VAIBOOK_EMAIL_FROM") || "VaiBook <bookings@vaibook.bz>",
  "VaiBook <onboarding@resend.dev>",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(dateStr: string) {
  const [y, m] = dateStr.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

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

function reviewEmailHtml(opts: {
  businessName: string;
  monthStr: string;
  revenue: number;
  bookingsTotal: number;
  bookingsCompleted: number;
  avgRating: number | null;
  reviewsCount: number;
  prevRevenue: number | null;
}) {
  const { businessName, monthStr, revenue, bookingsTotal, bookingsCompleted, avgRating, reviewsCount, prevRevenue } = opts;
  const completionPct = bookingsTotal > 0 ? Math.round((bookingsCompleted / bookingsTotal) * 100) : null;
  const deltaPct = prevRevenue && prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null;
  const deltaLine = deltaPct === null
    ? ""
    : `<p style="margin:4px 0 0;color:${deltaPct >= 0 ? "#0ca30c" : "#B91C1C"};font-size:14px;">${deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(deltaPct)}% vs the month before</p>`;

  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0D1F18;">
    <div style="background:#0D3D2E;padding:24px 28px;border-radius:12px 12px 0 0;">
      <div style="color:#C6F135;font-family:Arial,sans-serif;font-size:20px;font-weight:800;">vaibook</div>
      <p style="color:#fff;font-size:15px;margin:12px 0 0;">Your ${monthLabel(monthStr)} review</p>
    </div>
    <div style="border:1px solid #D9E4DF;border-top:none;padding:24px 28px;border-radius:0 0 12px 12px;">
      <p style="font-size:14px;">Hi ${businessName}, here's how your business did last month on VaiBook:</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #D9E4DF;">
            <div style="font-size:12px;color:#6B7F76;text-transform:uppercase;letter-spacing:.03em;">Revenue</div>
            <div style="font-size:26px;font-weight:800;color:#D4795A;">BZ$${revenue.toFixed(0)}</div>
            ${deltaLine}
          </td>
        </tr>
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #D9E4DF;">
            <div style="font-size:12px;color:#6B7F76;text-transform:uppercase;letter-spacing:.03em;">Bookings</div>
            <div style="font-size:26px;font-weight:800;">${bookingsTotal}</div>
            <p style="margin:4px 0 0;color:#6B7F76;font-size:14px;">${completionPct === null ? "No bookings this month" : `${completionPct}% completed`}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 0;">
            <div style="font-size:12px;color:#6B7F76;text-transform:uppercase;letter-spacing:.03em;">Rating</div>
            <div style="font-size:26px;font-weight:800;">${avgRating != null ? avgRating.toFixed(1) + "★" : "—"}</div>
            <p style="margin:4px 0 0;color:#6B7F76;font-size:14px;">${reviewsCount} review${reviewsCount === 1 ? "" : "s"} this month</p>
          </td>
        </tr>
      </table>
      <p style="font-size:13px;color:#6B7F76;margin-top:20px;">
        See your full 6-month trend anytime at vaibook.bz in your business dashboard, under "Monthly review."
      </p>
    </div>
  </div>`;
}

Deno.serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const now = new Date();
    const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const monthStr = lastMonthStart.toISOString().slice(0, 10);
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
    const prevMonthStr = prevMonthStart.toISOString().slice(0, 10);

    const { data: providers, error: provErr } = await supabase
      .from("provider_profiles")
      .select("id, user_id, business_name, users(email, full_name)")
      .eq("is_active", true);
    if (provErr) throw provErr;

    const { data: stats, error: statsErr } = await supabase
      .from("provider_monthly_stats")
      .select("*")
      .in("month_start", [monthStr, prevMonthStr]);
    if (statsErr) throw statsErr;

    // Who already got this month's review — never send twice.
    const { data: already, error: alreadyErr } = await supabase
      .from("notifications")
      .select("user_id")
      .eq("type", "monthly_review")
      .gte("created_at", thisMonthStart.toISOString());
    if (alreadyErr) throw alreadyErr;
    const done = new Set((already || []).map((n) => n.user_id));

    let sent = 0, notified = 0, skipped = 0, failed = 0;

    for (const p of providers || []) {
      if (done.has(p.user_id)) { skipped++; continue; }
      const thisStat = (stats || []).find((s) => s.provider_id === p.id && s.month_start === monthStr);
      const prevStat = (stats || []).find((s) => s.provider_id === p.id && s.month_start === prevMonthStr);

      if (!thisStat || (thisStat.bookings_total === 0 && Number(thisStat.revenue_total) === 0 && thisStat.reviews_count === 0)) {
        skipped++;
        continue;
      }

      await supabase.from("notifications").insert({
        user_id: p.user_id,
        title: "Your monthly review is ready",
        body: `BZ$${Number(thisStat.revenue_total).toFixed(0)} earned, ${thisStat.bookings_total} booking${thisStat.bookings_total === 1 ? "" : "s"} last month.`,
        type: "monthly_review",
      });
      notified++;

      const email = (p as any).users?.email;
      if (!email || /@phone\.vaibook\.bz$/i.test(email)) continue;

      const html = reviewEmailHtml({
        businessName: p.business_name || (p as any).users?.full_name || "there",
        monthStr,
        revenue: Number(thisStat.revenue_total),
        bookingsTotal: thisStat.bookings_total,
        bookingsCompleted: thisStat.bookings_completed,
        avgRating: thisStat.avg_rating != null ? Number(thisStat.avg_rating) : null,
        reviewsCount: thisStat.reviews_count,
        prevRevenue: prevStat ? Number(prevStat.revenue_total) : null,
      });

      const r = await sendViaResend(email, `Your ${monthLabel(monthStr)} review is in`, html);
      if (r.ok) sent++;
      else { failed++; console.error("Resend error:", r.text.slice(0, 300)); }
    }

    return new Response(JSON.stringify({ sent, notified, skipped, failed }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
