import { useEffect, useRef, useState } from "react";

// MISSION CONTROL — the admin's headline panel (2026-10-30).
// Live platform numbers from admin_platform_stats(): everyone on VaiBook,
// split by role (businesses, team members, customers), money and bookings,
// sign-ups over the last 30 days, and a district-by-district breakdown.
// Built to look sharp in a phone screenshot. "Privacy" blurs the money so
// a screenshot can be shared without revealing revenue.

const fmt = (n) => Number(n || 0).toLocaleString();
const money = (n) => `BZ$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function useCountUp(target, ms = 900) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const to = Number(target || 0);
    let reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* ignore */ }
    if (reduce) { setV(to); from.current = to; return undefined; }
    const start = performance.now(); const a = from.current;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(a + (to - a) * eased);
      if (t < 1) raf = requestAnimationFrame(tick); else from.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Count({ value, money: isMoney, decimals = 0 }) {
  const v = useCountUp(value);
  if (isMoney) return <>{money(v)}</>;
  return <>{decimals ? v.toFixed(decimals) : fmt(Math.round(v))}</>;
}

function Sparkline({ points }) {
  const data = (points || []).map((p) => Number(p.n) || 0);
  if (data.length < 2) return null;
  const w = 300, h = 54, max = Math.max(1, ...data);
  const step = w / (data.length - 1);
  const xy = data.map((n, i) => [i * step, h - 4 - (n / max) * (h - 10)]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = xy[xy.length - 1];
  return (
    <svg className="mc-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="mcSparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8B7CFF" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#8B7CFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#mcSparkFill)" />
      <path d={line} fill="none" stroke="#B4A9FF" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="#C6F135" />
    </svg>
  );
}

export default function MissionControl({ stats, loading, error, onRefresh }) {
  const [privacy, setPrivacy] = useState(() => {
    try { return localStorage.getItem("vaibook_mc_privacy") === "1"; } catch (e) { return false; }
  });
  const togglePrivacy = () => setPrivacy((p) => { try { localStorage.setItem("vaibook_mc_privacy", p ? "0" : "1"); } catch (e) { /* ignore */ } return !p; });

  const s = stats || {};
  const total = Number(s.total_users || 0);
  const pct = (n) => (total ? Math.round((Number(n || 0) / total) * 100) : 0);
  const districts = s.districts || [];
  const maxDistrict = Math.max(1, ...districts.map((d) => Number(d.total) || 0));
  const updated = s.generated_at ? new Date(s.generated_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const signupsMonth = (s.signups_30d || []).reduce((a, p) => a + (Number(p.n) || 0), 0);

  return (
    <section className="mc" aria-label="Platform overview">
      <style>{MC_CSS}</style>
      <div className="mc-grid" aria-hidden="true" />
      <div className="mc-glow" aria-hidden="true" />

      <header className="mc-top">
        <div className="mc-brand">
          <span className="mc-logo"><span>vai</span>book</span>
          <span className="mc-slash">//</span>
          <span className="mc-title">COMMAND CENTER</span>
        </div>
        <div className="mc-controls">
          <span className="mc-live"><i />LIVE{updated ? ` · ${updated}` : ""}</span>
          <button type="button" className={`mc-chip${privacy ? " on" : ""}`} onClick={togglePrivacy} aria-pressed={privacy}>
            {privacy ? "🙈 Privacy on" : "👁 Privacy"}
          </button>
          <button type="button" className="mc-chip" onClick={onRefresh} disabled={loading} aria-label="Refresh numbers">
            {loading ? "…" : "↻"}
          </button>
        </div>
      </header>

      {error && !stats && <div className="mc-error">Couldn't load the numbers. Tap ↻ to try again.</div>}

      <div className="mc-hero">
        <div>
          <div className="mc-label">TOTAL USERS</div>
          <div className="mc-big"><Count value={total} /></div>
          <div className="mc-hero-sub">
            {Number(s.new_users_7d) > 0 && <span className="mc-up">▲ {fmt(s.new_users_7d)} this week</span>}
            <span className="mc-muted">{fmt(signupsMonth)} joined in the last 30 days</span>
          </div>
        </div>
        <Sparkline points={s.signups_30d} />
      </div>

      <div className="mc-roles">
        {[
          { key: "businesses", icon: "🏪", label: "Businesses", value: s.businesses, sub: `${fmt(s.businesses_live)} live · ${fmt(s.paid_businesses)} paying`, color: "#8B7CFF" },
          { key: "team", icon: "🧑‍🔧", label: "Team members", value: s.team_members, sub: "staff with their own login", color: "#C6F135" },
          { key: "customers", icon: "🙋", label: "Customers", value: s.customers, sub: "booking on VaiBook", color: "#4FD1FF" },
        ].map((r) => (
          <div className="mc-role" key={r.key} style={{ "--c": r.color }}>
            <div className="mc-role-head"><span className="mc-role-icon">{r.icon}</span><span className="mc-label">{r.label.toUpperCase()}</span></div>
            <div className="mc-role-num"><Count value={r.value} /></div>
            <div className="mc-role-bar"><span style={{ width: `${pct(r.value)}%` }} /></div>
            <div className="mc-role-sub">{r.sub}</div>
          </div>
        ))}
      </div>

      <div className="mc-kpis">
        <div className="mc-kpi">
          <div className="mc-label">MRR</div>
          <div className={`mc-kpi-num${privacy ? " blur" : ""}`}><Count value={s.mrr} money /></div>
          <div className="mc-kpi-sub">monthly recurring</div>
        </div>
        <div className="mc-kpi">
          <div className="mc-label">BOOKINGS · 30D</div>
          <div className="mc-kpi-num"><Count value={s.bookings_30d} /></div>
          <div className="mc-kpi-sub">{fmt(s.bookings_total)} all time</div>
        </div>
        <div className="mc-kpi">
          <div className="mc-label">BOOKED · 30D</div>
          <div className={`mc-kpi-num${privacy ? " blur" : ""}`}><Count value={s.booked_value_30d} money /></div>
          <div className="mc-kpi-sub">through VaiBook</div>
        </div>
        <div className="mc-kpi">
          <div className="mc-label">RATING</div>
          <div className="mc-kpi-num">{s.avg_rating ? <>★ <Count value={s.avg_rating} decimals={1} /></> : "—"}</div>
          <div className="mc-kpi-sub">{fmt(s.reviews)} review{Number(s.reviews) === 1 ? "" : "s"}</div>
        </div>
      </div>

      <div className="mc-districts">
        <div className="mc-dhead">
          <span className="mc-label">BY DISTRICT</span>
          <span className="mc-legend">
            <i style={{ background: "#8B7CFF" }} />Businesses
            <i style={{ background: "#C6F135" }} />Team
            <i style={{ background: "#4FD1FF" }} />Customers
          </span>
        </div>
        {districts.map((d) => {
          const tot = Number(d.total) || 0;
          const w = (n) => `${((Number(n) || 0) / maxDistrict) * 100}%`;
          return (
            <div className={`mc-drow${tot ? "" : " empty"}`} key={d.district}>
              <div className="mc-dname">{d.district}</div>
              {tot ? (
                <div className="mc-dbar">
                  <span style={{ width: w(d.businesses), background: "#8B7CFF" }} />
                  <span style={{ width: w(d.team), background: "#C6F135" }} />
                  <span style={{ width: w(d.customers), background: "#4FD1FF" }} />
                </div>
              ) : <div className="mc-dempty">next to conquer</div>}
              <div className="mc-dnums">
                {tot ? (
                  <><b>{fmt(d.businesses)}</b><b className="t">{fmt(d.team)}</b><b className="c">{fmt(d.customers)}</b></>
                ) : <span className="mc-muted">—</span>}
              </div>
            </div>
          );
        })}
        {Number(s.customers_no_district) > 0 && (
          <div className="mc-foot">+ {fmt(s.customers_no_district)} {Number(s.customers_no_district) === 1 ? "customer who hasn't" : "customers who haven't"} booked yet (no district yet)</div>
        )}
      </div>
    </section>
  );
}

const MC_CSS = `
  .mc { position: relative; overflow: hidden; isolation: isolate; color: #F4F3FA; border-radius: 26px; padding: 22px 22px 18px; margin-bottom: 26px;
        background: radial-gradient(900px 380px at -10% -20%, rgba(124,92,255,0.42), transparent 60%),
                    radial-gradient(700px 300px at 115% 0%, rgba(198,241,53,0.16), transparent 60%),
                    radial-gradient(600px 300px at 50% 120%, rgba(79,209,255,0.14), transparent 60%),
                    linear-gradient(180deg, #0D0B1A 0%, #07060E 100%);
        border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 24px 60px rgba(13,8,40,0.45), inset 0 1px 0 rgba(255,255,255,0.06); }
  .mc-grid { position: absolute; inset: 0; z-index: -1; opacity: .5;
             background-image: linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px);
             background-size: 28px 28px; mask-image: radial-gradient(ellipse at 30% 0%, #000 30%, transparent 75%); -webkit-mask-image: radial-gradient(ellipse at 30% 0%, #000 30%, transparent 75%); }
  .mc-glow { position: absolute; z-index: -1; width: 260px; height: 260px; right: -60px; top: 120px; border-radius: 50%; background: rgba(139,124,255,0.25); filter: blur(60px); }
  .mc-label { font: 700 10.5px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .16em; color: rgba(244,243,250,0.55); }
  .mc-muted { color: rgba(244,243,250,0.5); }
  .mc-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
  .mc-brand { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .mc-logo { font-weight: 800; font-size: 17px; letter-spacing: -.01em; color: #FFFFFF; }
  .mc-logo span { font-weight: 500; color: rgba(255,255,255,0.55); }
  .mc-slash { color: #8B7CFF; font-weight: 800; }
  .mc-title { font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .2em; color: rgba(244,243,250,0.8); }
  .mc-controls { display: flex; align-items: center; gap: 6px; }
  .mc-live { display: inline-flex; align-items: center; gap: 6px; font: 700 10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; color: #C6F135; margin-right: 4px; }
  .mc-live i { width: 7px; height: 7px; border-radius: 50%; background: #C6F135; box-shadow: 0 0 0 0 rgba(198,241,53,0.7); animation: mcPulse 1.8s infinite; }
  @keyframes mcPulse { 0% { box-shadow: 0 0 0 0 rgba(198,241,53,0.65); } 70% { box-shadow: 0 0 0 8px rgba(198,241,53,0); } 100% { box-shadow: 0 0 0 0 rgba(198,241,53,0); } }
  .mc-chip { font-family: inherit; font-size: 12px; font-weight: 600; line-height: 1; color: #F4F3FA; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; padding: 7px 11px; cursor: pointer; }
  .mc-chip.on { background: rgba(198,241,53,0.16); border-color: rgba(198,241,53,0.45); color: #E4FF8A; }
  .mc-error { font-size: 13px; color: #FCA5A5; margin-bottom: 12px; }
  .mc-hero { display: grid; grid-template-columns: auto 1fr; gap: 18px; align-items: end; margin-bottom: 18px; }
  .mc-big { font-size: 68px; line-height: .95; font-weight: 800; letter-spacing: -.04em; margin: 6px 0 8px;
            background: linear-gradient(180deg, #FFFFFF 0%, #C9C2FF 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
            text-shadow: 0 0 40px rgba(139,124,255,0.25); font-variant-numeric: tabular-nums; }
  .mc-hero-sub { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12.5px; }
  .mc-up { color: #C6F135; font-weight: 700; background: rgba(198,241,53,0.12); border: 1px solid rgba(198,241,53,0.3); border-radius: 999px; padding: 3px 9px; }
  .mc-spark { width: 100%; height: 64px; display: block; }
  .mc-roles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px; }
  .mc-role { background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.09); border-radius: 18px; padding: 14px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
  .mc-role-head { display: flex; align-items: center; gap: 7px; }
  .mc-role-icon { font-size: 15px; }
  .mc-role-num { font-size: 34px; font-weight: 800; letter-spacing: -.03em; margin: 8px 0 10px; color: var(--c); text-shadow: 0 0 22px color-mix(in srgb, var(--c) 45%, transparent); font-variant-numeric: tabular-nums; }
  .mc-role-bar { height: 5px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; }
  .mc-role-bar span { display: block; height: 100%; border-radius: 99px; background: var(--c); box-shadow: 0 0 12px var(--c); transition: width .9s cubic-bezier(.2,.8,.2,1); }
  .mc-role-sub { font-size: 11.5px; color: rgba(244,243,250,0.55); margin-top: 8px; line-height: 1.35; }
  .mc-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
  .mc-kpi { border-radius: 16px; padding: 12px 14px; background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)); border: 1px solid rgba(255,255,255,0.08); min-width: 0; }
  .mc-kpi-num { font-size: 22px; font-weight: 800; letter-spacing: -.02em; margin: 7px 0 3px; color: #FFFFFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; transition: filter .2s; }
  .mc-kpi-num.blur { filter: blur(9px); user-select: none; }
  .mc-kpi-sub { font-size: 11px; color: rgba(244,243,250,0.5); }
  .mc-districts { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 14px; }
  .mc-dhead { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .mc-legend { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: rgba(244,243,250,0.6); }
  .mc-legend i { width: 8px; height: 8px; border-radius: 3px; display: inline-block; margin-left: 6px; }
  .mc-drow { display: grid; grid-template-columns: 96px 1fr auto; gap: 10px; align-items: center; padding: 7px 0; }
  .mc-dname { font-size: 13px; font-weight: 700; color: #FFFFFF; }
  .mc-drow.empty .mc-dname { color: rgba(244,243,250,0.45); font-weight: 600; }
  .mc-dbar { display: flex; gap: 2px; height: 10px; border-radius: 99px; background: rgba(255,255,255,0.06); overflow: hidden; align-items: stretch; }
  .mc-dbar span { display: block; height: 100%; min-width: 0; box-shadow: 0 0 10px rgba(255,255,255,0.15); transition: width .9s cubic-bezier(.2,.8,.2,1); }
  .mc-dbar span:first-child { border-radius: 99px 0 0 99px; }
  .mc-dempty { font-size: 11.5px; font-style: italic; color: rgba(244,243,250,0.32); letter-spacing: .02em; }
  .mc-dnums { display: flex; gap: 8px; font: 700 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; min-width: 66px; justify-content: flex-end; }
  .mc-dnums b { color: #B4A9FF; } .mc-dnums b.t { color: #C6F135; } .mc-dnums b.c { color: #4FD1FF; }
  .mc-foot { font-size: 11.5px; color: rgba(244,243,250,0.5); margin-top: 8px; }
  @media (max-width: 640px) {
    .mc { padding: 18px 16px 14px; border-radius: 22px; }
    .mc-hero { grid-template-columns: 1fr; gap: 6px; }
    .mc-big { font-size: 60px; }
    .mc-roles { grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .mc-role { padding: 11px 10px; border-radius: 15px; }
    .mc-role-num { font-size: 26px; margin: 6px 0 8px; }
    .mc-role-sub { font-size: 10.5px; }
    .mc-role .mc-label { font-size: 9px; letter-spacing: .1em; }
    .mc-role-icon { display: none; }
    .mc-kpis { grid-template-columns: 1fr 1fr; gap: 8px; }
    .mc-kpi-num { font-size: 20px; }
    .mc-drow { grid-template-columns: 84px 1fr auto; }
  }
  @media (prefers-reduced-motion: reduce) { .mc-live i { animation: none; } }
`;
