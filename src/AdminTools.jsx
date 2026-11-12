import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

// Admin tools (2026-10-31): the controls that change VaiBook for everyone
// without a code change. Loaded only inside the admin portal.
//   settings  — prices, free-plan cap, trial/grace days, payment details, site banner
//   customers — search everyone, block / unblock
//   bookings  — every booking across all businesses
//   reviews   — hide / unhide reviews
//   broadcast — message businesses, team members, customers or everyone
//   content   — service categories, districts, morning verses
// Saving settings or content fires "vaibook-platform-updated" so the app
// reloads them straight away.

export const notifyPlatformUpdated = () => {
  try { window.dispatchEvent(new CustomEvent("vaibook-platform-updated")); } catch (e) { /* ignore */ }
};

const money = (n) => "BZ$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
  if (!d) return "—";
  const x = new Date(String(d).length <= 10 ? d + "T12:00:00" : d);
  return isNaN(x) ? "—" : x.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
const errText = (error) => {
  const m = String((error && (error.message || error)) || "");
  if (/NOT_AUTHORIZED/.test(m)) return "Only VaiBook admins can do this. Try signing out and back in.";
  if (/CANNOT_BLOCK_ADMIN/.test(m)) return "Admin accounts can't be blocked.";
  if (/DUPLICATE_BROADCAST/.test(m)) return "That message was just sent. Wait a minute before sending it again.";
  if (/duplicate key|unique/i.test(m)) return "That name is already used. Pick a different one.";
  if (/check constraint|violates/i.test(m)) return "One of the values isn't allowed. Check the numbers and lengths and try again.";
  return "That didn't save. Check your connection and try again.";
};
const rows = (data) => (Array.isArray(data) ? data : data ? [data] : []);

function Header({ title, sub }) {
  return (
    <div className="portal-header">
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  );
}

