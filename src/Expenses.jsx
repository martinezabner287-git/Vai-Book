// Expenses & profit for a business (2026-11-03).
// Every business can log what it spends — typed in, or by snapping the
// receipt (read on the phone itself, nothing sent to another company) —
// and see income minus expenses = profit for any month.
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, prepareImageForWeb } from "./supabase";

const CATS = [
  { id: "supplies", icon: "🧴", en: "Supplies", es: "Insumos" },
  { id: "rent", icon: "🏠", en: "Rent", es: "Alquiler" },
  { id: "utilities", icon: "💡", en: "Light, water & internet", es: "Luz, agua e internet" },
  { id: "staff", icon: "👥", en: "Staff pay", es: "Pago de personal" },
  { id: "equipment", icon: "🛠️", en: "Equipment", es: "Equipo" },
  { id: "marketing", icon: "📣", en: "Marketing", es: "Publicidad" },
  { id: "transport", icon: "⛽", en: "Fuel & transport", es: "Combustible y transporte" },
  { id: "fees", icon: "🏛️", en: "Fees, licences & taxes", es: "Tasas, licencias e impuestos" },
  { id: "other", icon: "📦", en: "Other", es: "Otro" },
];
const catOf = (id) => CATS.find((c) => c.id === id) || CATS[CATS.length - 1];
const money = (n) => `BZ$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => ymd(new Date());
const blankForm = () => ({ id: null, amount: "", spent_on: todayStr(), category: "supplies", vendor: "", note: "", receipt_path: null, file: null, preview: null });

// ── Receipt reading ──────────────────────────────────────────────────
// Shrinks the photo (faster to read and to upload) and returns a JPEG blob.
async function shrinkImage(file, max = 1600) {
  if (!file || !/^image\//.test(file.type)) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return await new Promise((res) => c.toBlob((b) => res(b || file), "image/jpeg", 0.82));
  } catch (e) { return file; }
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// Pulls the total, the date and the shop name out of a receipt's text.
export function parseReceipt(text) {
  const lines = String(text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const amountsIn = (l) => (l.replace(/(\d)[Oo]/g, "$10").replace(/[Oo](\d)/g, "0$1").match(/\d{1,3}(?:[,\s]\d{3})*[.,]\d{2}(?!\d)/g) || [])
    .map((a) => Number(a.replace(/[,\s](?=\d{3})/g, "").replace(",", "."))).filter((n) => n > 0 && n < 1000000);
  let total = null;
  for (let i = lines.length - 1; i >= 0 && total === null; i--) {
    const l = lines[i];
    if (/total|amount\s*due|balance\s*due|grand|to\s*pay|importe|a\s*pagar/i.test(l) && !/sub\s*-?\s*total|tax|gst|discount|change|cambio/i.test(l)) {
      const a = amountsIn(l).concat(i + 1 < lines.length ? amountsIn(lines[i + 1]) : []);
      if (a.length) total = a[0];
    }
  }
  if (total === null) {
    const all = lines.flatMap(amountsIn);
    if (all.length) total = Math.max(...all);
  }
  let date = null;
  const joined = lines.join(" ");
  let m = joined.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) date = [m[1], m[2], m[3]];
  if (!date && (m = joined.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/))) {
    let [, a, b, y] = m; if (y.length === 2) y = `20${y}`;
    // Belize writes day/month; switch only when the first number can't be a day-month pair.
    let d = a, mo = b; if (Number(b) > 12 && Number(a) <= 12) { d = b; mo = a; }
    date = [y, mo, d];
  }
  if (!date && (m = joined.match(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(20\d{2})\b/))) {
    const mi = MONTHS.indexOf(m[2].toLowerCase()); if (mi >= 0) date = [m[3], String(mi + 1), m[1]];
  }
  if (!date && (m = joined.match(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/))) {
    const mi = MONTHS.indexOf(m[1].toLowerCase()); if (mi >= 0) date = [m[3], String(mi + 1), m[2]];
  }
  let spent_on = null;
  if (date) {
    const [y, mo, d] = date.map(Number);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt <= new Date(Date.now() + 86400000) && y >= 2000) spent_on = ymd(dt);
  }
  const vendor = (lines.find((l) => /[A-Za-z]{3,}/.test(l) && !/receipt|invoice|welcome|tel|phone|www|http|date|time|cashier|^#/i.test(l)) || "").replace(/[^\w&'.,\- ]+/g, "").trim().slice(0, 60) || null;
  return { total, spent_on, vendor };
}

let workerPromise = null;
async function readReceipt(blob, onProgress) {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker }) => createWorker("eng", 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr/",
      langPath: "/ocr",
      workerBlobURL: false,
      logger: (m) => { if (m && m.status === "recognizing text" && onProgress) onProgress(Math.round((m.progress || 0) * 100)); },
    }));
  }
  const worker = await workerPromise;
  const { data } = await worker.recognize(blob);
  return parseReceipt(data && data.text);
}

export default function Expenses({ providerId, userId, bookings, es }) {
  const tx = (en, sp) => (es ? sp : en);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scan, setScan] = useState(null); // { pct } while reading, { done:true, found } after
  const scanInput = useRef(null);
  const photoInput = useRef(null);

  const from = ymd(month);
  const to = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const monthLabel = month.toLocaleDateString(es ? "es" : "en-US", { month: "long", year: "numeric" });

  const load = async () => {
    if (!providerId) return;
    setLoading(true); setLoadError("");
    const { data, error: e } = await supabase.from("business_expenses").select("*")
      .eq("provider_id", providerId).gte("spent_on", from).lte("spent_on", to)
      .order("spent_on", { ascending: false }).order("created_at", { ascending: false });
    if (e) setLoadError(tx("Couldn't load your expenses. Check your connection and try again.", "No se pudieron cargar tus gastos. Revisa tu conexión e inténtalo de nuevo."));
    setRows(data || []);
    setLoading(false);
  };
  // eslint-disable-next-line
  useEffect(() => { load(); }, [providerId, from]);

  const income = useMemo(() => (bookings || [])
    .filter((b) => (b.status === "completed" || b.status === "done") && String(b.booking_date).slice(0, 10) >= from && String(b.booking_date).slice(0, 10) <= to)
    .reduce((s, b) => s + (Number(b.total_amount) || 0), 0), [bookings, from, to]);
  const spent = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const profit = income - spent;
  const byCat = CATS.map((c) => ({ ...c, total: rows.filter((r) => r.category === c.id).reduce((s, r) => s + Number(r.amount || 0), 0) }))
    .filter((c) => c.total > 0).sort((a, b) => b.total - a.total);

  const shiftMonth = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const isCurrentMonth = ymd(month) === ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const pickPhoto = async (file, alsoRead) => {
    if (!file) return;
    const small = await shrinkImage(file);
    const preview = URL.createObjectURL(small);
    setForm((f) => ({ ...(f || blankForm()), file: small, preview }));
    if (!alsoRead) return;
    setScan({ pct: 0 });
    try {
      const found = await readReceipt(small, (pct) => setScan({ pct }));
      setForm((f) => ({
        ...f,
        amount: f.amount || (found.total ? String(found.total.toFixed(2)) : ""),
        spent_on: found.spent_on || f.spent_on,
        vendor: f.vendor || found.vendor || "",
      }));
      setScan({ done: true, found: !!found.total });
    } catch (e) {
      console.error("Receipt reading failed:", e);
      setScan({ done: true, found: false });
    }
  };

  const save = async () => {
    const amount = Math.round(Number(String(form.amount).replace(/[^0-9.]/g, "")) * 100) / 100;
    if (!(amount > 0)) { setError(tx("Enter how much you spent.", "Escribe cuánto gastaste.")); return; }
    if (!form.spent_on) { setError(tx("Pick the date.", "Elige la fecha.")); return; }
    setSaving(true); setError("");
    let receipt_path = form.receipt_path;
    if (form.file) {
      const path = `${userId}/${providerId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      const upFile = await prepareImageForWeb(form.file);
      const up = await supabase.storage.from("expense-receipts").upload(path, upFile, { contentType: upFile.type || "image/jpeg", upsert: false });
      if (up.error) { setSaving(false); setError(tx("The receipt photo didn't upload. Try again, or save without it.", "La foto del recibo no se subió. Inténtalo de nuevo o guarda sin ella.")); return; }
      receipt_path = path;
    }
    const row = { provider_id: providerId, amount, spent_on: form.spent_on, category: form.category, vendor: form.vendor.trim() || null, note: form.note.trim() || null, receipt_path };
    const res = form.id
      ? await supabase.from("business_expenses").update(row).eq("id", form.id).select().single()
      : await supabase.from("business_expenses").insert(row).select().single();
    setSaving(false);
    if (res.error) { setError(tx("Couldn't save. Check your connection and try again.", "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.")); return; }
    if (form.preview) URL.revokeObjectURL(form.preview);
    setForm(null); setScan(null);
    const d = new Date(`${row.spent_on}T00:00:00`);
    if (d.getFullYear() !== month.getFullYear() || d.getMonth() !== month.getMonth()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    else load();
  };

  const remove = async (r) => {
    if (!window.confirm(tx(`Delete this ${money(r.amount)} expense?`, `¿Borrar este gasto de ${money(r.amount)}?`))) return;
    const { error: e } = await supabase.from("business_expenses").delete().eq("id", r.id);
    if (!e && r.receipt_path) supabase.storage.from("expense-receipts").remove([r.receipt_path]);
    setForm(null);
    load();
  };

  const viewReceipt = async (path) => {
    const w = window.open("", "_blank");
    const { data } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 600);
    if (data && data.signedUrl) { if (w) w.location = data.signedUrl; else window.location.href = data.signedUrl; } else if (w) w.close();
  };

  const exportCsv = () => {
    const head = ["Date", "Category", "Paid to", "Note", "Amount (BZ$)"];
    const lines = rows.slice().reverse().map((r) => [r.spent_on, catOf(r.category).en, r.vendor || "", r.note || "", Number(r.amount).toFixed(2)]);
    lines.push([], ["", "", "", "Income", income.toFixed(2)], ["", "", "", "Expenses", spent.toFixed(2)], ["", "", "", "Profit", profit.toFixed(2)]);
    const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `expenses-${from.slice(0, 7)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="xp">
      <div className="xp-month">
        <button type="button" className="xp-month-btn" onClick={() => shiftMonth(-1)} aria-label={tx("Previous month", "Mes anterior")}>‹</button>
        <strong>{monthLabel}</strong>
        <button type="button" className="xp-month-btn" onClick={() => shiftMonth(1)} disabled={isCurrentMonth} aria-label={tx("Next month", "Mes siguiente")}>›</button>
      </div>

      <div className="xp-profit">
        <div><span>{tx("Income", "Ingresos")}</span><b>{money(income)}</b></div>
        <div className="xp-minus">−</div>
        <div><span>{tx("Expenses", "Gastos")}</span><b>{money(spent)}</b></div>
        <div className="xp-minus">=</div>
        <div className={profit >= 0 ? "xp-pos" : "xp-neg"}><span>{profit >= 0 ? tx("Profit", "Ganancia") : tx("Loss", "Pérdida")}</span><b>{money(Math.abs(profit))}</b></div>
      </div>
      <p className="xp-hint">{tx("Income is your completed bookings this month.", "Los ingresos son tus citas completadas este mes.")}</p>

      {!form && (
        <div className="xp-actions">
          <button type="button" className="xp-btn xp-btn-primary" onClick={() => { setForm(blankForm()); setScan(null); setTimeout(() => scanInput.current && scanInput.current.click(), 0); }}>📷 {tx("Scan a receipt", "Escanear un recibo")}</button>
          <button type="button" className="xp-btn" onClick={() => { setForm(blankForm()); setScan(null); }}>＋ {tx("Add by hand", "Agregar a mano")}</button>
        </div>
      )}
      <input ref={scanInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; pickPhoto(f, true); }} />
      <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; pickPhoto(f, false); }} />

      {form && (
        <div className="xp-form">
          <div className="xp-form-head">
            <strong>{form.id ? tx("Edit expense", "Editar gasto") : tx("New expense", "Nuevo gasto")}</strong>
            <button type="button" className="xp-link" onClick={() => { if (form.preview) URL.revokeObjectURL(form.preview); setForm(null); setScan(null); setError(""); }}>{tx("Cancel", "Cancelar")}</button>
          </div>
          {scan && !scan.done && <div className="xp-scan">🔎 {tx("Reading your receipt…", "Leyendo tu recibo…")} {scan.pct ? `${scan.pct}%` : ""}<div className="xp-bar"><i style={{ width: `${scan.pct || 4}%` }} /></div></div>}
          {scan && scan.done && <div className={`xp-scan ${scan.found ? "ok" : "warn"}`}>{scan.found ? tx("✓ Filled in from the receipt — check the numbers before saving.", "✓ Llenado con el recibo — revisa los números antes de guardar.") : tx("Couldn't read the total clearly. Type it in below — the photo is still saved.", "No se pudo leer el total. Escríbelo abajo — la foto se guarda igual.")}</div>}
          <div className="xp-grid">
            <label className="xp-field"><span>{tx("Amount (BZ$)", "Monto (BZ$)")}</span>
              <input inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></label>
            <label className="xp-field"><span>{tx("Date", "Fecha")}</span>
              <input type="date" max={todayStr()} value={form.spent_on} onChange={(e) => setForm((f) => ({ ...f, spent_on: e.target.value }))} /></label>
          </div>
          <div className="xp-field"><span>{tx("What for", "En qué")}</span>
            <div className="xp-cats">
              {CATS.map((c) => (
                <button type="button" key={c.id} className={`xp-cat${form.category === c.id ? " on" : ""}`} onClick={() => setForm((f) => ({ ...f, category: c.id }))}>{c.icon} {es ? c.es : c.en}</button>
              ))}
            </div>
          </div>
          <label className="xp-field"><span>{tx("Paid to (optional)", "Pagado a (opcional)")}</span>
            <input maxLength={120} placeholder={tx("e.g. Courts, BEL, Brodies", "ej. Courts, BEL, Brodies")} value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} /></label>
          <label className="xp-field"><span>{tx("Note (optional)", "Nota (opcional)")}</span>
            <input maxLength={500} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></label>
          <div className="xp-receipt">
            {form.preview ? <img src={form.preview} alt={tx("Receipt", "Recibo")} />
              : form.receipt_path ? <button type="button" className="xp-link" onClick={() => viewReceipt(form.receipt_path)}>🧾 {tx("View saved receipt", "Ver recibo guardado")}</button>
                : null}
            <button type="button" className="xp-btn xp-btn-sm" onClick={() => photoInput.current && photoInput.current.click()}>📎 {form.preview || form.receipt_path ? tx("Change photo", "Cambiar foto") : tx("Add receipt photo", "Agregar foto del recibo")}</button>
          </div>
          {error && <p className="xp-error" role="alert">{error}</p>}
          <div className="xp-form-foot">
            <button type="button" className="xp-btn xp-btn-primary" disabled={saving || (scan && !scan.done)} onClick={save}>{saving ? tx("Saving…", "Guardando…") : tx("Save expense", "Guardar gasto")}</button>
            {form.id && <button type="button" className="xp-link xp-danger" onClick={() => remove(form)}>{tx("Delete", "Borrar")}</button>}
          </div>
        </div>
      )}

      {byCat.length > 0 && (
        <div className="xp-card">
          <div className="xp-card-title">{tx("Where it went", "En qué se fue")}</div>
          {byCat.map((c) => (
            <div className="xp-catrow" key={c.id}>
              <span>{c.icon} {es ? c.es : c.en}</span>
              <div className="xp-catbar"><i style={{ width: `${Math.max(4, (c.total / byCat[0].total) * 100)}%` }} /></div>
              <b>{money(c.total)}</b>
            </div>
          ))}
        </div>
      )}

      <div className="xp-card">
        <div className="xp-card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{tx("Expenses", "Gastos")} · {rows.length}</span>
          {rows.length > 0 && <button type="button" className="xp-link" onClick={exportCsv}>⬇️ CSV</button>}
        </div>
        {loading ? <p className="xp-empty">{tx("Loading…", "Cargando…")}</p>
          : loadError ? <p className="xp-error">{loadError}</p>
            : rows.length === 0 ? <p className="xp-empty">{tx("Nothing logged this month yet. Snap a receipt when you buy something for the business.", "Nada registrado este mes. Toma foto al recibo cuando compres algo para el negocio.")}</p>
              : rows.map((r) => {
                const c = catOf(r.category);
                return (
                  <button type="button" className="xp-row" key={r.id} onClick={() => { setScan(null); setError(""); setForm({ ...blankForm(), ...r, amount: String(r.amount), vendor: r.vendor || "", note: r.note || "", file: null, preview: null }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                    <span className="xp-row-icon">{c.icon}</span>
                    <span className="xp-row-main">
                      <b>{r.vendor || (es ? c.es : c.en)}</b>
                      <small>{new Date(`${r.spent_on}T00:00:00`).toLocaleDateString(es ? "es" : "en-US", { month: "short", day: "numeric" })} · {es ? c.es : c.en}{r.receipt_path ? " · 🧾" : ""}{r.note ? ` · ${r.note}` : ""}</small>
                    </span>
                    <span className="xp-row-amt">{money(r.amount)}</span>
                  </button>
                );
              })}
      </div>
    </div>
  );
}

// Small profit summary for the Earnings page.
export function ProfitSnapshot({ providerId, bookings, es, onOpen }) {
  const [spent, setSpent] = useState(null);
  const now = new Date();
  const from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  useEffect(() => {
    if (!providerId) return;
    supabase.from("business_expenses").select("amount").eq("provider_id", providerId).gte("spent_on", from).lte("spent_on", to)
      .then(({ data }) => setSpent((data || []).reduce((s, r) => s + Number(r.amount || 0), 0)));
  }, [providerId, from, to]);
  const income = (bookings || []).filter((b) => (b.status === "completed" || b.status === "done") && String(b.booking_date).slice(0, 10) >= from && String(b.booking_date).slice(0, 10) <= to)
    .reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
  const profit = income - (spent || 0);
  return (
    <button type="button" className="xp-snap" onClick={onOpen}>
      <span className="xp-snap-title">🧾 {es ? "Gastos y ganancia este mes" : "Expenses & profit this month"}</span>
      <span className="xp-snap-nums">
        {spent === null ? "…" : <>{money(income)} − {money(spent)} = <b className={profit >= 0 ? "xp-pos" : "xp-neg"}>{profit < 0 ? "−" : ""}{money(Math.abs(profit))}</b></>}
      </span>
      <span className="xp-snap-go">{es ? "Registrar un gasto ›" : "Log an expense ›"}</span>
    </button>
  );
}
