// ADMIN COMMAND CENTER — the overview tab for the admin portal: revenue at a
// glance, the "Velvet Rope" approval queue, and a roster of who's live.
//
// This is a presentational component on purpose: it takes already-loaded
// data and a handful of callbacks as props, and does no fetching or Supabase
// calls of its own. AdminPortal (in App.jsx) already loads applications,
// providers and payments for its other tabs — this just re-shapes that same
// data for a faster read, and reuses AdminPortal's existing actions
// (act(id, "active") / act(id, "rejected")) so "Approve" here is the exact
// same activation path as the "Activate" button on the Pending tab —
// including the 14-day trial-date stamping already wired into
// updateApplicationStatus(). There is no separate "approved" status; this
// UI just gives that same action a clearer, sales-facing label.
//
// Props:
//   pendingApps    — applications with status "pending": { id, business_name, owner_name, created_at }
//   activeProviders — providers with is_active true: { id, business_name, planName, planMonthly, addons? }
//                     `addons` is optional and expected to be undefined/empty today — see note by the
//                     roster below, there's no real per-shop add-on tracking in the database yet.
//   mrr            — precomputed monthly recurring revenue (sum of active providers' plan price), a number
//   busyId         — id of the application/provider currently mid-action (disables its buttons), or null
//   onApprove(id)  — approve a pending application and start its trial
//   onDeny(id)     — reject a pending application
//   onManage(providerId) — open full management (plan change / suspend / edit) for a live provider
//   paymentsPending, vipPending, refundsCount — counts that used to live as badges on the
//     now-removed sidebar (Payments / VIP Memberships / Refunds). Surfaced here as a small
//     status strip so removing that sidebar didn't remove the at-a-glance visibility.
//   emergencyLabel — "Paused" / "Offline" / null, mirrors the sidebar's old Emergency badge
//   onJump(tabId)  — switch the admin portal to another tab (used by the status strip)

