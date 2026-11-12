import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// phone-code — 2026-11-12.
// Sends a 6-digit code to a customer's WhatsApp (Meta WhatsApp Cloud API,
// authentication template) and checks it. All the rules (who may ask for a
// code, limits, expiry, 5 tries, marking the number confirmed, resetting the
// password) live in the database functions phone_code_issue / phone_code_check;
// this function only handles the WhatsApp side.
//
// POST { action: "send",  phone, purpose: "verify" | "reset", lang? }
// POST { action: "check", phone, purpose, code, new_password? }
// "verify" needs the signed-in customer's token; "reset" doesn't.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   WHATSAPP_TOKEN            permanent System User token from Meta
//   WHATSAPP_PHONE_NUMBER_ID  the VaiBook sender's phone number ID
//   WHATSAPP_TEMPLATE         approved authentication template name (default vaibook_code)
//   WHATSAPP_TEMPLATE_LANGS   languages it's approved in (default "en_US,es")

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WA_TOKEN = Deno.env.get("WHATSAPP_TOKEN") || "";
const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
const WA_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE") || "vaibook_code";
const WA_LANGS = (Deno.env.get("WHATSAPP_TEMPLATE_LANGS") || "en_US,es").split(",").map((s) => s.trim()).filter(Boolean);
const GRAPH = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v22.0";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// Errors come back as 200 + { error } so the app can read them easily.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function sendWhatsAppCode(to: string, code: string, lang: string) {
  const wanted = lang === "es" ? "es" : "en_US";
  const language = WA_LANGS.includes(wanted) ? wanted : WA_LANGS[0] || "en_US";
  const resp = await fetch(`https://graph.facebook.com/${GRAPH}/${WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: WA_TEMPLATE,
        language: { code: language },
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
        ],
      },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) console.error("whatsapp send failed", resp.status, JSON.stringify((data as any)?.error || {}).slice(0, 300));
  return resp.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "METHOD" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "BAD_REQUEST" }); }
  const action = String(body.action || "");
  const phone = String(body.phone || "").slice(0, 40);
  const purpose = String(body.purpose || "");
  if (!["verify", "reset"].includes(purpose)) return json({ error: "BAD_PURPOSE" });

  // Off until Meta is set up and the admin switch is on.
  const { data: enabled } = await admin.rpc("phone_codes_enabled");
  if (!enabled || !WA_TOKEN || !WA_PHONE_ID) return json({ error: "NOT_READY" });

  // Who is asking (only needed for "verify").
  let userId: string | null = null;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (token && token.split(".").length === 3) {
    const { data } = await admin.auth.getUser(token);
    userId = data?.user?.id || null;
  }
  if (purpose === "verify" && !userId) return json({ error: "LOGIN_FIRST" });

  if (action === "send") {
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const { data, error } = await admin.rpc("phone_code_issue", { p_phone: phone, p_purpose: purpose, p_user: userId, p_ip: ip });
    if (error) return json({ error: "FAILED" });
    if (data?.error) return json({ error: data.error });
    const sent = await sendWhatsAppCode(String(data.phone), String(data.code), String(body.lang || "en"));
    if (!sent) return json({ error: "SEND_FAILED" });
    return json({ ok: true });
  }

  if (action === "check") {
    const code = String(body.code || "").replace(/\D/g, "").slice(0, 6);
    const newPassword = purpose === "reset" ? String(body.new_password || "") : null;
    if (newPassword !== null && (newPassword.length < 8 || newPassword.length > 72)) return json({ error: "PASSWORD_TOO_SHORT" });
    const { data, error } = await admin.rpc("phone_code_check", {
      p_phone: phone, p_purpose: purpose, p_code: code, p_user: userId, p_new_password: newPassword,
    });
    if (error) return json({ error: "FAILED" });
    if (data?.error) return json({ error: data.error, tries_left: data.tries_left });
    return json({ ok: true });
  }

  return json({ error: "BAD_ACTION" });
});
