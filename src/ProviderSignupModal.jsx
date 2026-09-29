import { useEffect, useState } from "react";

// ── PROVIDER SIGNUP MODAL — "Direct-to-App" frictionless funnel ─────────
//
// Every "Provide my service" / "Apply to Join" entry point in the app
// (nav CTA, /providers hero, pricing cards, the closing "for business" CTA)
// now opens this instead of routing to a marketing page or the real
// application form. Shop Name / Email / Password, one lime button, done.
//
// ⚠️ MOCKUP, per the brief that requested it: this form is not wired to
// any backend. VaiBook currently has no email/password auth at all —
// real provider sign-in is Google OAuth (see ProviderPortal's "Sign in
// with Google" gate) — and no instant self-serve account creation; every
// real signup still goes through ProviderSignup's application, which sits
// in the admin queue until a human approves it (see ProviderSignup /
// submitProviderApplication in App.jsx). Submitting this modal creates
// nothing: no auth user, no provider row, no session. It just fires
// onEnterDashboard, which closes the modal and navigates to the
// "provider" view — where, with no real session behind it, ProviderPortal
// will currently show its own "Sign in with Google" gate rather than a
// live dashboard. Wiring this up to an actual instant-provisioning flow
// (a real signUp call + auto-created provider profile) is separate
// backend work, not included here — this component is the front-end
// shell + interaction only.
export default function ProviderSignupModal({ open, onClose, onEnterDashboard }) {
  const [form, setForm] = useState({ shopName: "", email: "", password: "" });
  const [entering, setEntering] = useState(false);

  // Reset on every fresh open so a previous fill-in never lingers, and
  // Escape closes it like any other overlay in this app.
  useEffect(() => {
    if (!open) return;
    setForm({ shopName: "", email: "", password: "" });
    setEntering(false);
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (entering) return;
    setEntering(true);
    // A short, deliberate beat — not 0ms (which reads as broken/no
    // feedback) but nowhere near a real signup's round trip either — is
    // what actually makes this feel "instant" rather than unresponsive.
    setTimeout(() => { onEnterDashboard(); }, 450);
  };

  return (
    <div className="psm-overlay" onClick={onClose}>
      <div className="psm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="psm-headline">
        <button className="psm-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="psm-eyebrow">✨ 14-day free trial</div>
        <h2 className="psm-headline" id="psm-headline">Start Your 14-Day Free Trial.</h2>
        <p className="psm-sub">No credit card required. Setup takes 30 seconds.</p>

        <form className="psm-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Shop Name</label>
            <input
              type="text"
              placeholder="e.g. Fresh Cutz Barbershop"
              value={form.shopName}
              onChange={set("shopName")}
              required
              autoFocus
            />
          </div>
          <div className="input-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@business.com"
              value={form.email}
              onChange={set("email")}
              required
            />
          </div>
          <div className="input-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Create a password"
              value={form.password}
              onChange={set("password")}
              minLength={6}
              required
            />
          </div>

          <button type="submit" className="btn-lime psm-submit" disabled={entering}>
            {entering ? "Entering…" : "Enter Dashboard →"}
          </button>
        </form>

        <p className="psm-note">No contracts, no setup fees — cancel anytime.</p>
      </div>
    </div>
  );
}