const money = (n) => `BZ$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const timeAgo = (iso) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
};

export default function AdminDashboard({
  pendingApps = [],
  activeProviders = [],
  mrr = 0,
  busyId = null,
  onApprove,
  onDeny,
  onManage,
  paymentsPending = 0,
  vipPending = 0,
  refundsCount = 0,
  emergencyLabel = null,
  onJump,
}) {
  const jump = (tabId) => onJump && onJump(tabId);
  const hasAlerts = paymentsPending > 0 || vipPending > 0 || refundsCount > 0 || emergencyLabel;

  return (
    <div className="acc-root">
      <style>{ADMIN_DASHBOARD_CSS}</style>

      <div className="portal-header">
        <h2>Command Center</h2>
        <p>Your network at a glance — the Velvet Rope queue, who's live, and what's coming in.</p>
      </div>

      {/* Quick-jump status strip — these used to be badge counts on the
          sidebar (Payments / VIP Memberships / Refunds / Emergency); now
          that the sidebar's gone, this is where that same visibility lives. */}
      {hasAlerts && (
        <div className="acc-alerts">
          {emergencyLabel && (
            <button className="acc-alert-pill acc-alert-danger" onClick={() => jump("security")}>🚨 {emergencyLabel}</button>
          )}
          {paymentsPending > 0 && (
            <button className="acc-alert-pill" onClick={() => jump("payments")}>🧾 {paymentsPending} payment{paymentsPending === 1 ? "" : "s"} to review</button>
          )}
          {vipPending > 0 && (
            <button className="acc-alert-pill" onClick={() => jump("vip")}>⚡ {vipPending} VIP payment{vipPending === 1 ? "" : "s"} to review</button>
          )}
          {refundsCount > 0 && (
            <button className="acc-alert-pill" onClick={() => jump("refunds")}>💸 {refundsCount} refund{refundsCount === 1 ? "" : "s"} pending</button>
          )}
        </div>
      )}

      {/* 1. REVENUE & NETWORK OVERVIEW */}
      <div className="acc-metrics">
        <div className="acc-metric-card">
          <div className="acc-metric-label">Pending Applications</div>
          <div className="acc-metric-value">{pendingApps.length}</div>
          <div className="acc-metric-sub">{pendingApps.length === 1 ? "shop waiting on the rope" : "shops waiting on the rope"}</div>
        </div>
        <div className="acc-metric-card">
          <div className="acc-metric-label">Active Shops</div>
          <div className="acc-metric-value">{activeProviders.length}</div>
          <div className="acc-metric-sub">live and bookable right now</div>
        </div>
        <div className="acc-metric-card acc-metric-highlight">
          <div className="acc-metric-label">Monthly Recurring Revenue</div>
          <div className="acc-metric-value">{money(mrr)}</div>
          <div className="acc-metric-sub">across every paid plan, before add-ons</div>
        </div>
      </div>

      {/* 2. PENDING APPLICATIONS — THE VELVET ROPE QUEUE */}
      <div className="acc-section">
        <div className="acc-section-head">
          <h3>The Velvet Rope Queue</h3>
          <span className="acc-section-count">{pendingApps.length}</span>
        </div>

        {pendingApps.length === 0 ? (
          <div className="acc-empty">Nobody's waiting — the queue is clear.</div>
        ) : (
          <div className="acc-list">
            {pendingApps.map((app) => {
              const isBusy = busyId === app.id;
              return (
                <div className="acc-row" key={app.id}>
                  <div className="acc-row-main">
                    <div className="acc-row-title">{app.business_name}</div>
                    <div className="acc-row-meta">{app.owner_name} · Applied {timeAgo(app.created_at)}</div>
                  </div>
                  <div className="acc-row-actions">
                    <button
                      className="acc-btn-approve"
                      disabled={isBusy}
                      onClick={() => onApprove && onApprove(app.id)}
                    >
                      {isBusy ? "Working..." : "Approve & Start 14-Day Trial"}
                    </button>
                    <button
                      className="acc-btn-deny"
                      disabled={isBusy}
                      onClick={() => onDeny && onDeny(app.id)}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. ACTIVE PARTNERS ROSTER */}
      <div className="acc-section">
        <div className="acc-section-head">
          <h3>Active Partners</h3>
          <span className="acc-section-count">{activeProviders.length}</span>
        </div>

        {activeProviders.length === 0 ? (
          <div className="acc-empty">No live shops yet.</div>
        ) : (
          <div className="acc-list">
            {activeProviders.map((p) => {
              const addons = p.addons || [];
              return (
                <div className="acc-row" key={p.id}>
                  <div className="acc-row-main">
                    <div className="acc-row-title">{p.business_name}</div>
                    <div className="acc-row-tags">
                      <span className="acc-plan-pill">{p.planName}</span>
                      {/* No add-on is actually tracked per shop yet (Vai Media is still a
                          WhatsApp inquiry, not a subscription) — this renders real tags
                          the moment that data exists, and nothing fabricated in the meantime. */}
                      {addons.map((a) => (
                        <span className="acc-addon-pill" key={a}>{a}</span>
                      ))}
                    </div>
                  </div>
                  <div className="acc-row-actions">
                    <button className="acc-btn-manage" onClick={() => onManage && onManage(p.id)}>Manage</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const ADMIN_DASHBOARD_CSS = `
  .acc-root { max-width: 980px; }

  .acc-alerts { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
  .acc-alert-pill {
    display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700;
    color: var(--forest); background: var(--sand); border: 1px solid var(--border);
    padding: 7px 13px; border-radius: 100px; cursor: pointer;
  }
  .acc-alert-danger { color: #B91C1C; background: #FEE2E2; border-color: #FCA5A5; }

  /* Metric row — dark forest + neon lime, matching the provider dashboard's
     "dopamine card" so the network's headline numbers read as premium at a
     glance, distinct from the lighter working lists below them. */
  .acc-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 28px; }
  .acc-metric-card {
    background: linear-gradient(160deg, var(--forest) 0%, #0A2A20 100%);
    border-radius: 14px;
    padding: 18px 20px;
    box-shadow: 0 10px 26px rgba(13,61,46,0.18);
  }
  .acc-metric-highlight { box-shadow: 0 10px 30px rgba(198,241,53,0.18), 0 10px 26px rgba(13,61,46,0.18); border: 1px solid rgba(198,241,53,0.3); }
  .acc-metric-label { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: rgba(245,239,224,0.6); margin-bottom: 8px; }
  .acc-metric-value { font-size: 28px; font-weight: 800; color: var(--lime); font-family: 'Plus Jakarta Sans', sans-serif; letter-spacing: -0.02em; line-height: 1.1; }
  .acc-metric-sub { font-size: 11.5px; color: rgba(245,239,224,0.55); margin-top: 6px; }

  /* Sections — dense list rows, not padded cards, so a full queue or roster
     stays scannable without scrolling forever. */
  .acc-section { margin-bottom: 28px; }
  .acc-section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .acc-section-head h3 { font-size: 15px; font-weight: 700; color: var(--forest); margin: 0; }
  .acc-section-count { font-size: 11px; font-weight: 700; color: var(--muted); background: var(--sand); padding: 2px 8px; border-radius: 100px; }
  .acc-empty { font-size: 13px; color: var(--muted); background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 16px; }

  .acc-list { background: #fff; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .acc-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 12px 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap;
  }
  .acc-row:last-child { border-bottom: none; }
  .acc-row-main { min-width: 0; }
  .acc-row-title { font-size: 13.5px; font-weight: 700; color: var(--dark-text); }
  .acc-row-meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .acc-row-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .acc-row-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }

  .acc-plan-pill { font-size: 11px; font-weight: 700; color: var(--forest); background: var(--sand); padding: 3px 9px; border-radius: 100px; }
  .acc-addon-pill { font-size: 11px; font-weight: 700; color: var(--forest); background: rgba(198,241,53,0.18); border: 1px solid rgba(198,241,53,0.4); padding: 3px 9px; border-radius: 100px; }

  .acc-btn-approve {
    background: var(--lime); color: var(--forest); border: none; font-weight: 800; font-size: 12.5px;
    padding: 9px 16px; border-radius: 100px; cursor: pointer; white-space: nowrap;
    box-shadow: 0 6px 16px rgba(198,241,53,0.3);
  }
  .acc-btn-approve:disabled { opacity: .6; cursor: default; }
  .acc-btn-deny { background: transparent; border: none; color: var(--muted); font-size: 12px; font-weight: 600; cursor: pointer; text-decoration: underline; padding: 4px; }
  .acc-btn-deny:disabled { opacity: .5; cursor: default; }
  .acc-btn-manage { background: transparent; border: 1px solid var(--border); color: var(--forest); font-size: 12px; font-weight: 700; padding: 7px 14px; border-radius: 8px; cursor: pointer; }

  @media (max-width: 720px) {
    .acc-metrics { grid-template-columns: 1fr; }
    .acc-row { flex-direction: column; align-items: flex-start; }
    .acc-row-actions { width: 100%; justify-content: flex-start; }
  }
`;