function Chips({ value, onChange, options }) {
  return (
    <div className="at-chips" role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id}
          className={`at-chip${value === o.id ? " on" : ""}`} onClick={() => onChange(o.id)}>
          {o.label}{o.count != null ? <span className="at-chip-n">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="at-field">
      <span className="at-label">{label}</span>
      {children}
      {hint && <span className="at-hint">{hint}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="at-toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="at-toggle-track" aria-hidden="true"><span /></span>
      <span className="at-toggle-text"><b>{label}</b>{hint && <small>{hint}</small>}</span>
    </label>
  );
}

function Notice({ msg }) {
  if (!msg) return null;
  return <div className={`at-notice ${msg.ok ? "ok" : "bad"}`} role="status">{msg.text}</div>;
}

// ── SETTINGS ───────────────────────────────────────────────────────────
const NUM_FIELDS = ["solo_monthly", "solo_six_month", "team_monthly", "team_six_month", "team_free_seats", "team_seat_price", "setup_fee", "free_booking_cap", "trial_days", "grace_days", "founding_partner_limit", "spotlight_slots", "spotlight_week_price"];

// "Where businesses pay you" — any number of banks and mobile wallets.
// Shown in each business's Billing tab (during a free trial, only from 24
// hours before it ends). Saved with the rest of Settings & prices.
const BLANK_PAY = { kind: "bank", name: "", account_name: "", account_number: "", note: "" };
function PayMethodsEditor({ form, set }) {
  const hasList = Array.isArray(form.pay_methods);
  const list = hasList ? form.pay_methods : [];
  const update = (i, patch) => set("pay_methods")(list.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const add = (kind) => set("pay_methods")([...list, { ...BLANK_PAY, kind, name: kind === "wallet" ? "" : "" }]);
  const remove = (i) => set("pay_methods")(list.filter((_, j) => j !== i));
  const move = (i, d) => {
    const j = i + d; if (j < 0 || j >= list.length) return;
    const next = list.slice(); [next[i], next[j]] = [next[j], next[i]]; set("pay_methods")(next);
  };
  return (
    <div className="card at-card">
      <div className="card-title">Where businesses pay you</div>
      <p className="at-muted">Add as many banks and mobile wallets as you like. They show in every business's Billing tab in this order. A business on its free trial sees them from 24 hours before the trial ends.</p>
      {!hasList && <p className="at-muted" style={{ color: "#B91C1C" }}>This list needs a quick database update before it can be saved.</p>}
      {list.length === 0 && hasList && <p className="at-muted">Nothing added yet — businesses are told to message you for the details.</p>}
      {list.map((m, i) => (
        <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <b style={{ fontSize: 13 }}>{m.kind === "wallet" ? "📱 Mobile wallet" : "🏦 Bank"} {i + 1}</b>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn-sm" style={{ border: "1px solid var(--border)" }} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className="btn-sm" style={{ border: "1px solid var(--border)" }} disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" className="btn-sm" style={{ border: "1px solid #e05252", color: "#e05252" }} onClick={() => remove(i)}>Remove</button>
          </div>
          <div className="at-grid">
            <Field label={m.kind === "wallet" ? "Wallet (e.g. DigiWallet, E-Kyash)" : "Bank (e.g. Belize Bank, Heritage)"}><input maxLength={60} value={m.name || ""} onChange={(e) => update(i, { name: e.target.value })} /></Field>
            <Field label="Account name"><input maxLength={80} value={m.account_name || ""} onChange={(e) => update(i, { account_name: e.target.value })} /></Field>
            <Field label={m.kind === "wallet" ? "Wallet number" : "Account number"}><input maxLength={60} value={m.account_number || ""} onChange={(e) => update(i, { account_number: e.target.value })} /></Field>
            <Field label="Extra note (optional)" hint="e.g. branch, account type, put your business name as the reference"><input maxLength={160} value={m.note || ""} onChange={(e) => update(i, { note: e.target.value })} /></Field>
          </div>
        </div>
      ))}
      {hasList && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn-sm" style={{ border: "1px solid var(--border)" }} onClick={() => add("bank")}>+ Add a bank</button>
          <button type="button" className="btn-sm" style={{ border: "1px solid var(--border)" }} onClick={() => add("wallet")}>+ Add a mobile wallet</button>
        </div>
      )}
    </div>
  );
}

function AdminSettings() {
  const [form, setForm] = useState(null);
  const [orig, setOrig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("platform_settings").select("*").limit(1);
    const row = rows(data)[0];
    if (error || !row) { setMsg({ ok: false, text: "Couldn't load the settings. Refresh to try again." }); return; }
    setForm(row); setOrig(row);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!form) return (<><Header title="Settings & prices" /><Notice msg={msg} />{!msg && <p className="at-muted">Loading…</p>}</>);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k) => (e) => set(k)(e.target.value);
  const changed = JSON.stringify(form) !== JSON.stringify(orig);
  const perDay = (total, days) => (Number(total) > 0 ? (Number(total) / days).toFixed(2) : "0.00");

  const save = async () => {
    const patch = {};
    for (const k of Object.keys(form)) {
      if (["id", "updated_at", "updated_by"].includes(k)) continue;
      if (k === "pay_methods") {
        if (JSON.stringify(form[k]) === JSON.stringify(orig[k])) continue;
        const clean = (form[k] || []).map((m) => ({
          kind: m.kind === "wallet" ? "wallet" : "bank",
          name: String(m.name || "").trim(), account_name: String(m.account_name || "").trim(),
          account_number: String(m.account_number || "").trim(), note: String(m.note || "").trim(),
        })).filter((m) => m.name || m.account_name || m.account_number || m.note);
        if (clean.some((m) => !m.name || !(m.account_number || m.note))) { setMsg({ ok: false, text: "Each bank or wallet needs a name and an account number (or a note with the details)." }); return; }
        patch[k] = clean;
        continue;
      }
      if (form[k] === orig[k]) continue;
      if (NUM_FIELDS.includes(k)) {
        const n = Number(form[k]);
        if (form[k] === "" || !isFinite(n) || n < 0) { setMsg({ ok: false, text: "Prices and numbers can't be empty or below zero." }); return; }
        patch[k] = ["team_free_seats", "free_booking_cap", "trial_days", "grace_days", "founding_partner_limit", "spotlight_slots"].includes(k) ? Math.round(n) : Math.round(n * 100) / 100;
      } else patch[k] = typeof form[k] === "string" ? form[k].trim() : form[k];
    }
    if (form.banner_link && !/^(https:\/\/|#)/i.test(form.banner_link.trim())) { setMsg({ ok: false, text: "The banner link has to start with https:// (or # for a page inside VaiBook)." }); return; }
    if (!Object.keys(patch).length) return;
    setSaving(true); setMsg(null);
    const { data, error } = await supabase.from("platform_settings").update(patch).eq("id", true).select("*");
    setSaving(false);
    const row = rows(data)[0];
    if (error || !row) { setMsg({ ok: false, text: errText(error) }); return; }
    setForm(row); setOrig(row);
    setMsg({ ok: true, text: "Saved. Everyone sees the new settings the next time a page loads." });
    notifyPlatformUpdated();
  };

  return (
    <>
      <Header title="Settings & prices" sub="These apply to everyone on VaiBook. Changes show on the site straight away." />
      <div className="card at-card">
        <div className="card-title">Plans & prices</div>
        <p className="at-muted">The 6-month price covers 7 months (pay 6, get 1 free). The per-day price is worked out from it.</p>
        <div className="at-grid">
          <Field label="Solo · monthly (BZ$)" hint={`BZ$${perDay(form.solo_monthly, 30)}/day`}><input type="number" inputMode="decimal" min="0" step="0.01" value={form.solo_monthly} onChange={num("solo_monthly")} /></Field>
          <Field label="Solo · 6 months (BZ$)" hint={`BZ$${perDay(form.solo_six_month, 210)}/day`}><input type="number" inputMode="decimal" min="0" step="0.01" value={form.solo_six_month} onChange={num("solo_six_month")} /></Field>
          <Field label="Team · monthly (BZ$)" hint={`BZ$${perDay(form.team_monthly, 30)}/day`}><input type="number" inputMode="decimal" min="0" step="0.01" value={form.team_monthly} onChange={num("team_monthly")} /></Field>
          <Field label="Team · 6 months (BZ$)" hint={`BZ$${perDay(form.team_six_month, 210)}/day`}><input type="number" inputMode="decimal" min="0" step="0.01" value={form.team_six_month} onChange={num("team_six_month")} /></Field>
          <Field label="Team · staff seats included"><input type="number" inputMode="numeric" min="0" step="1" value={form.team_free_seats} onChange={num("team_free_seats")} /></Field>
          <Field label="Team · each extra seat (BZ$/month)"><input type="number" inputMode="decimal" min="0" step="0.01" value={form.team_seat_price} onChange={num("team_seat_price")} /></Field>
        </div>
      </div>

      <div className="card at-card">
        <div className="card-title">Free trial & late payments</div>
        <div className="at-grid">
          <Field label="Free trial · days" hint="Counts from when you approve the application. Solo or Team, whichever they applied for."><input type="number" inputMode="numeric" min="1" max="365" step="1" value={form.trial_days} onChange={num("trial_days")} /></Field>
          <Field label="Spotlight spots per district" hint="Businesses shown first on the main page and Recommended, per district."><input type="number" inputMode="numeric" min="0" max="20" step="1" value={form.spotlight_slots ?? 3} onChange={num("spotlight_slots")} /></Field>
          <Field label="Spotlight price per week (BZ$)"><input type="number" inputMode="decimal" min="0" step="0.01" value={form.spotlight_week_price ?? 25} onChange={num("spotlight_week_price")} /></Field>
          <Field label="Founding Partner spots" hint="The first this-many businesses get the 🏅 Founding Partner badge for good. Everyone already on VaiBook has it."><input type="number" inputMode="numeric" min="0" max="10000" step="1" value={form.founding_partner_limit ?? 50} onChange={num("founding_partner_limit")} /></Field>
        </div>
      </div>

      <PayMethodsEditor form={form} set={set} />

      {"phone_codes_on" in form && (
        <div className="card at-card">
          <div className="card-title">Customer sign-up · WhatsApp codes</div>
          <p className="at-muted">When on, every customer has to confirm their WhatsApp number with a 6-digit code before their account works (once — after that it's number + password), and "Forgot password" sends a code instead of messaging you. Turn on only after the Meta WhatsApp sender is set up, or nobody new can sign up. Each code costs about BZ$0.02.</p>
          <Toggle checked={!!form.phone_codes_on} onChange={set("phone_codes_on")} label="WhatsApp codes on" />
        </div>
      )}

      <div className="card at-card">
        <div className="card-title">Site banner</div>
        <p className="at-muted">A strip across the top of VaiBook, for news, a promo or a heads-up. People can close it; a new message shows again.</p>
        <Toggle checked={form.banner_on} onChange={set("banner_on")} label="Show the banner" />
        <div className="at-grid">
          <Field label="Style">
            <select value={form.banner_kind} onChange={(e) => set("banner_kind")(e.target.value)}>
              <option value="info">News (violet)</option>
              <option value="promo">Promo (green)</option>
              <option value="warning">Heads-up (amber)</option>
            </select>
          </Field>
          <Field label="Who sees it">
            <select value={form.banner_audience} onChange={(e) => set("banner_audience")(e.target.value)}>
              <option value="everyone">Everyone</option>
              <option value="customers">Customers (booking side)</option>
              <option value="businesses">Businesses (their portal)</option>
            </select>
          </Field>
        </div>
        <div className="at-grid one">
          <Field label="Message (English)" hint={`${(form.banner_en || "").length}/300`}><input maxLength={300} value={form.banner_en} onChange={(e) => set("banner_en")(e.target.value)} placeholder="e.g. New: book barbers in Orange Walk" /></Field>
          <Field label="Message (Spanish)" hint="Leave empty to show the English one."><input maxLength={300} value={form.banner_es} onChange={(e) => set("banner_es")(e.target.value)} /></Field>
          <Field label="Link (optional)" hint="https://… or # for a page inside VaiBook, e.g. #providers"><input maxLength={300} value={form.banner_link} onChange={(e) => set("banner_link")(e.target.value)} placeholder="https://" /></Field>
        </div>
        {form.banner_en && (
          <div className={`vb-site-banner k-${form.banner_kind} at-preview`}><span>{form.banner_en}</span>{form.banner_link && <b> Learn more →</b>}</div>
        )}
      </div>

      <div className="at-savebar">
        <Notice msg={msg} />
        <div className="at-savebar-row">
          {orig.updated_at && <span className="at-muted">Last saved {fmtDate(orig.updated_at)}{orig.updated_by ? ` by ${orig.updated_by}` : ""}</span>}
          <button type="button" className="btn-sm ghost" disabled={!changed || saving} onClick={() => { setForm(orig); setMsg(null); }}>Undo changes</button>
          <button type="button" className="btn-sm forest" disabled={!changed || saving} onClick={save}>{saving ? "Saving…" : "Save for everyone"}</button>
        </div>
      </div>
    </>
  );
}

// ── CUSTOMERS ──────────────────────────────────────────────────────────
function AdminCustomers({ filter: initialFilter }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState(initialFilter || "all");
  const [busy, setBusy] = useState(null);
  const [blocking, setBlocking] = useState(null); // { id, reason }
  const [msg, setMsg] = useState(null);
  const load = useCallback(async (search) => {
    const { data, error } = await supabase.rpc("admin_list_customers", { p_search: search || "", p_limit: 300 });
    if (error) { setMsg({ ok: false, text: errText(error) }); setList([]); return; }
    setList(rows(data));
  }, []);
  useEffect(() => { const t = setTimeout(() => load(q), q ? 300 : 0); return () => clearTimeout(t); }, [q, load]);

  const counts = useMemo(() => {
    const c = { all: 0, customer: 0, business: 0, team: 0, blocked: 0 };
    (list || []).forEach((u) => { c.all++; c[u.kind] = (c[u.kind] || 0) + 1; if (u.blocked) c.blocked++; });
    return c;
  }, [list]);
  const shown = (list || []).filter((u) => kind === "all" || (kind === "blocked" ? u.blocked : u.kind === kind));

  const setBlocked = async (u, blocked, reason) => {
    setBusy(u.id); setMsg(null);
    const { error } = await supabase.rpc("admin_set_customer_blocked", { p_user_id: u.id, p_blocked: blocked, p_reason: reason || null });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: errText(error) }); return; }
    setBlocking(null);
    setList((l) => l.map((x) => (x.id === u.id ? { ...x, blocked, block_reason: blocked ? reason || null : null } : x)));
    setMsg({ ok: true, text: blocked ? `${u.full_name || "That account"} can no longer book or post reviews.` : `${u.full_name || "That account"} can book again.` });
  };
  const wa = (p) => String(p || "").replace(/[^0-9]/g, "");

  return (
    <>
      <Header title="Customers" sub="Everyone with a VaiBook account. Block someone who keeps not showing up or is abusive; blocked accounts can't book or post reviews." />
      <div className="card at-card">
        <input className="at-search" type="search" placeholder="Search by name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search accounts" />
        <Chips value={kind} onChange={setKind} options={[
          { id: "all", label: "All", count: counts.all },
          { id: "customer", label: "Customers", count: counts.customer },
          { id: "business", label: "Business owners", count: counts.business },
          { id: "team", label: "Team", count: counts.team },
          { id: "blocked", label: "Blocked", count: counts.blocked },
        ]} />
        <Notice msg={msg} />
        {list === null ? <p className="at-muted">Loading…</p> : shown.length === 0 ? <p className="at-muted">Nobody here{q ? " matches that search" : ""}.</p> : (
          <div className="at-list">
            {shown.map((u) => (
              <div className={`at-row${u.blocked ? " blocked" : ""}`} key={u.id}>
                <div className="at-row-main">
                  <div className="at-row-title">
                    {u.full_name || "No name"}
                    <span className={`at-tag t-${u.kind}`}>{({ customer: "Customer", business: "Business owner", team: "Team", admin: "Admin" })[u.kind] || u.kind}</span>
                    {u.blocked && <span className="at-tag t-blocked">Blocked</span>}
                  </div>
                  <div className="at-row-meta">
                    {u.phone && <a href={`https://wa.me/${wa(u.phone)}`} target="_blank" rel="noopener noreferrer">{u.phone}</a>}
                    {u.email && <span>{u.email}</span>}
                    <span>Joined {fmtDate(u.created_at)}</span>
                  </div>
                  <div className="at-row-stats">
                    <span><b>{u.bookings}</b> bookings</span>
                    {Number(u.no_shows) > 0 && <span className="warn"><b>{u.no_shows}</b> no-shows</span>}
                    {Number(u.cancelled) > 0 && <span><b>{u.cancelled}</b> cancelled</span>}
                    <span><b>{u.reviews}</b> reviews</span>
                    {u.last_booking && <span>Last booking {fmtDate(u.last_booking)}</span>}
                  </div>
                  {u.blocked && u.block_reason && <div className="at-row-note">Reason: {u.block_reason}</div>}
                  {blocking && blocking.id === u.id && (
                    <div className="at-inline-form">
                      <input autoFocus maxLength={300} placeholder="Reason (only admins see this)" value={blocking.reason} onChange={(e) => setBlocking({ ...blocking, reason: e.target.value })} />
                      <button type="button" className="btn-sm at-danger" disabled={busy === u.id} onClick={() => setBlocked(u, true, blocking.reason.trim())}>{busy === u.id ? "Blocking…" : "Block account"}</button>
                      <button type="button" className="btn-sm ghost" onClick={() => setBlocking(null)}>Cancel</button>
                    </div>
                  )}
                </div>
                {u.kind !== "admin" && !(blocking && blocking.id === u.id) && (
                  <div className="at-row-actions">
                    {u.blocked
                      ? <button type="button" className="btn-sm ghost" disabled={busy === u.id} onClick={() => setBlocked(u, false)}>{busy === u.id ? "…" : "Unblock"}</button>
                      : <button type="button" className="btn-sm ghost at-danger-ghost" onClick={() => setBlocking({ id: u.id, reason: "" })}>Block</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── BOOKINGS ───────────────────────────────────────────────────────────
const STATUS_LABEL = { pending: "Waiting", awaiting_payment: "Awaiting deposit", confirmed: "Confirmed", completed: "Done", cancelled: "Cancelled", rejected: "Declined", no_show: "No-show" };
function AdminBookings() {
  const [days, setDays] = useState("30");
  const [list, setList] = useState(null);
  const [status, setStatus] = useState("all");
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let alive = true; setList(null);
    supabase.rpc("admin_list_bookings", { p_days: days === "all" ? null : Number(days), p_limit: 1000 }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setMsg({ ok: false, text: errText(error) }); setList([]); return; }
      setList(rows(data));
    });
    return () => { alive = false; };
  }, [days]);
  const shown = (list || []).filter((b) => status === "all" || b.status === status);
  const value = shown.filter((b) => ["pending", "awaiting_payment", "confirmed", "completed"].includes(b.status)).reduce((a, b) => a + (Number(b.total_amount) || 0), 0);
  const statusCounts = (list || []).reduce((m, b) => { m[b.status] = (m[b.status] || 0) + 1; return m; }, {});

  return (
    <>
      <Header title="Bookings" sub="Every booking made on VaiBook, newest first." />
      <div className="card at-card">
        <Chips value={days} onChange={setDays} options={[{ id: "7", label: "7 days" }, { id: "30", label: "30 days" }, { id: "90", label: "90 days" }, { id: "all", label: "All time" }]} />
        <Chips value={status} onChange={setStatus} options={[{ id: "all", label: "All", count: (list || []).length },
          ...Object.keys(STATUS_LABEL).filter((k) => statusCounts[k]).map((k) => ({ id: k, label: STATUS_LABEL[k], count: statusCounts[k] }))]} />
        <Notice msg={msg} />
        {list !== null && <div className="at-summary"><b>{shown.length}</b> bookings · <b>{money(value)}</b> booked (not counting cancelled or declined)</div>}
        {list === null ? <p className="at-muted">Loading…</p> : shown.length === 0 ? <p className="at-muted">No bookings in this range.</p> : (
          <div className="at-list">
            {shown.map((b) => (
              <div className="at-row" key={b.id}>
                <div className="at-row-main">
                  <div className="at-row-title">{b.business_name || "Business"}<span className={`at-tag s-${b.status}`}>{STATUS_LABEL[b.status] || b.status}</span></div>
                  <div className="at-row-meta">
                    <span>{b.service_name || "Service"}</span>
                    <span>{b.customer_name || "Customer"}</span>
                    {b.district && <span>{b.district}</span>}
                  </div>
                  <div className="at-row-stats">
                    <span>For {fmtDate(b.booking_date)}{b.booking_time ? ` · ${String(b.booking_time).slice(0, 5)}` : ""}</span>
                    <span>Made {fmtDate(b.created_at)}</span>
                    {b.order_number && <span>#{b.order_number}</span>}
                  </div>
                </div>
                <div className="at-row-amount">{money(b.total_amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── REVIEWS ────────────────────────────────────────────────────────────
function AdminReviews({ filter: initialFilter }) {
  const [filter, setFilter] = useState(initialFilter || "all");
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(null);
  const [hiding, setHiding] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let alive = true; setList(null);
    supabase.rpc("admin_list_reviews", { p_filter: filter, p_limit: 300 }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setMsg({ ok: false, text: errText(error) }); setList([]); return; }
      setList(rows(data));
    });
    return () => { alive = false; };
  }, [filter]);
  const setHidden = async (r, hidden, reason) => {
    setBusy(r.id); setMsg(null);
    const { error } = await supabase.rpc("admin_set_review_hidden", { p_review_id: r.id, p_hidden: hidden, p_reason: reason || null });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: errText(error) }); return; }
    setHiding(null);
    setList((l) => l.map((x) => (x.id === r.id ? { ...x, is_hidden: hidden, hidden_reason: hidden ? reason || null : null } : x)).filter((x) => filter !== "hidden" || x.is_hidden));
    setMsg({ ok: true, text: hidden ? "Hidden. It no longer shows on the business page or counts toward its rating." : "Back on the business page." });
  };
  const avg = list && list.length ? (list.filter((r) => !r.is_hidden).reduce((a, r) => a + r.rating, 0) / Math.max(1, list.filter((r) => !r.is_hidden).length)).toFixed(1) : null;

  return (
    <>
      <Header title="Reviews" sub="Hide fake, abusive or off-topic reviews. Hidden reviews disappear from the business page and stop counting toward its rating; only the person who wrote it still sees it." />
      <div className="card at-card">
        <Chips value={filter} onChange={setFilter} options={[{ id: "all", label: "All" }, { id: "low", label: "1–2 stars" }, { id: "hidden", label: "Hidden" }]} />
        <Notice msg={msg} />
        {list !== null && filter === "all" && avg && <div className="at-summary"><b>★ {avg}</b> average across {list.filter((r) => !r.is_hidden).length} visible reviews</div>}
        {list === null ? <p className="at-muted">Loading…</p> : list.length === 0 ? <p className="at-muted">No reviews here yet.</p> : (
          <div className="at-list">
            {list.map((r) => (
              <div className={`at-row${r.is_hidden ? " blocked" : ""}`} key={r.id}>
                <div className="at-row-main">
                  <div className="at-row-title">
                    <span className={`at-stars${r.rating <= 2 ? " low" : ""}`} aria-label={`${r.rating} stars`}>{"★".repeat(r.rating)}<span className="off">{"★".repeat(5 - r.rating)}</span></span>
                    {r.business_name || "Business"}
                    {r.is_hidden && <span className="at-tag t-blocked">Hidden</span>}
                  </div>
                  {r.comment ? <div className="at-quote">“{r.comment}”</div> : <div className="at-muted">No comment, stars only.</div>}
                  <div className="at-row-meta"><span>{r.customer_name || "Customer"}</span><span>{fmtDate(r.created_at)}</span></div>
                  {r.is_hidden && r.hidden_reason && <div className="at-row-note">Reason: {r.hidden_reason}</div>}
                  {hiding && hiding.id === r.id && (
                    <div className="at-inline-form">
                      <input autoFocus maxLength={200} placeholder="Why? (only admins see this)" value={hiding.reason} onChange={(e) => setHiding({ ...hiding, reason: e.target.value })} />
                      <button type="button" className="btn-sm at-danger" disabled={busy === r.id} onClick={() => setHidden(r, true, hiding.reason.trim())}>{busy === r.id ? "Hiding…" : "Hide review"}</button>
                      <button type="button" className="btn-sm ghost" onClick={() => setHiding(null)}>Cancel</button>
                    </div>
                  )}
                </div>
                {!(hiding && hiding.id === r.id) && (
                  <div className="at-row-actions">
                    {r.is_hidden
                      ? <button type="button" className="btn-sm ghost" disabled={busy === r.id} onClick={() => setHidden(r, false)}>{busy === r.id ? "…" : "Show again"}</button>
                      : <button type="button" className="btn-sm ghost at-danger-ghost" onClick={() => setHiding({ id: r.id, reason: "" })}>Hide</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── BROADCAST ──────────────────────────────────────────────────────────
const AUDIENCES = [
  { id: "businesses", label: "Business owners" },
  { id: "team", label: "Team members" },
  { id: "customers", label: "Customers" },
  { id: "everyone", label: "Everyone" },
];
function AdminBroadcast() {
  const [audience, setAudience] = useState("businesses");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sizes, setSizes] = useState(null);
  const [history, setHistory] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from("platform_broadcasts").select("*").order("created_at", { ascending: false }).limit(20);
    setHistory(rows(data));
  }, []);
  useEffect(() => {
    supabase.rpc("admin_broadcast_audience_sizes").then(({ data }) => setSizes(data && !Array.isArray(data) ? data : null));
    loadHistory();
  }, [loadHistory]);
  const n = sizes ? Number(sizes[audience] || 0) : null;
  const ready = title.trim() && body.trim();
  const send = async () => {
    setSending(true); setMsg(null);
    const { data, error } = await supabase.rpc("admin_broadcast", { p_audience: audience, p_title: title.trim(), p_body: body.trim() });
    setSending(false); setConfirming(false);
    if (error) { setMsg({ ok: false, text: errText(error) }); return; }
    setMsg({ ok: true, text: `Sent to ${Number(data) || 0} ${Number(data) === 1 ? "person" : "people"}. It's in their notifications, and phones with notifications on get a push.` });
    setTitle(""); setBody(""); loadHistory();
  };

  return (
    <>
      <Header title="Broadcast" sub="Send a message to a whole group at once. It lands in their VaiBook notifications and as a push on phones that allow it." />
      <div className="card at-card">
        <Field label="Send to">
          <Chips value={audience} onChange={(v) => { setAudience(v); setConfirming(false); }} options={AUDIENCES.map((a) => ({ ...a, count: sizes ? sizes[a.id] : null }))} />
        </Field>
        <Field label="Title" hint={`${title.length}/120`}><input maxLength={120} value={title} onChange={(e) => { setTitle(e.target.value); setConfirming(false); }} placeholder="e.g. New: online deposits are live" /></Field>
        <Field label="Message" hint={`${body.length}/1000`}><textarea rows={4} maxLength={1000} value={body} onChange={(e) => { setBody(e.target.value); setConfirming(false); }} placeholder="Keep it short and say what to do next." /></Field>
        {ready && (
          <div className="at-push-preview" aria-label="Preview">
            <div className="at-push-app">VaiBook · now</div>
            <div className="at-push-title">{title}</div>
            <div className="at-push-body">{body}</div>
          </div>
        )}
        <Notice msg={msg} />
        <div className="at-savebar-row">
          {!confirming ? (
            <button type="button" className="btn-sm forest" disabled={!ready || sending || n === 0} onClick={() => setConfirming(true)}>Send{n != null ? ` to ${n}` : ""}</button>
          ) : (
            <>
              <span className="at-confirm-text">Send to {n} {AUDIENCES.find((a) => a.id === audience).label.toLowerCase()}? This can't be undone.</span>
              <button type="button" className="btn-sm ghost" onClick={() => setConfirming(false)}>Cancel</button>
              <button type="button" className="btn-sm forest" disabled={sending} onClick={send}>{sending ? "Sending…" : "Yes, send it"}</button>
            </>
          )}
        </div>
      </div>
      <div className="card at-card">
        <div className="card-title">Sent before</div>
        {history === null ? <p className="at-muted">Loading…</p> : history.length === 0 ? <p className="at-muted">Nothing sent yet.</p> : (
          <div className="at-list">
            {history.map((h) => (
              <div className="at-row" key={h.id}>
                <div className="at-row-main">
                  <div className="at-row-title">{h.title}<span className="at-tag">{(AUDIENCES.find((a) => a.id === h.audience) || {}).label || h.audience}</span></div>
                  <div className="at-quote">{h.body}</div>
                  <div className="at-row-meta"><span>{fmtDate(h.created_at)}</span><span>{h.recipients} people</span>{h.created_by && <span>{h.created_by}</span>}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── CONTENT: categories, districts, verses ─────────────────────────────
const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().split(" ").map((w, i) => (i ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join("").slice(0, 40);

function CategoriesEditor({ onMsg }) {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [adding, setAdding] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from("service_categories").select("*").order("sort_order").order("name_en");
    setList(rows(data));
  }, []);
  useEffect(() => { load(); }, [load]);
  const saveRow = async (row, isNew) => {
    const r = { ...row, name_en: (row.name_en || "").trim(), name_es: (row.name_es || "").trim(), desc_en: (row.desc_en || "").trim(), desc_es: (row.desc_es || "").trim(), icon: (row.icon || "✨").trim() || "✨" };
    if (!r.name_en) { onMsg({ ok: false, text: "Give the category a name." }); return; }
    if (isNew) {
      r.service_type = (row.service_type || "").trim() || r.name_en;
      r.key = slug(r.name_en) || "cat" + Date.now();
      r.search_term = (row.search_term || "").trim() || r.service_type;
      r.sort_order = (Math.max(0, ...(list || []).filter((c) => c.key !== "other").map((c) => c.sort_order)) || 0) + 10;
    }
    setBusy(true);
    const q = isNew ? supabase.from("service_categories").insert(r).select("*") : supabase.from("service_categories").update({
      name_en: r.name_en, name_es: r.name_es, desc_en: r.desc_en, desc_es: r.desc_es, icon: r.icon,
      search_term: (r.search_term || "").trim() || r.service_type, show_on_home: !!r.show_on_home, is_active: !!r.is_active,
    }).eq("key", r.key).select("*");
    const { data, error } = await q;
    setBusy(false);
    if (error || !rows(data).length) { onMsg({ ok: false, text: errText(error) }); return; }
    setEdit(null); setAdding(null); onMsg({ ok: true, text: isNew ? `Added “${r.name_en}”.` : `Saved “${r.name_en}”.` });
    load(); notifyPlatformUpdated();
  };
  const move = async (idx, dir) => {
    const a = list[idx], b = list[idx + dir];
    if (!a || !b) return;
    setBusy(true);
    const r1 = await supabase.from("service_categories").update({ sort_order: b.sort_order }).eq("key", a.key);
    const r2 = await supabase.from("service_categories").update({ sort_order: a.sort_order === b.sort_order ? a.sort_order + dir : a.sort_order }).eq("key", b.key);
    setBusy(false);
    if (r1.error || r2.error) { onMsg({ ok: false, text: errText(r1.error || r2.error) }); return; }
    load(); notifyPlatformUpdated();
  };
  const form = (row, setRow, isNew) => (
    <div className="at-edit">
      <div className="at-grid">
        <Field label="Icon (emoji)"><input maxLength={8} value={row.icon || ""} onChange={(e) => setRow({ ...row, icon: e.target.value })} /></Field>
        <Field label="Name (English)"><input maxLength={60} value={row.name_en || ""} onChange={(e) => setRow({ ...row, name_en: e.target.value })} placeholder="e.g. Lash Studios" /></Field>
        <Field label="Name (Spanish)"><input maxLength={60} value={row.name_es || ""} onChange={(e) => setRow({ ...row, name_es: e.target.value })} /></Field>
        <Field label="Short line (English)"><input maxLength={80} value={row.desc_en || ""} onChange={(e) => setRow({ ...row, desc_en: e.target.value })} placeholder="e.g. Lifts & extensions" /></Field>
        <Field label="Short line (Spanish)"><input maxLength={80} value={row.desc_es || ""} onChange={(e) => setRow({ ...row, desc_es: e.target.value })} /></Field>
        {isNew
          ? <Field label="Business type" hint="What a business picks when it signs up, e.g. “Lash Studio”. Can't be changed later."><input maxLength={60} value={row.service_type || ""} onChange={(e) => setRow({ ...row, service_type: e.target.value })} placeholder={row.name_en || ""} /></Field>
          : <Field label="Business type" hint="Fixed: businesses already use it."><input value={row.service_type} disabled /></Field>}
      </div>
      <Toggle checked={row.show_on_home} onChange={(v) => setRow({ ...row, show_on_home: v })} label="Show as a tile on the home page" />
      <Toggle checked={row.is_active} onChange={(v) => setRow({ ...row, is_active: v })} label="Businesses can pick it when they sign up" hint="Turning this off never removes businesses already in it." />
      <div className="at-savebar-row">
        <button type="button" className="btn-sm ghost" onClick={() => (isNew ? setAdding(null) : setEdit(null))}>Cancel</button>
        <button type="button" className="btn-sm forest" disabled={busy} onClick={() => saveRow(row, isNew)}>{busy ? "Saving…" : isNew ? "Add category" : "Save"}</button>
      </div>
    </div>
  );
  if (list === null) return <p className="at-muted">Loading…</p>;
  return (
    <>
      <p className="at-muted">The kinds of business on VaiBook. The order here is the order of the tiles on the home page.</p>
      <div className="at-list">
        {list.map((c, i) => (
          <div className={`at-row${c.is_active ? "" : " blocked"}`} key={c.key}>
            {edit && edit.key === c.key ? form(edit, setEdit, false) : (
              <>
                <div className="at-row-main">
                  <div className="at-row-title"><span className="at-icon">{c.icon}</span>{c.name_en}{c.name_es && <span className="at-muted"> · {c.name_es}</span>}
                    {!c.show_on_home && <span className="at-tag">Not on home</span>}{!c.is_active && <span className="at-tag t-blocked">Off</span>}</div>
                  <div className="at-row-meta"><span>{c.desc_en || "—"}</span><span>Type: {c.service_type}</span></div>
                </div>
                <div className="at-row-actions">
                  <button type="button" className="at-icon-btn" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="at-icon-btn" aria-label="Move down" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="btn-sm ghost" onClick={() => { setEdit({ ...c }); setAdding(null); }}>Edit</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {adding ? form(adding, setAdding, true) : (
        <button type="button" className="btn-sm forest at-add" onClick={() => { setAdding({ icon: "✨", show_on_home: true, is_active: true }); setEdit(null); }}>+ Add a category</button>
      )}
    </>
  );
}

function DistrictsEditor({ onMsg }) {
  const [list, setList] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from("districts").select("*").order("sort_order").order("name");
    setList(rows(data));
  }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (q, okText) => {
    setBusy(true);
    const { error } = await q;
    setBusy(false);
    if (error) { onMsg({ ok: false, text: errText(error) }); return false; }
    if (okText) onMsg({ ok: true, text: okText });
    load(); notifyPlatformUpdated(); return true;
  };
  const add = async () => {
    const n = name.trim().replace(/\s+/g, " ");
    if (n.length < 2) return;
    if (await run(supabase.from("districts").insert({ name: n, sort_order: (Math.max(0, ...(list || []).map((d) => d.sort_order)) || 0) + 10 }), `Added ${n}.`)) setName("");
  };
  const move = async (i, dir) => {
    const a = list[i], b = list[i + dir];
    if (!a || !b) return;
    setBusy(true);
    await supabase.from("districts").update({ sort_order: b.sort_order }).eq("name", a.name);
    await supabase.from("districts").update({ sort_order: a.sort_order === b.sort_order ? a.sort_order + dir : a.sort_order }).eq("name", b.name);
    setBusy(false); load(); notifyPlatformUpdated();
  };
  if (list === null) return <p className="at-muted">Loading…</p>;
  return (
    <>
      <p className="at-muted">The places businesses can list themselves in, and customers can filter by. Turning one off hides it from the lists; businesses already there keep it.</p>
      <div className="at-list">
        {list.map((d, i) => (
          <div className={`at-row${d.is_active ? "" : " blocked"}`} key={d.name}>
            <div className="at-row-main"><div className="at-row-title">{d.name}{!d.is_active && <span className="at-tag t-blocked">Off</span>}</div></div>
            <div className="at-row-actions">
              <button type="button" className="at-icon-btn" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="at-icon-btn" aria-label="Move down" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="btn-sm ghost" disabled={busy} onClick={() => run(supabase.from("districts").update({ is_active: !d.is_active }).eq("name", d.name), d.is_active ? `${d.name} is hidden from the lists.` : `${d.name} is back in the lists.`)}>{d.is_active ? "Turn off" : "Turn on"}</button>
            </div>
          </div>
        ))}
      </div>
      <div className="at-inline-form">
        <input maxLength={40} placeholder="New place, e.g. San Pedro" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button type="button" className="btn-sm forest" disabled={busy || name.trim().length < 2} onClick={add}>Add</button>
      </div>
    </>
  );
}

const THEMES = [
  { id: "business", label: "Business" },
  { id: "wealth", label: "Wealth" },
  { id: "health", label: "Health" },
  { id: "others", label: "Treating others" },
];
function VersesEditor({ onMsg }) {
  const [list, setList] = useState(null);
  const [theme, setTheme] = useState("business");
  const [today, setToday] = useState(null);
  const [edit, setEdit] = useState(null);
  const [adding, setAdding] = useState(null);
  const [delId, setDelId] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from("daily_verses").select("*").order("id");
    setList(rows(data));
    const t = await supabase.rpc("verse_for_day");
    setToday(rows(t.data)[0] || null);
  }, []);
  useEffect(() => { load(); }, [load]);
  const counts = (list || []).reduce((m, v) => { m[v.theme] = (m[v.theme] || 0) + 1; return m; }, {});
  const shown = (list || []).filter((v) => v.theme === theme);
  const save = async (v, isNew) => {
    const row = { ref: (v.ref || "").trim(), body: (v.body || "").trim(), theme: v.theme || theme };
    if (!row.ref || !row.body) { onMsg({ ok: false, text: "Add both the verse and where it's from (e.g. Proverbs 3:9)." }); return; }
    setBusy(true);
    const { error } = isNew ? await supabase.from("daily_verses").insert(row) : await supabase.from("daily_verses").update(row).eq("id", v.id);
    setBusy(false);
    if (error) { onMsg({ ok: false, text: errText(error) }); return; }
    setEdit(null); setAdding(null); onMsg({ ok: true, text: isNew ? "Verse added to the rotation." : "Verse saved." }); load();
  };
  const remove = async (v) => {
    setBusy(true);
    const { error } = await supabase.from("daily_verses").delete().eq("id", v.id);
    setBusy(false); setDelId(null);
    if (error) { onMsg({ ok: false, text: errText(error) }); return; }
    onMsg({ ok: true, text: "Verse removed." }); load();
  };
  const form = (v, setV, isNew) => (
    <div className="at-edit">
      <Field label="Theme">
        <select value={v.theme || theme} onChange={(e) => setV({ ...v, theme: e.target.value })}>{THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
      </Field>
      <Field label="Verse"><textarea rows={3} maxLength={600} value={v.body || ""} onChange={(e) => setV({ ...v, body: e.target.value })} /></Field>
      <Field label="Where it's from"><input maxLength={60} value={v.ref || ""} onChange={(e) => setV({ ...v, ref: e.target.value })} placeholder="e.g. Proverbs 16:3" /></Field>
      <div className="at-savebar-row">
        <button type="button" className="btn-sm ghost" onClick={() => (isNew ? setAdding(null) : setEdit(null))}>Cancel</button>
        <button type="button" className="btn-sm forest" disabled={busy} onClick={() => save(v, isNew)}>{busy ? "Saving…" : isNew ? "Add verse" : "Save"}</button>
      </div>
    </div>
  );
  if (list === null) return <p className="at-muted">Loading…</p>;
  return (
    <>
      <p className="at-muted">Sent to every business at 5:00 AM. The days rotate business → wealth → health → treating others, going through each list in order.</p>
      {today && (
        <div className="at-today">
          <span className="at-label">Today · {(THEMES.find((t) => t.id === today.theme) || {}).label}</span>
          <div className="at-quote">“{today.body}”</div>
          <div className="at-muted">{today.ref}</div>
        </div>
      )}
      <Chips value={theme} onChange={(t) => { setTheme(t); setEdit(null); }} options={THEMES.map((t) => ({ ...t, count: counts[t.id] || 0 }))} />
      <div className="at-list">
        {shown.map((v) => (
          <div className="at-row" key={v.id}>
            {edit && edit.id === v.id ? form(edit, setEdit, false) : (
              <>
                <div className="at-row-main">
                  <div className="at-quote">“{v.body}”</div>
                  <div className="at-row-meta"><span>{v.ref}</span></div>
                </div>
                <div className="at-row-actions">
                  {delId === v.id ? (
                    <>
                      <button type="button" className="btn-sm ghost" onClick={() => setDelId(null)}>Keep</button>
                      <button type="button" className="btn-sm at-danger" disabled={busy || shown.length <= 1} onClick={() => remove(v)}>Remove</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn-sm ghost" onClick={() => { setEdit({ ...v }); setAdding(null); }}>Edit</button>
                      <button type="button" className="btn-sm ghost at-danger-ghost" disabled={shown.length <= 1} onClick={() => setDelId(v.id)}>Remove</button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {adding ? form(adding, setAdding, true) : (
        <button type="button" className="btn-sm forest at-add" onClick={() => { setAdding({ theme }); setEdit(null); }}>+ Add a verse</button>
      )}
    </>
  );
}

function AdminContent({ filter }) {
  const [section, setSection] = useState(filter || "categories");
  const [msg, setMsg] = useState(null);
  return (
    <>
      <Header title="Categories, places & verses" sub="The lists the whole site is built from." />
      <div className="card at-card">
        <Chips value={section} onChange={(s) => { setSection(s); setMsg(null); }} options={[{ id: "categories", label: "Categories" }, { id: "districts", label: "Districts" }, { id: "verses", label: "Morning verses" }]} />
        <Notice msg={msg} />
        {section === "categories" && <CategoriesEditor onMsg={setMsg} />}
        {section === "districts" && <DistrictsEditor onMsg={setMsg} />}
        {section === "verses" && <VersesEditor onMsg={setMsg} />}
      </div>
    </>
  );
}

// ── SPOTLIGHT ──────────────────────────────────────────────────────────
function AdminSpotlight() {
  const [list, setList] = useState(null);
  const [providers, setProviders] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [starts, setStarts] = useState({});
  const [add, setAdd] = useState({ provider: "", start: new Date().toISOString().slice(0, 10), weeks: 1 });
  const today = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
  const load = useCallback(async () => {
    const [{ data, error }, prov] = await Promise.all([supabase.rpc("admin_list_spotlights"), supabase.rpc("admin_list_providers")]);
    if (error) { setMsg({ ok: false, text: errText(error) }); setList([]); } else setList(rows(data));
    setProviders(rows(prov.data).filter((p) => p.is_active !== false).sort((a, b) => String(a.business_name).localeCompare(String(b.business_name))));
  }, []);
  useEffect(() => { load(); }, [load]);
  const spotErr = (error) => (/DISTRICT_FULL/.test(String(error && error.message)) ? String(error.message).replace(/^.*DISTRICT_FULL:\s*/, "").replace(/^./, (c) => c.toUpperCase()) + ". Pick later dates." : errText(error));
  const activate = async (r) => {
    setBusy(r.id); setMsg(null);
    const { error } = await supabase.rpc("admin_activate_spotlight", { p_id: r.id, p_starts_on: starts[r.id] || today, p_weeks: r.weeks });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: spotErr(error) }); return; }
    setMsg({ ok: true, text: `${r.business_name} is in the Spotlight. They've been notified.` }); load();
  };
  const cancel = async (r) => {
    setBusy(r.id); setMsg(null);
    const { error } = await supabase.rpc("admin_cancel_spotlight", { p_id: r.id });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: errText(error) }); return; }
    setMsg({ ok: true, text: `${r.business_name}'s spotlight was cancelled.` }); load();
  };
  const addOne = async () => {
    if (!add.provider) return;
    setBusy("add"); setMsg(null);
    const { error } = await supabase.rpc("admin_add_spotlight", { p_provider_id: add.provider, p_starts_on: add.start, p_weeks: Number(add.weeks) || 1 });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: spotErr(error) }); return; }
    setMsg({ ok: true, text: "Spotlight added." }); setAdd((a) => ({ ...a, provider: "" })); load();
  };
  const requested = (list || []).filter((r) => r.status === "requested");
  const active = (list || []).filter((r) => r.status === "active");
  const live = active.filter((r) => r.starts_on <= today && r.ends_on >= today);
  const byDistrict = live.reduce((m, r) => { const k = r.district || "—"; m[k] = (m[k] || 0) + 1; return m; }, {});
  const fmt = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");
  return (
    <>
      <Header title="Spotlight" sub="Paid top placement: the first businesses customers see on the main page and in Recommended, per district. Switch one on after the payment is confirmed." />
      <Notice msg={msg} />
      <div className="card at-card">
        <div className="card-title">Waiting for payment ({requested.length})</div>
        {list === null ? <p className="at-muted">Loading…</p> : requested.length === 0 ? <p className="at-muted">No requests right now.</p> : (
          <div className="at-list">
            {requested.map((r) => (
              <div className="at-row" key={r.id}>
                <div className="at-row-main">
                  <div className="at-row-title">{r.business_name}<span className="at-tag">{r.district || "—"}</span></div>
                  <div className="at-row-meta"><span>{r.weeks} week{r.weeks > 1 ? "s" : ""}</span><span>{money(r.amount)}</span><span>Asked {fmtDate(r.created_at)}</span>{r.whatsapp && <a href={`https://wa.me/${String(r.whatsapp).replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}</div>
                  <div className="at-inline-form">
                    <span className="at-muted" style={{ margin: 0 }}>Starts</span>
                    <input type="date" value={starts[r.id] || today} min={today} onChange={(e) => setStarts((m) => ({ ...m, [r.id]: e.target.value }))} style={{ flex: "0 1 170px" }} />
                    <button type="button" className="btn-sm forest" disabled={busy === r.id} onClick={() => activate(r)}>{busy === r.id ? "…" : "Paid · switch on"}</button>
                    <button type="button" className="btn-sm ghost at-danger-ghost" disabled={busy === r.id} onClick={() => cancel(r)}>Decline</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card at-card">
        <div className="card-title">In the Spotlight</div>
        {Object.keys(byDistrict).length > 0 && <div className="at-summary">{Object.entries(byDistrict).map(([d, n]) => `${d}: ${n} live`).join(" · ")}</div>}
        {list === null ? <p className="at-muted">Loading…</p> : active.length === 0 ? <p className="at-muted">Nobody yet.</p> : (
          <div className="at-list">
            {active.map((r) => (
              <div className="at-row" key={r.id}>
                <div className="at-row-main">
                  <div className="at-row-title">🌟 {r.business_name}<span className="at-tag">{r.district || "—"}</span>{r.starts_on > today && <span className="at-tag">Starts {fmt(r.starts_on)}</span>}</div>
                  <div className="at-row-meta"><span>{fmt(r.starts_on)} – {fmt(r.ends_on)}</span><span>{money(r.amount)}</span></div>
                </div>
                <div className="at-row-actions"><button type="button" className="btn-sm ghost at-danger-ghost" disabled={busy === r.id} onClick={() => cancel(r)}>Cancel</button></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card at-card">
        <div className="card-title">Add a spotlight by hand</div>
        <p className="at-muted">For a business that paid you directly.</p>
        <div className="at-grid">
          <Field label="Business"><select value={add.provider} onChange={(e) => setAdd((a) => ({ ...a, provider: e.target.value }))}><option value="">Pick a business…</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.business_name} · {p.district || "—"}</option>)}</select></Field>
          <Field label="Starts"><input type="date" value={add.start} min={today} onChange={(e) => setAdd((a) => ({ ...a, start: e.target.value }))} /></Field>
          <Field label="Weeks"><select value={add.weeks} onChange={(e) => setAdd((a) => ({ ...a, weeks: e.target.value }))}>{[1, 2, 3, 4, 8, 12].map((w) => <option key={w} value={w}>{w}</option>)}</select></Field>
        </div>
        <button type="button" className="btn-sm forest" disabled={!add.provider || busy === "add"} onClick={addOne}>{busy === "add" ? "Adding…" : "Add spotlight"}</button>
      </div>
    </>
  );
}

export const ADMIN_TOOL_IDS = ["settings", "customers", "bookings", "reviews", "broadcast", "content", "spotlight"];

export default function AdminTools({ tool, filter }) {
  return (
    <div className="at-root">
      <style>{AT_CSS}</style>
      {tool === "settings" && <AdminSettings />}
      {tool === "customers" && <AdminCustomers filter={filter} />}
      {tool === "bookings" && <AdminBookings />}
      {tool === "reviews" && <AdminReviews filter={filter} />}
      {tool === "broadcast" && <AdminBroadcast />}
      {tool === "content" && <AdminContent filter={filter} />}
      {tool === "spotlight" && <AdminSpotlight />}
    </div>
  );
}

const AT_CSS = `
  .at-root { --at-v: #5B4BE0; }
  .at-card { margin-bottom: 16px; }
  .at-muted { color: var(--muted, #6B6E7B); font-size: 13px; line-height: 1.5; margin: 0 0 12px; }
  .at-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px 14px; margin: 6px 0 12px; }
  .at-grid.one { grid-template-columns: 1fr; }
  .at-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; margin-bottom: 10px; }
  .at-label { font-size: 12.5px; font-weight: 700; color: #3A3D48; }
  .at-hint { font-size: 12px; color: var(--muted, #6B6E7B); line-height: 1.4; }
  .at-field input, .at-field select, .at-field textarea, .at-search, .at-inline-form input {
    width: 100%; box-sizing: border-box; font: inherit; font-size: 16px; padding: 11px 12px; border: 1px solid #E1DEEA; border-radius: 12px; background: #FFFFFF; color: #16181D; }
  .at-field textarea { resize: vertical; min-height: 64px; }
  .at-field input:focus, .at-field select:focus, .at-field textarea:focus, .at-search:focus, .at-inline-form input:focus { outline: none; border-color: var(--at-v); box-shadow: 0 0 0 3px rgba(91,75,224,0.14); }
  .at-field input:disabled { background: #F5F4F8; color: #6B6E7B; }
  .at-search { margin-bottom: 12px; }
  .at-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
  .at-chip { font: inherit; font-size: 13px; font-weight: 600; padding: 7px 12px; border-radius: 999px; border: 1px solid #E1DEEA; background: #FFFFFF; color: #3A3D48; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
  .at-chip.on { background: var(--at-v); border-color: var(--at-v); color: #FFFFFF; }
  .at-chip-n { font-size: 11.5px; font-weight: 700; background: rgba(22,24,29,0.07); border-radius: 999px; padding: 1px 7px; }
  .at-chip.on .at-chip-n { background: rgba(255,255,255,0.22); }
  .at-toggle { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; margin: 6px 0 12px; }
  .at-toggle input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .at-toggle-track { flex-shrink: 0; width: 42px; height: 24px; border-radius: 999px; background: #D9D6E3; position: relative; transition: background .15s; margin-top: 1px; }
  .at-toggle-track span { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: transform .15s; }
  .at-toggle input:checked + .at-toggle-track { background: var(--at-v); }
  .at-toggle input:checked + .at-toggle-track span { transform: translateX(18px); }
  .at-toggle input:focus-visible + .at-toggle-track { box-shadow: 0 0 0 3px rgba(91,75,224,0.25); }
  .at-toggle-text { display: flex; flex-direction: column; gap: 2px; font-size: 14px; color: #16181D; min-width: 0; }
  .at-toggle-text b { font-weight: 600; }
  .at-toggle-text small { font-size: 12.5px; color: var(--muted, #6B6E7B); line-height: 1.4; }
  .at-notice { font-size: 13.5px; border-radius: 12px; padding: 10px 12px; margin: 8px 0 12px; line-height: 1.45; }
  .at-notice.ok { background: #ECFDF3; color: #15803D; }
  .at-notice.bad { background: #FDECEC; color: #B91C1C; }
  .at-savebar { position: sticky; bottom: calc(12px + env(safe-area-inset-bottom)); background: #FFFFFF; border: 1px solid #E8E6EF; border-radius: 16px; padding: 12px 14px; box-shadow: 0 10px 30px rgba(22,24,29,0.10); z-index: 5; }
  .at-savebar .at-notice { margin-top: 0; }
  .at-savebar-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
  .at-savebar-row .at-muted { margin: 0 auto 0 0; font-size: 12px; }
  .at-confirm-text { font-size: 13.5px; font-weight: 600; color: #16181D; margin-right: auto; }
  .at-list { display: flex; flex-direction: column; }
  .at-row { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid #F0EEF4; }
  .at-row:last-child { border-bottom: none; }
  .at-row.blocked { opacity: .72; }
  .at-row-main { flex: 1; min-width: 0; }
  .at-row-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; font-size: 15px; font-weight: 700; color: #16181D; }
  .at-row-meta, .at-row-stats { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12.5px; color: var(--muted, #6B6E7B); margin-top: 5px; }
  .at-row-meta a { color: var(--at-v); font-weight: 600; text-decoration: none; }
  .at-row-stats b { color: #16181D; }
  .at-row-stats .warn, .at-row-stats .warn b { color: #B45309; }
  .at-row-note { font-size: 12.5px; color: #6B6E7B; margin-top: 6px; font-style: italic; }
  .at-row-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; flex-shrink: 0; }
  .at-row-amount { font-weight: 800; font-size: 15px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .at-tag { font-size: 11px; font-weight: 700; border-radius: 999px; padding: 2px 8px; background: #F1EFF6; color: #4A4D5A; }
  .at-tag.t-business { background: #EEECFD; color: #4A3BCF; }
  .at-tag.t-team { background: #EAF8EF; color: #15803D; }
  .at-tag.t-admin { background: #16181D; color: #FFFFFF; }
  .at-tag.t-blocked { background: #FDECEC; color: #B91C1C; }
  .at-tag.s-confirmed, .at-tag.s-completed { background: #EAF8EF; color: #15803D; }
  .at-tag.s-pending, .at-tag.s-awaiting_payment { background: #FEF6E7; color: #B45309; }
  .at-tag.s-cancelled, .at-tag.s-rejected, .at-tag.s-no_show { background: #FDECEC; color: #B91C1C; }
  .at-stars { color: #D97706; letter-spacing: 1px; font-size: 14px; }
  .at-stars.low { color: #DC2626; }
  .at-stars .off { color: #D9D6E3; }
  .at-quote { font-size: 14px; color: #2A2D38; line-height: 1.5; margin-top: 6px; overflow-wrap: anywhere; }
  .at-summary { font-size: 13.5px; color: #3A3D48; margin: 0 0 6px; }
  .at-inline-form { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; align-items: center; }
  .at-inline-form input { flex: 1 1 200px; width: auto; }
  .btn-sm.at-danger { background: #B91C1C; color: #FFFFFF; border-color: #B91C1C; }
  .btn-sm.at-danger-ghost { color: #B91C1C; border-color: #F3C7C7; }
  .at-icon-btn { width: 34px; height: 34px; border-radius: 10px; border: 1px solid #E1DEEA; background: #FFFFFF; font-size: 15px; cursor: pointer; color: #3A3D48; }
  .at-icon-btn:disabled { opacity: .35; cursor: default; }
  .at-icon { font-size: 18px; }
  .at-edit { flex: 1; min-width: 0; background: #FAFAFC; border: 1px solid #ECEAF2; border-radius: 14px; padding: 14px; margin: 4px 0; }
  .at-add { margin-top: 12px; }
  .at-today { background: linear-gradient(180deg, #F5F3FF, #FFFFFF); border: 1px solid #E6E1FB; border-radius: 14px; padding: 14px; margin: 0 0 14px; }
  .at-push-preview { background: #F5F4F8; border-radius: 16px; padding: 12px 14px; margin: 4px 0 12px; max-width: 420px; }
  .at-push-app { font-size: 11.5px; color: #6B6E7B; font-weight: 600; }
  .at-push-title { font-size: 14px; font-weight: 700; margin-top: 3px; overflow-wrap: anywhere; }
  .at-push-body { font-size: 13.5px; color: #3A3D48; margin-top: 2px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .at-preview { position: static !important; border-radius: 12px; margin-top: 4px; }
  @media (max-width: 600px) {
    .at-row { flex-direction: column; gap: 10px; }
    .at-row-actions { justify-content: flex-start; }
    .at-savebar-row { justify-content: stretch; }
    .at-savebar-row .btn-sm { flex: 1; }
    .at-savebar-row .at-muted, .at-confirm-text { flex-basis: 100%; }
  }
`;
