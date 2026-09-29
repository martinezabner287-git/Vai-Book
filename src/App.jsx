
import { useState, useEffect, useLayoutEffect, useRef, useContext, createContext, lazy, Suspense } from "react";
import { supabase, signInWithGoogle, signOut, getOrCreateUser, getProviderProfile, checkIsAdmin, getProviderApplications, updateApplicationStatus, submitProviderApplication, getProviderBookings, updateBookingStatus, updateBooking, upsertProviderProfile, getWorkingHours, upsertWorkingHours, getActiveApplicationByEmail, uploadProviderPhoto, deleteProviderPhoto, createService, deleteService, getActiveProviders, getProviderDirectory, createBooking, getProviderBusyWindows, createBookingSafe, cancelBooking, getCustomerBookings, uploadReceipt, submitReview, getProviderReviews, updateReview, sendBookingEmail, updateUserProfile, getPaymentMethods, addPaymentMethod, deletePaymentMethod, createNotification, getNotifications, markNotificationRead, markAllNotificationsRead, getCategoryDefaultFeatures, getProviderFeatureOverrides, setProviderFeatureOverride, getVisitNotes, upsertVisitNote, adminListProviders, adminUpdateProvider, adminDeleteProvider, getFavoriteProviderIds, getFavoriteProviders, addFavorite, removeFavorite, getBookingMessages, sendBookingMessage, markBookingMessagesRead, getUnreadBookingMessages, getProviderMonthlyTrend, createProviderProfile, getProviderById, createWalkInBooking, submitProviderPayment, getMyProviderPayments, adminListProviderPayments, adminReviewProviderPayment, submitVipPayment, getMyVipPayments, adminListVipPayments, adminReviewVipPayment, createVipBooking, submitBookingRefund, adminListBookingRefunds, openPrivateFile, getProviderStaff, addProviderStaff, updateProviderStaff, deleteProviderStaff, getLoyaltyAccount, getProviderLoyaltyCustomers, redeemLoyaltyReward, getMyStaffProfile, claimStaffSeatByEmail, getStaffBookings, getProviderNotifyEmail, getMaintenanceStatus, setMaintenanceMode, getSiteOfflineStatus, setSiteOffline, sendEmailOtp, verifyEmailOtp, savePushSubscription, attachBookingServices, getProviderBlocks, insertProviderBlock, deleteProviderBlock, proposeBookingReschedule, confirmBookingReschedule, declineBookingReschedule, withdrawBookingReschedule } from "./supabase";
import { compressImageFile } from "./imageUtils";
import { bookingRequestSchema, rescheduleProposalSchema, validate } from "./validation";

// Default map center: Belize (roughly Belmopan) for providers who haven't set a pin yet.
const BELIZE_CENTER = [17.25, -88.77];

// react-leaflet + leaflet only ever gets fetched when one of these two
// components actually renders — see the comment atop MapWidgets.jsx.
const ProviderMiniMap = lazy(() => import("./MapWidgets").then((m) => ({ default: m.ProviderMiniMap })));
const ProviderLocationMap = lazy(() => import("./MapWidgets").then((m) => ({ default: m.ProviderLocationMap })));
// Pulls in the `qrcode` package, so it's code-split and only fetched the
// moment a provider actually opens their launch graphic — not on every
// dashboard load.
const WelcomePlaqueGenerator = lazy(() => import("./WelcomePlaqueGenerator"));
function MapLoadingFallback({ height }) {
  return (
    <div style={{ height, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--sand)", fontSize: 12.5, color: "var(--muted)" }}>
      Loading map...
    </div>
  );
}

function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

// Builds the professional "you're booked" confirmation email: a thank-you
// note, an appointment card, a proper invoice breakdown, and the provider's
// location with a one-tap directions link. Used once a booking is actually
// confirmed (immediately for no-deposit bookings, or once the deposit
// payment is confirmed) — not for the earlier accept/deposit-request emails.
function bookingConfirmedEmailHtml({ customerName, providerProfile, serviceName, dateStr, timeStr, total, deposit }) {
  const balance = deposit != null ? (Number(total || 0) - Number(deposit || 0)).toFixed(2) : null;
  const hasLocation = providerProfile?.latitude != null && providerProfile?.longitude != null;
  const mapsUrl = hasLocation ? directionsUrl(providerProfile.latitude, providerProfile.longitude) : null;
  const addressLine = providerProfile?.location_label || providerProfile?.district || "";
  const providerName = providerProfile?.business_name || "your provider";

  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1a2e22;">
    <div style="background: #0D3D2E; padding: 22px 28px; border-radius: 10px 10px 0 0;">
      <span style="font-size: 20px; font-weight: 700; color: #FAFAF7;">vai<span style="color: #C6F135;">book</span></span>
    </div>
    <div style="background: #ffffff; border: 1px solid #E5E0D3; border-top: none; border-radius: 0 0 10px 10px; padding: 28px;">
      <h2 style="margin: 0 0 6px; font-size: 20px; color: #0D3D2E;">Thank you for booking with VaiBook${customerName ? `, ${customerName}` : ""}!</h2>
      <p style="margin: 0 0 20px; font-size: 14px; color: #5b6b62; line-height: 1.5;">Your appointment with <strong>${providerName}</strong> is confirmed. Here's everything you need for your visit.</p>

      <div style="background: #F5EFE0; border-radius: 8px; padding: 16px 18px; margin-bottom: 16px;">
        <div style="font-size: 12px; color: #5b6b62; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.4px;">Appointment</div>
        <div style="font-size: 15px; font-weight: 600;">${serviceName}</div>
        <div style="font-size: 13px; color: #5b6b62; margin-top: 2px;">${dateStr}${timeStr ? ` at ${timeStr}` : ""}</div>
      </div>

      <div style="border: 1px solid #E5E0D3; border-radius: 8px; padding: 16px 18px; margin-bottom: 16px;">
        <div style="font-size: 12px; font-weight: 600; color: #0D3D2E; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.4px;">Invoice</div>
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr><td style="padding: 4px 0; color: #5b6b62;">Total</td><td style="padding: 4px 0; text-align: right;">BZ$${Number(total || 0).toFixed(2)}</td></tr>
          ${deposit != null ? `<tr><td style="padding: 4px 0; color: #5b6b62;">Deposit paid</td><td style="padding: 4px 0; text-align: right;">BZ$${Number(deposit).toFixed(2)}</td></tr>
          <tr><td style="padding: 8px 0 0; font-weight: 600; border-top: 1px solid #E5E0D3;">Balance due at appointment</td><td style="padding: 8px 0 0; text-align: right; font-weight: 600; border-top: 1px solid #E5E0D3;">BZ$${balance}</td></tr>` : ""}
        </table>
      </div>

      ${addressLine || mapsUrl ? `
      <div style="border: 1px solid #E5E0D3; border-radius: 8px; padding: 16px 18px; margin-bottom: 16px;">
        <div style="font-size: 12px; font-weight: 600; color: #0D3D2E; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.4px;">Location</div>
        ${addressLine ? `<div style="font-size: 14px; margin-bottom: 10px;">${addressLine}</div>` : ""}
        ${mapsUrl ? `<a href="${mapsUrl}" style="display: inline-block; background: #0D3D2E; color: #FAFAF7; text-decoration: none; font-size: 13px; font-weight: 600; padding: 9px 18px; border-radius: 100px;">Get directions</a>` : ""}
      </div>` : ""}

      <p style="font-size: 13px; color: #5b6b62; line-height: 1.5; margin-top: 24px;">We look forward to seeing you. If anything comes up, you can reach ${providerName} directly.</p>
      <p style="font-size: 13px; color: #5b6b62; margin-top: 16px;">— The VaiBook Team</p>
    </div>
  </div>`;
}

// Sent the moment an admin activates a provider application. Important:
// activation alone does NOT put the business live — the very first time
// this person signs in to VaiBook with the same email, their provider
// profile is created automatically (see loadProviderProfile). This email
// exists so they actually know to go do that, rather than the admin
// approving someone who never finds out and never shows up in search.
function providerApprovedEmailHtml({ businessName, ownerName }) {
  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1a2e22;">
    <div style="background: #0D3D2E; padding: 22px 28px; border-radius: 10px 10px 0 0;">
      <span style="font-size: 20px; font-weight: 700; color: #FAFAF7;">vai<span style="color: #C6F135;">book</span></span>
    </div>
    <div style="background: #ffffff; border: 1px solid #E5E0D3; border-top: none; border-radius: 0 0 10px 10px; padding: 28px;">
      <h2 style="margin: 0 0 6px; font-size: 20px; color: #0D3D2E;">You're approved${ownerName ? `, ${ownerName}` : ""}! 🎉</h2>
      <p style="margin: 0 0 20px; font-size: 14px; color: #5b6b62; line-height: 1.5;"><strong>${businessName}</strong> has been approved on VaiBook. One last step to go live:</p>
      <div style="background: #F5EFE0; border-radius: 8px; padding: 16px 18px; margin-bottom: 16px;">
        <div style="font-size: 14px; line-height: 1.6;">
          Sign in at <strong>vai-book.vercel.app/#provider</strong> with Google, using this same email address. The moment you do, your business goes live and customers can start finding and booking you.
        </div>
      </div>
      <p style="font-size: 13px; color: #5b6b62; line-height: 1.5;">Nothing else is needed — no forms, no re-applying. Just sign in once and you're live.</p>
      <p style="font-size: 13px; color: #5b6b62; margin-top: 16px;">— The VaiBook Team</p>
    </div>
  </div>`;
}

// Compact relative-time formatter for the notification list ("2h ago").
function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// Builds a small, deduplicated list of search suggestions from a list of
// providers (each with business_name, service_type, and services[].name).
// Matches happen against three things: the provider's business name, its
// category (service_type), and the individual services it offers — so
// typing "the nigglet cuts", "barber", or "haircut" all surface results.
function buildSuggestions(list, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q || !list || list.length === 0) return [];
  const results = [];
  const seen = new Set();

  list.forEach((p) => {
    if ((p.business_name || "").toLowerCase().includes(q)) {
      const key = `p-${p.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ key, type: "provider", icon: "🏪", label: p.business_name, sublabel: p.service_type || "" });
      }
    }
  });

  const categories = new Set();
  list.forEach((p) => {
    if (p.service_type && p.service_type.toLowerCase().includes(q)) categories.add(p.service_type);
  });
  categories.forEach((cat) => {
    const key = `c-${cat}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ key, type: "category", icon: "🏷️", label: cat, sublabel: "Category" });
    }
  });

  const serviceNames = new Map();
  list.forEach((p) => {
    (p.services || []).forEach((s) => {
      if (s.name && s.name.toLowerCase().includes(q)) {
        const k = s.name.toLowerCase();
        if (!serviceNames.has(k)) serviceNames.set(k, { name: s.name, count: 0 });
        serviceNames.get(k).count += 1;
      }
    });
  });
  serviceNames.forEach(({ name, count }) => {
    const key = `s-${name.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ key, type: "service", icon: "✂️", label: name, sublabel: `Service · ${count} provider${count === 1 ? "" : "s"}` });
    }
  });

  return results.slice(0, 8);
}

// ── DESIGN TOKENS ──────────────────────────────────────────────
// Palette: deep forest green (#0D3D2E) + warm sand (#F5EFE0) + 
// electric lime accent (#C6F135) + soft clay (#D4795A) + near-white (#FAFAF7)
// Type: "Plus Jakarta Sans" throughout (display + body) — matches Vai Buy & Sell
// Signature: the lime accent used sparingly — only on the ONE thing that matters per screen

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --forest: #0D3D2E;
    --forest-mid: #164D3A;
    --forest-light: #1E6B50;
    --sand: #F5EFE0;
    --lime: #C6F135;
    --clay: #D4795A;
    --near-white: #FAFAF7;
    --dark-text: #0D1F18;
    --muted: #6B7F76;
    --border: #D9E4DF;
    --radius: 12px;
    --radius-sm: 8px;
  }

  body { font-family: 'Plus Jakarta Sans', sans-serif; background: var(--near-white); color: var(--dark-text); }

  /* NAV — carries its own visible dark-to-green fade over its own (short)
     height, ending on the exact color the hero starts from, so nav and
     hero read as one continuous fade rather than nav sitting as a flat
     dark cap on top of a graded hero. Earlier version only moved from
     near-black to dark forest here (#030B08→#0D3D2E) — too small a jump
     over ~108px to look like it was fading at all next to the hero's much
     bigger swing. Widening nav's own jump (near-black to a clearly lighter
     mid-green) makes the brightening visible within the nav bar itself.
     Kept as two independent percentage-based gradients (not a shared
     canvas) so the hero always still reaches full vivid green at its own
     bottom edge regardless of actual rendered height.
     nav/nav-strip stay transparent so nav-outer's gradient shows through
     both rows uninterrupted. This nav renders on every view (not just the
     homepage), so the same graded top bar now carries through the
     customer/provider/admin portals too. */
  .nav-outer { position: sticky; top: 0; z-index: 100; background: linear-gradient(180deg, #02100A 0%, #17593F 100%); }
  .nav {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 48px; background: transparent; position: relative;
  }
  .nav-logo { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 22px; color: var(--near-white); letter-spacing: -0.5px; }
  .nav-logo span { color: var(--lime); }
  /* margin-left: auto — .nav has only 3 real flex children when signed in
     (nav-search-wrap is position:absolute so it doesn't count, and
     nav-search-toggle is display:none above the 1180px breakpoint): logo,
     this block, and the notification bell. justify-content: space-between
     only pins the FIRST and LAST child to the true edges — a middle child
     floats and centers itself in whatever space is left, which is exactly
     what put the avatar/"List your business" behind the floating compact
     search once scrolled (it was centering, not overlapping by accident).
     auto-margin claims all free space to this block's left instead,
     pinning it (and the bell right after it) to the right edge as a
     group — the same fix already applied to the portal-only avatar div
     below, needed here too since this is a separate render branch. */
  .nav-cta { display: flex; align-items: center; gap: 18px; position: relative; margin-left: auto; }

  /* NAV STRIP (second row — category shortcuts, Vai Buy-style) */
  .nav-strip {
    display: flex; align-items: center; gap: 26px; padding: 10px 48px;
    background: transparent; border-top: 1px solid rgba(255,255,255,0.08);
    overflow-x: auto; scrollbar-width: none;
  }
  .nav-strip::-webkit-scrollbar { display: none; }
  .nav-strip-link { background: none; border: none; color: rgba(250,250,247,0.82); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; padding: 2px 0; white-space: nowrap; transition: color .2s; }
  .nav-strip-link:hover { color: var(--lime); }
  .nav-strip-cta { color: var(--lime); font-weight: 600; margin-left: auto; }
  .nav-strip-district { margin-left: auto; font-size: 12px; color: rgba(250,250,247,0.55); white-space: nowrap; padding-left: 18px; }
  .nav-strip-cta ~ .nav-strip-district { margin-left: 0; }

  /* NAV SEARCH (pinned between the logo and menu/account controls).
     Positioned absolutely and centered on .nav itself (left:50% + translateX
     -50%), NOT centered-within-leftover-flex-space — the logo (~112px) and
     the cta group (~337px) are different widths, so a flex:1 middle slot
     centers itself around the midpoint of the SPACE BETWEEN them, which
     sits well left of the bar's true center once the cta group's width is
     counted. Absolute + translate ties it to the nav's actual center
     regardless of how wide the logo or cta group are.
     There isn't enough room for a centered bar next to the fixed-width cta
     group below ~1180px, so that range keeps the toggle-button + slide-down
     panel pattern (already the mobile-accessible fallback) instead of
     shrinking/overlapping it — bumped up from the old 768px cutoff to cover
     that gap, not just phones. */
  .nav-search-wrap {
    position: absolute; left: 50%; top: 50%; width: 380px;
    opacity: 0; pointer-events: none;
    transform: translate(-50%, calc(-50% - 4px));
    transition: opacity .2s ease, transform .2s ease;
  }
  .nav-search-wrap.visible { opacity: 1; pointer-events: auto; transform: translate(-50%, -50%); }
  .nav-search { position: relative; width: 100%; }
  .nav-search-input-wrap { display: flex; align-items: center; gap: 8px; background: var(--sand); border-radius: 100px; padding: 9px 16px; }
  .nav-search-input-wrap input { border: none; outline: none; background: transparent; font-size: 13px; width: 100%; font-family: 'Plus Jakarta Sans', sans-serif; color: var(--dark-text); }
  .nav-search-icon { font-size: 14px; color: var(--muted); flex-shrink: 0; }
  /* margin-left: 12px — now that .nav-cta/the avatar div claim their own
     margin-left: auto (see .nav-cta above) to stay pinned right, there's
     no free space left for justify-content to put between this and the
     logo at the <1180px widths where this button is actually visible, so
     it needs its own fixed gap rather than relying on the parent's
     distribution. */
  .nav-search-toggle { display: none; background: transparent; border: 1px solid rgba(255,255,255,0.35); width: 38px; height: 38px; border-radius: 50%; align-items: center; justify-content: center; cursor: pointer; font-size: 15px; color: var(--near-white); flex-shrink: 0; opacity: 0; pointer-events: none; transition: opacity .2s ease; margin-left: 12px; }
  .nav-search-toggle.visible { opacity: 1; pointer-events: auto; }
  .nav-search-mobile-panel { display: none; }
  @media (max-width: 1180px) {
    .nav-search-wrap { display: none; }
    .nav-search-toggle { display: flex; }
    .nav-search-mobile-panel { display: block; position: absolute; top: 100%; left: 0; right: 0; background: white; border-bottom: 1px solid var(--border); padding: 14px 20px 18px; box-shadow: 0 12px 24px rgba(13,61,46,0.08); }
  }

  /* NOTIFICATION BELL */
  .notif-bell-btn { position: relative; background: transparent; border: 1px solid rgba(255,255,255,0.35); width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; flex-shrink: 0; }
  .notif-bell-btn:hover { border-color: var(--lime); }
  .notif-badge { position: absolute; top: -4px; right: -4px; background: var(--clay); color: white; font-size: 10px; font-weight: 700; min-width: 16px; height: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 3px; }
  .notif-dropdown { position: absolute; top: calc(100% + 10px); right: 0; width: 320px; max-height: 420px; overflow-y: auto; background: white; border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 16px 36px rgba(13,61,46,0.16); z-index: 150; }
  .notif-dropdown-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 13px; }
  .notif-dropdown-header a { color: var(--forest); font-weight: 600; cursor: pointer; font-size: 12px; }
  .notif-empty { padding: 24px 16px; font-size: 13px; color: var(--muted); text-align: center; margin: 0; }
  .notif-item { padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; position: relative; }
  .notif-item:last-child { border-bottom: none; }
  .notif-item:hover { background: var(--sand); }
  .notif-item.unread { background: #F3F8EE; }
  .notif-item.unread::before { content: ''; position: absolute; top: 16px; left: 6px; width: 6px; height: 6px; border-radius: 50%; background: var(--clay); }
  .notif-item.unread .notif-title { padding-left: 12px; }
  .notif-title { font-size: 13px; font-weight: 600; color: var(--dark-text); }
  .notif-body { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.4; }
  .notif-time { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .nav-login-link { background: none; border: none; color: var(--near-white); font-size: 14px; font-weight: 500; cursor: pointer; padding: 4px; }
  .nav-login-link:hover { color: var(--lime); }
  .btn-ghost { background: transparent; border: 1px solid rgba(255,255,255,0.35); color: var(--near-white); padding: 9px 20px; border-radius: 100px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all .2s; }
  .btn-ghost:hover { border-color: var(--lime); color: var(--lime); }
  .btn-lime { background: var(--lime); border: none; color: var(--forest); padding: 8px 20px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity .2s; }
  .btn-lime:hover { opacity: 0.85; }
  .nav-menu-btn { display: flex; align-items: center; gap: 8px; background: transparent; border: 1px solid rgba(255,255,255,0.35); color: var(--near-white); padding: 9px 18px 9px 22px; border-radius: 100px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all .2s; }
  .nav-menu-btn:hover { border-color: var(--lime); color: var(--lime); }
  .nav-signup-btn { background: var(--lime); border: none; color: var(--forest); padding: 9px 20px; border-radius: 100px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all .2s; box-shadow: 0 0 0 rgba(198,241,53,0); }
  .nav-signup-btn:hover { box-shadow: 0 0 14px rgba(198,241,53,0.6); transform: translateY(-1px); }
  .nav-menu-btn .bars { display: flex; flex-direction: column; gap: 3px; }
  .nav-menu-btn .bars span { width: 16px; height: 2px; background: currentColor; border-radius: 2px; }
  .nav-dropdown { position: absolute; top: calc(100% + 12px); right: 0; background: white; border-radius: var(--radius-sm); box-shadow: 0 16px 40px rgba(13,61,46,0.18); border: 1px solid var(--border); min-width: 220px; padding: 10px; z-index: 200; }
  .nav-dropdown a, .nav-dropdown button.nav-dropdown-item { display: block; width: 100%; text-align: left; background: none; border: none; padding: 11px 14px; border-radius: 8px; font-size: 14px; font-weight: 500; color: var(--dark-text); cursor: pointer; text-decoration: none; }
  .nav-dropdown a:hover, .nav-dropdown button.nav-dropdown-item:hover { background: var(--sand); }
  .nav-dropdown hr { border: none; border-top: 1px solid var(--border); margin: 8px 4px; }

  /* AUTH CHOICE */
  .auth-choice { min-height: 100vh; display: grid; grid-template-columns: 1fr 1fr; background: var(--near-white); }
  .auth-choice-left { position: relative; padding: 40px; display: flex; flex-direction: column; }
  .auth-back { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border); background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; color: var(--dark-text); }
  .auth-back:hover { border-color: var(--forest); color: var(--forest); }
  .auth-choice-body { flex: 1; display: flex; flex-direction: column; justify-content: center; max-width: 420px; margin: 0 auto; width: 100%; }
  .auth-choice-body h1 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 30px; font-weight: 800; color: var(--forest); margin-bottom: 32px; text-align: center; }
  .auth-option-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 20px 22px; margin-bottom: 16px; cursor: pointer; transition: all .2s; background: white; }
  .auth-option-card:hover { border-color: var(--forest); box-shadow: 0 6px 20px rgba(13,61,46,0.08); }
  .auth-option-card h3 { font-size: 16px; font-weight: 700; color: var(--dark-text); margin-bottom: 4px; }
  .auth-option-card p { font-size: 13px; color: var(--muted); }
  .auth-option-arrow { font-size: 18px; color: var(--forest); flex-shrink: 0; }
  .auth-choice-panel { position: relative; overflow: hidden; background: var(--forest); display: flex; align-items: center; justify-content: center; }
  .auth-choice-panel::before {
    content: '';
    position: absolute; inset: -20%;
    background:
      radial-gradient(circle at 25% 30%, rgba(198,241,53,0.35), transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(212,121,90,0.30), transparent 55%);
    filter: blur(60px);
  }
  .auth-choice-panel-logo { position: relative; z-index: 1; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 44px; font-weight: 800; color: var(--near-white); }
  .auth-choice-panel-logo span { color: var(--lime); }
  @media (max-width: 768px) {
    .auth-choice { grid-template-columns: 1fr; }
    .auth-choice-panel { display: none; }
  }

  /* ACCOUNT DROPDOWN */
  .nav-avatar-btn { display: flex; align-items: center; gap: 8px; background: transparent; border: 1px solid rgba(255,255,255,0.35); border-radius: 100px; padding: 4px 12px 4px 4px; cursor: pointer; transition: border-color .2s; }
  .nav-avatar-btn:hover { border-color: var(--lime); }
  .nav-avatar-circle { width: 30px; height: 30px; border-radius: 50%; background: var(--lime); color: var(--forest); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
  .profile-avatar-circle { width: 84px; height: 84px; border-radius: 50%; background: var(--lime); color: var(--forest); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 30px; }
  .nav-avatar-caret { font-size: 10px; color: rgba(250,250,247,0.7); }
  .nav-account-dropdown { position: absolute; top: calc(100% + 12px); right: 0; background: white; border-radius: var(--radius-sm); box-shadow: 0 16px 40px rgba(13,61,46,0.18); border: 1px solid var(--border); min-width: 250px; padding: 10px; z-index: 200; }
  .nav-account-name { padding: 10px 14px 14px; font-weight: 700; font-size: 16px; color: var(--dark-text); }
  .nav-account-dropdown button.nav-dropdown-item { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; background: none; border: none; padding: 11px 14px; border-radius: 8px; font-size: 14px; font-weight: 500; color: var(--dark-text); cursor: pointer; }
  .nav-account-dropdown button.nav-dropdown-item:hover { background: var(--sand); }
  .nav-account-dropdown button.nav-dropdown-item .icn { width: 18px; text-align: center; }
  .nav-account-dropdown button.nav-dropdown-item.for-biz { justify-content: space-between; font-weight: 600; }
  .nav-account-dropdown a { display: block; width: 100%; text-align: left; padding: 11px 14px; border-radius: 8px; font-size: 14px; font-weight: 500; color: var(--dark-text); cursor: pointer; text-decoration: none; }
  .nav-account-dropdown a:hover { background: var(--sand); }
  .nav-account-dropdown hr { border: none; border-top: 1px solid var(--border); margin: 8px 4px; }

  /* HERO */
  .hero {
    background: var(--forest);
    padding: 96px 48px 80px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center;
    min-height: 85vh;
  }
  .hero-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--lime); margin-bottom: 20px; }
  .hero-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: clamp(40px, 5vw, 64px); line-height: 1.05; color: var(--near-white); margin-bottom: 24px; }
  .hero-title em { font-style: normal; color: var(--lime); }
  .hero-body { font-size: 17px; line-height: 1.7; color: rgba(255,255,255,0.65); max-width: 440px; margin-bottom: 40px; }
  .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
  .btn-primary { background: var(--lime); color: var(--forest); border: none; padding: 14px 28px; border-radius: var(--radius-sm); font-size: 15px; font-weight: 600; cursor: pointer; transition: opacity .2s; }
  .btn-primary:hover { opacity: .85; }
  .btn-outline-white { background: transparent; color: var(--near-white); border: 1px solid rgba(255,255,255,0.35); padding: 14px 28px; border-radius: var(--radius-sm); font-size: 15px; font-weight: 500; cursor: pointer; transition: all .2s; }
  .btn-outline-white:hover { border-color: var(--lime); color: var(--lime); }

  /* HERO CARD */
  .hero-card-wrap { display: flex; flex-direction: column; gap: 16px; }
  .service-card {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    border-radius: var(--radius); padding: 20px 24px;
    display: flex; align-items: center; gap: 16px; cursor: pointer;
    transition: background .2s, border-color .2s;
  }
  .service-card:hover { background: rgba(198,241,53,0.08); border-color: rgba(198,241,53,0.3); }
  .service-icon { width: 48px; height: 48px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
  .service-info h4 { font-size: 15px; font-weight: 600; color: var(--near-white); margin-bottom: 2px; }
  .service-info p { font-size: 13px; color: rgba(255,255,255,0.5); }
  .service-badge { margin-left: auto; background: var(--lime); color: var(--forest); font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; }
  .service-badge.open { background: rgba(198,241,53,0.15); color: var(--lime); }

  /* SEARCH HERO — dark marketplace-style hero: small eyebrow label, bold
     two-line statement headline (2nd line in lime), then the search pill.
     Same structural language as Vai Buy's shop hero, in VaiBook's own
     forest-green palette instead of Vai Buy's navy/teal. */
  .search-hero {
    position: relative; overflow: hidden; padding: 100px 24px 88px; text-align: left;
    /* Picks up exactly where the nav's gradient ends (#17593F) and keeps
       brightening toward a vivid emerald glow at the bottom, so the nav
       and hero read as one unbroken fade down the page. Percentage-based
       to its own box (not a fixed pixel canvas), so the hero always
       reaches full vivid green right at its own bottom edge, whatever its
       actual rendered height turns out to be. */
    background: linear-gradient(170deg, #17593F 0%, #1E6B50 45%, #2BB37B 100%);
  }
  .search-hero::before {
    content: '';
    position: absolute; inset: -25%;
    background: radial-gradient(circle at 50% 100%, rgba(198,241,53,0.22), transparent 60%);
    z-index: 0;
  }
  .search-hero > * { position: relative; z-index: 1; max-width: 780px; margin-left: auto; margin-right: auto; }
  .search-hero > .search-bar-pill { z-index: 10; }
  .search-hero-eyebrow { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: rgba(250,250,247,0.55); margin-bottom: 18px; text-align: center; }
  .search-hero h1 { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: clamp(32px, 5vw, 58px); line-height: 1.08; letter-spacing: -1px; margin: 0 auto 20px; text-align: center; }
  .search-hero h1 .line1 { display: block; color: var(--near-white); }
  .search-hero h1 .line2 { display: block; color: var(--lime); }
  @media (max-width: 480px) {
    .search-hero h1 { font-size: clamp(28px, 8vw, 36px); }
  }
  .search-sub { font-size: 17px; color: rgba(250,250,247,0.72); max-width: 560px; margin: 0 auto 40px; line-height: 1.5; text-align: center; }
  .search-bar-pill { position: relative; max-width: 760px; margin: 0 auto; background: white; border-radius: 100px; box-shadow: 0 20px 50px rgba(0,0,0,0.28); display: flex; align-items: center; padding: 8px; gap: 4px; }
  .search-bar-pill .field { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 10px 18px; }
  .search-bar-pill .field input, .search-bar-pill .field select { border: none; outline: none; background: transparent; font-size: 14px; width: 100%; color: var(--dark-text); font-family: 'Plus Jakarta Sans', sans-serif; }
  .search-bar-pill .sep { width: 1px; height: 28px; background: var(--border); flex-shrink: 0; }
  .search-submit { background: var(--forest); color: var(--near-white); border: none; border-radius: 100px; padding: 14px 30px; font-weight: 600; font-size: 15px; cursor: pointer; white-space: nowrap; transition: opacity .2s; font-family: 'Plus Jakarta Sans', sans-serif; }
  .search-submit:hover { opacity: .87; }
  .search-hero-tagline { margin-top: 26px; font-size: 13px; color: rgba(250,250,247,0.6); text-align: center; }
  .search-hero-tagline a { color: var(--lime); font-weight: 600; cursor: pointer; text-decoration: underline; }
  .hero-trial-btn { display: block; margin: 0 auto 44px; padding: 17px 38px; font-size: 16px; border-radius: 100px; box-shadow: 0 16px 40px rgba(198,241,53,0.22); }
  .hero-search-label { font-size: 12px; font-weight: 600; letter-spacing: .03em; color: rgba(250,250,247,0.5); text-align: center; margin-bottom: 14px; }

  /* SEARCH SUGGESTIONS (autocomplete dropdown, shared by hero + browse search bars) */
  .suggestions-dropdown { position: absolute; top: calc(100% + 8px); left: 0; right: 0; background: white; border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 16px 36px rgba(13,61,46,0.16); z-index: 60; overflow: hidden; text-align: left; }
  .suggestion-item { display: flex; align-items: center; gap: 10px; padding: 11px 18px; cursor: pointer; font-size: 13px; }
  .suggestion-item:hover, .suggestion-item.active { background: var(--sand); }
  .suggestion-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
  .suggestion-label { font-weight: 600; color: var(--dark-text); }
  .suggestion-sub { font-size: 11px; color: var(--muted); margin-left: auto; flex-shrink: 0; padding-left: 12px; }
  @media (max-width: 640px) {
    .search-hero { padding: 80px 20px 64px; }
    .search-bar-pill { flex-direction: column; border-radius: 20px; align-items: stretch; }
    .search-bar-pill .sep { display: none; }
    .search-submit { width: 100%; }
  }

  /* STATS BAR */
  .marketing-strip { background: var(--sand); padding: 40px 48px; display: flex; justify-content: space-around; gap: 32px; flex-wrap: wrap; }
  .marketing-item { text-align: center; max-width: 230px; }
  .marketing-item-icon { font-size: 26px; line-height: 1; margin-bottom: 10px; }
  .marketing-item-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 16px; font-weight: 800; color: var(--forest); }
  .marketing-item-sub { font-size: 13px; color: var(--muted); margin-top: 4px; line-height: 1.45; }

  .platform-preview-section { padding-bottom: 40px; }
  .platform-preview-img { display: block; width: 100%; height: auto; max-width: 1100px; margin: 0 auto; border-radius: 20px; box-shadow: 0 24px 60px rgba(13,61,46,0.14); }

  /* HOW IT WORKS */
  .section { padding: 80px 48px; }
  .section-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--clay); margin-bottom: 12px; }
  .section-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: clamp(28px, 4vw, 44px); color: var(--forest); margin-bottom: 16px; line-height: 1.1; }
  .section-sub { font-size: 16px; color: var(--muted); max-width: 520px; line-height: 1.65; margin-bottom: 48px; }
  .steps-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; }
  .step-card { background: var(--near-white); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px 24px; position: relative; overflow: hidden; }
  .step-card::before { content: attr(data-n); position: absolute; top: -10px; right: 16px; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 72px; font-weight: 800; color: var(--forest); opacity: 0.04; line-height: 1; }
  .step-icon { font-size: 28px; margin-bottom: 16px; }
  .step-card h3 { font-size: 16px; font-weight: 600; color: var(--forest); margin-bottom: 8px; }
  .step-card p { font-size: 14px; color: var(--muted); line-height: 1.6; }

  /* SERVICES SECTION */
  .services-section { padding: 80px 48px; }
  .services-pills { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; max-width: 1040px; margin: 0 auto; }
  .service-pill { display: inline-flex; align-items: center; gap: 9px; background: #fff; border: 1px solid var(--border); color: var(--dark-text); padding: 13px 22px; border-radius: 100px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all .2s; }
  .service-pill:hover { border-color: var(--forest); color: var(--forest); box-shadow: 0 2px 10px rgba(13,61,46,0.08); }
  .service-pill .icon { font-size: 18px; line-height: 1; }

  /* BROWSE BY DISTRICT */
  .browse-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 32px 24px; max-width: 1100px; margin: 0 auto 44px; }
  .browse-col h5 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--forest); margin-bottom: 14px; }
  .browse-col ul { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .browse-col li { font-size: 14px; color: var(--dark-text); }
  .browse-col a { color: inherit; cursor: pointer; transition: color .2s; }
  .browse-col a:hover { color: var(--forest-light); text-decoration: underline; }
  .browse-pills { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; max-width: 1100px; margin: 0 auto; }
  .browse-pill { background: white; border: 1px solid var(--border); color: var(--dark-text); padding: 9px 18px; border-radius: 100px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all .2s; }
  .browse-pill:hover { border-color: var(--forest); color: var(--forest); }

  /* PRICING (public, for prospective providers) */
  .pricing-section { padding: 80px 48px; }
  .trial-badge { display: inline-flex; align-items: center; gap: 6px; background: var(--lime); color: var(--forest); font-size: 12.5px; font-weight: 700; padding: 7px 18px; border-radius: 100px; margin: 4px 0 18px; }
  .pricing-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; max-width: 720px; margin: 0 auto; align-items: stretch; }
  .pricing-card { background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 32px 28px; display: flex; flex-direction: column; position: relative; }
  .pricing-card.recommended { border: 2px solid var(--forest); box-shadow: 0 16px 36px rgba(13,61,46,0.12); }
  .pricing-badge { position: absolute; top: -13px; left: 50%; transform: translateX(-50%); background: var(--forest); color: var(--lime); font-size: 11px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; padding: 5px 14px; border-radius: 100px; white-space: nowrap; }
  .pricing-name { font-size: 13px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; }
  .pricing-price { font-size: 34px; font-weight: 800; color: var(--dark-text); margin: 10px 0 6px; font-family: 'Plus Jakarta Sans', sans-serif; }
  .pricing-price span { font-size: 14px; font-weight: 500; color: var(--muted); }
  .pricing-price-note { font-size: 12px; color: var(--muted); margin: -4px 0 14px; }
  .pricing-tagline { font-size: 13px; color: var(--muted); margin-bottom: 22px; min-height: 34px; }
  .pricing-features { list-style: none; padding: 0; margin: 0 0 28px; flex: 1; }
  .pricing-features li { display: flex; gap: 9px; align-items: flex-start; font-size: 13.5px; color: var(--dark-text); padding: 7px 0; line-height: 1.4; }
  .pricing-features li .check { color: var(--forest); font-weight: 700; flex-shrink: 0; }
  .pricing-cta { width: 100%; text-align: center; }
  .pricing-foot-note { text-align: center; font-size: 13px; color: var(--muted); margin-top: 32px; max-width: 620px; margin-left: auto; margin-right: auto; }
  .vai-creative-banner { position: relative; overflow: hidden; max-width: 780px; margin: 56px auto 0; text-align: center; background: linear-gradient(160deg, var(--forest) 0%, #0A2A20 100%); border: 1px solid rgba(198,241,53,0.25); border-radius: 24px; padding: 52px 40px; box-shadow: 0 24px 60px rgba(13,61,46,0.28); }
  .vai-creative-banner::before { content: ""; position: absolute; top: -60px; right: -60px; width: 220px; height: 220px; background: radial-gradient(circle, rgba(198,241,53,0.18) 0%, rgba(198,241,53,0) 70%); pointer-events: none; }
  .vai-creative-eyebrow { display: inline-flex; align-items: center; gap: 6px; background: rgba(198,241,53,0.12); color: var(--lime); font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; padding: 7px 16px; border-radius: 100px; margin-bottom: 18px; border: 1px solid rgba(198,241,53,0.3); }
  .vai-creative-title { color: #FFFFFF; font-size: 27px; font-weight: 800; margin: 0 0 14px; letter-spacing: -0.01em; position: relative; }
  .vai-creative-copy { color: rgba(245,239,224,0.78); font-size: 15.5px; line-height: 1.6; max-width: 520px; margin: 0 auto 30px; position: relative; }
  .vai-creative-btn { display: inline-block; background: var(--lime); color: var(--forest); font-weight: 800; font-size: 15px; padding: 15px 34px; border-radius: 14px; text-decoration: none; box-shadow: 0 10px 26px rgba(198,241,53,0.25); position: relative; }
  .vai-creative-alt { margin: 14px 0 0; font-size: 12.5px; position: relative; }
  .vai-creative-alt a { color: rgba(245,239,224,0.65); text-decoration: underline; }
  .for-business-cta { background: var(--forest); padding: 96px 24px; text-align: center; }
  .for-business-inner { max-width: 640px; margin: 0 auto; }
  .for-business-headline { color: #FFFFFF; font-weight: 800; font-size: 40px; line-height: 1.15; margin: 0 0 20px; letter-spacing: -0.01em; }
  .for-business-sub { color: rgba(245, 239, 224, 0.72); font-size: 17px; line-height: 1.6; margin: 0 0 40px; }
  .for-business-btn { padding: 17px 36px; font-size: 16px; font-weight: 700; border-radius: 14px; }
  @media (max-width: 900px) {
    .pricing-grid { grid-template-columns: 1fr; max-width: 420px; }
  }
  @media (max-width: 768px) {
    .pricing-section { padding: 60px 24px; }
  }

  .btn-forest { background: var(--forest); color: var(--near-white); border: none; width: 100%; padding: 13px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity .2s; }
  .btn-forest:hover { opacity: .85; }
  .btn-outline-forest { background: transparent; color: var(--forest); border: 1px solid var(--forest); width: 100%; padding: 13px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600; cursor: pointer; transition: all .2s; }
  .btn-outline-forest:hover { background: var(--forest); color: var(--near-white); }

  /* FOOTER */
  .footer { background: var(--dark-text); padding: 48px 48px 32px; color: rgba(255,255,255,0.5); }
  .footer-top { display: flex; justify-content: space-between; gap: 32px; flex-wrap: wrap; margin-bottom: 40px; }
  .footer-brand .nav-logo { font-size: 20px; display: block; margin-bottom: 12px; }
  .footer-brand p { font-size: 13px; max-width: 240px; line-height: 1.6; }
  .footer-links h5 { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: rgba(255,255,255,0.8); margin-bottom: 14px; }
  .footer-links ul { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .footer-links li { font-size: 13px; cursor: pointer; transition: color .2s; }
  .footer-links li:hover { color: var(--near-white); }
  .footer-bottom { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 24px; font-size: 12px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }

  /* PORTAL LAYOUTS */
  .portal-layout { display: grid; grid-template-columns: 240px 1fr; min-height: calc(100vh - 64px); }
  .sidebar { background: var(--forest); padding: 28px 0; display: flex; flex-direction: column; }
  .sidebar-section { padding: 0 16px; margin-bottom: 32px; }
  .sidebar-label { font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,0.35); padding: 0 12px; margin-bottom: 8px; }
  .sidebar-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--radius-sm); cursor: pointer; color: rgba(255,255,255,0.65); font-size: 14px; font-weight: 500; transition: all .2s; margin-bottom: 2px; }
  .sidebar-item:hover, .sidebar-item.active { background: rgba(198,241,53,0.12); color: var(--near-white); }
  .sidebar-item.active { color: var(--lime); }
  .sidebar-item .icon { font-size: 16px; width: 20px; text-align: center; }
  .sidebar-avatar { padding: 16px; border-top: 1px solid rgba(255,255,255,0.08); margin-top: auto; display: flex; align-items: center; gap: 12px; }
  .avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--lime); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: var(--forest); flex-shrink: 0; }
  .avatar-info .name { font-size: 13px; font-weight: 600; color: var(--near-white); }
  .avatar-info .role { font-size: 11px; color: rgba(255,255,255,0.4); }

  /* PROVIDER PORTAL — TOP NAV (replaces the persistent left sidebar with a
     single top bar: logo, daily-use links, and an avatar dropdown holding
     everything else. Customer/Staff portals are untouched and still use
     .portal-layout/.sidebar above.) */
  .provider-shell { min-height: 100vh; background: #F0F4F2; }
  .provider-topbar { position: sticky; top: 0; z-index: 150; height: 64px; background: var(--forest); display: flex; align-items: center; gap: 24px; padding: 0 24px; }
  .provider-topbar-left { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .provider-status-pill { font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--lime); background: rgba(198,241,53,0.12); padding: 4px 9px; border-radius: 100px; white-space: nowrap; }
  .provider-status-pill.pending { color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.08); }
  .provider-topnav-links { display: flex; align-items: center; gap: 4px; flex: 1; }
  .provider-nav-link { background: none; border: none; color: rgba(255,255,255,0.65); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 600; padding: 21px 14px; cursor: pointer; border-bottom: 2px solid transparent; transition: color .2s, border-color .2s; }
  .provider-nav-link:hover { color: #FFFFFF; }
  .provider-nav-link.active { color: var(--lime); border-bottom-color: var(--lime); }
  .provider-hamburger { display: none; background: none; border: 1px solid rgba(255,255,255,0.3); color: #FFFFFF; width: 38px; height: 38px; border-radius: 8px; font-size: 16px; cursor: pointer; flex-shrink: 0; }
  .provider-topbar-right { flex-shrink: 0; margin-left: auto; }
  .provider-avatar-wrap { position: relative; }
  .provider-avatar-btn { background: none; border: none; cursor: pointer; padding: 0; display: flex; align-items: center; }
  .provider-avatar-btn .avatar { flex-shrink: 0; }
  .provider-account-dropdown { top: calc(100% + 10px); min-width: 240px; }
  .provider-dropdown-header { padding: 6px 14px 10px; }
  .provider-dropdown-header .name { font-size: 14px; font-weight: 700; color: var(--dark-text); }
  .provider-dropdown-header .sub { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
  .provider-dropdown-group-label { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); padding: 10px 14px 4px; }
  .provider-mobile-nav { display: none; }

  /* PORTAL CONTENT */
  .portal-content { background: #F0F4F2; padding: 32px; overflow-y: auto; }
  .portal-header { margin-bottom: 28px; }
  .portal-header h2 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 26px; font-weight: 700; color: var(--forest); }
  .portal-header p { font-size: 14px; color: var(--muted); margin-top: 4px; }

  /* CARDS / WIDGETS */
  .card { background: var(--near-white); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
  .card-sm { background: var(--near-white); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
  .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .metric { background: var(--near-white); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
  .metric-label { font-size: 12px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
  .metric-value { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 30px; font-weight: 800; color: var(--forest); }
  .metric-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
  .metric-accent { color: var(--clay); }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .mb-4 { margin-bottom: 16px; }
  .mb-6 { margin-bottom: 24px; }

  /* BOOKING CARDS */
  .booking-item { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--border); }
  .booking-item:last-child { border-bottom: none; }
  .booking-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .booking-dot.confirmed { background: #22C55E; }
  .booking-dot.pending { background: #F59E0B; }
  .booking-dot.done { background: var(--muted); }
  .booking-info { flex: 1; }
  .booking-info .title { font-size: 14px; font-weight: 600; color: var(--dark-text); }
  .booking-info .meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .booking-amount { font-size: 14px; font-weight: 600; color: var(--forest); }
  .status-pill { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; margin-left: 10px; }
  .status-pill.confirmed { background: #DCFCE7; color: #15803D; }
  .status-pill.pending { background: #FEF3C7; color: #B45309; }
  .status-pill.done { background: #F1F5F9; color: var(--muted); }
  .status-pill.rejected { background: #FEE2E2; color: #B91C1C; }
  .status-pill.awaiting { background: #DBEAFE; color: #1D4ED8; }
  .booking-dot.rejected { background: #EF4444; }
  .booking-dot.awaiting { background: #3B82F6; }

  /* MODAL */
  .modal-overlay { position: fixed; inset: 0; background: rgba(13,61,46,0.55); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 20px; }
  .modal-panel { background: white; border-radius: var(--radius); padding: 28px; width: 100%; max-width: 440px; max-height: 88vh; overflow-y: auto; }
  .modal-close { float: right; cursor: pointer; color: var(--muted); font-size: 14px; }
  .star-picker { display: flex; gap: 6px; margin: 8px 0 16px; }
  .star-picker span { font-size: 26px; cursor: pointer; color: #E2E8F0; }
  .star-picker span.on { color: #F59E0B; }

  /* PROVIDER SPECIFIC */
  .provider-service { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .provider-service:last-child { border-bottom: none; }
  .toggle { width: 40px; height: 22px; background: #E2E8F0; border-radius: 11px; position: relative; cursor: pointer; transition: background .2s; }
  .toggle.on { background: var(--forest); }
  .toggle::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; background: white; border-radius: 50%; transition: transform .2s; }
  .toggle.on::after { transform: translateX(18px); }
  .card-title { font-size: 16px; font-weight: 600; color: var(--forest); margin-bottom: 16px; }

  /* VAI CREATIVE — dashboard promo card (Availability tab). Small and
     dark against the light dashboard cards around it so it reads as a
     premium aside, not another form to fill in. */
  .vai-creative-promo { margin-top: 24px; background: linear-gradient(160deg, var(--forest) 0%, #0A2A20 100%); border: 1px solid rgba(198,241,53,0.22); border-radius: 16px; padding: 22px 26px; display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
  .vai-creative-promo-text strong { display: block; font-size: 14.5px; font-weight: 800; color: #FFFFFF; margin-bottom: 4px; }
  .vai-creative-promo-text span { font-size: 12.5px; color: rgba(245,239,224,0.7); line-height: 1.5; }
  .vai-creative-promo-btn { flex-shrink: 0; background: var(--lime); color: var(--forest); font-weight: 800; font-size: 13px; padding: 11px 20px; border-radius: 10px; text-decoration: none; white-space: nowrap; }

  /* DOPAMINE CARD — dashboard financial snapshot */
  .dopamine-card { display: flex; align-items: center; background: linear-gradient(160deg, var(--forest) 0%, #0A2A20 100%); border-radius: 20px; padding: 26px 24px; margin-bottom: 20px; box-shadow: 0 16px 40px rgba(13,61,46,0.22); }
  .dopamine-metric { flex: 1; min-width: 0; }
  .dopamine-label { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: rgba(245,239,224,0.6); margin-bottom: 6px; }
  .dopamine-value { font-size: 32px; font-weight: 800; color: var(--lime); font-family: 'Plus Jakarta Sans', sans-serif; letter-spacing: -0.02em; white-space: nowrap; }
  .dopamine-value-sm { font-size: 21px; color: #FFFFFF; }
  .dopamine-pct { font-size: 12.5px; font-weight: 600; color: rgba(245,239,224,0.7); }
  .dopamine-divider { width: 1px; align-self: stretch; background: rgba(255,255,255,0.14); margin: 0 22px; }

  /* NEXT IN THE CHAIR — spotlight card */
  .next-chair-card { background: #fff; border: 1.5px solid var(--lime); border-left: 6px solid var(--forest); border-radius: 16px; padding: 16px 20px; margin-bottom: 20px; }
  .next-chair-label { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--forest); margin-bottom: 8px; }
  .next-chair-body { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .next-chair-name { font-size: 16px; font-weight: 800; color: var(--dark-text); }
  .next-chair-meta { font-size: 13px; color: var(--muted); margin-top: 2px; }
  .next-chair-whatsapp { flex-shrink: 0; width: 46px; height: 46px; border-radius: 50%; background: #25D366; display: flex; align-items: center; justify-content: center; font-size: 21px; text-decoration: none; box-shadow: 0 6px 16px rgba(37,211,102,0.35); }

  /* YOUR SHOPFRONT — chairside link/QR card */
  .shopfront-card { background: linear-gradient(160deg, var(--forest) 0%, #0A2A20 100%); border: 1px solid rgba(198,241,53,0.2); border-radius: 16px; padding: 20px 22px; margin-bottom: 20px; }
  .shopfront-label { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--lime); margin-bottom: 8px; }
  .shopfront-url { font-size: 12.5px; color: rgba(245,239,224,0.75); word-break: break-all; margin-bottom: 16px; }
  .shopfront-actions { display: flex; gap: 10px; flex-wrap: wrap; }
  .shopfront-btn { flex: 1; min-width: 130px; padding: 12px 0; border-radius: 10px; font-weight: 800; font-size: 13.5px; cursor: pointer; border: none; text-align: center; }
  .shopfront-btn-outline { background: transparent; color: #FFFFFF; border: 1.5px solid rgba(255,255,255,0.3); }
  .shopfront-btn-lime { background: var(--lime); color: var(--forest); }

  /* REBOOKING RADAR — bottom-of-dashboard retention strip */
  .rebook-radar { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; background: var(--sand); border-radius: 14px; padding: 16px 20px; margin-top: 20px; }
  .rebook-radar-text { font-size: 13.5px; font-weight: 600; color: var(--dark-text); }
  .rebook-radar-btn { flex-shrink: 0; background: var(--forest); color: #FFFFFF; font-weight: 700; font-size: 13px; padding: 10px 18px; border-radius: 10px; border: none; cursor: pointer; }

  /* FULL-SCREEN QR MODAL */
  .qr-modal-overlay { position: fixed; inset: 0; background: rgba(13,31,24,0.94); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .qr-modal-close { position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.1); color: #fff; border: none; width: 40px; height: 40px; border-radius: 50%; font-size: 18px; cursor: pointer; }
  .qr-modal-panel { background: #fff; border-radius: 20px; padding: 28px; text-align: center; max-width: 360px; width: 100%; }
  .qr-modal-img { width: 100%; max-width: 300px; height: auto; border-radius: 12px; }
  .qr-modal-business { margin-top: 16px; font-size: 16px; font-weight: 800; color: var(--dark-text); }
  .qr-modal-hint { margin-top: 4px; font-size: 13px; color: var(--muted); }

  /* ELITE WELCOME — "you're live" banner + launch graphic modal */
  .launch-banner { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; background: linear-gradient(160deg, var(--forest) 0%, #0A2A20 100%); border: 1px solid rgba(198,241,53,0.3); border-radius: 16px; padding: 18px 22px; margin-bottom: 20px; }
  .launch-banner-title { font-size: 15px; font-weight: 800; color: #FFFFFF; }
  .launch-banner-sub { font-size: 12.5px; color: rgba(245,239,224,0.7); margin-top: 3px; }
  .plaque-modal-panel { background: transparent; max-width: 420px; width: 100%; }
  .plaque-loading { background: #fff; border-radius: 16px; padding: 60px 24px; text-align: center; font-size: 14px; color: var(--muted); }
  .plaque-generator { display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .plaque-canvas { width: 100%; max-width: 420px; aspect-ratio: 1 / 1; border-radius: 16px; box-shadow: 0 24px 60px rgba(0,0,0,0.45); }
  .plaque-actions { display: flex; flex-direction: column; gap: 10px; width: 100%; }
  .plaque-actions .btn-sm { width: 100%; padding: 13px 0; font-size: 13.5px; }

  /* SEARCH BAR */
  .search-bar { position: relative; background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 20px; display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
  .search-bar input { border: none; outline: none; font-size: 15px; flex: 1; font-family: 'Plus Jakarta Sans', sans-serif; color: var(--dark-text); background: transparent; }
  .search-bar .search-icon { color: var(--muted); font-size: 18px; }

  /* PROVIDER GRID */
  .provider-card { background: var(--near-white); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; cursor: pointer; transition: box-shadow .2s; }
  .provider-card:hover { box-shadow: 0 4px 20px rgba(13,61,46,0.1); }
  .provider-card-img { height: 120px; display: flex; align-items: center; justify-content: center; font-size: 52px; }
  .provider-card-body { padding: 16px; }
  .provider-card-body h4 { font-size: 15px; font-weight: 600; color: var(--dark-text); margin-bottom: 2px; }
  .provider-card-body .trade { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
  .stars { color: #F59E0B; font-size: 13px; }
  .provider-card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
  .price-tag { font-size: 14px; font-weight: 600; color: var(--forest); }
  .avail-badge { font-size: 11px; font-weight: 600; background: #DCFCE7; color: #15803D; padding: 3px 8px; border-radius: 6px; }

  /* DISCOVER CAROUSELS (Recommended / New to VaiBook / Trending) */
  .carousel-row { display: flex; gap: 16px; overflow-x: auto; scroll-behavior: smooth; scrollbar-width: none; padding-bottom: 6px; }
  .carousel-row::-webkit-scrollbar { display: none; }
  .carousel-card { flex: 0 0 240px; background: var(--near-white); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; cursor: pointer; transition: box-shadow .2s; position: relative; }
  .carousel-card:hover { box-shadow: 0 4px 20px rgba(13,61,46,0.1); }
  .carousel-card-img { height: 140px; display: flex; align-items: center; justify-content: center; font-size: 44px; background: #E8F5EF; }
  .carousel-badge { position: absolute; top: 10px; left: 10px; z-index: 2; background: var(--near-white); font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; color: var(--dark-text); box-shadow: 0 1px 4px rgba(0,0,0,0.15); }
  .carousel-heart { position: absolute; top: 10px; right: 10px; z-index: 2; width: 28px; height: 28px; border-radius: 50%; border: none; background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; font-size: 13px; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }
  .carousel-card-body { padding: 14px; }
  .carousel-card-body h4 { font-size: 14px; font-weight: 700; color: var(--dark-text); margin-bottom: 2px; }
  .carousel-card-body .loc { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  .carousel-card-body .meta { font-size: 12px; color: var(--muted); }
  .carousel-arrow { position: absolute; top: 50%; right: -14px; transform: translateY(-50%); width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border); background: var(--near-white); box-shadow: 0 2px 10px rgba(0,0,0,0.12); cursor: pointer; font-size: 15px; color: var(--forest); display: flex; align-items: center; justify-content: center; }

  /* PROVIDER PROFILE MODAL (Services / Portfolio / Reviews / About) — a
     Fresha-style profile: photo gallery + name/rating/hours header up top,
     a sticky booking card alongside the tabbed content. Still an in-app
     overlay (not a routable URL) rather than a page, since VaiBook doesn't
     have per-provider routes yet — same trigger (openBooking) and state
     as before, just a much richer layout. */
  .modal-panel.profile-panel { max-width: 1080px; padding: 0; }
  .profile-scroll { padding: 28px; }
  .profile-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .profile-name-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .profile-name-row h2 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 26px; font-weight: 800; color: var(--forest); margin: 0; }
  .profile-icon-btn { background: #FFFFFF; border: 1px solid var(--border); cursor: pointer; width: 38px; height: 38px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: var(--dark-text); transition: background .15s, border-color .15s; }
  .profile-icon-btn:hover { background: var(--sand); border-color: var(--forest); }
  .profile-icon-btn svg { width: 18px; height: 18px; }
  .profile-icon-btn svg.heart-filled { color: var(--clay); }

  .guest-checkout-fields { border-top: 1px solid var(--border, #eee); margin-top: 4px; padding-top: 16px; margin-bottom: 4px; }
  .guest-checkout-label { font-size: 12px; font-weight: 700; color: var(--dark-text); margin: 0 0 10px; }
  .guest-checkout-note { font-size: 11px; color: var(--muted); margin: -4px 0 4px; }
  .optional-tag { font-weight: 400; color: var(--muted); }
  .checkout-liability-note { font-size: 10.5px; color: var(--muted); text-align: center; line-height: 1.5; margin: 10px 0 0; }

  .email-auth-overlay { position: fixed; inset: 0; background: rgba(13, 31, 24, 0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
  .email-auth-card { background: #FFFFFF; border-radius: 20px; width: 100%; max-width: 360px; padding: 32px; box-shadow: 0 24px 60px rgba(13,61,46,0.25); position: relative; }
  .email-auth-close { position: absolute; top: 16px; right: 16px; background: none; border: none; cursor: pointer; color: var(--muted); font-size: 20px; line-height: 1; padding: 4px; }
  .email-auth-brand { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 18px; color: var(--forest); margin: 0 0 20px; }
  .email-auth-brand span { color: var(--lime-dark, #8FAF1C); }
  .email-auth-title { font-size: 20px; font-weight: 800; color: var(--forest); margin: 0 0 6px; }
  .email-auth-sub { font-size: 13px; color: var(--muted); margin: 0 0 20px; line-height: 1.5; }
  .email-auth-sub strong { color: var(--dark-text); }
  .email-auth-code-row { display: flex; gap: 8px; justify-content: center; margin-bottom: 8px; }
  .email-auth-code-input { width: 42px; height: 52px; text-align: center; font-size: 20px; font-weight: 700; border-radius: 10px; border: 1px solid var(--border, #ddd); }
  .email-auth-code-input:focus { outline: none; border-color: var(--forest); box-shadow: 0 0 0 2px rgba(13,61,46,0.15); }
  .email-auth-error { font-size: 12px; color: #B91C1C; text-align: center; margin: 8px 0 0; }
  .email-auth-btn { width: 100%; margin-top: 20px; padding: 14px 0; font-size: 14px; border-radius: 12px; background: var(--forest); color: var(--lime); font-weight: 700; border: none; cursor: pointer; }
  .email-auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .email-auth-resend { width: 100%; margin-top: 10px; padding: 8px 0; font-size: 12px; font-weight: 600; color: var(--forest); background: none; border: none; cursor: pointer; }
  .email-auth-resend:disabled { color: var(--muted); cursor: not-allowed; }

  .profile-meta { font-size: 13px; color: var(--muted); margin: 8px 0 22px; display: flex; flex-wrap: wrap; align-items: center; gap: 0; }
  .profile-meta .dot { margin: 0 6px; }
  .profile-meta a { color: var(--forest); font-weight: 600; }
  .profile-meta .open-txt { color: #15803D; font-weight: 600; }
  .profile-meta .closed-txt { color: var(--clay); font-weight: 600; }

  .profile-gallery { display: grid; gap: 8px; border-radius: var(--radius); overflow: hidden; height: 320px; margin-bottom: 28px; }
  .gallery-hero { background-size: cover; background-position: center; cursor: pointer; }
  .gallery-fallback { display: flex; align-items: center; justify-content: center; font-size: 72px; background: #E8F5EF; }
  .gallery-side { display: grid; grid-template-rows: 1fr 1fr; gap: 8px; }
  .gallery-side-img { background-size: cover; background-position: center; cursor: pointer; position: relative; }
  .gallery-more-btn { position: absolute; bottom: 12px; right: 12px; background: white; border: none; border-radius: 100px; padding: 8px 16px; font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.2); }

  .profile-body { display: grid; grid-template-columns: 1fr 320px; gap: 32px; align-items: start; }
  .profile-sidebar-card { background: var(--near-white); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; position: sticky; top: 20px; }
  .profile-sidebar-card h3 { font-size: 18px; font-weight: 800; color: var(--forest); margin-bottom: 8px; }
  .chip { display: inline-block; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 100px; margin-bottom: 14px; }
  .chip-featured { background: var(--sand); color: var(--forest); }
  .chip-plan-pro { background: var(--sand); color: var(--forest); }
  .chip-plan-business { background: var(--forest); color: #fff; }
  .sidebar-divider { height: 1px; background: var(--border); margin: 4px 0; }
  .sidebar-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; font-size: 13px; color: var(--dark-text); padding: 12px 0; cursor: default; }
  .sidebar-row + .sidebar-row { border-top: 1px solid var(--border); }
  .sidebar-row.clickable { cursor: pointer; }
  .hours-list { padding: 0 0 6px; width: 100%; }
  .hours-row { display: flex; justify-content: space-between; font-size: 12.5px; padding: 3px 0; color: var(--muted); }
  .hours-row.today { color: var(--dark-text); font-weight: 700; }

  .reviews-summary { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; }
  .reviews-summary .big-rating { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 36px; font-weight: 800; color: var(--forest); line-height: 1; }
  .reviews-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 4px 32px; }

  .service-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--border); }
  .service-row:last-child { border-bottom: none; }
  .portfolio-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .portfolio-thumb { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 10px; cursor: pointer; border: 1px solid var(--border); transition: opacity .15s; }
  .portfolio-thumb:hover { opacity: .85; }
  .review-card { padding: 14px 0; border-bottom: 1px solid var(--border); }
  .review-card:last-child { border-bottom: none; }
  .lightbox-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 300; padding: 24px; cursor: zoom-out; }
  .lightbox-overlay img { max-width: 92vw; max-height: 92vh; border-radius: 10px; object-fit: contain; }

  .tab-row { display: flex; gap: 4px; margin-bottom: 24px; background: white; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px; }
  .tab { flex: 1; text-align: center; padding: 8px; font-size: 13px; font-weight: 500; color: var(--muted); cursor: pointer; border-radius: 6px; transition: all .2s; }
  .tab.active { background: var(--forest); color: var(--near-white); }

  .input-group { margin-bottom: 14px; }
  .input-group label { font-size: 12px; font-weight: 600; color: var(--dark-text); display: block; margin-bottom: 6px; letter-spacing: .02em; }
  .input-group input, .input-group select, .input-group textarea { width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; font-size: 14px; font-family: 'Plus Jakarta Sans', sans-serif; color: var(--dark-text); background: white; outline: none; transition: border-color .2s; }
  .input-group input:focus, .input-group select:focus, .input-group textarea:focus { border-color: var(--forest); }
  .input-group input:disabled { background: var(--sand); color: var(--muted); cursor: default; }
  .input-group textarea { resize: vertical; height: 80px; }
  .btn-sm { padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: var(--radius-sm); cursor: pointer; border: none; transition: opacity .2s; }
  .btn-sm:hover { opacity: .85; }
  .btn-sm.forest { background: var(--forest); color: var(--near-white); }
  .btn-sm.lime { background: var(--lime); color: var(--forest); }
  .btn-sm.ghost { background: transparent; border: 1px solid var(--border); color: var(--dark-text); }

  /* MULTI-SERVICE CHECKOUT (tappable service cards + sticky total bar) */
  .service-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 12px; cursor: pointer; transition: background .15s, box-shadow .15s; border: 1.5px solid transparent; margin-bottom: 8px; }
  .service-card:not(.active):hover { background: var(--sand); }
  .service-card.active { background: var(--forest); border-color: var(--lime); box-shadow: 0 0 0 1px var(--lime) inset; }
  .service-card.active .service-card-name, .service-card.active .service-card-meta { color: var(--near-white); }
  .service-card-check { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--border); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; color: transparent; font-weight: 800; }
  .service-card.active .service-card-check { background: var(--lime); border-color: var(--lime); color: var(--forest); }
  .multi-fab { position: sticky; bottom: 8px; background: var(--forest); color: var(--near-white); border-radius: 16px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; box-shadow: 0 8px 24px rgba(13,61,46,0.35); z-index: 5; }
  .multi-fab .totals { font-size: 12px; line-height: 1.4; color: rgba(255,255,255,0.8); }
  .multi-fab .totals strong { color: var(--lime); font-size: 17px; display: block; }
  .multi-fab button { background: var(--lime); color: var(--forest); border: none; padding: 13px 18px; border-radius: 10px; font-weight: 800; font-size: 14px; cursor: pointer; white-space: nowrap; }

  /* BOTTOM SHEET (mobile-first — replaces a modal for quick provider actions) */
  .sheet-overlay { position: fixed; inset: 0; background: rgba(13,61,46,0.55); display: flex; align-items: flex-end; justify-content: center; z-index: 300; }
  .sheet-panel { background: white; width: 100%; max-width: 520px; border-radius: 20px 20px 0 0; padding: 14px 20px calc(22px + env(safe-area-inset-bottom)); animation: sheetUp .22s ease-out; }
  @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .sheet-handle { width: 40px; height: 4px; background: var(--border); border-radius: 2px; margin: 0 auto 18px; }
  .preset-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 20px; }
  .preset-btn { flex: 1 1 21%; min-width: 78px; padding: 16px 0; border-radius: 12px; border: 1.5px solid var(--border); background: #fff; font-weight: 800; font-size: 14px; color: var(--dark-text); cursor: pointer; }
  .preset-btn.active { border-color: var(--lime); background: var(--forest); color: var(--near-white); }

  /* PANIC BUTTON */
  .panic-btn { width: 100%; background: var(--lime); color: var(--forest); border: none; border-radius: 16px; padding: 22px 16px; font-size: 19px; font-weight: 800; cursor: pointer; box-shadow: 0 6px 0 var(--forest-light); letter-spacing: -0.01em; transition: transform .08s, box-shadow .08s; }
  .panic-btn:active { transform: translateY(4px); box-shadow: 0 2px 0 var(--forest-light); }
  .panic-btn:disabled { opacity: .55; cursor: not-allowed; box-shadow: none; }
  /* Secondary quick action — same touch target size as .panic-btn so it
     reads as an equally-tappable option, just visually quieter (outline,
     no fill) so Walk-In stays the obvious primary choice. */
  .panic-btn-secondary { width: 100%; background: #fff; color: var(--forest); border: 2px solid var(--forest); border-radius: 16px; padding: 20px 16px; font-size: 17px; font-weight: 800; cursor: pointer; letter-spacing: -0.01em; transition: transform .08s, background .15s; }
  .panic-btn-secondary:active { transform: translateY(2px); background: var(--sand); }
  .panic-btn-secondary:disabled { opacity: .55; cursor: not-allowed; }
  .block-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .block-row .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--clay); flex-shrink: 0; }

  /* CALENDAR */
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .cal-day-label { text-align: center; font-size: 11px; font-weight: 600; color: var(--muted); padding: 4px 0; }
  .cal-day { text-align: center; padding: 8px 4px; border-radius: 6px; font-size: 13px; cursor: pointer; position: relative; }
  .cal-day:hover { background: var(--sand); }
  .cal-day.today { background: var(--forest); color: white; font-weight: 600; }
  .cal-day.has-booking::after { content: ''; position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; background: var(--lime); border-radius: 50%; }
  .cal-day.today.has-booking::after { background: var(--lime); }
  .cal-day.empty { cursor: default; }

  @media (max-width: 768px) {
    .nav { padding: 14px 20px; }
    .nav-strip { padding: 10px 20px; gap: 20px; }
    .hero { grid-template-columns: 1fr; padding: 60px 24px; min-height: auto; }
    .hero-card-wrap { display: none; }
    .section { padding: 60px 24px; }
    .marketing-strip { padding: 32px 24px; }
    .portal-layout { grid-template-columns: 1fr; }
    .sidebar { display: none; }
    .portal-content { padding: 20px; }
    .provider-topbar { padding: 0 16px; gap: 12px; }
    .provider-topbar-left .nav-logo { font-size: 16px; }
    .provider-status-pill { display: none; }
    .provider-topnav-links { display: none; }
    .provider-hamburger { display: flex; align-items: center; justify-content: center; }
    .provider-mobile-nav { display: flex; flex-direction: column; position: absolute; top: 64px; left: 0; right: 0; background: var(--forest); border-top: 1px solid rgba(255,255,255,0.1); box-shadow: 0 16px 30px rgba(0,0,0,0.25); z-index: 149; padding: 8px; }
    .provider-mobile-nav-item { background: none; border: none; color: rgba(255,255,255,0.75); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 600; text-align: left; padding: 13px 12px; border-radius: 8px; cursor: pointer; }
    .provider-mobile-nav-item.active { color: var(--lime); background: rgba(198,241,53,0.1); }
    .grid-2 { grid-template-columns: 1fr; }
    .grid-3 { grid-template-columns: 1fr; }
    .metric-grid { grid-template-columns: 1fr 1fr; }
    .services-section { padding: 60px 24px; }
    .for-business-cta { padding: 72px 20px; }
    .for-business-headline { font-size: 30px; }
    .for-business-sub { font-size: 15.5px; }
    .vai-creative-banner { padding: 36px 22px; margin-top: 40px; }
    .vai-creative-title { font-size: 22px; }
    .footer { padding: 40px 24px 24px; }
    .a2hs-banner { left: 12px; right: 12px; bottom: 12px; padding: 12px; }
    .profile-scroll { padding: 20px; }
    .profile-body { grid-template-columns: 1fr; gap: 20px; }
    .profile-sidebar { order: -1; }
    .profile-sidebar-card { position: static; }
    .profile-gallery { height: 220px; }
    .profile-name-row h2 { font-size: 21px; }
    .reviews-grid { grid-template-columns: 1fr; }
  }

  /* NAV — keep the top row on one line without pushing "Menu"/the avatar
     off-screen on phone-width viewports (the 3-button Log in / List your
     business / Menu row otherwise overflows below ~430px). */
  .mobile-only-item { display: none; }
  @media (max-width: 480px) {
    .quick-actions-row { flex-direction: column; }
    .panic-btn, .panic-btn-secondary { font-size: 17px; padding: 18px 16px; }
    .dopamine-card { flex-direction: column; align-items: stretch; gap: 16px; }
    .dopamine-divider { width: auto; height: 1px; margin: 0; }
    .dopamine-value { font-size: 28px; }
    .next-chair-body { flex-wrap: wrap; }
    .shopfront-actions { flex-direction: column; }
    .rebook-radar { flex-direction: column; align-items: stretch; text-align: center; }
    .nav { padding: 14px 16px; }
    .nav-logo { font-size: 18px; }
    .nav-cta { gap: 8px; }
    .nav-signup-btn { display: none; }
    .nav-login-link { font-size: 13px; padding: 4px 2px; }
    .nav-menu-btn { padding: 8px 12px 8px 14px; font-size: 13px; gap: 6px; }
    .nav-menu-btn .bars span { width: 13px; }
    .nav-avatar-btn { padding: 3px 8px 3px 3px; gap: 6px; }
    .notif-bell-btn { width: 34px; height: 34px; font-size: 14px; }
    .nav-dropdown .mobile-only-item { display: block; }
    .nav-account-dropdown .mobile-only-item { display: flex; }
    .carousel-arrow { display: none; }
    .carousel-card { flex-basis: 200px; }
  }

  .a2hs-banner {
    position: fixed;
    left: 20px;
    right: 20px;
    bottom: 20px;
    max-width: 420px;
    margin: 0 auto;
    background: var(--forest);
    color: white;
    border-radius: var(--radius);
    box-shadow: 0 16px 40px rgba(13,61,46,0.35);
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 500;
    animation: a2hsSlideUp .35s ease;
  }
  @keyframes a2hsSlideUp {
    from { transform: translateY(24px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .a2hs-banner-icon { font-size: 24px; flex-shrink: 0; }
  .a2hs-banner-text { flex: 1; min-width: 0; }
  .a2hs-banner-title { font-size: 13px; font-weight: 700; line-height: 1.3; }
  .a2hs-banner-sub { font-size: 12px; color: rgba(255,255,255,0.65); margin-top: 2px; }
  .a2hs-banner-cta { background: var(--lime); color: var(--forest); border: none; border-radius: 100px; padding: 8px 14px; font-size: 13px; font-weight: 700; cursor: pointer; flex-shrink: 0; white-space: nowrap; }
  .a2hs-banner-close { background: none; border: none; color: rgba(255,255,255,0.5); font-size: 14px; cursor: pointer; padding: 4px; flex-shrink: 0; }
  .a2hs-banner-close:hover { color: white; }

  .a2hs-modal { max-width: 380px; text-align: center; position: relative; padding: 32px 28px 28px; }
  .a2hs-modal-close { position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 16px; color: var(--muted); cursor: pointer; }
  .a2hs-modal-close:hover { color: var(--forest); }
  .a2hs-modal-icon { font-size: 40px; margin-bottom: 8px; }
  .a2hs-modal-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 20px; font-weight: 800; color: var(--forest); margin: 0 0 8px; }
  .a2hs-modal-sub { font-size: 13px; color: var(--muted); line-height: 1.5; margin: 0 0 20px; }
  .a2hs-install-btn { width: 100%; padding: 12px; font-size: 14px; margin-bottom: 16px; }
  .a2hs-tabs { display: flex; gap: 8px; background: var(--sand); border-radius: 100px; padding: 4px; margin-bottom: 20px; }
  .a2hs-tab { flex: 1; background: none; border: none; padding: 8px 12px; border-radius: 100px; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; }
  .a2hs-tab.active { background: white; color: var(--forest); box-shadow: 0 2px 8px rgba(13,61,46,0.12); }
  .a2hs-steps { list-style: none; margin: 0; padding: 0; text-align: left; display: flex; flex-direction: column; gap: 14px; }
  .a2hs-steps li { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; color: var(--dark-text); line-height: 1.4; }
  .a2hs-step-num { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; background: var(--forest); color: white; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .a2hs-glyph { font-size: 13px; }
`;

// ── BRAND MARK ─────────────────────────────────────────────────
// Stepped-triangle mark: three ascending terraces reading left-to-right,
// moss green climbing to the lime accent — the "growth" motif agreed on
// for VaiBook. Renders as a plain <svg> so it drops in anywhere the
// wordmark appears, at any size, without an external image file.
function VaiBookMark({ size = 26, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ flexShrink: 0, display: "block", ...style }}
      aria-hidden="true"
    >
      <rect x="6" y="62" width="26" height="32" rx="6" fill="#3F6B4A" />
      <rect x="37" y="38" width="26" height="56" rx="6" fill="#5C8A68" />
      <rect x="68" y="6" width="26" height="88" rx="6" fill="var(--lime, #C6F135)" />
    </svg>
  );
}

// ── DATA ────────────────────────────────────────────────────────
// VaiBook is scoped to the self-care niche (like Fresha/Mangomint), not a
// general local-services directory — this list is the merged set of
// categories those two platforms cover. Home Cleaning/Car Wash/Handyman
// were dropped from here (they're still findable by direct search, just no
// longer featured in nav/homepage/footer/browse) — that's the "everyday
// services" side of the business, slated for its own "Vai Services" product
// later rather than folded into VaiBook's self-care identity.
const SERVICES = [
  { icon: "✂️", name: "Barbers", desc: "Cuts & styles", bg: "#1A5C44" },
  { icon: "💇", name: "Hair Salons", desc: "Color & styling", bg: "#2A4A3E" },
  { icon: "💅", name: "Nail Techs", desc: "Nails & art", bg: "#1E4035" },
  { icon: "🧖", name: "Spas", desc: "Full-body relaxation", bg: "#163626" },
  { icon: "🩺", name: "Med Spas", desc: "Injectables & clinical", bg: "#1C4A38" },
  { icon: "💆", name: "Massage", desc: "Therapeutic & relaxation", bg: "#244530" },
  { icon: "🧴", name: "Skincare & Facials", desc: "Cleanses & glow-ups", bg: "#1A5C44" },
  { icon: "🪒", name: "Hair Removal", desc: "Waxing & laser", bg: "#2A4A3E" },
  { icon: "🖋️", name: "Tattoo & Piercing", desc: "Ink & piercings", bg: "#1E4035" },
  { icon: "🌿", name: "Wellness Centers", desc: "Holistic & recovery", bg: "#163626" },
  { icon: "🐾", name: "Pet Grooming", desc: "All breeds", bg: "#1C4A38" },
  { icon: "🏋️", name: "Fitness & Recovery", desc: "Training & recovery", bg: "#2A4A3E" },
  { icon: "🦵", name: "Physical Therapy", desc: "Rehab & mobility", bg: "#1E4035" },
];

// ── BUSINESS CATEGORIES & FEATURE FLAGS ──────────────────────────
// Every provider belongs to one business category, chosen at signup. Core
// features are on for every category; industry-specific "modules" default
// on/off per category and can be overridden per-provider in Settings →
// Modules. The canonical data lives in Supabase (business_categories /
// feature_flags / category_default_features / provider_feature_overrides —
// see supabase_feature_flags.sql); this is the client-side mirror used for
// labels/icons and for computing category_key at signup time.
const CORE_FEATURES = ["calendar_scheduling", "client_crm", "pos", "reporting_analytics"];

const CORE_FEATURE_CATALOG = {
  calendar_scheduling: { label: "Calendar & Scheduling", icon: "🗓️", desc: "Staff availability, shift management, booking interface" },
  client_crm: { label: "Client CRM", icon: "👥", desc: "Client profiles, booking history, automated reminders" },
  pos: { label: "Point of Sale", icon: "💳", desc: "Checkout, deposit collection, payment processing" },
  reporting_analytics: { label: "Reporting & Analytics", icon: "📊", desc: "Revenue tracking, commission payouts" },
};

const BUSINESS_CATEGORIES = [
  { key: "general", label: "General Service", icon: "🛠️" },
  { key: "hair_salon", label: "Hair Salons, Barbershops & Nail Studios", icon: "✂️" },
  { key: "spa_massage", label: "Spas & Massage Therapy", icon: "💆" },
  { key: "med_spa", label: "Med Spas & Clinics", icon: "🩺" },
  { key: "tattoo_piercing", label: "Tattoo & Piercing Studios", icon: "🖋️" },
];

const SERVICE_TYPE_TO_CATEGORY = {
  "Barber": "hair_salon",
  "Hair Salon": "hair_salon",
  "Nail Tech": "hair_salon",
  "Hair Removal Studio": "hair_salon",
  "Spa": "spa_massage",
  "Massage": "spa_massage",
  "Skincare Studio": "spa_massage",
  "Med Spa / Clinic": "med_spa",
  "Physical Therapy": "med_spa",
  "Tattoo & Piercing Studio": "tattoo_piercing",
  "Wellness Center": "general",
  "Pet Grooming": "general",
  "Fitness & Recovery": "general",
  "Photography": "general",
  "Other": "general",
  // Kept for backward compatibility with providers who signed up before
  // VaiBook narrowed to the self-care niche — no longer offered at signup,
  // but existing profiles with these values still resolve correctly.
  "Beauty Salon": "hair_salon",
  "Home Cleaning": "general",
  "Car Wash": "general",
  "Handyman": "general",
};
const categoryForServiceType = (serviceType) => SERVICE_TYPE_TO_CATEGORY[serviceType] || "general";

// Small icon per service_type, used on provider cards that don't have a
// portfolio photo yet. Kept as its own lookup (rather than reusing SERVICES,
// whose names are plural/marketing-flavored) since it's keyed by the exact
// singular strings providers pick at signup.
const SERVICE_TYPE_ICON = {
  "Barber": "✂️",
  "Hair Salon": "💇",
  "Nail Tech": "💅",
  "Spa": "🧖",
  "Med Spa / Clinic": "🩺",
  "Massage": "💆",
  "Skincare Studio": "🧴",
  "Hair Removal Studio": "🪒",
  "Tattoo & Piercing Studio": "🖋️",
  "Wellness Center": "🌿",
  "Pet Grooming": "🐾",
  "Fitness & Recovery": "🏋️",
  "Physical Therapy": "🦵",
  "Photography": "📸",
  "Other": "🛠️",
  // Legacy values from before the self-care narrowing — still shown
  // correctly on any provider card that has one.
  "Beauty Salon": "💇",
  "Home Cleaning": "🏠",
  "Car Wash": "🚗",
  "Handyman": "🔧",
};
const iconForServiceType = (serviceType) => SERVICE_TYPE_ICON[serviceType] || "🛠️";

// Shared provider helpers — module-level so both the landing page's
// discover carousels and the customer portal's browse grid compute rating
// and starting price the same way, off the same provider shape
// (getActiveProviders' `*, services(*), reviews(rating)` embed).
const providerRating = (p) => {
  const ratings = (p.reviews || []).map((r) => r.rating).filter((r) => r != null);
  if (!ratings.length) return null;
  return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
};

const providerFromPrice = (p) => {
  const prices = (p.services || []).filter((s) => s.is_active !== false).map((s) => Number(s.price) || 0);
  if (!prices.length) return null;
  return Math.min(...prices);
};

// Small badge that literally reflects a provider's plan tier ("✓ Pro" /
// "✓ Business") so customers can see they're on a paid plan. Deliberately
// NOT worded as "Verified" or "Certified" — VaiBook doesn't vet or inspect
// paid listings any differently from free ones, so the badge only ever
// claims what's actually true: which plan they're paying for. Separate
// from the "⭐ Featured" chip, which signals a provider chose to pay extra
// to rank higher in search — a provider can have neither, either, or both.
const planBadge = (p) => {
  const plan = p?.plan;
  if (plan === "business") return { label: "✓ Team", bg: "var(--forest)", color: "#fff" };
  if (plan === "pro") return { label: "✓ Pro", bg: "var(--sand)", color: "var(--forest)" };
  return null;
};

// Whether a provider currently accepts VIP off-hours requests — mirrors
// the enforce_vip_surcharge_plan trigger's own condition (Pro/Business
// plan with a positive vip_surcharge set), so the UI never offers
// something the database would reject.
const isProviderVipEligible = (p) => (p?.plan === "pro" || p?.plan === "business") && Number(p?.vip_surcharge) > 0;

// "New to VaiBook" badge window — providers who joined in the last 30 days
// get the pill; older ones can still appear in the row (as the most
// recently joined of what's available) without being mislabeled as new.
const isRecentlyJoined = (p, days = 30) => {
  if (!p.created_at) return false;
  const joined = new Date(p.created_at).getTime();
  if (Number.isNaN(joined)) return false;
  return (Date.now() - joined) / (1000 * 60 * 60 * 24) <= days;
};

// One horizontally-scrolling row of provider cards, used by the landing
// page's Recommended / New to VaiBook / Trending sections. `badgeFor` is an
// optional (provider) => string|null that puts a pill in the top-left
// corner of a card (e.g. "New", "Featured").
function ProviderCarousel({ providers, badgeFor, onCardClick }) {
  const rowRef = useRef(null);
  const scrollNext = () => {
    if (rowRef.current) rowRef.current.scrollBy({ left: 260, behavior: "smooth" });
  };
  return (
    <div style={{ position: "relative" }}>
      <div className="carousel-row" ref={rowRef}>
        {providers.map((p) => {
          const rating = providerRating(p);
          const badge = badgeFor ? badgeFor(p) : null;
          return (
            <div className="carousel-card" key={p.id} onClick={() => onCardClick(p)}>
              {badge && <span className="carousel-badge">{badge}</span>}
              <button
                className="carousel-heart"
                onClick={(e) => { e.stopPropagation(); onCardClick(p); }}
                aria-label="Save this provider"
              >
                🤍
              </button>
              {p.portfolio_urls && p.portfolio_urls.length > 0 ? (
                <div className="carousel-card-img" style={{ background: `center/cover no-repeat url(${p.portfolio_urls[0]})` }} />
              ) : (
                <div className="carousel-card-img">{iconForServiceType(p.service_type)}</div>
              )}
              <div className="carousel-card-body">
                <h4>{p.business_name}</h4>
                <div className="loc">{p.district}</div>
                <div className="meta">
                  {p.service_type}
                  {rating ? <> · ⭐ {rating} ({p.reviews.length})</> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {providers.length > 3 && (
        <button className="carousel-arrow" onClick={scrollNext} aria-label="Scroll for more">→</button>
      )}
    </div>
  );
}

// Industry-specific adaptive modules. `label`/`icon`/`desc` drive the
// Settings → Modules UI; which ones default on per category lives in the
// `category_default_features` table (mirrored below only for reference).
const INDUSTRY_FEATURE_CATALOG = {
  hipaa_compliance_mode: { label: "Restricted Access Mode", icon: "🔒", desc: "Limits who on your team can view sensitive client records" },
  soap_charting: { label: "SOAP Medical Charting", icon: "📋", desc: "Structured clinical notes per completed visit" },
  digital_consent_forms: { label: "Digital Consent Forms", icon: "✍️", desc: "Client e-signs consent before treatment" },
  secure_photo_storage: { label: "Secure Photo Storage", icon: "🖼️", desc: "Access-controlled before/after photos" },
  processing_time_buffers: { label: "Processing Time Buffers", icon: "⏱️", desc: "Extra unbookable time after a service (e.g. color processing)" },
  hair_formula_tracking: { label: "Hair Formula Tracking", icon: "🎨", desc: "Save color/chemical formulas per client" },
  virtual_waiting_room: { label: "Virtual Waiting Room", icon: "🪑", desc: "Check-in queue shown to walk-ins" },
  express_walkin_checkout: { label: "Express Walk-in Checkout", icon: "⚡", desc: "Fast checkout flow for walk-in clients" },
  room_resource_booking: { label: "Room & Resource Booking", icon: "🚪", desc: "Assign a specific room or equipment to an appointment" },
  digital_liability_waivers: { label: "Digital Liability Waivers", icon: "📝", desc: "Client e-signs a liability waiver" },
  id_verification_upload: { label: "ID Verification Upload", icon: "🪪", desc: "Client uploads ID for age/identity verification" },
  reference_art_upload: { label: "Reference Art Upload", icon: "🖌️", desc: "Client uploads reference images for the artist" },
};

const FeatureFlagsContext = createContext({ flags: {}, loading: true, categoryKey: "general", setOverride: async () => {} });
const useFeatureFlags = () => useContext(FeatureFlagsContext);

// Wraps the provider portal. Merges this provider's category defaults with
// any manual per-provider overrides into a single `flags` map, and exposes
// `setOverride` so Settings → Modules can flip a module on/off live.
function FeatureFlagsProvider({ providerId, categoryKey, children }) {
  const [defaults, setDefaults] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getCategoryDefaultFeatures(categoryKey),
      getProviderFeatureOverrides(providerId),
    ]).then(([defs, ovr]) => {
      if (cancelled) return;
      setDefaults(defs || []);
      setOverrides(ovr || {});
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [providerId, categoryKey]);

  const flags = {};
  CORE_FEATURES.forEach((k) => { flags[k] = true; });
  Object.keys(INDUSTRY_FEATURE_CATALOG).forEach((k) => {
    flags[k] = overrides[k] != null ? overrides[k] : defaults.includes(k);
  });

  const setOverride = async (featureKey, enabled) => {
    setOverrides((prev) => ({ ...prev, [featureKey]: enabled }));
    await setProviderFeatureOverride(providerId, featureKey, enabled);
  };

  return (
    <FeatureFlagsContext.Provider value={{ flags, loading, categoryKey, defaults, overrides, setOverride }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

// Gate for conditionally rendering a flag-dependent module anywhere in the
// tree, e.g. `<FeatureGate flag="soap_charting"><VisitNotesButton .../></FeatureGate>`.
function FeatureGate({ flag, children, fallback = null }) {
  const { flags, loading } = useFeatureFlags();
  if (loading) return fallback;
  return flags[flag] ? children : fallback;
}

// Settings → Modules: shows core features (always on) plus every industry
// module, pre-toggled from the provider's category defaults, with a manual
// per-provider override switch. This is the live UI for the adaptive
// feature-flag system described in the architecture doc.
function ModulesPanel() {
  const { flags, loading, defaults, categoryKey, setOverride } = useFeatureFlags();
  const categoryLabel = (BUSINESS_CATEGORIES.find((c) => c.key === categoryKey) || {}).label || "General Service";

  return (
    <>
      <div className="portal-header">
        <h2>Modules</h2>
        <p>Your default modules come from your business category ({categoryLabel}). Toggle any module on or off for your account.</p>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-title">Core — included for every provider</div>
        {CORE_FEATURES.map((key) => (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: 14 }}>{CORE_FEATURE_CATALOG[key].icon} {CORE_FEATURE_CATALOG[key].label}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{CORE_FEATURE_CATALOG[key].desc}</div>
            </div>
            <div className="toggle on" style={{ opacity: 0.5, cursor: "not-allowed" }} title="Always on"></div>
          </div>
        ))}

        <div className="card-title" style={{ marginTop: 24 }}>Industry-specific modules</div>
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading modules...</p>
        ) : (
          Object.keys(INDUSTRY_FEATURE_CATALOG).map((key) => {
            const f = INDUSTRY_FEATURE_CATALOG[key];
            const isOn = !!flags[key];
            const isDefault = defaults.includes(key);
            return (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 14 }}>
                    {f.icon} {f.label}
                    {isDefault && <span style={{ fontSize: 10, color: "var(--forest-light)", fontWeight: 700, marginLeft: 6 }}>RECOMMENDED FOR YOUR CATEGORY</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{f.desc}</div>
                </div>
                <div className={`toggle ${isOn ? "on" : ""}`} onClick={() => setOverride(key, !isOn)}></div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

// Bookings → completed appointments: minimal working example of a flag-gated
// module (soap_charting). Saves structured Subjective/Objective/Assessment/
// Plan notes per booking.
function VisitNotesButton({ booking }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState({ subjective: "", objective: "", assessment: "", plan: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getVisitNotes(booking.id).then((existing) => {
      if (cancelled || !existing) return;
      setNote({
        subjective: existing.subjective || "",
        objective: existing.objective || "",
        assessment: existing.assessment || "",
        plan: existing.plan || "",
      });
      setSaved(true);
    });
    return () => { cancelled = true; };
  }, [open, booking.id]);

  const save = async () => {
    setSaving(true);
    const ok = await upsertVisitNote({ booking_id: booking.id, provider_id: booking.provider_id, ...note });
    setSaving(false);
    if (ok) setSaved(true);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <button className="btn-sm ghost" onClick={() => setOpen((o) => !o)}>{saved ? "View / edit visit notes" : "Add visit notes (SOAP)"}</button>
      {open && (
        <div style={{ marginTop: 8, padding: 12, background: "var(--sand)", borderRadius: 8 }}>
          {["subjective", "objective", "assessment", "plan"].map((k) => (
            <div key={k} className="input-group" style={{ marginBottom: 8 }}>
              <label style={{ textTransform: "capitalize" }}>{k}</label>
              <textarea style={{ width: "100%", minHeight: 44 }} value={note[k] || ""} onChange={(e) => setNote((n) => ({ ...n, [k]: e.target.value }))} />
            </div>
          ))}
          <button className="btn-sm forest" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save visit notes"}</button>
        </div>
      )}
    </div>
  );
}

// A collapsible message thread tied to one specific booking. Works the
// same in both portals — only `currentRole`/`recipientUserId` differ
// depending on which side is rendering it. Polls every 15s (same pattern
// as NotificationBell) rather than a realtime subscription, to match how
// the rest of the app is built.
function BookingChat({ bookingId, currentUserId, currentRole, recipientUserId }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef(null);

  const load = async (markRead) => {
    const data = await getBookingMessages(bookingId);
    setMessages(data);
    setUnread(data.filter((m) => !m.read_at && m.sender_id !== currentUserId).length);
    if (markRead && data.some((m) => !m.read_at && m.sender_id !== currentUserId)) {
      await markBookingMessagesRead(bookingId, currentUserId);
      setUnread(0);
    }
  };

  useEffect(() => {
    load(false);
    const interval = setInterval(() => load(open), 15000);
    return () => clearInterval(interval);
  }, [bookingId, open]);

  useEffect(() => {
    if (open) load(true);
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError("");
    let ok = false;
    try {
      ok = await sendBookingMessage({ booking_id: bookingId, sender_id: currentUserId, sender_role: currentRole, body });
    } catch (err) {
      setSending(false);
      setSendError(err?.code === "RATE_LIMITED"
        ? "You're sending messages quickly — please slow down a bit."
        : "Something went wrong sending that. Please try again.");
      return;
    }
    if (ok) {
      setDraft("");
      await load(false);
      if (recipientUserId) {
        createNotification({
          user_id: recipientUserId,
          title: "New message",
          body: body.length > 80 ? body.slice(0, 80) + "…" : body,
          type: "message",
          booking_id: bookingId,
        });
      }
    } else {
      setSendError("Something went wrong sending that. Please try again.");
    }
    setSending(false);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <button className="btn-sm ghost" style={{ position: "relative" }} onClick={() => setOpen((v) => !v)}>
        💬 {open ? "Hide messages" : "Message"}
        {!open && unread > 0 && (
          <span className="notif-badge" style={{ position: "absolute", top: -6, right: -6 }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div style={{ marginTop: 8, background: "var(--sand)", borderRadius: 10, padding: 12 }}>
          <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            {messages.length === 0 && <p style={{ fontSize: 12, color: "var(--muted)" }}>No messages yet — say hello about this booking.</p>}
            {messages.map((m) => {
              const mine = m.sender_id === currentUserId;
              return (
                <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                  <div style={{ background: mine ? "var(--forest)" : "#fff", color: mine ? "#fff" : "inherit", borderRadius: 10, padding: "8px 10px", fontSize: 13, lineHeight: 1.4 }}>
                    {m.body}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, textAlign: mine ? "right" : "left" }}>{timeAgo(m.created_at)}</div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={draft}
              placeholder="Type a message..."
              style={{ flex: 1 }}
              disabled={sending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button className="btn-sm forest" disabled={sending || !draft.trim()} onClick={send}>Send</button>
          </div>
          {sendError && <p style={{ fontSize: 11, color: "#B91C1C", marginTop: 6 }}>{sendError}</p>}
        </div>
      )}
    </div>
  );
}

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Supabase returns month_start as a plain "YYYY-MM-DD" string — parsed by
// splitting rather than `new Date(...)`, since the latter reads it as UTC
// midnight and can render as the *previous* day's month in timezones west
// of UTC.
function monthLabelFromDateStr(s) {
  if (!s) return "";
  const m = parseInt(String(s).split("-")[1], 10);
  return MONTH_ABBR[m - 1] || s;
}

// A small, dependency-free line/bar chart for one monthly-trend series.
// Values are few (a handful of months) so every point gets a direct label
// and a native tooltip rather than a full interactive-tooltip layer — kept
// intentionally simple to match how the rest of this app is built (plain
// inline SVG, no charting library).
function TrendChart({ points, kind = "line", color, formatValue }) {
  const width = 560;
  const height = 170;
  const padTop = 30;
  const padBottom = 26;
  const padSide = 22;
  const plotW = width - padSide * 2;
  const plotH = height - padTop - padBottom;

  const values = points.map((p) => p.y).filter((v) => v != null);
  const hasData = values.some((v) => v > 0);
  const maxV = values.length ? Math.max(...values, 0) : 0;
  const niceMax = maxV === 0 ? 1 : maxV * 1.2;

  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;
  const xFor = (i) => padSide + (points.length > 1 ? i * stepX : plotW / 2);
  const yFor = (v) => padTop + plotH - (Math.max(v || 0, 0) / niceMax) * plotH;
  const fmt = (v) => (formatValue ? formatValue(v) : v);

  if (!hasData) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 13 }}>
        Not enough data yet
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <line x1={padSide} y1={padTop + plotH} x2={width - padSide} y2={padTop + plotH} style={{ stroke: "var(--border)" }} strokeWidth="1" />

      {kind === "bar" && points.map((p, i) => {
        const barW = Math.min(34, stepX * 0.5) || 34;
        const x = xFor(i) - barW / 2;
        const y = yFor(p.y || 0);
        const barH = padTop + plotH - y;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 0)} rx={4} fill={color}>
              <title>{`${p.label}: ${p.y == null ? "—" : fmt(p.y)}`}</title>
            </rect>
            {p.y != null && (
              <text x={xFor(i)} y={y - 8} textAnchor="middle" fontSize="11" fontWeight="700" style={{ fill: "var(--dark-text)" }}>{fmt(p.y)}</text>
            )}
            <text x={xFor(i)} y={padTop + plotH + 18} textAnchor="middle" fontSize="11" style={{ fill: "var(--muted)" }}>{p.label}</text>
          </g>
        );
      })}

      {kind === "line" && (
        <>
          <path
            d={points
              .map((p, i) => (p.y == null ? null : `${xFor(i)} ${yFor(p.y)}`))
              .reduce((acc, seg, idx) => (seg == null ? { d: acc.d, pen: false } : { d: `${acc.d}${acc.pen ? " L " : `${acc.d ? " " : ""}M `}${seg}`, pen: true }), { d: "", pen: false }).d}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <g key={i}>
              {p.y != null && (
                <circle cx={xFor(i)} cy={yFor(p.y)} r="4" fill="white" stroke={color} strokeWidth="2">
                  <title>{`${p.label}: ${fmt(p.y)}`}</title>
                </circle>
              )}
              {p.y != null && (
                <text x={xFor(i)} y={yFor(p.y) - 11} textAnchor="middle" fontSize="11" fontWeight="700" style={{ fill: "var(--dark-text)" }}>{fmt(p.y)}</text>
              )}
              <text x={xFor(i)} y={padTop + plotH + 18} textAnchor="middle" fontSize="11" style={{ fill: "var(--muted)" }}>{p.label}</text>
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

// YYYY-MM-DD in the BROWSER'S LOCAL calendar day — not toISOString().slice(0,10),
// which is UTC and rolls over to the next date once local time passes
// (24 - |UTC offset|):00. Belize is UTC-6, so any use of the UTC form for
// "today" silently became "tomorrow" for every Belize visitor after 6pm,
// which is exactly when a booking app is busiest — it broke the default
// booking date, the "today" cutoff that hides already-passed time slots,
// and the reschedule date picker's minimum, all the same way in each spot.
const localDateStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// "HH:MM" for a Date, in local time — matches the start_time/end_time format
// provider_blocks stores, so it can be compared against them directly.
const localTimeStr = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
// "HH:MM"/"HH:MM:SS" -> minutes since midnight, for comparing times stored
// as text (bookings.booking_time, provider_blocks start/end, working_hours).
const hhmmToMinutes = (t) => {
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DEFAULT_HOURS = DAY_NAMES.map((day, i) => ({
  day, day_of_week: i, is_open: i !== 0, start_time: i === 6 ? "09:00" : "08:00", end_time: i === 6 ? "15:00" : "18:00",
}));

function bookingStatusClass(status) {
  if (status === "confirmed") return "confirmed";
  if (status === "pending") return "pending";
  if (status === "awaiting_payment") return "awaiting";
  // A no-show is a failed appointment, not a finished one — it shares the
  // cancelled/declined styling so it can't be mistaken for completed work.
  if (status === "rejected" || status === "cancelled" || status === "no_show") return "rejected";
  return "done";
}

function statusLabel(status) {
  if (status === "awaiting_payment") return "awaiting payment";
  if (status === "no_show") return "no-show";
  return status;
}

// ── DATES AND TIMES ─────────────────────────────────────────────
// booking_date is a Postgres `date` ("2026-08-31") and booking_time a
// separate `time` ("14:30:00"). `new Date("2026-08-31")` is parsed as UTC
// midnight, which in Belize (UTC−6) is 6:00 PM the DAY BEFORE — so every
// date rendered that way was off by one, and every "time" rendered from
// booking_date alone printed a constant 6:00 PM instead of the real
// appointment time. Always go through these.
function bookingDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const d = new Date(`${String(dateStr).slice(0, 10)}T${String(timeStr || "00:00").slice(0, 5)}:00`);
  return isNaN(d.getTime()) ? null : d;
}
function bookingDateOnly(dateStr) {
  return bookingDateTime(dateStr, "00:00");
}
function formatBookingDate(dateStr, opts) {
  const d = bookingDateOnly(dateStr);
  return d ? d.toLocaleDateString([], opts) : "—";
}
function formatBookingTime(timeStr) {
  if (!timeStr) return "";
  const d = bookingDateTime("2000-01-01", timeStr);
  return d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : String(timeStr).slice(0, 5);
}
// "Aug 31, 2:30 PM" — the one-line form used in every booking list.
function formatBookingWhen(b) {
  const datePart = formatBookingDate(b?.booking_date, { month: "short", day: "numeric" });
  const timePart = formatBookingTime(b?.booking_time);
  return timePart ? `${datePart}, ${timePart}` : datePart;
}
function isSameLocalDay(dateStr, d) {
  const bd = bookingDateOnly(dateStr);
  if (!bd || !d) return false;
  return bd.getFullYear() === d.getFullYear() && bd.getMonth() === d.getMonth() && bd.getDate() === d.getDate();
}

// Renders the actual score rather than five hardcoded stars — a 2-star
// provider used to display ★★★★★ with only the small number beside it
// telling the truth.
function StarRating({ value, size = 13 }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  const pct = (v / 5) * 100;
  return (
    <span
      aria-label={`${v} out of 5`}
      title={`${v} out of 5`}
      style={{ position: "relative", display: "inline-block", fontSize: size, lineHeight: 1, letterSpacing: 1, whiteSpace: "nowrap" }}
    >
      <span style={{ color: "var(--border)" }}>★★★★★</span>
      <span style={{ position: "absolute", left: 0, top: 0, width: `${pct}%`, overflow: "hidden", color: "#F5A623" }}>★★★★★</span>
    </span>
  );
}

// ── BOOKING SEARCH + SORT ───────────────────────────────────────
// Shared by both the customer's "My bookings" list and the provider's
// "Bookings" list: text search by name (nameFn picks which name field
// to match per side) plus a "recently booked" sort — by when the
// booking was created (created_at), falling back to the appointment
// date/time for older rows or walk-ins where created_at might be
// missing, so sorting never silently breaks.
function filterAndSortBookings(list, search, sort, nameFn) {
  const q = (search || "").trim().toLowerCase();
  const filtered = q ? list.filter((b) => (nameFn(b) || "").toLowerCase().includes(q)) : list;
  const bookedAt = (b) => {
    const t = b.created_at ? new Date(b.created_at).getTime() : NaN;
    if (!isNaN(t)) return t;
    return new Date(`${b.booking_date}T${b.booking_time || "00:00"}`).getTime() || 0;
  };
  const sorted = [...filtered].sort((a, b) => sort === "oldest" ? bookedAt(a) - bookedAt(b) : bookedAt(b) - bookedAt(a));
  return sorted;
}

// ── INVOICES ────────────────────────────────────────────────────
// VaiBook doesn't process payments itself, so this isn't a payment
// receipt from VaiBook — it's a record of the transaction between the
// provider and the customer, built entirely client-side from data
// already on the booking. Only offered on "completed" bookings (see
// callers), matching the same definition of real, delivered revenue
// already used everywhere else in the app (Earnings tab, Monthly review).
// Takes a flat options object so both portals can build it from whatever
// shape their own booking join happens to have.
function buildInvoiceHtml({
  orderNumber, bookingDate, bookingTime, serviceName, amount, depositAmount,
  providerName, providerTaxId, providerDistrict, providerWhatsapp,
  customerName, customerEmail,
}) {
  const dateLabel = bookingDate ? formatBookingDate(bookingDate, { year: "numeric", month: "long", day: "numeric" }) : "—";
  const timeLabel = bookingTime ? String(bookingTime).slice(0, 5) : "";
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${esc(orderNumber)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #0D1F18; max-width: 640px; margin: 40px auto; padding: 0 20px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0D3D2E; padding-bottom: 16px; margin-bottom: 24px; }
  .logo { font-size: 22px; font-weight: 800; color: #0D3D2E; }
  .logo span { color: #7A9E1F; }
  .meta { text-align: right; font-size: 13px; color: #555; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 24px; gap: 24px; }
  .party { font-size: 13px; line-height: 1.6; }
  .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #888; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { text-align: left; padding: 10px 0; border-bottom: 1px solid #E5E5E5; font-size: 13px; }
  th { color: #888; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: .04em; }
  .amount-col { text-align: right; }
  .total-row td { border-bottom: none; padding-top: 14px; font-size: 16px; font-weight: 800; }
  .footnote { font-size: 11.5px; color: #888; line-height: 1.6; margin-top: 32px; border-top: 1px solid #E5E5E5; padding-top: 16px; }
  @media print { body { margin: 0; padding: 20px; } }
</style>
</head>
<body>
  <div class="head">
    <div class="logo">vai<span>book</span></div>
    <div class="meta">
      <h1>Invoice</h1>
      <div>#${esc(orderNumber)}</div>
      <div>${dateLabel}${timeLabel ? " · " + timeLabel : ""}</div>
    </div>
  </div>
  <div class="parties">
    <div class="party">
      <h3>From</h3>
      <div><strong>${esc(providerName)}</strong></div>
      ${providerDistrict ? `<div>${esc(providerDistrict)}, Belize</div>` : ""}
      ${providerWhatsapp ? `<div>${esc(providerWhatsapp)}</div>` : ""}
      ${providerTaxId ? `<div>Business reg./TIN: ${esc(providerTaxId)}</div>` : ""}
    </div>
    <div class="party">
      <h3>Billed to</h3>
      <div><strong>${esc(customerName)}</strong></div>
      ${customerEmail ? `<div>${esc(customerEmail)}</div>` : ""}
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th class="amount-col">Amount</th></tr></thead>
    <tbody>
      <tr><td>${esc(serviceName)}</td><td class="amount-col">BZ$${Number(amount || 0).toFixed(2)}</td></tr>
      ${depositAmount ? `<tr><td style="color:#888;">— of which deposit paid in advance</td><td class="amount-col" style="color:#888;">BZ$${Number(depositAmount).toFixed(2)}</td></tr>` : ""}
      <tr class="total-row"><td>Total</td><td class="amount-col">BZ$${Number(amount || 0).toFixed(2)}</td></tr>
    </tbody>
  </table>
  <div class="footnote">
    VaiBook is a booking marketplace, not a payment processor — this invoice reflects a transaction directly between the customer and the service provider named above, generated from their VaiBook booking record. It is not issued by VaiBook.
  </div>
</body>
</html>`;
}

// Opens the invoice in a new tab and triggers the browser's native
// print dialog, where "Save as PDF" is a standard destination — avoids
// needing a PDF-generation library for something the browser already
// does well.
function printInvoice(html) {
  const w = window.open("", "_blank");
  if (!w) {
    // Otherwise the button just looks dead.
    window.alert("Your browser blocked the new tab this opens in. Allow pop-ups for VaiBook and try again.");
    return;
  }
  w.document.write(html);
  w.document.close();
  // The invoice is static markup with no external resources to wait on,
  // so a short delay (rather than onload, which can be unreliable on a
  // document.write'd window) is enough for the new tab to paint before print.
  setTimeout(() => { try { w.print(); } catch (e) { /* window may already be closed */ } }, 250);
}

// ── SALES & TAX LEDGER ──────────────────────────────────────────
// Deliberately separate from buildInvoiceHtml above rather than bolted
// onto it: an invoice is a per-transaction document handed to one
// customer; a ledger is the provider's own register of every completed
// booking over a period, for filing taxes — one row per booking,
// listing the same order number each booking's individual invoice
// uses, so the two stay reconcilable without being the same document.
// Built entirely client-side from bookings already loaded, same as
// invoices — no new table or migration needed.
function buildLedgerHtml({ providerName, providerTaxId, periodLabel, rows, taxRate = 0 }) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  // Amounts collected from customers are tax-inclusive, so the tax portion
  // is backed out of the total rather than added on top: at 12.5%, BZ$100
  // collected is BZ$88.89 net + BZ$11.11 tax.
  const rate = Number(taxRate) || 0;
  const taxPortion = rate > 0 ? total - total / (1 + rate / 100) : 0;
  const netOfTax = total - taxPortion;
  const rowsHtml = rows.length
    ? rows.map((r) => `<tr><td>${esc(r.dateLabel)}</td><td>${esc(r.orderNumber)}</td><td>${esc(r.serviceName)}</td><td>${esc(r.customerName)}</td><td class="amount-col">BZ$${Number(r.amount || 0).toFixed(2)}</td></tr>`).join("")
    : `<tr><td colspan="5" style="color:#888;text-align:center;padding:24px 0;">No completed bookings in this period.</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Sales &amp; tax ledger — ${esc(periodLabel)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #0D1F18; max-width: 760px; margin: 40px auto; padding: 0 20px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0D3D2E; padding-bottom: 16px; margin-bottom: 24px; }
  .logo { font-size: 22px; font-weight: 800; color: #0D3D2E; }
  .logo span { color: #7A9E1F; }
  .meta { text-align: right; font-size: 13px; color: #555; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .party { font-size: 13px; line-height: 1.6; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { text-align: left; padding: 8px 10px 8px 0; border-bottom: 1px solid #E5E5E5; font-size: 12.5px; }
  th { color: #888; font-weight: 600; text-transform: uppercase; font-size: 10.5px; letter-spacing: .04em; }
  .amount-col { text-align: right; }
  .total-row td { border-bottom: none; padding-top: 14px; font-size: 16px; font-weight: 800; }
  .footnote { font-size: 11.5px; color: #888; line-height: 1.6; margin-top: 32px; border-top: 1px solid #E5E5E5; padding-top: 16px; }
  @media print { body { margin: 0; padding: 20px; } }
</style>
</head>
<body>
  <div class="head">
    <div class="logo">vai<span>book</span></div>
    <div class="meta">
      <h1>Sales &amp; tax ledger</h1>
      <div>${esc(periodLabel)}</div>
    </div>
  </div>
  <div class="party">
    <div><strong>${esc(providerName)}</strong></div>
    ${providerTaxId ? `<div>Business reg./TIN: ${esc(providerTaxId)}</div>` : ""}
  </div>
  <table>
    <thead><tr><th>Date</th><th>Order #</th><th>Service</th><th>Customer</th><th class="amount-col">Amount</th></tr></thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row"><td colspan="4">Total collected (${rows.length} completed booking${rows.length === 1 ? "" : "s"})</td><td class="amount-col">BZ$${total.toFixed(2)}</td></tr>
      ${rate > 0 ? `
      <tr><td colspan="4" style="padding-top:10px;">Net of tax</td><td class="amount-col">BZ$${netOfTax.toFixed(2)}</td></tr>
      <tr><td colspan="4"><strong>Tax included at ${rate}%</strong></td><td class="amount-col"><strong>BZ$${taxPortion.toFixed(2)}</strong></td></tr>` : ""}
    </tbody>
  </table>
  <div class="footnote">
    VaiBook is a booking marketplace, not a payment processor — every amount here reflects a transaction directly between this provider and their customer, generated from their VaiBook booking records for their own tax filing use. It is not issued by VaiBook and is not a formal receipt of taxes paid.${rate > 0 ? ` The tax figure above is a straight ${rate}% calculation on the amounts collected, provided for convenience — confirm your actual liability with your accountant or the tax department.` : ""}
  </div>
</body>
</html>`;
}

// ── COMPONENTS ──────────────────────────────────────────────────

function getInitials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function scrollToSection(id, onNav, current) {
  const jump = () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  if (current !== "home") {
    onNav("home");
    setTimeout(jump, 60);
  } else {
    jump();
  }
}

// Web Push subscription keys are handed to the browser as a base64url
// string (VAPID public key) but the Push API wants a raw Uint8Array —
// this is the standard conversion every Web Push tutorial uses.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Shared by both the provider's and the customer's "Push notifications on
// this device" toggle in Settings — subscribes this browser/device to Web
// Push for whichever user id owns the screen it's used from, and keeps the
// toggle's state in sync with whatever this browser already has registered
// (so a reload doesn't lose the "✓ On" state). Pulled out into one hook
// instead of writing this twice so provider and customer push behave
// identically and only need fixing in one place.
function usePushSubscription(userId) {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [subscribingPush, setSubscribingPush] = useState(false);
  const [pushError, setPushError] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => {
      setPushEnabled(!!sub);
    }).catch(() => {});
  }, []);

  const enablePushNotifications = async () => {
    setPushError("");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushError("Push notifications aren't supported in this browser. On iPhone, add VaiBook to your Home Screen first (Share -> Add to Home Screen), then try again from there.");
      return;
    }
    const vapidKey = process.env.REACT_APP_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setPushError("Push notifications aren't configured yet.");
      return;
    }
    if (!userId) {
      setPushError("Please finish signing in first.");
      return;
    }
    setSubscribingPush(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushError("Notifications are blocked. Enable them for this site in your browser settings to turn this on.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const { error } = await savePushSubscription(userId, subscription);
      if (error) throw error;
      setPushEnabled(true);
    } catch (err) {
      console.error("Push subscription failed:", err);
      setPushError("Couldn't turn on push notifications. Please try again.");
    } finally {
      setSubscribingPush(false);
    }
  };

  return { pushEnabled, subscribingPush, pushError, enablePushNotifications };
}

// Shared by enterCustomerPortal/enterProviderPortal below. Per an explicit
// requirement, once an account is actively signed into one portal
// (provider or customer), no click anywhere in the app may carry it into
// the other one silently — that always has to go through a real sign-out,
// then signing back in and explicitly choosing which portal to enter (via
// AuthChoice). "Actively signed into" is tracked by vaibook_last_view
// (the same localStorage flag the refresh-restore logic already keeps up
// to date whenever `view` settles on "provider"/"customer"/"admin", and
// clears on sign-out) rather than the momentary `view` state, so this
// still catches a switch attempt made from the plain home page or a
// settings screen, not just from inside the other portal's own UI.
function switchToPortal(targetPortal, onNav, session, onSignIn, onSignOut) {
  if (!session) {
    try { localStorage.setItem("vaibook_pending_view", targetPortal); } catch (e) { /* ignore */ }
    onSignIn();
    return;
  }
  let activePortal = null;
  try { activePortal = localStorage.getItem("vaibook_last_view"); } catch (e) { /* ignore */ }
  if ((activePortal === "provider" || activePortal === "customer") && activePortal !== targetPortal) {
    // Signed in and actively parked in the OTHER portal: force a real
    // sign-out and land on the explicit "which portal?" screen instead of
    // switching in place. Picking an option there re-runs this same
    // function with the session now cleared, so it signs back in and
    // lands exactly where they chose.
    Promise.resolve(onSignOut && onSignOut()).then(() => onNav("auth"));
    return;
  }
  onNav(targetPortal);
}

function enterCustomerPortal(onNav, session, onSignIn, onSignOut) {
  switchToPortal("customer", onNav, session, onSignIn, onSignOut);
}

function enterProviderPortal(onNav, session, onSignIn, onSignOut) {
  switchToPortal("provider", onNav, session, onSignIn, onSignOut);
}

// Lets the public pricing section's per-plan CTA land on the signup form
// with that plan already selected, without threading a new param through
// onNav (which is just setView — a plain string setter used in dozens of
// places). Same "stash it, read it once on mount" pattern as
// vaibook_pending_view above. ProviderSignup reads and clears this once;
// stale leftovers can't affect a later, unrelated visit to signup.
function goToSignupWithPlan(onNav, planId) {
  try { localStorage.setItem("vaibook_signup_plan", planId); } catch (e) { /* ignore */ }
  onNav("signup");
}

function AuthChoice({ onNav, session, onSignIn, onSignOut }) {
  return (
    <div className="auth-choice">
      <div className="auth-choice-left">
        <button className="auth-back" onClick={() => onNav("home")} aria-label="Back">←</button>
        <div className="auth-choice-body">
          <h1>Sign up / log in</h1>
          <div className="auth-option-card" onClick={() => enterCustomerPortal(onNav, session, onSignIn, onSignOut)}>
            <div>
              <h3>VaiBook for customers</h3>
              <p>Book local services near you</p>
            </div>
            <span className="auth-option-arrow">→</span>
          </div>
          <div className="auth-option-card" onClick={() => enterProviderPortal(onNav, session, onSignIn, onSignOut)}>
            <div>
              <h3>VaiBook for professionals</h3>
              <p>Manage and grow your business</p>
            </div>
            <span className="auth-option-arrow">→</span>
          </div>
        </div>
      </div>
      <div className="auth-choice-panel">
        {/* Swap this for a real photo later: <img src="/your-photo.jpg" style={{width:"100%",height:"100%",objectFit:"cover"}} /> */}
        <div className="auth-choice-panel-logo" style={{ display: "flex", alignItems: "center", gap: 12 }}><VaiBookMark size={38} />vai<span>book</span></div>
      </div>
    </div>
  );
}

function openInstallAppGuide() {
  window.dispatchEvent(new Event("vaibook-open-install-guide"));
}

function InstallAppGuide() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState("ios");
  const [showBanner, setShowBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // How long a dismiss (or an "install"/"show me" tap that didn't end in a
  // real install) snoozes the banner before it's allowed to reappear on a
  // later visit. It only stops reappearing for good once the app is
  // actually installed — detected live via standalone mode below, not by
  // remembering a one-time dismiss forever.
  const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

  useEffect(() => {
    const ua = window.navigator.userAgent || "";
    const isIOSPhone = /iPhone|iPod/.test(ua) && !window.MSStream;
    // iPadOS Safari reports itself as a desktop Mac by default (since iOS
    // 13), so a plain UA check misses iPads entirely. A touch-capable
    // "MacIntel" is the standard way to still catch it.
    const isIPad = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isIOS = isIOSPhone || isIPad;
    const isAndroid = /Android/.test(ua); // covers Android phones and tablets alike
    const isMobileOrTablet = isIOS || isAndroid;
    setPlatform(isIOS ? "ios" : "android");

    const isStandalone =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onOpenGuide = () => setOpen(true);
    window.addEventListener("vaibook-open-install-guide", onOpenGuide);

    let bannerTimer = null;
    if (isMobileOrTablet && !isStandalone) {
      let snoozedAt = null;
      try { snoozedAt = Number(localStorage.getItem("vaibook_a2hs_snoozed_at")) || null; } catch (e) { /* ignore */ }
      const stillSnoozed = snoozedAt && (Date.now() - snoozedAt < SNOOZE_MS);
      if (!stillSnoozed) {
        bannerTimer = setTimeout(() => setShowBanner(true), 2500);
      }
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("vaibook-open-install-guide", onOpenGuide);
      if (bannerTimer) clearTimeout(bannerTimer);
    };
  }, []);

  const snoozeBanner = () => {
    setShowBanner(false);
    try { localStorage.setItem("vaibook_a2hs_snoozed_at", String(Date.now())); } catch (e) { /* ignore */ }
  };

  const dismissBanner = snoozeBanner;

  const handleInstallClick = async () => {
    snoozeBanner();
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) { /* ignore */ }
      setDeferredPrompt(null);
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      {showBanner && (
        <div className="a2hs-banner">
          <span className="a2hs-banner-icon">📲</span>
          <div className="a2hs-banner-text">
            <div className="a2hs-banner-title">Add VaiBook to your Home Screen</div>
            <div className="a2hs-banner-sub">Quick access, just like an app.</div>
          </div>
          <button className="a2hs-banner-cta" onClick={handleInstallClick}>{deferredPrompt ? "Install" : "Show me"}</button>
          <button className="a2hs-banner-close" onClick={dismissBanner} aria-label="Dismiss">✕</button>
        </div>
      )}
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-panel a2hs-modal" onClick={(e) => e.stopPropagation()}>
            <button className="a2hs-modal-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            <div className="a2hs-modal-icon">📲</div>
            <h2 className="a2hs-modal-title">Add VaiBook to your Home Screen</h2>
            <p className="a2hs-modal-sub">Get one-tap access and a full-screen app experience — no App Store needed.</p>

            {deferredPrompt && (
              <button className="btn-lime a2hs-install-btn" onClick={handleInstallClick}>Install App</button>
            )}

            <div className="a2hs-tabs">
              <button className={`a2hs-tab ${platform === "ios" ? "active" : ""}`} onClick={() => setPlatform("ios")}>📱 iPhone</button>
              <button className={`a2hs-tab ${platform === "android" ? "active" : ""}`} onClick={() => setPlatform("android")}>🤖 Android</button>
            </div>

            {platform === "ios" ? (
              <ol className="a2hs-steps">
                <li><span className="a2hs-step-num">1</span> Tap the <strong>Share</strong> icon <span className="a2hs-glyph">⬆️</span> in Safari's toolbar.</li>
                <li><span className="a2hs-step-num">2</span> Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
                <li><span className="a2hs-step-num">3</span> Tap <strong>"Add"</strong> in the top right.</li>
              </ol>
            ) : (
              <ol className="a2hs-steps">
                <li><span className="a2hs-step-num">1</span> Tap the <strong>⋮ menu</strong> icon in Chrome's top right.</li>
                <li><span className="a2hs-step-num">2</span> Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>.</li>
                <li><span className="a2hs-step-num">3</span> Tap <strong>"Add"</strong> / <strong>"Install"</strong> to confirm.</li>
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Where clicking a notification should take you — keyed by the
// `notifications.type` values created throughout the app (booking
// requests/responses, receipts, reviews, monthly review, messages).
// "message" isn't included here since it can go to either portal
// depending on who's being notified — handled separately below.
const NOTIF_DESTINATIONS = {
  booking_requested: { view: "provider", tab: "bookings" },
  booking_cancelled: { view: "provider", tab: "bookings" },
  receipt_uploaded: { view: "provider", tab: "bookings" },
  review: { view: "provider", tab: "bookings" },
  monthly_review: { view: "provider", tab: "review" },
  booking_rejected: { view: "customer", tab: "bookings" },
  payment_confirmed: { view: "customer", tab: "bookings" },
  booking_completed: { view: "customer", tab: "bookings" },
  // These were missing, so the two notifications that matter most to a
  // customer — "you've been accepted, go pay your deposit" and "you're
  // confirmed" — silently did nothing when tapped.
  booking_accepted_deposit: { view: "customer", tab: "bookings" },
  booking_confirmed: { view: "customer", tab: "bookings" },
  booking_cancelled_by_provider: { view: "customer", tab: "bookings" },
  booking_rescheduled: { view: "customer", tab: "bookings" },
  booking_no_show: { view: "customer", tab: "bookings" },
  review_reply: { view: "customer", tab: "bookings" },
  payment_due_reminder: { view: "provider", tab: "billing" },
  payment_overdue_suspended: { view: "provider", tab: "billing" },
};

// Site-wide banner for the admin-only emergency maintenance switch (see
// supabase_security_hardening.sql / AdminPortal's "Emergency" tab). Polls
// rather than subscribing, matching how the rest of the app already
// checks for updates (e.g. NotificationBell below) — this is a rare
// admin action, not something that needs to be instant, and the flag is
// also enforced server-side regardless of whether this banner has caught
// up yet.
function MaintenanceBanner() {
  const [status, setStatus] = useState({ on: false, message: "" });

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const s = await getMaintenanceStatus();
      if (!cancelled) setStatus(s);
    };
    check();
    const interval = setInterval(check, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!status.on) return null;
  return (
    <div style={{ background: "#b45309", color: "#fff", textAlign: "center", padding: "10px 16px", fontSize: 13, fontWeight: 600, position: "relative", zIndex: 500 }}>
      🚧 {status.message || "New bookings and signups are temporarily paused for maintenance. Everything else still works — please try again shortly."}
    </div>
  );
}

// Full-site takeover shown to everyone except a signed-in admin while
// "Site offline" is on (see AdminPortal's Emergency tab / set_site_offline
// in supabase_site_offline.sql) — the Vai-Buy-style "we'll be back
// shortly" screen, so planned changes can be made with the public site
// hidden, while the admin can still sign in and see the real thing.
function SiteOffline({ message, onSignIn }) {
  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: "100vh", background: "var(--sand)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 440, width: "100%", background: "white", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "0 20px 60px rgba(13,61,46,0.16)" }}>
          <div style={{ background: "var(--forest)", padding: "20px 28px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--lime)", flexShrink: 0 }} />
            <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 19, fontWeight: 800, color: "var(--near-white)", display: "flex", alignItems: "center", gap: 8 }}>
              <VaiBookMark size={19} />vai<span style={{ color: "var(--lime)" }}>book</span>
            </span>
          </div>
          <div style={{ padding: "32px 28px" }}>
            <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 23, fontWeight: 800, color: "var(--dark-text)", margin: "0 0 12px" }}>We'll be back shortly</h1>
            <p style={{ color: "var(--muted)", fontSize: 15, lineHeight: 1.6, margin: "0 0 10px" }}>
              {message || "VaiBook is offline while we make some improvements."}
            </p>
            <p style={{ color: "var(--muted)", fontSize: 15, lineHeight: 1.6, margin: 0 }}>Thanks for your patience — check back soon.</p>
            <div style={{ marginTop: 26, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <a style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer" }} onClick={onSignIn}>Site owner? Sign in</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function EmailAuthModal({ email, onClose, onResend, onVerified }) {
  // Step-2-only modal: by the time this opens, the caller (guest checkout,
  // or a "Sign in" entry point elsewhere) has already collected the email
  // and triggered sendEmailOtp once. This just handles entering + verifying
  // the 6-digit code, and re-sending it. No password ever exists to check.
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(30);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  }, []);

  const handleCodeChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleCodeKeyDown = (index, e) => {
    if (e.key === "Backspace" && !code[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handleCodePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setCode(next);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleVerify = async () => {
    const joined = code.join("");
    if (joined.length !== 6) { setError("Enter the 6-digit code."); return; }
    setError("");
    setVerifying(true);
    const { data, error: verifyError } = await verifyEmailOtp(email, joined);
    setVerifying(false);
    if (verifyError || !data?.session) {
      setError("That code didn't work. Check it and try again.");
      return;
    }
    onVerified(data);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    setError("");
    await onResend?.();
    setResending(false);
    setResendCooldown(30);
  };

  return (
    <div className="email-auth-overlay" onClick={onClose}>
      <div className="email-auth-card" onClick={(e) => e.stopPropagation()}>
        <button className="email-auth-close" onClick={onClose} aria-label="Close">×</button>
        <p className="email-auth-brand">vai <span>book</span></p>
        <h2 className="email-auth-title">Enter the code</h2>
        <p className="email-auth-sub">We sent a 6-digit code to <strong>{email}</strong>.</p>

        <div className="email-auth-code-row" onPaste={handleCodePaste}>
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => (inputRefs.current[i] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleCodeChange(i, e.target.value)}
              onKeyDown={(e) => handleCodeKeyDown(i, e)}
              className="email-auth-code-input"
            />
          ))}
        </div>

        {error && <p className="email-auth-error">{error}</p>}

        <button className="email-auth-btn" disabled={verifying} onClick={handleVerify}>
          {verifying ? "Verifying..." : "Verify & continue"}
        </button>
        <button className="email-auth-resend" disabled={resendCooldown > 0 || resending} onClick={handleResend}>
          {resending ? "Resending..." : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
        </button>
      </div>
    </div>
  );
}

function NotificationBell({ userId, providerProfile, onNav }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const data = await getNotifications(userId);
    setNotifications(data || []);
  };

  useEffect(() => {
    if (!userId) return;
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const openNotification = async (n) => {
    if (!n.read) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      await markNotificationRead(n.id);
    }
    setOpen(false);

    // "message" notifications can belong to either portal depending on who
    // sent it — best guess without more context is: send them to whichever
    // portal this account actually has (a dual customer+provider account
    // is the one case this can guess wrong).
    const dest = NOTIF_DESTINATIONS[n.type]
      || (n.type === "message" ? { view: providerProfile ? "provider" : "customer", tab: "bookings" } : null);
    if (!dest || !onNav) return;
    onNav(dest.view);
    // The target portal only starts listening for a tab switch once it has
    // mounted — give the nav change one render cycle before dispatching.
    setTimeout(() => setPortalTab(dest.tab), 60);
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
    await markAllNotificationsRead(userId);
  };

  if (!userId) return null;

  return (
    <div style={{ position: "relative" }}>
      <button className="notif-bell-btn" onClick={() => setOpen((v) => !v)} aria-label="Notifications">
        🔔
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <div className="notif-dropdown" onMouseLeave={() => setOpen(false)}>
          <div className="notif-dropdown-header">
            <strong>Notifications</strong>
            {unreadCount > 0 && <a onClick={markAllRead}>Mark all read</a>}
          </div>
          {notifications.length === 0 ? (
            <p className="notif-empty">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={`notif-item ${n.read ? "" : "unread"}`} onClick={() => openNotification(n)}>
                <div className="notif-title">{n.title}</div>
                {n.body && <div className="notif-body">{n.body}</div>}
                <div className="notif-time">{timeAgo(n.created_at)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const PORTAL_TOOLS_BY_VIEW = {
  customer: [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "browse", icon: "🔍", label: "Find services" },
    { id: "favorites", icon: "❤️", label: "Favorites" },
    { id: "bookings", icon: "📅", label: "My bookings" },
    { id: "payments", icon: "💳", label: "Payments" },
    { id: "reviews", icon: "⭐", label: "My reviews" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ],
  provider: [
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "bookings", icon: "📅", label: "Bookings" },
    { id: "calendar", icon: "🗓️", label: "Availability" },
    { id: "services", icon: "✂️", label: "My services" },
    { id: "earnings", icon: "💰", label: "Earnings" },
    { id: "billing", icon: "🧾", label: "My plan & billing" },
    { id: "staff", icon: "👥", label: "My staff" },
    { id: "reviews", icon: "⭐", label: "My reviews" },
    { id: "review", icon: "📈", label: "Monthly review" },
    { id: "profile", icon: "👤", label: "Public profile" },
    { id: "modules", icon: "🧩", label: "Modules" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ],
  admin: [
    { id: "pending", icon: "⏳", label: "Pending" },
    { id: "active", icon: "✅", label: "Active" },
    { id: "rejected", icon: "✖", label: "Rejected" },
    { id: "providers", icon: "🏪", label: "Providers" },
    { id: "payments", icon: "🧾", label: "Payments" },
    { id: "refunds", icon: "↩️", label: "Refunds" },
  ],
};

function setPortalTab(tabId) {
  window.dispatchEvent(new CustomEvent("vaibook-set-portal-tab", { detail: { tab: tabId } }));
}

function Nav({ onNav, current, session, user, providerProfile, onSignIn, onSignOut }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const closeAccount = () => setAccountOpen(false);

  // Pinned search — lives in the nav itself so it's reachable from any page,
  // but should only actually show once the page's own "main" search bar
  // (the hero pill on the landing page, or the browse-tab bar in the
  // customer portal) has scrolled out of view — or isn't present at all.
  const [navQuery, setNavQuery] = useState("");
  const [showNavSuggestions, setShowNavSuggestions] = useState(false);
  const [navDirectory, setNavDirectory] = useState([]);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [navSearchActive, setNavSearchActive] = useState(false);
  const navRef = useRef(null);

  useEffect(() => {
    getProviderDirectory().then((data) => setNavDirectory(data || []));
  }, []);

  useLayoutEffect(() => {
    let rafId = null;
    const check = () => {
      const target = document.getElementById("main-search-bar");
      if (!target) { setNavSearchActive(true); return; }
      const rect = target.getBoundingClientRect();
      const navHeight = navRef.current ? navRef.current.getBoundingClientRect().height : 0;
      const visible = rect.bottom > navHeight && rect.top < window.innerHeight;
      setNavSearchActive(!visible);
    };
    const scheduleCheck = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", scheduleCheck, { passive: true });
    window.addEventListener("resize", scheduleCheck);
    const mo = new MutationObserver(scheduleCheck);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener("scroll", scheduleCheck);
      window.removeEventListener("resize", scheduleCheck);
      mo.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [current]);

  const navSuggestions = buildSuggestions(navDirectory, navQuery);

  const submitNavSearch = (queryOverride) => {
    const q = (queryOverride != null ? queryOverride : navQuery).trim();
    try {
      localStorage.setItem("vaibook_pending_search", JSON.stringify({ query: q, district: "All" }));
    } catch (e) { /* ignore storage errors */ }
    setShowNavSuggestions(false);
    setMobileSearchOpen(false);
    enterCustomerPortal(onNav, session, onSignIn, onSignOut);
  };

  const selectNavSuggestion = (s) => {
    setNavQuery(s.label);
    submitNavSearch(s.label);
  };

  const go = (fn) => { fn(); closeMenu(); };
  const goAccount = (fn) => { fn(); closeAccount(); };

  const openTab = (tabId) => {
    try { localStorage.setItem("vaibook_pending_tab", tabId); } catch (e) { /* ignore */ }
    // Routed through enterCustomerPortal (not a bare onNav) so an account
    // that's actively signed into the provider portal still gets the
    // forced sign-out + explicit portal choice instead of slipping into
    // customer settings via this menu.
    enterCustomerPortal(onNav, session, onSignIn, onSignOut);
  };

  const initials = getInitials(user?.full_name);

  // Same check the account cluster below already uses to decide whether
  // it's rendering the marketing nav-cta (logged-out / home) or an
  // authenticated portal's avatar-only nav. The floating "compact search"
  // (nav-search-wrap/toggle + its mobile panel) only makes sense on those
  // same customer-acquisition pages — nobody needs to search for a barber
  // from inside their own admin/provider/customer dashboard. Reusing the
  // condition here also fixes a real layout bug, not just a cosmetic one:
  // navSearchActive defaults to true on any page without #main-search-bar
  // (i.e. every portal page), and nav-search-wrap is position:absolute,
  // centered on the whole nav bar regardless of flexbox. On a portal page
  // the account cluster is just a lone avatar button (not the wider
  // nav-cta), so with only [logo, avatar, bell] as real flex children,
  // justify-content:space-between centers the avatar almost exactly where
  // that floating search box also centers itself — landing the avatar
  // visually inside the search input. Not rendering the search UI at all
  // on portal pages removes the collision outright, rather than trying to
  // out-position an absolutely-centered overlay with flex ordering.
  const showNavSearch = current === "home" || (current === "customer" && !session);

  return (
    <div className="nav-outer" ref={navRef}>
    <nav className="nav">
      <span className="nav-logo" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }} onClick={() => onNav("home")}><VaiBookMark size={24} />vai<span>book</span></span>

      {showNavSearch && (
      <div className={`nav-search-wrap ${navSearchActive ? "visible" : ""}`}>
        <div className="nav-search">
          <div className="nav-search-input-wrap">
            <span className="nav-search-icon">🔍</span>
            <input
              placeholder="Search barbers, haircuts, nail techs..."
              value={navQuery}
              onChange={e => { setNavQuery(e.target.value); setShowNavSuggestions(true); }}
              onFocus={() => setShowNavSuggestions(true)}
              onBlur={() => setTimeout(() => setShowNavSuggestions(false), 150)}
              onKeyDown={e => { if (e.key === "Enter") submitNavSearch(); }}
            />
          </div>
          {showNavSuggestions && navSuggestions.length > 0 && (
            <div className="suggestions-dropdown">
              {navSuggestions.map((s) => (
                <div key={s.key} className="suggestion-item" onMouseDown={() => selectNavSuggestion(s)}>
                  <span className="suggestion-icon">{s.icon}</span>
                  <span className="suggestion-label">{s.label}</span>
                  <span className="suggestion-sub">{s.sublabel}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}
      {showNavSearch && (
      <button className={`nav-search-toggle ${navSearchActive ? "visible" : ""}`} onClick={() => setMobileSearchOpen(v => !v)} aria-label="Search">🔍</button>
      )}

      {(current === "home" || (current === "customer" && !session)) ? (
        <div className="nav-cta">
          {session ? (
            <div style={{ position: "relative" }}>
              <button className="nav-avatar-btn" onClick={() => setAccountOpen((v) => !v)}>
                <span className="nav-avatar-circle">{initials}</span>
                <span className="nav-avatar-caret">▾</span>
              </button>
              {accountOpen && (
                <div className="nav-account-dropdown" onMouseLeave={closeAccount}>
                  <div className="nav-account-name">{user?.full_name || "My account"}</div>
                  <button className="nav-dropdown-item" onClick={() => goAccount(() => openTab("settings"))}>
                    <span className="icn">👤</span> Profile
                  </button>
                  <button className="nav-dropdown-item" onClick={() => goAccount(() => openTab("bookings"))}>
                    <span className="icn">📅</span> My bookings
                  </button>
                  <button className="nav-dropdown-item" onClick={() => goAccount(() => openTab("payments"))}>
                    <span className="icn">💳</span> Payments
                  </button>
                  <button className="nav-dropdown-item" onClick={() => goAccount(() => openTab("reviews"))}>
                    <span className="icn">⭐</span> My reviews
                  </button>
                  <button className="nav-dropdown-item" onClick={() => goAccount(() => openTab("settings"))}>
                    <span className="icn">⚙️</span> Settings
                  </button>
                  <hr />
                  <button className="nav-dropdown-item" onClick={() => goAccount(onSignOut)}>
                    <span className="icn">↪</span> Log out
                  </button>
                  <hr />
                  <a onClick={() => goAccount(() => onNav("home"))}>Home</a>
                  <a onClick={() => goAccount(() => scrollToSection("services", onNav, current))}>Services</a>
                  <a onClick={() => goAccount(() => scrollToSection("how-it-works", onNav, current))}>How it works</a>
                  <a onClick={() => goAccount(() => scrollToSection("pricing", onNav, current))}>Pricing</a>
                  <hr />
                  <button className="nav-dropdown-item mobile-only-item" onClick={() => goAccount(() => onNav("signup"))}>
                    <span className="icn">🏪</span> Provide my service
                  </button>
                  <button className="nav-dropdown-item for-biz" onClick={() => goAccount(() => enterProviderPortal(onNav, session, onSignIn, onSignOut))}>
                    For businesses <span>→</span>
                  </button>
                  <hr />
                  <button className="nav-dropdown-item" onClick={() => goAccount(openInstallAppGuide)}>
                    <span className="icn">📲</span> Add to Home Screen
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="nav-login-link" onClick={() => onNav("auth")}>Log in</button>
          )}
          {current === "home" && (
            <button className="nav-signup-btn" onClick={() => onNav("signup")}>Provide my service</button>
          )}
          {!session && (
          <div style={{ position: "relative" }}>
            <button className="nav-menu-btn" onClick={() => setMenuOpen((v) => !v)}>
              Menu
              <span className="bars"><span /><span /></span>
            </button>
            {menuOpen && (
              <div className="nav-dropdown" onMouseLeave={closeMenu}>
                <a onClick={() => go(() => onNav("home"))}>Home</a>
                <a onClick={() => go(() => scrollToSection("services", onNav, current))}>Services</a>
                <a onClick={() => go(() => scrollToSection("how-it-works", onNav, current))}>How it works</a>
                <a onClick={() => go(() => scrollToSection("pricing", onNav, current))}>Pricing</a>
                <hr />
                <button className="nav-dropdown-item" onClick={() => go(openInstallAppGuide)}>Add to Home Screen</button>
                {current === "home" && (
                  <>
                    <hr />
                    <button className="nav-dropdown-item mobile-only-item" onClick={() => go(() => onNav("signup"))}>Provide my service</button>
                    <button className="nav-dropdown-item" onClick={() => go(() => enterProviderPortal(onNav, session, onSignIn, onSignOut))}>
                      Provider login
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          )}
        </div>
      ) : session && PORTAL_TOOLS_BY_VIEW[current] ? (
        // marginLeft: auto — on a portal page this is the only other real
        // flex child besides .nav-logo and the bell (search is hidden
        // here, see showNavSearch above), and plain space-between would
        // center a lone middle item instead of hugging it to the right
        // next to the bell. auto-margin claims all the free space on its
        // left, pinning this (and the bell after it) to the right edge.
        <div style={{ position: "relative", marginLeft: "auto" }}>
          <button className="nav-avatar-btn" onClick={() => setAccountOpen((v) => !v)}>
            <span className="nav-avatar-circle">{initials}</span>
            <span className="nav-avatar-caret">▾</span>
          </button>
          {accountOpen && (
            <div className="nav-account-dropdown" onMouseLeave={closeAccount}>
              <div className="nav-account-name">{user?.full_name || "My account"}</div>
              {PORTAL_TOOLS_BY_VIEW[current].map((item) => (
                <button key={item.id} className="nav-dropdown-item" onClick={() => goAccount(() => setPortalTab(item.id))}>
                  <span className="icn">{item.icon}</span> {item.label}
                </button>
              ))}
              {(current === "customer" || current === "provider") && (
                <>
                  <hr />
                  {current === "provider" ? (
                    <button className="nav-dropdown-item" onClick={() => goAccount(() => enterCustomerPortal(onNav, session, onSignIn, onSignOut))}>
                      <span className="icn">🛍️</span> Switch to customer
                    </button>
                  ) : (
                    <button className="nav-dropdown-item for-biz" onClick={() => goAccount(() => enterProviderPortal(onNav, session, onSignIn, onSignOut))}>
                      <span className="icn">🏪</span> Switch to provider
                    </button>
                  )}
                </>
              )}
              <hr />
              <button className="nav-dropdown-item" onClick={() => goAccount(openInstallAppGuide)}>
                <span className="icn">📲</span> Add to Home Screen
              </button>
              <hr />
              <button className="nav-dropdown-item" onClick={() => goAccount(onSignOut)}>
                <span className="icn">↪</span> Log out
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <button className="nav-menu-btn" onClick={() => setMenuOpen((v) => !v)}>
            Menu
            <span className="bars"><span /><span /></span>
          </button>
          {menuOpen && (
            <div className="nav-dropdown" onMouseLeave={closeMenu}>
              <a onClick={() => go(() => onNav("home"))}>Home</a>
              <a onClick={() => go(() => scrollToSection("services", onNav, current))}>Services</a>
              <a onClick={() => go(() => scrollToSection("how-it-works", onNav, current))}>How it works</a>
              <a onClick={() => go(() => scrollToSection("browse", onNav, current))}>Browse by district</a>
              <a onClick={() => go(() => scrollToSection("pricing", onNav, current))}>Pricing</a>
              <hr />
              <button className="nav-dropdown-item" onClick={() => go(openInstallAppGuide)}>Add to Home Screen</button>
            </div>
          )}
        </div>
      )}

      {mobileSearchOpen && navSearchActive && (
        <div className="nav-search-mobile-panel">
          <div className="nav-search-input-wrap">
            <span className="nav-search-icon">🔍</span>
            <input
              autoFocus
              placeholder="Search barbers, haircuts, nail techs..."
              value={navQuery}
              onChange={e => setNavQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitNavSearch(); }}
            />
          </div>
          {navSuggestions.length > 0 && (
            <div className="suggestions-dropdown" style={{ position: "static", boxShadow: "none", border: "none", marginTop: 8 }}>
              {navSuggestions.map((s) => (
                <div key={s.key} className="suggestion-item" onMouseDown={() => selectNavSuggestion(s)}>
                  <span className="suggestion-icon">{s.icon}</span>
                  <span className="suggestion-label">{s.label}</span>
                  <span className="suggestion-sub">{s.sublabel}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rendered last (not right after the search toggle) so .nav's
          justify-content: space-between pins it to the far right edge of
          the bar, after the avatar/List-your-business/Menu cluster — where
          it was originally and where it needs to stay, on both desktop and
          the single-row mobile layout above. */}
      {session && user && <NotificationBell userId={user.id} providerProfile={providerProfile} onNav={onNav} />}
    </nav>
    {/* nav-strip (the 13-category pill row) removed per explicit request —
        aggressive simplification. Its CSS rules (.nav-strip*) are left in
        the stylesheet, unused, rather than pulled, in case this is
        revisited; they cost nothing sitting idle. */}
    </div>
  );
}

function LandingPage({ onNav, session, onSignIn, onSignOut }) {
  const [heroQuery, setHeroQuery] = useState("");
  const [heroDistrict, setHeroDistrict] = useState("");
  const [heroDirectory, setHeroDirectory] = useState([]);
  const [showHeroSuggestions, setShowHeroSuggestions] = useState(false);
  // Powers the three "discover" carousels below (Recommended / New to
  // VaiBook / Trending) — one fetch, three client-side sorts, rather than
  // three separate queries.
  const [discoverProviders, setDiscoverProviders] = useState([]);
  const [loadingDiscover, setLoadingDiscover] = useState(true);

  useEffect(() => {
    getProviderDirectory().then((data) => setHeroDirectory(data || []));
    getActiveProviders().then((data) => { setDiscoverProviders(data || []); setLoadingDiscover(false); });
  }, []);

  const heroSuggestions = buildSuggestions(heroDirectory, heroQuery);

  // Recommended: highest-rated first, 2+ reviews required so one 5-star
  // review can't dominate.
  const recommendedProviders = discoverProviders
    .filter((p) => providerRating(p) != null && (p.reviews || []).length >= 2)
    .sort((a, b) => providerRating(b) - providerRating(a))
    .slice(0, 8);

  // New to VaiBook: most recently joined, regardless of reviews yet — the
  // "New" pill only shows on the ones actually within the last 30 days
  // (see isRecentlyJoined), so this never mislabels an older provider.
  const newProviders = [...discoverProviders]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 8);

  // Trending: VaiBook doesn't track view/booking velocity yet, so this
  // stands in with the closest honest signal available today — providers
  // who opted into "Featured" placement (a paid visibility boost, i.e.
  // providers actively investing in being seen), tie-broken by review
  // count as a rough popularity proxy. Worth swapping for real recent-
  // booking-volume data once there's enough traffic to make that
  // meaningful.
  const trendingProviders = [...discoverProviders]
    .sort((a, b) => {
      const bf = b.is_featured ? 1 : 0, af = a.is_featured ? 1 : 0;
      if (bf !== af) return bf - af;
      return (b.reviews || []).length - (a.reviews || []).length;
    })
    .slice(0, 8);

  const goToProvider = (p) => {
    try {
      localStorage.setItem("vaibook_pending_search", JSON.stringify({ query: p.business_name, district: "All" }));
    } catch (e) { /* ignore storage errors */ }
    enterCustomerPortal(onNav, session, onSignIn, onSignOut);
  };

  const submitHeroSearch = (queryOverride) => {
    const q = (queryOverride != null ? queryOverride : heroQuery).trim();
    try {
      localStorage.setItem("vaibook_pending_search", JSON.stringify({ query: q, district: heroDistrict || "All" }));
    } catch (e) { /* ignore storage errors */ }
    enterCustomerPortal(onNav, session, onSignIn, onSignOut);
  };

  const selectHeroSuggestion = (s) => {
    setHeroQuery(s.label);
    setShowHeroSuggestions(false);
    submitHeroSearch(s.label);
  };

  return (
    <>
      {/* HERO — full swing back to customer-facing (per explicit request):
          hero copy sits above the search bar, which is the primary action
          again. The B2B eyebrow and trial-signup CTA from the earlier pivot
          are removed here (they still exist elsewhere — nav CTA, pricing
          section, signup page). Headline drops its trailing period, same
          fix as before: Plus Jakarta Sans ExtraBold (800) draws a period
          glyph with a wide left side-bearing that reads as a stray gap at
          large display size — confirmed on the live site. */}
      <section className="search-hero">
        <h1><span className="line1">Belize's top professionals,</span><span className="line2">booked in seconds</span></h1>
        <p className="search-sub">Skip the DMs, choose your time, and secure your spot in seconds.</p>
        <div className="search-bar-pill" id="main-search-bar">
          <div className="field">
            <span>🔍</span>
            <input
              placeholder="What service do you need?"
              value={heroQuery}
              onChange={e => { setHeroQuery(e.target.value); setShowHeroSuggestions(true); }}
              onFocus={() => setShowHeroSuggestions(true)}
              onBlur={() => setTimeout(() => setShowHeroSuggestions(false), 150)}
              onKeyDown={e => { if (e.key === "Enter") { setShowHeroSuggestions(false); submitHeroSearch(); } }}
            />
          </div>
          <div className="sep" />
          <div className="field">
            <span>📍</span>
            <select value={heroDistrict} onChange={e => setHeroDistrict(e.target.value)}>
              <option value="">Any district</option>
              {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <button className="search-submit" onClick={() => { setShowHeroSuggestions(false); submitHeroSearch(); }}>Search</button>
          {showHeroSuggestions && heroSuggestions.length > 0 && (
            <div className="suggestions-dropdown">
              {heroSuggestions.map((s) => (
                <div key={s.key} className="suggestion-item" onMouseDown={() => selectHeroSuggestion(s)}>
                  <span className="suggestion-icon">{s.icon}</span>
                  <span className="suggestion-label">{s.label}</span>
                  <span className="suggestion-sub">{s.sublabel}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" id="how-it-works">
        <div className="section-eyebrow">Simple process</div>
        <h2 className="section-title">From search to booked in under 2 minutes</h2>
        <p className="section-sub">No more messaging back and forth just to get a haircut. Pick your time, confirm, show up.</p>
        <div className="steps-grid">
          {[
            { n: "1", icon: "🔍", title: "Find your provider", desc: "Search by service type and district. See real ratings from real customers." },
            { n: "2", icon: "📅", title: "Pick your slot", desc: "View live availability. No more 'are you free Friday?' messages." },
            { n: "3", icon: "💳", title: "Pay your deposit", desc: "Pay your provider directly and upload your receipt in-app. They confirm it to lock in your appointment." },
            { n: "4", icon: "⭐", title: "Rate & review", desc: "After your appointment, leave a verified review. Build the community." },
          ].map((s, i) => (
            <div className="step-card" key={i} data-n={s.n}>
              <div className="step-icon">{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* DISCOVER — Fresha-style horizontal carousels. Each row only
          renders once it has at least 2 real providers to show — a thin
          market showing 1 card (or the same provider) across three rows
          would look broken rather than impressive, so this grows in on its
          own as more providers join instead of needing to be toggled on. */}
      {!loadingDiscover && (recommendedProviders.length >= 2 || newProviders.length >= 2 || trendingProviders.length >= 2) && (
        <section className="section" id="discover">
          {recommendedProviders.length >= 2 && (
            <div style={{ marginBottom: 44 }}>
              <div className="section-eyebrow">Loved by customers</div>
              <h2 className="section-title" style={{ marginBottom: 20 }}>Recommended</h2>
              <ProviderCarousel providers={recommendedProviders} onCardClick={goToProvider} />
            </div>
          )}
          {newProviders.length >= 2 && (
            <div style={{ marginBottom: 44 }}>
              <div className="section-eyebrow">Just joined</div>
              <h2 className="section-title" style={{ marginBottom: 20 }}>New to VaiBook</h2>
              <ProviderCarousel providers={newProviders} badgeFor={(p) => (isRecentlyJoined(p) ? "New" : null)} onCardClick={goToProvider} />
            </div>
          )}
          {trendingProviders.length >= 2 && (
            <div>
              <div className="section-eyebrow">Getting noticed</div>
              <h2 className="section-title" style={{ marginBottom: 20 }}>Trending</h2>
              <ProviderCarousel providers={trendingProviders} badgeFor={(p) => (p.is_featured ? "Featured" : null)} onCardClick={goToProvider} />
            </div>
          )}
        </section>
      )}

      {/* SERVICES */}
      <section className="services-section" id="services">
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div className="section-eyebrow" style={{ justifyContent: "center", display: "flex" }}>What's on VaiBook</div>
          <h2 className="section-title">Every local service. One platform.</h2>
          <p className="section-sub" style={{ margin: "0 auto" }}>From a fresh fade to a relaxing facial — all bookable in your district.</p>
        </div>
        <div className="services-pills">
          {SERVICES.map((s, i) => (
            <button className="service-pill" key={i} onClick={() => enterCustomerPortal(onNav, session, onSignIn, onSignOut)}>
              <span className="icon">{s.icon}</span> {s.name}
            </button>
          ))}
        </div>
      </section>

      {/* MARKETING STRIP — sells what VaiBook does, not raw usage numbers.
          A brand-new platform's real counts (bookings, providers, districts)
          look thin and undercut trust, so this highlights capabilities
          instead. Placed right before Coverage/Browse by district so it
          leads into "here's where we actually operate". */}
      <div className="marketing-strip">
        <div className="marketing-item">
          <div className="marketing-item-icon">⚡</div>
          <div className="marketing-item-title">Instant booking</div>
          <div className="marketing-item-sub">Book in a few taps — no back-and-forth calls or texts.</div>
        </div>
        <div className="marketing-item">
          <div className="marketing-item-icon">✅</div>
          <div className="marketing-item-title">Verified providers</div>
          <div className="marketing-item-sub">Every business is reviewed before it goes live on VaiBook.</div>
        </div>
        <div className="marketing-item">
          <div className="marketing-item-icon">🔒</div>
          <div className="marketing-item-title">Secure payments</div>
          <div className="marketing-item-sub">Pay safely and keep every booking in one place.</div>
        </div>
        <div className="marketing-item">
          <div className="marketing-item-icon">📍</div>
          <div className="marketing-item-title">All of Belize</div>
          <div className="marketing-item-sub">Serving every district, with more providers joining weekly.</div>
        </div>
      </div>

      {/* PLATFORM PREVIEW — a marketing collage showing the scheduling
          dashboard + a customer-facing booking screen side by side. This is
          an illustrative mockup (fictional salon/business names and review
          counts), not a live screenshot or a real usage claim. */}
      <section className="section platform-preview-section">
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="section-eyebrow" style={{ justifyContent: "center", display: "flex" }}>See it in action</div>
          <h2 className="section-title">Built for how your business really runs</h2>
          <p className="section-sub" style={{ margin: "0 auto" }}>One dashboard for your schedule, one booking page your customers love.</p>
        </div>
        <picture>
          <source srcSet="/platform-preview.webp" type="image/webp" />
          <img
            className="platform-preview-img"
            src="/platform-preview.jpg"
            alt="VaiBook scheduling dashboard and customer booking screen preview"
            width={1600}
            height={1100}
            loading="lazy"
            decoding="async"
          />
        </picture>
      </section>

      {/* PRICING — for prospective providers. "Recommended" on Pro is
          VaiBook's own editorial call, not a "Most popular" claim — there's
          no real usage data yet to honestly back that. Every feature line
          comes straight from PLANS above, which only lists things that are
          actually built (and, for Starter's booking cap, actually
          enforced) — nothing here is aspirational.
          NOTE: the "14-Day Free Trial" badge below is marketing copy the
          user explicitly asked for — there is no trial mechanism in the
          backend (no trial_ends_at, no auto-expiry/downgrade). Every
          signup, trial-badged or not, still goes through the same manual
          bank-transfer + admin-confirms flow as before. If a real
          system-enforced trial is wanted, that's separate schema/logic
          work, not just this copy change. */}
      <section className="section pricing-section" id="pricing">
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div className="section-eyebrow" style={{ justifyContent: "center", display: "flex" }}>For business owners</div>
          <div className="trial-badge">✨ Start with a 14-day free trial — no card required</div>
          <h2 className="section-title">Simple pricing. Grow when you're ready.</h2>
          <p className="section-sub" style={{ margin: "0 auto" }}>No contracts, no setup fees. Try VaiBook free for 14 days, then pick the plan that fits your shop.</p>
        </div>
        <div className="pricing-grid">
          {PUBLIC_PLANS.map((p) => (
            <div className={`pricing-card ${p.recommended ? "recommended" : ""}`} key={p.id}>
              {p.recommended && <div className="pricing-badge">Recommended</div>}
              <div className="pricing-name">{p.name}</div>
              <div className="pricing-price">
                BZ${p.monthly}<span> /month</span>
              </div>
              {p.priceNote && <div className="pricing-price-note">{p.priceNote}</div>}
              <div className="pricing-tagline">{p.tagline}</div>
              <ul className="pricing-features">
                {p.features.map((f, i) => (
                  <li key={i}><span className="check">✓</span>{f}</li>
                ))}
              </ul>
              <button
                className={p.recommended ? "btn-lime pricing-cta" : "btn-sm forest pricing-cta"}
                onClick={() => goToSignupWithPlan(onNav, p.id)}
              >
                Start Your 14-Day Free Trial
              </button>
            </div>
          ))}
        </div>
        <p className="pricing-foot-note">Every plan includes invoices, refund tracking, and your own booking page. Change plans anytime — email us and we'll switch you at the end of your current billing period.</p>

        {/* VAI CREATIVE — a premium agency add-on, deliberately separated
            from the Solo/Team self-serve pricing above: no price shown, no
            "Buy" button, just an inquiry CTA, so it never adds checkout
            friction to the core SaaS signup. */}
        <div className="vai-creative-banner">
          <div className="vai-creative-eyebrow">✨ Vai Creative</div>
          <h3 className="vai-creative-title">Vai Creative: Content &amp; Growth</h3>
          <p className="vai-creative-copy">Need fresh content? We bring the cameras to your shop. High-quality Reels, profile photos, and social media management designed to get you more bookings.</p>
          <a className="vai-creative-btn" href={vaiCreativeWhatsAppUrl("pricing page")} target="_blank" rel="noreferrer">Inquire Now</a>
          <p className="vai-creative-alt"><a href={vaiCreativeMailtoUrl()}>or email us</a></p>
        </div>
      </section>

      {/* FOR BUSINESS — conversion block, right above the footer. Deliberately
          plain: no icons, no images, just a high-contrast dark-green break
          to sell the trial CTA one more time before the page ends. */}
      <section className="for-business-cta">
        <div className="for-business-inner">
          <h2 className="for-business-headline">Stop Losing Revenue to No-Shows</h2>
          <p className="for-business-sub">
            Join Belize's top professionals. Get your customized booking link, automate
            24-hour reminders, and secure deposits directly via WhatsApp.
          </p>
          <button className="btn-lime for-business-btn" onClick={() => onNav("signup")}>
            Start Your 14-Day Free Trial
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-top">
          <div className="footer-brand">
            <span className="nav-logo" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><VaiBookMark size={20} />vai<span>book</span></span>
            <p>Local services. Booked easily. Built for Belize.</p>
          </div>
          <div className="footer-links">
            <h5>Services</h5>
            <ul>
              {SERVICES.map((s) => <li key={s.name}>{s.name}</li>)}
            </ul>
          </div>
          <div className="footer-links">
            <h5>Company</h5>
            <ul>
              <li>About Vai</li><li>How it works</li><li>Districts</li><li>Blog</li>
            </ul>
          </div>
          <div className="footer-links">
            <h5>Support</h5>
            <ul>
              <li>Help center</li><li>Contact us</li><li>Privacy policy</li><li>Terms</li>
            </ul>
          </div>
          <div className="footer-links">
            <h5>More from Vai Plaza</h5>
            <ul>
              <li><a href="https://vaibuyandsell.bz/shop?category=Home%20%26%20Living" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>Vai Buy — buy &amp; sell</a></li>
              {/* Vai Media entry goes here once its link/handle is confirmed */}
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 VaiBook. Built in Belize 🇧🇿</span>
          <span>A product of Vai Plaza</span>
        </div>
      </footer>
    </>
  );
}

// ── CUSTOMER PORTAL ─────────────────────────────────────────────
function CustomerPortal({ onNav, user, session, onSignOut, onUserUpdate, deepLinkProviderId, onDeepLinkConsumed }) {
  const [tab, setTab] = useState("home");

  // Lets the top nav's account dropdown (with the same tools list as the
  // sidebar) switch tabs while already inside the customer portal,
  // since the sidebar itself is hidden on mobile.
  useEffect(() => {
    const onSetTab = (e) => { if (e.detail && e.detail.tab) setTab(e.detail.tab); };
    window.addEventListener("vaibook-set-portal-tab", onSetTab);
    return () => window.removeEventListener("vaibook-set-portal-tab", onSetTab);
  }, []);
  const displayName = user?.full_name || session?.user?.email || "there";
  const firstName = displayName.split(" ")[0].split("@")[0];
  const initial = displayName[0]?.toUpperCase() || "?";
  const [bookingTab, setBookingTab] = useState("upcoming");
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingSort, setBookingSort] = useState("newest");

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!user) return;
    const [fn, ...rest] = (user.full_name || "").split(" ");
    setProfileForm({ firstName: fn || "", lastName: rest.join(" "), phone: user.phone || "" });
  }, [user]);

  const startEditProfile = () => setEditingProfile(true);
  const cancelEditProfile = () => {
    const [fn, ...rest] = (user?.full_name || "").split(" ");
    setProfileForm({ firstName: fn || "", lastName: rest.join(" "), phone: user?.phone || "" });
    setEditingProfile(false);
  };
  const saveProfile = async () => {
    setSavingProfile(true);
    const full_name = [profileForm.firstName.trim(), profileForm.lastName.trim()].filter(Boolean).join(" ") || user?.full_name;
    const updated = await updateUserProfile(user.id, { full_name, phone: profileForm.phone.trim() || null });
    setSavingProfile(false);
    if (updated) {
      onUserUpdate && onUserUpdate(updated);
      setEditingProfile(false);
    }
  };

  // VaiBook VIP membership — same hands-off bank-transfer-and-confirm
  // billing as a provider plan payment, just customer-side. `user` already
  // carries vip_active/vip_expires_at (getOrCreateUser selects '*').
  const isVipMember = !!(user?.vip_active && user?.vip_expires_at && new Date(user.vip_expires_at) > new Date());
  const [vipPayments, setVipPayments] = useState([]);
  const [loadingVipPayments, setLoadingVipPayments] = useState(false);
  const [vipPaymentForm, setVipPaymentForm] = useState({ receipt: null });
  const [vipPaymentFileKey, setVipPaymentFileKey] = useState(0);
  const [submittingVipPayment, setSubmittingVipPayment] = useState(false);
  const [vipPaymentError, setVipPaymentError] = useState("");
  const [refreshingVipStatus, setRefreshingVipStatus] = useState(false);

  const loadMyVipPayments = async () => {
    if (!user?.id) return;
    setLoadingVipPayments(true);
    const data = await getMyVipPayments(user.id);
    setVipPayments(data || []);
    setLoadingVipPayments(false);
  };

  const submitVipMembershipPayment = async () => {
    if (!vipPaymentForm.receipt) { setVipPaymentError("Please attach a receipt image or PDF."); return; }
    setSubmittingVipPayment(true);
    setVipPaymentError("");
    const ok = await submitVipPayment(user.id, vipPaymentForm.receipt, {
      amount: VIP_MEMBERSHIP.monthly,
      periodLabel: new Date().toLocaleDateString([], { month: "long", year: "numeric" }),
    });
    setSubmittingVipPayment(false);
    if (ok) {
      setVipPaymentForm({ receipt: null });
      setVipPaymentFileKey((k) => k + 1);
      loadMyVipPayments();
    } else {
      setVipPaymentError("Something went wrong uploading your receipt. Please try again.");
    }
  };

  // No webhook tells this screen the moment admin confirms a payment, so
  // this just re-fetches the user's own row on demand rather than polling.
  const refreshVipStatus = async () => {
    if (!session?.user) return;
    setRefreshingVipStatus(true);
    const refreshed = await getOrCreateUser(session.user);
    if (refreshed) onUserUpdate && onUserUpdate(refreshed);
    setRefreshingVipStatus(false);
  };

  useEffect(() => { loadMyVipPayments(); }, [user?.id]);

  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providerSearch, setProviderSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("All");

  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState(null);

  // Lets a customer share a specific service (not just the provider as a
  // whole) with someone else — mirrors the existing QR-code deep link
  // ("#book-<provider id>") so the shared link lands straight on that
  // provider's booking page. Native share sheet where the browser
  // supports it (navigator.share — covers Amazon's own "share" pattern on
  // mobile); clipboard copy with a brief inline confirmation otherwise.
  const [copiedServiceId, setCopiedServiceId] = useState(null);
  const shareService = async (service) => {
    if (!selectedProvider) return;
    const url = `${window.location.origin}/#book-${selectedProvider.id}`;
    const text = `${service.name} at ${selectedProvider.business_name} — book it on VaiBook`;
    if (navigator.share) {
      try { await navigator.share({ title: text, url }); } catch (e) { /* user cancelled — not an error */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopiedServiceId(service.id);
      setTimeout(() => setCopiedServiceId((id) => (id === service.id ? null : id)), 1800);
    } catch (e) { /* clipboard unavailable — nothing more we can do here */ }
  };

  // Same share pattern, one level up: shares the provider's whole profile
  // (not one specific service) — this is the icon-button version that sits
  // beside the profile heart/favorite button, mirroring the share+heart
  // icon pair pattern used by marketplace apps like Amazon/Fresha.
  const [providerLinkCopied, setProviderLinkCopied] = useState(false);
  const shareProvider = async (provider) => {
    if (!provider) return;
    const url = `${window.location.origin}/#book-${provider.id}`;
    const text = `${provider.business_name} on VaiBook`;
    if (navigator.share) {
      try { await navigator.share({ title: text, url }); } catch (e) { /* user cancelled — not an error */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setProviderLinkCopied(true);
      setTimeout(() => setProviderLinkCopied(false), 1800);
    } catch (e) { /* clipboard unavailable — nothing more we can do here */ }
  };

  // Per-booking unread message counts, so a waiting message is visible from
  // the list instead of only after opening that booking's chat.
  const [unreadByBooking, setUnreadByBooking] = useState({});
  const loadUnreadMessages = async () => {
    if (!user?.id) return;
    const rows = await getUnreadBookingMessages(user.id);
    const map = {};
    (rows || []).forEach((r) => { map[r.booking_id] = (map[r.booking_id] || 0) + 1; });
    setUnreadByBooking(map);
  };
  useEffect(() => {
    loadUnreadMessages();
    const t = setInterval(loadUnreadMessages, 30000);
    return () => clearInterval(t);
  }, [user?.id]);

  // A QR code / booking-link deep link ("#book-<id>") jumps straight to
  // that provider's booking view, same modal as clicking them from search —
  // no account needed just to look, same as browsing normally.
  useEffect(() => {
    if (!deepLinkProviderId) return;
    let cancelled = false;
    (async () => {
      const p = await getProviderById(deepLinkProviderId);
      if (!cancelled && p) {
        setSelectedProvider(p);
        // Without this the booking form has no working hours to build time
        // slots from, so every QR/NFC scan dead-ended on "this provider
        // hasn't set their working hours yet" — openBooking() loads them,
        // and this path has to do exactly the same.
        setProviderHours([]);
        setBusyWindows([]);
        getWorkingHours(p.id).then((hrs) => { if (!cancelled) setProviderHours(hrs || []); });
        if (p.loyalty_enabled && user?.id) {
          getLoyaltyAccount(p.id, user.id).then((acc) => { if (!cancelled) setMyLoyalty(acc); });
        }
      }
      if (!cancelled) onDeepLinkConsumed && onDeepLinkConsumed();
    })();
    return () => { cancelled = true; };
  }, [deepLinkProviderId]);

  const [bookingForm, setBookingForm] = useState({ service_id: "", service_ids: [], date: "", time: "10:00", notes: "" });
  // Multi-service checkout: tapping a service card toggles it in/out of this
  // set (see the service-card list below) — a totally separate interaction
  // from the existing single-service "Book" button, which still books that
  // one service instantly and is untouched.
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [guestCheckoutForm, setGuestCheckoutForm] = useState({ name: "", email: "", whatsapp: "" });
  const [showEmailAuthModal, setShowEmailAuthModal] = useState(false);
  const [sendingBookingOtp, setSendingBookingOtp] = useState(false);
  const { pushEnabled, subscribingPush, pushError, enablePushNotifications } = usePushSubscription(user?.id);
  const [providerHours, setProviderHours] = useState([]);
  const [busyWindows, setBusyWindows] = useState([]);
  const [myLoyalty, setMyLoyalty] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [rescheduleRespondingId, setRescheduleRespondingId] = useState(null);
  const [rescheduleRespondError, setRescheduleRespondError] = useState({});
  const [profileTab, setProfileTab] = useState("services");
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [bookingService, setBookingService] = useState(null);
  const [providerReviews, setProviderReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [showBrowseSuggestions, setShowBrowseSuggestions] = useState(false);

  const [uploadingReceiptId, setUploadingReceiptId] = useState(null);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [submittingReview, setSubmittingReview] = useState(false);

  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [favoriteProviders, setFavoriteProviders] = useState([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [togglingFavoriteId, setTogglingFavoriteId] = useState(null);

  const loadFavoriteIds = async () => {
    if (!user?.id) return;
    const ids = await getFavoriteProviderIds(user.id);
    setFavoriteIds(new Set(ids));
  };

  const loadFavoriteProviders = async () => {
    if (!user?.id) return;
    setLoadingFavorites(true);
    const data = await getFavoriteProviders(user.id);
    setFavoriteProviders(data);
    setLoadingFavorites(false);
  };

  useEffect(() => {
    loadFavoriteIds();
    loadFavoriteProviders();
  }, [user?.id]);

  const toggleFavorite = async (e, providerId) => {
    e.stopPropagation();
    if (!user?.id || togglingFavoriteId === providerId) return;
    setTogglingFavoriteId(providerId);
    const isFav = favoriteIds.has(providerId);
    // Optimistic update so the heart flips instantly.
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      isFav ? next.delete(providerId) : next.add(providerId);
      return next;
    });
    const ok = isFav ? await removeFavorite(user.id, providerId) : await addFavorite(user.id, providerId);
    if (ok) {
      if (isFav) {
        setFavoriteProviders((prev) => prev.filter((p) => p.id !== providerId));
      } else {
        loadFavoriteProviders();
      }
    } else {
      // Revert on failure.
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        isFav ? next.add(providerId) : next.delete(providerId);
        return next;
      });
    }
    setTogglingFavoriteId(null);
  };

  const loadProviders = async () => {
    setLoadingProviders(true);
    const data = await getActiveProviders(districtFilter !== "All" ? { district: districtFilter } : {});
    setProviders(data || []);
    setLoadingProviders(false);
  };

  useEffect(() => {
    loadProviders();
  }, [districtFilter]);

  const loadBookings = async () => {
    if (!user?.id) return;
    setLoadingBookings(true);
    const data = await getCustomerBookings(user.id);
    setBookings(data || []);
    setLoadingBookings(false);
  };

  useEffect(() => {
    loadBookings();
  }, [user?.id]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vaibook_pending_search");
      if (raw) {
        const parsed = JSON.parse(raw);
        setTab("browse");
        if (parsed.query) setProviderSearch(parsed.query);
        setDistrictFilter(parsed.district || "All");
        localStorage.removeItem("vaibook_pending_search");
      }
    } catch (e) { /* ignore malformed/missing storage */ }
  }, []);

  useEffect(() => {
    try {
      const pendingTab = localStorage.getItem("vaibook_pending_tab");
      if (pendingTab) {
        setTab(pendingTab);
        localStorage.removeItem("vaibook_pending_tab");
      }
    } catch (e) { /* ignore malformed/missing storage */ }
  }, []);

  const sideItems = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "browse", icon: "🔍", label: "Find services" },
    { id: "favorites", icon: "❤️", label: "Favorites" },
    { id: "bookings", icon: "📅", label: "My bookings" },
    { id: "payments", icon: "💳", label: "Payments" },
    { id: "reviews", icon: "⭐", label: "My reviews" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  const openBooking = (provider) => {
    setBookingError("");
    setProfileTab("services");
    setHoursExpanded(false);
    setBookingService(null);
    setSelectedServiceIds([]);
    setProviderReviews([]);
    setLightboxUrl(null);
    setSelectedProvider(provider);
    setProviderHours([]);
    setBusyWindows([]);
    setMyLoyalty(null);
    if (provider?.id) {
      getWorkingHours(provider.id).then((hrs) => setProviderHours(hrs || []));
      if (provider.loyalty_enabled && user?.id) {
        getLoyaltyAccount(provider.id, user.id).then((acc) => setMyLoyalty(acc));
      }
    }
  };

  const startBookingForService = (service) => {
    setBookingForm({
      service_id: service.id,
      service_ids: [],
      date: localDateStr(),
      time: "",
      notes: "",
      isVip: false,
    });
    setBookingError("");
    setBookingService(service);
  };

  // ── Multi-service checkout ────────────────────────────────────────
  // Tapping a service card (not the "Book" button) toggles it into this
  // running selection instead of jumping straight into the date/time step —
  // the sticky total bar below the list is what actually advances.
  const toggleServiceSelect = (service) => {
    setSelectedServiceIds((ids) => (ids.includes(service.id) ? ids.filter((id) => id !== service.id) : [...ids, service.id]));
  };
  const selectedServicesList = (selectedProvider?.services || []).filter((s) => selectedServiceIds.includes(s.id));
  const multiTotalPrice = selectedServicesList.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  const multiTotalDuration = selectedServicesList.reduce((sum, s) => sum + (Number(s.duration_min) || 0), 0);

  // "Next: Pick time" — builds one combined "service" out of everything
  // selected so the existing date/time step below (which only ever knew
  // about a single bookingService) can render it unchanged: same name/price/
  // duration fields, just summed across the whole selection. The real list
  // of service ids travels separately on bookingForm.service_ids for
  // submitBooking to use.
  const proceedToMultiServiceTime = () => {
    if (selectedServicesList.length === 0) return;
    const names = selectedServicesList.map((s) => s.name).join(" + ");
    setBookingForm({
      service_id: selectedServicesList[0].id,
      service_ids: selectedServicesList.map((s) => s.id),
      date: localDateStr(),
      time: "",
      notes: "",
      isVip: false,
    });
    setBookingError("");
    setBookingService({
      id: selectedServicesList[0].id,
      name: names,
      price: multiTotalPrice,
      duration_min: multiTotalDuration,
      isMulti: true,
    });
  };

  // A VIP request is for a time OUTSIDE the provider's normal working
  // hours, so it doesn't use the slot picker built from providerHours —
  // the customer just names a time and the provider accepts or declines,
  // same as any other booking request.
  const startVipBookingForService = (service) => {
    setBookingForm({
      service_id: service.id,
      service_ids: [],
      date: localDateStr(),
      time: "",
      notes: "",
      isVip: true,
    });
    setBookingError("");
    setBookingService(service);
  };

  // Reload the provider's busy windows whenever the chosen date changes so the
  // slot picker reflects live availability (not just what was true when the
  // modal first opened).
  useEffect(() => {
    if (!selectedProvider?.id || !bookingForm.date) { setBusyWindows([]); return; }
    let cancelled = false;
    setLoadingSlots(true);
    getProviderBusyWindows(selectedProvider.id, bookingForm.date).then((windows) => {
      if (!cancelled) { setBusyWindows(windows || []); setLoadingSlots(false); }
    });
    return () => { cancelled = true; };
  }, [selectedProvider?.id, bookingForm.date]);

  const timeToMinutes = (t) => {
    const [h, m] = String(t).slice(0, 5).split(":").map(Number);
    return h * 60 + m;
  };
  const minutesToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const formatTimeLabel = (t) => {
    const mins = timeToMinutes(t);
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const ampm = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  // Open/closed status for the profile header + sidebar, computed from the
  // provider's own working_hours rows — no separate "is open" field to fake,
  // just today's (or the next open day's) real hours.
  const getOpenStatus = (hours) => {
    if (!hours || !hours.length) return { open: null, label: "Hours not listed" };
    const now = new Date();
    const dow = now.getDay();
    const nowM = now.getHours() * 60 + now.getMinutes();
    const today = hours.find((h) => h.day_of_week === dow);
    if (today && today.is_open && today.start_time && today.end_time) {
      const startM = timeToMinutes(today.start_time);
      const endM = timeToMinutes(today.end_time);
      if (nowM >= startM && nowM < endM) return { open: true, label: `Open now · closes ${formatTimeLabel(today.end_time)}` };
      if (nowM < startM) return { open: false, label: `Closed · opens today at ${formatTimeLabel(today.start_time)}` };
    }
    for (let i = 1; i <= 7; i++) {
      const nextDow = (dow + i) % 7;
      const day = hours.find((h) => h.day_of_week === nextDow);
      if (day && day.is_open && day.start_time) {
        const dayLabel = i === 1 ? "tomorrow" : DAY_NAMES[nextDow];
        return { open: false, label: `Closed · opens ${dayLabel} at ${formatTimeLabel(day.start_time)}` };
      }
    }
    return { open: false, label: "Closed" };
  };

  // Builds the list of bookable slots for the currently selected date + service:
  // provider working hours minus already-busy windows minus times in the past.
  const availableSlots = (() => {
    if (!bookingForm.date) return [];
    // Multi-service checkout: bookingForm.service_ids (set by
    // proceedToMultiServiceTime) carries the full selection, so the slot
    // picker only shows times with enough room for ALL of them back-to-back
    // — never a single service's duration once more than one is selected.
    const durationMin = (bookingForm.service_ids || []).length > 0
      ? bookingForm.service_ids.reduce((sum, id) => {
          const s = (selectedProvider?.services || []).find((sv) => sv.id === id);
          return sum + (Number(s?.duration_min) || 0);
        }, 0) || 30
      : Number((selectedProvider?.services || []).find((s) => s.id === bookingForm.service_id)?.duration_min) || 30;
    const dow = new Date(bookingForm.date + "T00:00:00").getDay();
    const dayHours = providerHours.find((h) => h.day_of_week === dow);
    if (!dayHours || !dayHours.is_open || !dayHours.start_time || !dayHours.end_time) return [];
    const startM = timeToMinutes(dayHours.start_time);
    const endM = timeToMinutes(dayHours.end_time);
    const isToday = bookingForm.date === localDateStr();
    const nowM = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1;
    const step = 30;
    // "Set-and-forget" daily lunch break — subtracted from every day's
    // availability the same way a real booking would be, without the
    // provider having to block it themselves. Treated as just another busy
    // window for this one calculation, so it never touches busyWindows
    // (and therefore never shows on the provider's own schedule as a
    // ghost appointment).
    const lunchWindow = (selectedProvider?.lunch_break_start && Number(selectedProvider?.lunch_break_minutes) > 0)
      ? { start_time: selectedProvider.lunch_break_start, end_time: minutesToTime(timeToMinutes(selectedProvider.lunch_break_start) + Number(selectedProvider.lunch_break_minutes)) }
      : null;
    const allBusy = lunchWindow ? [...busyWindows, lunchWindow] : busyWindows;
    const slots = [];
    for (let m = startM; m + durationMin <= endM; m += step) {
      if (isToday && m <= nowM) continue;
      const slotEnd = m + durationMin;
      const busy = allBusy.some((w) => {
        const wStart = timeToMinutes(w.start_time);
        const wEnd = timeToMinutes(w.end_time);
        return m < wEnd && wStart < slotEnd;
      });
      if (!busy) slots.push(minutesToTime(m));
    }
    return slots;
  })();

  const backToServices = () => {
    setBookingService(null);
    setSelectedServiceIds([]);
    setBookingError("");
  };

  const openReviewsTab = () => {
    setProfileTab("reviews");
    if (selectedProvider && providerReviews.length === 0 && !loadingReviews) {
      setLoadingReviews(true);
      getProviderReviews(selectedProvider.id).then((data) => {
        setProviderReviews(data || []);
        setLoadingReviews(false);
      });
    }
  };

  const submitBooking = async (overrideCustomerId) => {
    const bookingCustomerId = overrideCustomerId || user?.id;
    if (!bookingCustomerId) { setBookingError("Please sign in again to book."); return; }
    if (!bookingForm.service_id || !bookingForm.date || !bookingForm.time) {
      setBookingError("Please choose a service, date, and time.");
      return;
    }
    const check = validate(bookingRequestSchema, {
      service_id: bookingForm.service_id,
      service_ids: bookingForm.service_ids && bookingForm.service_ids.length > 0 ? bookingForm.service_ids : undefined,
      date: bookingForm.date,
      time: bookingForm.time,
      notes: bookingForm.notes || null,
    });
    if (!check.ok) { setBookingError(check.message); return; }
    const service = (selectedProvider.services || []).find((s) => s.id === bookingForm.service_id);
    if (!service) { setBookingError("Please choose a service."); return; }

    // Multi-service checkout: service_ids carries the FULL selection (see
    // proceedToMultiServiceTime) — service/service_id above is only the
    // first one, used because create_booking_safe's signature takes a
    // single primary service. The combined price/duration/label for
    // everything the customer actually picked are computed here instead.
    const isMultiService = (bookingForm.service_ids || []).length > 1;
    const multiServices = isMultiService ? (selectedProvider.services || []).filter((s) => bookingForm.service_ids.includes(s.id)) : [service];
    const serviceLabel = isMultiService ? multiServices.map((s) => s.name).join(" + ") : service.name;
    const combinedDuration = multiServices.reduce((sum, s) => sum + (Number(s.duration_min) || 0), 0);

    setSubmittingBooking(true);
    setBookingError("");

    const total = isMultiService ? multiServices.reduce((sum, s) => sum + (Number(s.price) || 0), 0) : (Number(service.price) || 0);
    const dpPct = selectedProvider.downpayment_required ? (selectedProvider.downpayment_pct || 50) : 0;
    // VIP requests skip the deposit flow entirely — it's a premium
    // off-hours request, not the normal reserve-a-slot flow a deposit
    // protects.
    const downpayment = (!bookingForm.isVip && dpPct) ? Math.round(total * dpPct) / 100 : null;
    const order_number = `VB-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    let created = null;
    try {
      created = bookingForm.isVip
        ? await createVipBooking({
            order_number,
            customer_id: bookingCustomerId,
            provider_id: selectedProvider.id,
            service_id: service.id,
            booking_date: bookingForm.date,
            booking_time: bookingForm.time,
            notes: bookingForm.notes ? bookingForm.notes.trim() : null,
          })
        : await createBookingSafe({
            order_number,
            customer_id: bookingCustomerId,
            provider_id: selectedProvider.id,
            service_id: service.id,
            booking_date: bookingForm.date,
            booking_time: bookingForm.time,
            total_amount: total,
            downpayment_amount: downpayment,
            notes: bookingForm.notes ? bookingForm.notes.trim() : null,
          });
    } catch (err) {
      setSubmittingBooking(false);
      if (err?.code === "SLOT_TAKEN") {
        setBookingError("Sorry, that time was just taken by another customer. Please pick a different slot.");
        // Refresh so the now-taken slot disappears from the picker.
        getProviderBusyWindows(selectedProvider.id, bookingForm.date).then((w) => setBusyWindows(w || []));
        setBookingForm((f) => ({ ...f, time: "" }));
      } else if (err?.code === "RATE_LIMITED") {
        setBookingError("You've sent a few booking requests in a short time. Please wait a bit before trying again.");
      } else if (err?.code === "MAINTENANCE_MODE") {
        setBookingError("New bookings are temporarily paused for maintenance. Please try again shortly.");
      } else if (err?.code === "STARTER_LIMIT_REACHED") {
        setBookingError(`${selectedProvider?.business_name || "This provider"} has reached their booking limit for this month. Please check back next month, or message them directly to arrange your appointment.`);
      } else if (err?.code === "NOT_VIP_MEMBER") {
        setBookingError("Your VaiBook VIP membership isn't active. Check Settings to renew it, then try again.");
      } else if (err?.code === "VIP_NOT_OFFERED") {
        setBookingError(`${selectedProvider?.business_name || "This provider"} isn't accepting VIP requests right now.`);
      } else {
        setBookingError("Something went wrong sending your request. Please try again.");
      }
      return;
    }

    if (created && isMultiService) {
      // Attach the full service list + combined duration now that the
      // primary booking exists — see attachBookingServices' comment for why
      // this is a separate call rather than something create_booking_safe
      // does in one shot. A conflict here means the combined duration
      // doesn't actually fit (a race with another booking, or the picked
      // slot was only ever valid for the single primary service) — safest
      // is to undo the booking outright rather than leave a confirmed/
      // pending row that doesn't reflect what the customer actually paid a
      // deposit for.
      try {
        await attachBookingServices(created.id, bookingForm.service_ids, combinedDuration);
      } catch (err) {
        await cancelBooking(created.id);
        setSubmittingBooking(false);
        setBookingError("That combined appointment time is no longer available. Please pick another time.");
        getProviderBusyWindows(selectedProvider.id, bookingForm.date).then((w) => setBusyWindows(w || []));
        setBookingForm((f) => ({ ...f, time: "" }));
        return;
      }
    }

    setSubmittingBooking(false);

    if (created) {
      // For a VIP request, total_amount (service price + the provider's
      // VIP add-on) is computed server-side, not the plain service price
      // used above for a normal booking's downpayment math.
      const finalTotal = Number(created.total_amount) || total;
      const whenLabel = `${formatBookingDate(bookingForm.date)} at ${formatBookingTime(bookingForm.time)}`;
      if (selectedProvider.user_id) {
        await createNotification({
          user_id: selectedProvider.user_id,
          title: bookingForm.isVip ? "New VIP booking request" : "New booking request",
          body: `${user?.full_name || guestCheckoutForm.name || "A customer"} requested ${serviceLabel} on ${whenLabel}${bookingForm.isVip ? " (VIP — outside your normal hours)" : ""}.`,
          type: "booking_requested",
          booking_id: created.id,
        });
      }
      // A provider who isn't sitting in the app had no way of knowing a
      // request had come in. The address is resolved server-side for this
      // one booking (and only if they still want these emails) rather than
      // being published on every provider's public profile row.
      const providerEmail = await getProviderNotifyEmail(created.id);
      if (providerEmail) {
        await sendBookingEmail({
          to: providerEmail,
          subject: `New${bookingForm.isVip ? " VIP" : ""} booking request — ${serviceLabel}, ${whenLabel}`,
          html: `<p>Hi ${selectedProvider.business_name || "there"},</p><p><strong>${user?.full_name || guestCheckoutForm.name || "A customer"}</strong> just requested <strong>${serviceLabel}</strong> for <strong>${whenLabel}</strong> (BZ$${finalTotal.toFixed(2)})${bookingForm.isVip ? " — this is a VIP request, outside your normal working hours" : ""}.</p>${bookingForm.notes ? `<p>Their note: "${bookingForm.notes.trim()}"</p>` : ""}<p>Open VaiBook to accept or decline it. You can turn these emails off under Settings → Notifications.</p>`,
        });
      }
      setSelectedProvider(null);
      setBookingService(null);
      setSelectedServiceIds([]);
      await loadBookings();
      setTab("bookings");
      setBookingTab("upcoming");
    } else {
      setBookingError("Something went wrong sending your request. Please try again.");
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm("Cancel this booking?")) return;
    setCancellingId(bookingId);
    const cancelled = bookings.find((b) => b.id === bookingId);
    await cancelBooking(bookingId);
    if (cancelled?.provider_profiles?.user_id) {
      await createNotification({
        user_id: cancelled.provider_profiles.user_id,
        title: "Booking cancelled",
        body: `${user?.full_name || "A customer"} cancelled their booking${cancelled?.services?.name ? ` for ${cancelled.services.name}` : ""} on ${new Date(cancelled.booking_date).toLocaleDateString()}.`,
        type: "booking_cancelled",
        booking_id: bookingId,
      });
    }
    await loadBookings();
    setCancellingId(null);
  };

  const handleConfirmReschedule = async (booking) => {
    setRescheduleRespondingId(booking.id);
    setRescheduleRespondError((e) => ({ ...e, [booking.id]: "" }));
    try {
      await confirmBookingReschedule(booking.id);
    } catch (err) {
      setRescheduleRespondingId(null);
      setRescheduleRespondError((e) => ({
        ...e,
        [booking.id]: err.code === "SLOT_TAKEN"
          ? "That time just got taken. Ask your provider to propose another one."
          : "Couldn't confirm that time. Please try again.",
      }));
      return;
    }
    if (booking.provider_profiles?.user_id) {
      await createNotification({
        user_id: booking.provider_profiles.user_id,
        title: "Customer confirmed the new time",
        body: `${user?.full_name || "The customer"} confirmed the new time for their ${booking.services?.name || "appointment"}.`,
        type: "booking_reschedule_confirmed",
        booking_id: booking.id,
      });
    }
    await loadBookings();
    setRescheduleRespondingId(null);
  };

  const handleDeclineReschedule = async (booking) => {
    setRescheduleRespondingId(booking.id);
    setRescheduleRespondError((e) => ({ ...e, [booking.id]: "" }));
    try {
      await declineBookingReschedule(booking.id);
    } catch (err) {
      setRescheduleRespondingId(null);
      setRescheduleRespondError((e) => ({ ...e, [booking.id]: "Couldn't do that. Please try again." }));
      return;
    }
    if (booking.provider_profiles?.user_id) {
      await createNotification({
        user_id: booking.provider_profiles.user_id,
        title: "Customer kept the original time",
        body: `${user?.full_name || "The customer"} would like to keep the original time for their ${booking.services?.name || "appointment"}.`,
        type: "booking_reschedule_declined",
        booking_id: booking.id,
      });
    }
    await loadBookings();
    setRescheduleRespondingId(null);
  };

  const handleUploadReceipt = async (bookingId, file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      window.alert("That file is larger than 10MB. Please upload a smaller photo or PDF.");
      return;
    }
    setUploadingReceiptId(bookingId);
    const savedPath = await uploadReceipt(bookingId, file);
    if (!savedPath) {
      // Used to notify the provider and carry on as if it worked, leaving
      // the customer sure they'd sent proof they hadn't.
      setUploadingReceiptId(null);
      window.alert("That receipt didn't upload. Please check your connection and try again.");
      return;
    }
    const uploadedBooking = bookings.find((b) => b.id === bookingId);
    if (uploadedBooking?.provider_profiles?.user_id) {
      await createNotification({
        user_id: uploadedBooking.provider_profiles.user_id,
        title: "Deposit receipt uploaded",
        body: `${user?.full_name || "A customer"} uploaded a receipt for ${uploadedBooking.services?.name || "their booking"}. Confirm payment to finalize.`,
        type: "receipt_uploaded",
        booking_id: bookingId,
      });
    }
    await loadBookings();
    setUploadingReceiptId(null);
  };

  // Passing the existing review pre-fills the form for editing instead of
  // starting a fresh one — see submitBookingReview below, which routes to
  // an UPDATE when there's an existing review id to edit.
  const openReview = (bookingId, existingReview) => {
    setReviewingId(bookingId);
    setReviewForm(existingReview
      ? { rating: existingReview.rating, comment: existingReview.comment || "" }
      : { rating: 5, comment: "" });
  };

  const submitBookingReview = async (booking) => {
    if (!user?.id) return;
    // A provider account is also a customer account, so nothing stopped
    // someone booking their own business, completing it and reviewing it.
    if (booking.provider_profiles?.user_id && booking.provider_profiles.user_id === user.id) {
      window.alert("You can't review your own business.");
      return;
    }
    const existing = booking.reviews && booking.reviews[0];
    setSubmittingReview(true);
    try {
      const saved = existing
        ? await updateReview(existing.id, {
            rating: reviewForm.rating,
            comment: reviewForm.comment ? reviewForm.comment.trim() : null,
          })
        : await submitReview({
            booking_id: booking.id,
            customer_id: user.id,
            provider_id: booking.provider_id,
            rating: reviewForm.rating,
            comment: reviewForm.comment ? reviewForm.comment.trim() : null,
          });
      if (!saved) {
        window.alert("That review didn't save. If you've already reviewed this booking, it's there under the booking. Otherwise please try again.");
        setSubmittingReview(false);
        return;
      }
      if (!existing && booking.provider_profiles?.user_id) {
        await createNotification({
          user_id: booking.provider_profiles.user_id,
          title: "New review received",
          body: `${user?.full_name || "A customer"} left a ${reviewForm.rating}-star review${reviewForm.comment ? `: "${reviewForm.comment.trim().slice(0, 80)}"` : "."}`,
          type: "review",
          booking_id: booking.id,
        });
      }
    } catch (err) {
      if (err?.code === "REVIEW_LOCKED") {
        window.alert("This review has already gone public, so it can't be edited anymore.");
      } else {
        window.alert("That review didn't save. Please try again.");
      }
      setSubmittingReview(false);
      return;
    }
    await loadBookings();
    setReviewingId(null);
    setSubmittingReview(false);
  };

  const upcomingBookings = bookings.filter((b) => ["pending", "awaiting_payment", "confirmed"].includes(b.status));
  const completedBookings = bookings.filter((b) => b.status === "completed");
  const rejectedBookings = bookings.filter((b) => b.status === "rejected" || b.status === "cancelled");
  const bookingNameFn = (b) => b.provider_profiles?.business_name || b.services?.name || "";
  const visibleBookings = filterAndSortBookings(
    bookingTab === "upcoming" ? upcomingBookings : bookingTab === "completed" ? completedBookings : rejectedBookings,
    bookingSearch,
    bookingSort,
    bookingNameFn
  );
  const totalSpent = completedBookings.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);
  const reviewedBookings = bookings.filter((b) => b.reviews && b.reviews.length > 0);

  const filteredProviders = providers.filter((p) => {
    if (!providerSearch.trim()) return true;
    const q = providerSearch.trim().toLowerCase();
    const nameMatch = (p.business_name || "").toLowerCase().includes(q);
    const categoryMatch = (p.service_type || "").toLowerCase().includes(q);
    const serviceMatch = (p.services || []).some((s) => (s.name || "").toLowerCase().includes(q));
    return nameMatch || categoryMatch || serviceMatch;
  });

  const browseSuggestions = buildSuggestions(providers, providerSearch);
  const selectBrowseSuggestion = (s) => {
    setProviderSearch(s.label);
    setShowBrowseSuggestions(false);
  };

  const providerRating = (p) => {
    const ratings = (p.reviews || []).map((r) => r.rating).filter((r) => r != null);
    if (!ratings.length) return null;
    return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
  };

  const providerFromPrice = (p) => {
    const prices = (p.services || []).filter((s) => s.is_active !== false).map((s) => Number(s.price) || 0);
    if (!prices.length) return null;
    return Math.min(...prices);
  };

  return (
    <div className="portal-layout">
      <aside className="sidebar">
        <div style={{ padding: "0 16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 20 }}>
          <span className="nav-logo" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, color: "var(--near-white)", display: "inline-flex", alignItems: "center", gap: 7 }}><VaiBookMark size={19} />vai<span style={{ color: "var(--lime)" }}>book</span></span>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>Customer portal</div>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-label">Menu</div>
          {sideItems.map(item => (
            <div key={item.id} className={`sidebar-item ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>
              <span className="icon">{item.icon}</span>{item.label}
            </div>
          ))}
        </div>
        <div className="sidebar-avatar">
          <div className="avatar">{initial}</div>
          <div className="avatar-info">
            <div className="name">{displayName}</div>
            <div className="role" style={{ cursor: "pointer" }} onClick={onSignOut}>Sign out</div>
          </div>
        </div>
      </aside>

      <main className="portal-content">
        {tab === "home" && (
          <>
            <div className="portal-header">
              <h2>Good to see you, {firstName} 👋</h2>
              <p>{upcomingBookings.length === 0 ? "No upcoming bookings right now." : `You have ${upcomingBookings.length} upcoming booking${upcomingBookings.length === 1 ? "" : "s"}.`}</p>
            </div>
            <div className="metric-grid">
              <div className="metric"><div className="metric-label">Total bookings</div><div className="metric-value">{bookings.length}</div><div className="metric-sub">All time</div></div>
              <div className="metric"><div className="metric-label">Total spent</div><div className="metric-value" style={{ color: "var(--clay)" }}>BZ${totalSpent.toFixed(0)}</div><div className="metric-sub">{completedBookings.length} completed</div></div>
              <div className="metric"><div className="metric-label">Providers found</div><div className="metric-value">{providers.length}</div><div className="metric-sub">Active on VaiBook</div></div>
              <div className="metric"><div className="metric-label">Reviews left</div><div className="metric-value">{reviewedBookings.length}</div><div className="metric-sub">Of {completedBookings.length} completed</div></div>
            </div>
            <div className="grid-2">
              <div className="card">
                <div className="card-title">Upcoming bookings</div>
                {upcomingBookings.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{loadingBookings ? "Loading..." : "Nothing booked yet — find a provider to get started."}</p>}
                {upcomingBookings.slice(0, 2).map((b) => (
                  <div className="booking-item" key={b.id}>
                    <div className={`booking-dot ${bookingStatusClass(b.status)}`}></div>
                    <div className="booking-info">
                      <div className="title">{b.services?.name || "Service"}</div>
                      <div className="meta">{b.provider_profiles?.business_name || "Provider"} · {formatBookingWhen(b)}</div>
                    </div>
                    <div>
                      <span className="booking-amount">BZ${b.total_amount ?? "—"}</span>
                      <span className={`status-pill ${bookingStatusClass(b.status)}`}>{statusLabel(b.status)}</span>
                    </div>
                  </div>
                ))}
                <button className="btn-sm forest" style={{ marginTop: 16 }} onClick={() => setTab("bookings")}>View all bookings</button>
              </div>
              <div className="card">
                <div className="card-title">Quick book</div>
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>What do you need today, {firstName}?</p>
                <div className="search-bar" style={{ padding: "10px 16px", marginBottom: 16 }}>
                  <span className="search-icon">🔍</span>
                  <input
                    placeholder="Search barbers, nail techs, spas..."
                    value={providerSearch}
                    onChange={e => { setProviderSearch(e.target.value); setShowBrowseSuggestions(true); }}
                    onFocus={() => setShowBrowseSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowBrowseSuggestions(false), 150)}
                    onKeyDown={e => { if (e.key === "Enter") { setShowBrowseSuggestions(false); setTab("browse"); } }}
                  />
                  {showBrowseSuggestions && browseSuggestions.length > 0 && (
                    <div className="suggestions-dropdown">
                      {browseSuggestions.map((s) => (
                        <div key={s.key} className="suggestion-item" onMouseDown={() => { selectBrowseSuggestion(s); setTab("browse"); }}>
                          <span className="suggestion-icon">{s.icon}</span>
                          <span className="suggestion-label">{s.label}</span>
                          <span className="suggestion-sub">{s.sublabel}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {SERVICES.slice(0,4).map((s, i) => (
                    <div key={i} onClick={() => setTab("browse")} style={{ background: "var(--sand)", borderRadius: 8, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "background .2s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#E8EDE0"}
                      onMouseLeave={e => e.currentTarget.style.background = "var(--sand)"}
                    >
                      <span style={{ fontSize: 22 }}>{s.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--forest)" }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "browse" && (
          <>
            <div className="portal-header"><h2>Find a service</h2><p>Browse verified providers across Belize.</p></div>
            <div className="search-bar" id="main-search-bar">
              <span className="search-icon">🔍</span>
              <input
                placeholder="Search barbers, nail techs, spas, or 'haircut'..."
                value={providerSearch}
                onChange={e => { setProviderSearch(e.target.value); setShowBrowseSuggestions(true); }}
                onFocus={() => setShowBrowseSuggestions(true)}
                onBlur={() => setTimeout(() => setShowBrowseSuggestions(false), 150)}
              />
              {showBrowseSuggestions && browseSuggestions.length > 0 && (
                <div className="suggestions-dropdown">
                  {browseSuggestions.map((s) => (
                    <div key={s.key} className="suggestion-item" onMouseDown={() => selectBrowseSuggestion(s)}>
                      <span className="suggestion-icon">{s.icon}</span>
                      <span className="suggestion-label">{s.label}</span>
                      <span className="suggestion-sub">{s.sublabel}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {["All", ...DISTRICTS].map((f, i) => (
                <button key={i} className="btn-sm" style={{ background: f === districtFilter ? "var(--forest)" : "white", color: f === districtFilter ? "white" : "var(--muted)", border: "1px solid var(--border)" }} onClick={() => setDistrictFilter(f)}>{f}</button>
              ))}
            </div>
            {loadingProviders && <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading providers...</p>}
            {!loadingProviders && filteredProviders.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>No providers found. Try a different district or search term.</p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 16 }}>
              {filteredProviders.map((p) => {
                const rating = providerRating(p);
                const fromPrice = providerFromPrice(p);
                return (
                  <div className="provider-card" key={p.id} style={{ cursor: "pointer", position: "relative" }} onClick={() => openBooking(p)}>
                    <button
                      onClick={(e) => toggleFavorite(e, p.id)}
                      aria-label={favoriteIds.has(p.id) ? "Remove from favorites" : "Add to favorites"}
                      style={{ position: "absolute", top: 10, right: 10, zIndex: 2, width: 30, height: 30, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15, boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}
                    >
                      {favoriteIds.has(p.id) ? "❤️" : "🤍"}
                    </button>
                    {p.portfolio_urls && p.portfolio_urls.length > 0 ? (
                      <div className="provider-card-img" style={{ background: `center/cover no-repeat url(${p.portfolio_urls[0]})` }} />
                    ) : (
                      <div className="provider-card-img" style={{ background: "#E8F5EF" }}>{iconForServiceType(p.service_type)}</div>
                    )}
                    <div className="provider-card-body">
                      <h4>{p.business_name}{(() => { const badge = planBadge(p); return badge && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: badge.color, background: badge.bg, padding: "2px 7px", borderRadius: 5, verticalAlign: "middle" }}>{badge.label}</span>; })()}{p.is_featured && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "var(--forest)", background: "var(--sand)", padding: "2px 7px", borderRadius: 5, verticalAlign: "middle" }}>⭐ Featured</span>}</h4>
                      <div className="trade">{p.service_type} · {p.district}</div>
                      <div className="stars">{rating ? <StarRating value={rating} /> : "No reviews yet "}<span style={{ color: "var(--muted)", fontSize: 12 }}>{rating ? ` ${rating} (${p.reviews.length})` : ""}</span></div>
                      {p.whatsapp && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>📞 {p.whatsapp}</div>}
                      <div className="provider-card-footer">
                        <span className="price-tag">{fromPrice != null ? `From BZ$${fromPrice}` : "Contact for pricing"}</span>
                        {p.downpayment_required ? <span style={{ fontSize: 11, color: "var(--muted)" }}>{p.downpayment_pct || 50}% deposit</span> : <span className="avail-badge">No deposit</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "favorites" && (
          <>
            <div className="portal-header"><h2>Favorites</h2><p>Providers you've saved for next time.</p></div>
            {loadingFavorites && <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading...</p>}
            {!loadingFavorites && favoriteProviders.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>No favorites yet — tap the heart on any provider to save them here.</p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 16 }}>
              {favoriteProviders.map((p) => {
                const rating = providerRating(p);
                const fromPrice = providerFromPrice(p);
                return (
                  <div className="provider-card" key={p.id} style={{ cursor: "pointer", position: "relative" }} onClick={() => openBooking(p)}>
                    <button
                      onClick={(e) => toggleFavorite(e, p.id)}
                      aria-label="Remove from favorites"
                      style={{ position: "absolute", top: 10, right: 10, zIndex: 2, width: 30, height: 30, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15, boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}
                    >
                      ❤️
                    </button>
                    {p.portfolio_urls && p.portfolio_urls.length > 0 ? (
                      <div className="provider-card-img" style={{ background: `center/cover no-repeat url(${p.portfolio_urls[0]})` }} />
                    ) : (
                      <div className="provider-card-img" style={{ background: "#E8F5EF" }}>{iconForServiceType(p.service_type)}</div>
                    )}
                    <div className="provider-card-body">
                      <h4>{p.business_name}{(() => { const badge = planBadge(p); return badge && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: badge.color, background: badge.bg, padding: "2px 7px", borderRadius: 5, verticalAlign: "middle" }}>{badge.label}</span>; })()}{p.is_featured && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "var(--forest)", background: "var(--sand)", padding: "2px 7px", borderRadius: 5, verticalAlign: "middle" }}>⭐ Featured</span>}</h4>
                      <div className="trade">{p.service_type} · {p.district}</div>
                      <div className="stars">{rating ? <StarRating value={rating} /> : "No reviews yet "}<span style={{ color: "var(--muted)", fontSize: 12 }}>{rating ? ` ${rating} (${p.reviews.length})` : ""}</span></div>
                      <div className="provider-card-footer">
                        <span className="price-tag">{fromPrice != null ? `From BZ$${fromPrice}` : "Contact for pricing"}</span>
                        {p.downpayment_required ? <span style={{ fontSize: 11, color: "var(--muted)" }}>{p.downpayment_pct || 50}% deposit</span> : <span className="avail-badge">No deposit</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "bookings" && (
          <>
            <div className="portal-header"><h2>My bookings</h2><p>Track all your appointments in one place.</p></div>
            <div className="tab-row">
              {["Upcoming", "Completed", "Cancelled"].map((t, i) => (
                <div key={i} className={`tab ${bookingTab === t.toLowerCase() ? "active" : ""}`} onClick={() => setBookingTab(t.toLowerCase())}>{t}</div>
              ))}
            </div>
            <div className="form-row" style={{ marginBottom: 12 }}>
              <div className="input-group" style={{ flex: 2 }}>
                <input placeholder="Search by provider or service name..." value={bookingSearch} onChange={e => setBookingSearch(e.target.value)} />
              </div>
              <div className="input-group" style={{ flex: 1 }}>
                <select value={bookingSort} onChange={e => setBookingSort(e.target.value)}>
                  <option value="newest">Recently booked: newest first</option>
                  <option value="oldest">Recently booked: oldest first</option>
                </select>
              </div>
            </div>
            <div className="card">
              {loadingBookings && <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>Loading...</p>}
              {!loadingBookings && visibleBookings.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{bookingSearch.trim() ? "No bookings match your search." : "Nothing here yet."}</p>
              )}
              {visibleBookings.map((b) => {
                const hasReview = b.reviews && b.reviews.length > 0;
                // Low-star reviews are held privately for 48 hours before
                // going public (see supabase_review_privacy.sql) — while
                // held, the customer can still edit it in place.
                const reviewIsHeld = hasReview && b.reviews[0].hold_until && new Date(b.reviews[0].hold_until) > new Date();
                return (
                  <div key={b.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                    <div className="booking-item" style={{ padding: 0, border: "none" }}>
                      <div className={`booking-dot ${bookingStatusClass(b.status)}`}></div>
                      <div className="booking-info">
                        <div className="title">
                          {b.services?.name || "Service"}
                          {b.is_vip && (
                            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "var(--forest)", background: "var(--lime)", padding: "2px 7px", borderRadius: 5, verticalAlign: "middle" }}>⚡ VIP</span>
                          )}
                        </div>
                        <div className="meta">
                          {b.provider_profiles?.business_name || "Provider"} · {formatBookingWhen(b)}
                          {unreadByBooking[b.id] > 0 && (
                            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "var(--forest)", background: "var(--lime)", padding: "2px 7px", borderRadius: 999 }}>
                              💬 {unreadByBooking[b.id]} new
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="booking-amount">BZ${b.total_amount ?? "—"}</span>
                        <span className={`status-pill ${bookingStatusClass(b.status)}`}>{statusLabel(b.status)}</span>
                      </div>
                    </div>

                    {b.status === "rejected" && b.provider_message && (
                      <p style={{ fontSize: 12, color: "#B91C1C", marginTop: 6 }}>Provider's note: {b.provider_message}</p>
                    )}
                    {b.status !== "rejected" && b.provider_message && (
                      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Provider's note: {b.provider_message}</p>
                    )}

                    {["cancelled", "rejected"].includes(b.status) && b.booking_refunds && b.booking_refunds.length > 0 && (
                      <div style={{ marginTop: 8, background: "#E7F5EC", borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--forest)" }}>💸 You were refunded BZ${b.booking_refunds[0].amount}</div>
                        {b.booking_refunds[0].note && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{b.booking_refunds[0].note}</p>}
                        {b.booking_refunds[0].receipt_url && <a href="#" onClick={(e) => { e.preventDefault(); openPrivateFile(b.booking_refunds[0].receipt_url); }} style={{ fontSize: 12 }}>View proof</a>}
                      </div>
                    )}

                    {b.pending_reschedule_date && (
                      <div style={{ marginTop: 8, background: "var(--sand)", borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--forest)", marginBottom: 4 }}>New time proposed</div>
                        <p style={{ fontSize: 12.5, color: "var(--dark-text)", marginBottom: 10 }}>
                          {b.provider_profiles?.business_name || "Your provider"} would like to move this to <strong>{formatBookingWhen({ booking_date: b.pending_reschedule_date, booking_time: b.pending_reschedule_time })}</strong>. Your original time stays booked until you decide.
                        </p>
                        {rescheduleRespondError[b.id] && <p style={{ color: "#B91C1C", fontSize: 12, marginBottom: 8 }}>{rescheduleRespondError[b.id]}</p>}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn-sm lime" disabled={rescheduleRespondingId === b.id} onClick={() => handleConfirmReschedule(b)}>
                            {rescheduleRespondingId === b.id ? "Confirming..." : "Confirm new time"}
                          </button>
                          <button className="btn-sm ghost" disabled={rescheduleRespondingId === b.id} onClick={() => handleDeclineReschedule(b)}>
                            Keep original time
                          </button>
                        </div>
                      </div>
                    )}

                    {["pending", "awaiting_payment", "confirmed"].includes(b.status) && (
                      <button
                        className="btn-sm ghost"
                        style={{ marginTop: 8, color: "#B91C1C" }}
                        disabled={cancellingId === b.id}
                        onClick={() => handleCancelBooking(b.id)}
                      >
                        {cancellingId === b.id ? "Cancelling..." : "Cancel booking"}
                      </button>
                    )}

                    {b.status === "awaiting_payment" && b.payments && b.payments.find((p) => p.payment_status === "pending") && (
                      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                        Payment status: <strong style={{ color: "var(--forest)" }}>pending</strong> — BZ${b.payments.find((p) => p.payment_status === "pending").amount}
                      </p>
                    )}
                    {b.status === "awaiting_payment" && b.payment_status === "unpaid" && (
                      <div style={{ marginTop: 8 }}>
                        {(b.provider_profiles?.payment_methods && b.provider_profiles.payment_methods.length > 0) ? (
                          <div style={{ background: "var(--sand)", borderRadius: 10, padding: "10px 12px", marginBottom: 10, fontSize: 12.5, lineHeight: 1.6 }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>Send BZ${b.downpayment_amount ?? "—"} to one of:</div>
                            {b.provider_profiles.payment_methods.map((m) => (
                              <div key={m.id} style={{ marginBottom: 6 }}>
                                <div>{m.type === "wallet" ? "📱" : "🏦"} {m.name}{m.account_name ? ` — ${m.account_name}` : ""}{m.account_number ? ` — ${m.account_number}` : ""}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>The provider hasn't added their payment details yet — reach out to them directly to arrange the deposit.</p>
                        )}
                        <label className="btn-sm lime" style={{ cursor: "pointer" }}>
                          {uploadingReceiptId === b.id ? "Uploading..." : "Upload deposit receipt"}
                          <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} disabled={uploadingReceiptId === b.id} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handleUploadReceipt(b.id, f); }} />
                        </label>
                      </div>
                    )}
                    {b.status === "awaiting_payment" && b.payment_status === "receipt_uploaded" && (
                      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Receipt submitted — waiting for the provider to confirm payment.</p>
                    )}

                    {b.status === "confirmed" && b.provider_profiles?.payment_methods && b.provider_profiles.payment_methods.length > 0 && (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ fontSize: 12, color: "var(--forest)", cursor: "pointer", fontWeight: 600 }}>Payment details</summary>
                        <div style={{ background: "var(--sand)", borderRadius: 10, padding: "10px 12px", marginTop: 8, fontSize: 12.5, lineHeight: 1.6 }}>
                          {b.provider_profiles.payment_methods.map((m) => (
                            <div key={m.id} style={{ marginBottom: 6 }}>
                              <div style={{ fontWeight: 700 }}>{m.type === "wallet" ? "📱" : "🏦"} {m.name}</div>
                              {m.account_name && <div>Account name: {m.account_name}</div>}
                              {m.account_number && <div>{m.type === "wallet" ? "Wallet number" : "Account number"}: {m.account_number}</div>}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {b.status === "completed" && (
                      <button
                        className="btn-sm ghost"
                        style={{ marginTop: 8, marginRight: 8, fontSize: 12 }}
                        onClick={() => printInvoice(buildInvoiceHtml({
                          orderNumber: b.order_number,
                          bookingDate: b.booking_date,
                          bookingTime: b.booking_time,
                          serviceName: b.services?.name || "Service",
                          amount: b.total_amount,
                          depositAmount: b.downpayment_amount,
                          providerName: b.provider_profiles?.business_name,
                          providerTaxId: b.provider_profiles?.tax_id,
                          providerDistrict: b.provider_profiles?.district,
                          providerWhatsapp: b.provider_profiles?.whatsapp,
                          customerName: user?.full_name || session?.user?.email,
                          customerEmail: user?.email || session?.user?.email,
                        }))}
                      >
                        🧾 Print / download invoice
                      </button>
                    )}
                    {b.status === "completed" && !hasReview && reviewingId !== b.id && (
                      <button className="btn-sm ghost" style={{ marginTop: 8 }} onClick={() => openReview(b.id, null)}>Leave a review</button>
                    )}
                    {b.status === "completed" && reviewingId === b.id && (
                      <div style={{ marginTop: 10, background: "var(--sand)", borderRadius: 8, padding: 12 }}>
                        <div className="star-picker">
                          {[1,2,3,4,5].map(n => (
                            <span key={n} className={n <= reviewForm.rating ? "on" : ""} onClick={() => setReviewForm(f => ({ ...f, rating: n }))}>★</span>
                          ))}
                        </div>
                        <textarea placeholder="How was it?" value={reviewForm.comment} onChange={e => setReviewForm(f => ({ ...f, comment: e.target.value }))} style={{ width: "100%", minHeight: 60, marginBottom: 8 }} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn-sm forest" disabled={submittingReview} onClick={() => submitBookingReview(b)}>{submittingReview ? "Submitting..." : "Submit review"}</button>
                          <button className="btn-sm ghost" onClick={() => setReviewingId(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {b.status === "completed" && hasReview && reviewingId !== b.id && (
                      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                        You rated this {"★".repeat(b.reviews[0].rating)}{b.reviews[0].comment ? ` — "${b.reviews[0].comment}"` : ""}
                        {reviewIsHeld && (
                          <>
                            {" "}
                            <span style={{ color: "var(--forest)" }}>
                              — not public yet, so you can still change it until {new Date(b.reviews[0].hold_until).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
                            </span>{" "}
                            <button className="btn-sm ghost" style={{ marginLeft: 4, fontSize: 11, padding: "3px 8px" }} onClick={() => openReview(b.id, b.reviews[0])}>Edit review</button>
                          </>
                        )}
                      </p>
                    )}

                    {["pending", "awaiting_payment", "confirmed"].includes(b.status) && (
                      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                        Need a different time? Message them below — they can move this booking to a new slot without you
                        having to cancel and rebook.
                      </p>
                    )}

                    {["pending", "awaiting_payment", "confirmed", "completed"].includes(b.status) && (
                      <BookingChat
                        bookingId={b.id}
                        currentUserId={user?.id}
                        currentRole="customer"
                        recipientUserId={b.provider_profiles?.user_id}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "payments" && (
          <>
            <div className="portal-header"><h2>Payments</h2><p>All your transactions and receipts.</p></div>
            <div className="metric-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div className="metric"><div className="metric-label">Total spent</div><div className="metric-value" style={{ color: "var(--clay)" }}>BZ${totalSpent.toFixed(0)}</div><div className="metric-sub">All time</div></div>
              <div className="metric"><div className="metric-label">Awaiting payment</div><div className="metric-value">{bookings.filter(b => b.status === "awaiting_payment").length}</div><div className="metric-sub">Bookings</div></div>
              <div className="metric"><div className="metric-label">Completed</div><div className="metric-value">{completedBookings.length}</div><div className="metric-sub">Bookings</div></div>
            </div>
            <div className="card">
              <div className="card-title">Recent transactions</div>
              {bookings.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{loadingBookings ? "Loading..." : "No transactions yet."}</p>}
              {bookings.map((b) => (
                <div className="booking-item" key={b.id}>
                  <div style={{ width: 36, height: 36, background: "var(--sand)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💳</div>
                  <div className="booking-info"><div className="title">{b.services?.name || "Service"}</div><div className="meta">{b.provider_profiles?.business_name || "Provider"}{b.receipt_url ? " · " : ""}{b.receipt_url && <a href="#" onClick={(e) => { e.preventDefault(); openPrivateFile(b.receipt_url); }}>receipt</a>}</div></div>
                  <div>
                    <span className="booking-amount">BZ${b.total_amount ?? "—"}</span>
                    <span className={`status-pill ${bookingStatusClass(b.status)}`}>{b.payment_status === "paid" ? "paid" : statusLabel(b.status)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {(tab === "reviews" || tab === "settings") && (
          <>
            <div className="portal-header"><h2>{tab === "reviews" ? "My reviews" : "Settings"}</h2></div>
            <div className="card" style={{ maxWidth: 480 }}>
              {tab === "settings" ? (
                <>
                  <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    Profile
                    {!editingProfile && (
                      <span style={{ color: "var(--forest)", fontWeight: 600, fontSize: 13, cursor: "pointer" }} onClick={startEditProfile}>Edit</span>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 20px" }}>
                    <div className="profile-avatar-circle">{getInitials(user?.full_name)}</div>
                  </div>
                  <div className="input-group">
                    <label>First name</label>
                    <input
                      value={profileForm.firstName}
                      disabled={!editingProfile}
                      onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label>Last name</label>
                    <input
                      value={profileForm.lastName}
                      disabled={!editingProfile}
                      onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label>Phone number</label>
                    <input
                      value={profileForm.phone}
                      disabled={!editingProfile}
                      placeholder="+501 600 0000"
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="input-group"><label>Email</label><input defaultValue={user?.email || session?.user?.email || ""} disabled /></div>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>Your email is managed through your Google sign-in.</p>
                  {editingProfile && (
                    <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                      <button className="btn-primary" onClick={saveProfile} disabled={savingProfile}>
                        {savingProfile ? "Saving..." : "Save"}
                      </button>
                      <button className="btn-ghost" onClick={cancelEditProfile} disabled={savingProfile}>Cancel</button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="card-title">Reviews you've left</div>
                  {reviewedBookings.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>No reviews yet. Leave one after a completed booking.</p>}
                  {reviewedBookings.map((b) => (
                    <div key={b.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{b.provider_profiles?.business_name || "Provider"}</div>
                      <div className="stars" style={{ marginBottom: 6 }}>{"★".repeat(b.reviews[0].rating)}</div>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>{b.reviews[0].comment}</div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {tab === "settings" && (
              <div className="card" style={{ maxWidth: 480, marginTop: 20 }}>
                <div className="card-title">Notifications</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Push notifications on this device</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Get an alert the instant a provider responds to or cancels your booking, even with VaiBook closed.
                    </div>
                  </div>
                  {pushEnabled ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--forest)", flexShrink: 0 }}>✓ On</span>
                  ) : (
                    <button className="btn-sm forest" style={{ flexShrink: 0 }} onClick={enablePushNotifications} disabled={subscribingPush}>
                      {subscribingPush ? "Turning on..." : "Turn on"}
                    </button>
                  )}
                </div>
                {pushError && <p style={{ fontSize: 12, color: "#B91C1C", marginTop: 4 }}>{pushError}</p>}
              </div>
            )}

            {tab === "settings" && (() => {
              const pendingVip = vipPayments.find((p) => p.status === "pending");
              return (
                <div className="card" style={{ maxWidth: 480, marginTop: 20 }}>
                  <div className="card-title">{VIP_MEMBERSHIP.label}</div>
                  {isVipMember ? (
                    <>
                      <p style={{ fontSize: 13, color: "var(--forest)", fontWeight: 600, marginBottom: 4 }}>✓ Active</p>
                      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                        Valid through {new Date(user.vip_expires_at).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}. You can request an appointment outside normal hours with any participating Pro/Business provider — look for "⚡ VIP request" next to a service on their profile.
                      </p>
                    </>
                  ) : (
                    <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
                      VIP members can request a last-minute or after-hours appointment with participating providers — the provider sets the add-on price and still has to accept the request, but you're not stuck waiting for their next open slot. BZ${VIP_MEMBERSHIP.monthly}/month.
                    </p>
                  )}

                  {pendingVip ? (
                    <p style={{ fontSize: 13, color: "#B45309", background: "#FEF3C7", borderRadius: 8, padding: "10px 14px" }}>
                      Your payment from {new Date(pendingVip.submitted_at).toLocaleDateString()} is awaiting confirmation.
                    </p>
                  ) : (
                    <div style={{ paddingTop: isVipMember ? 12 : 0, borderTop: isVipMember ? "1px solid var(--border)" : "none" }}>
                      <p style={{ fontSize: 13, marginBottom: 10 }}>
                        {isVipMember ? `Renew for another 30 days: send BZ$${VIP_MEMBERSHIP.monthly}, then upload the receipt.` : `Send BZ$${VIP_MEMBERSHIP.monthly} by bank transfer or mobile wallet, then upload the receipt — admin confirms it and you're VIP for 30 days.`}
                      </p>
                      <div className="input-group">
                        <label>Receipt (image or PDF)</label>
                        <input key={vipPaymentFileKey} type="file" accept="image/*,application/pdf" onChange={e => setVipPaymentForm({ receipt: e.target.files?.[0] || null })} />
                      </div>
                      {vipPaymentError && <p style={{ fontSize: 12, color: "#B91C1C", marginBottom: 8 }}>{vipPaymentError}</p>}
                      <button className="btn-sm forest" disabled={submittingVipPayment} onClick={submitVipMembershipPayment}>
                        {submittingVipPayment ? "Uploading..." : isVipMember ? "Submit renewal payment" : "Submit payment"}
                      </button>
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 12 }}>
                    Just paid and don't see it reflected yet? <span style={{ color: "var(--forest)", fontWeight: 600, cursor: "pointer" }} onClick={refreshVipStatus}>{refreshingVipStatus ? "Checking..." : "Refresh status"}</span>
                  </p>
                </div>
              );
            })()}
          </>
        )}
      </main>

      {selectedProvider && (() => {
        const photos = selectedProvider.portfolio_urls || [];
        const rating = providerRating(selectedProvider);
        const openStatus = getOpenStatus(providerHours);
        const hoursRows = DAY_NAMES.map((day, i) => {
          const h = providerHours.find((x) => x.day_of_week === i);
          return { day, i, isToday: i === new Date().getDay(), text: h && h.is_open && h.start_time && h.end_time ? `${formatTimeLabel(h.start_time)} – ${formatTimeLabel(h.end_time)}` : "Closed" };
        });
        return (
          <div className="modal-overlay" onClick={() => setSelectedProvider(null)}>
            <div className="modal-panel profile-panel" onClick={(e) => e.stopPropagation()}>
              <div className="profile-scroll">
                <span className="modal-close" onClick={() => setSelectedProvider(null)}>✕ Close</span>

                <div className="profile-header-row">
                  <div className="profile-name-row">
                    <h2>{selectedProvider.business_name}</h2>
                    <button
                      className="profile-icon-btn"
                      onClick={() => shareProvider(selectedProvider)}
                      aria-label="Share this business"
                      title={providerLinkCopied ? "Link copied" : "Share"}
                    >
                      {providerLinkCopied ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" /><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /></svg>
                      )}
                    </button>
                    <button
                      className="profile-icon-btn"
                      onClick={(e) => toggleFavorite(e, selectedProvider.id)}
                      aria-label={favoriteIds.has(selectedProvider.id) ? "Remove from favorites" : "Add to favorites"}
                    >
                      <svg viewBox="0 0 24 24" fill={favoriteIds.has(selectedProvider.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={favoriteIds.has(selectedProvider.id) ? "heart-filled" : ""}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>
                    </button>
                  </div>
                </div>
                <div className="profile-meta">
                  {rating ? (
                    <span className="stars"><StarRating value={rating} size={15} /> {rating} <span style={{ color: "var(--muted)" }}>({selectedProvider.reviews.length})</span></span>
                  ) : <span>No reviews yet</span>}
                  <span className="dot">·</span>
                  <span className={openStatus.open ? "open-txt" : "closed-txt"}>{openStatus.label}</span>
                  <span className="dot">·</span>
                  <span>{selectedProvider.service_type}</span>
                  <span className="dot">·</span>
                  <span>{selectedProvider.district}</span>
                  {selectedProvider.latitude != null && selectedProvider.longitude != null && (
                    <>
                      <span className="dot">·</span>
                      <a href={directionsUrl(selectedProvider.latitude, selectedProvider.longitude)} target="_blank" rel="noreferrer">Get directions</a>
                    </>
                  )}
                </div>

                {/* Booking-in-progress hides the gallery, loyalty banner, tab
                    switcher and sidebar below — a customer who has already
                    picked a service shouldn't be re-tempted to browse photos
                    or tab away mid-flow. This is purely presentational: none
                    of the booking logic (bookingForm/submitBooking/slot
                    computation) changed, only what's rendered around it. */}
                {!bookingService && (
                  <div className="profile-gallery" style={{ gridTemplateColumns: photos.length > 1 ? "2fr 1fr" : "1fr" }}>
                    {photos.length === 0 ? (
                      <div className="gallery-hero gallery-fallback">{iconForServiceType(selectedProvider.service_type)}</div>
                    ) : (
                      <>
                        <div className="gallery-hero" style={{ backgroundImage: `url(${photos[0]})` }} onClick={() => setLightboxUrl(photos[0])} />
                        {photos.length > 1 && (
                          <div className="gallery-side">
                            {photos.slice(1, 3).map((url, i) => (
                              <div key={url} className="gallery-side-img" style={{ backgroundImage: `url(${url})` }} onClick={() => (photos.length > 3 && i === 1 ? setProfileTab("portfolio") : setLightboxUrl(url))}>
                                {i === 1 && photos.length > 3 && (
                                  <button className="gallery-more-btn" onClick={(e) => { e.stopPropagation(); setProfileTab("portfolio"); }}>See all photos</button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {!bookingService && selectedProvider.loyalty_enabled && (
                  <div style={{ background: "var(--sand)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
                    {(() => {
                      const threshold = Number(selectedProvider.loyalty_reward_threshold) || 0;
                      const balance = myLoyalty?.points_balance || 0;
                      const reward = selectedProvider.loyalty_reward_description || "a reward";
                      if (!user) return <>⭐ Loyalty program: earn points here toward <strong>{reward}</strong> — sign in to start earning.</>;
                      if (threshold > 0 && balance >= threshold) return <>⭐ You've earned <strong>{reward}</strong>! Mention it at your next visit.</>;
                      return <>⭐ You have <strong>{balance}</strong> point{balance === 1 ? "" : "s"} here{threshold > 0 ? ` — ${threshold - balance} more for ${reward}` : ""}.</>;
                    })()}
                  </div>
                )}

                <div className="profile-body" style={bookingService ? { gridTemplateColumns: "1fr" } : undefined}>
                  <div className="profile-main">
                    {!bookingService && (
                      <div className="tab-row">
                        {[
                          { id: "services", label: "Services" },
                          { id: "portfolio", label: "Portfolio" },
                          { id: "reviews", label: "Reviews" },
                          { id: "about", label: "About" },
                        ].map((t) => (
                          <div key={t.id} className={`tab ${profileTab === t.id ? "active" : ""}`} onClick={() => (t.id === "reviews" ? openReviewsTab() : setProfileTab(t.id))}>
                            {t.label}
                          </div>
                        ))}
                      </div>
                    )}

                    {profileTab === "services" && (
                      bookingService ? (
                        <div style={{ maxWidth: 440, margin: "0 auto" }}>
                          <div onClick={backToServices} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--forest)", fontWeight: 700, cursor: "pointer", marginBottom: 20 }}>
                            <span style={{ fontSize: 16 }}>←</span> Back to services
                          </div>
                          <h3 style={{ fontSize: 20, fontWeight: 800, color: "var(--dark-text)", margin: "0 0 4px" }}>Pick a date &amp; time</h3>
                          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 18px" }}>at {selectedProvider.business_name}</p>
                          <div style={{ background: bookingForm.isVip ? "var(--lime)" : "var(--sand)", borderRadius: 10, padding: "14px 16px", marginBottom: 20, fontSize: 13 }}>
                            <strong>{bookingService.name}</strong> — BZ${bookingForm.isVip ? (Number(bookingService.price) + Number(selectedProvider.vip_surcharge || 0)).toFixed(2) : bookingService.price} · {bookingService.duration_min} min
                            {bookingForm.isVip && <div style={{ fontSize: 11, marginTop: 4 }}>⚡ VIP request — includes {selectedProvider.business_name}'s BZ${selectedProvider.vip_surcharge} off-hours add-on</div>}
                          </div>
                          <div className="input-group">
                            <label>Date</label>
                            <input type="date" min={localDateStr()} value={bookingForm.date} onChange={e => setBookingForm(f => ({ ...f, date: e.target.value, time: "" }))} style={{ padding: "13px 14px", fontSize: 15 }} />
                          </div>
                          {bookingForm.isVip ? (
                            <div className="input-group">
                              <label>Requested time</label>
                              <input type="time" value={bookingForm.time} onChange={e => setBookingForm(f => ({ ...f, time: e.target.value }))} />
                              <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>This is outside {selectedProvider.business_name}'s normal hours, so pick whatever time you actually need — they'll confirm directly with you.</p>
                            </div>
                          ) : (
                            <div className="input-group">
                              <label>Available times</label>
                              {loadingSlots ? (
                                <p style={{ fontSize: 12, color: "var(--muted)" }}>Checking live availability...</p>
                              ) : !providerHours.length ? (
                                <p style={{ fontSize: 12, color: "var(--muted)" }}>This provider hasn't set their working hours yet — try again later or send a note with your preferred time.</p>
                              ) : availableSlots.length === 0 ? (
                                <p style={{ fontSize: 12, color: "var(--clay)" }}>No open slots on this date. Please choose another day.</p>
                              ) : (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 9, maxHeight: 220, overflowY: "auto", paddingTop: 4 }}>
                                  {availableSlots.map((t) => (
                                    <button
                                      type="button"
                                      key={t}
                                      onClick={() => setBookingForm(f => ({ ...f, time: t }))}
                                      className="btn-sm"
                                      style={{
                                        padding: "11px 4px",
                                        fontSize: 13,
                                        fontWeight: 700,
                                        border: bookingForm.time === t ? "1.5px solid var(--forest)" : "1px solid var(--border, #ddd)",
                                        background: bookingForm.time === t ? "var(--forest)" : "#fff",
                                        color: bookingForm.time === t ? "#fff" : "var(--dark-text)",
                                        borderRadius: 10,
                                        cursor: "pointer",
                                      }}
                                    >
                                      {formatTimeLabel(t)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <div className="input-group"><label>Notes (optional)</label><textarea placeholder="Anything the provider should know?" value={bookingForm.notes} onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))} style={{ minHeight: 60 }} /></div>

                          {!bookingForm.isVip && selectedProvider.downpayment_required && (
                            <p style={{ fontSize: 12, color: "var(--clay)", marginBottom: 12 }}>This provider requires a {selectedProvider.downpayment_pct || 50}% deposit after they accept your booking.</p>
                          )}

                          {!user?.id && (
                            <div className="guest-checkout-fields">
                              <p className="guest-checkout-label">Your details</p>
                              <div className="input-group">
                                <label>Full name</label>
                                <input type="text" placeholder="Your full name" value={guestCheckoutForm.name} onChange={e => setGuestCheckoutForm(f => ({ ...f, name: e.target.value }))} />
                              </div>
                              <div className="input-group">
                                <label>Email address</label>
                                <input type="email" placeholder="you@example.com" value={guestCheckoutForm.email} onChange={e => setGuestCheckoutForm(f => ({ ...f, email: e.target.value }))} />
                              </div>
                              <div className="input-group">
                                <label>WhatsApp number <span className="optional-tag">(optional)</span></label>
                                <input type="tel" placeholder="+501 622 1234" value={guestCheckoutForm.whatsapp} onChange={e => setGuestCheckoutForm(f => ({ ...f, whatsapp: e.target.value }))} />
                              </div>
                              <p className="guest-checkout-note">We'll email you a 6-digit code to confirm it's really you — no password, no separate signup.</p>
                            </div>
                          )}

                          {bookingError && <p style={{ fontSize: 12, color: "#B91C1C", marginBottom: 12 }}>{bookingError}</p>}

                          <button
                            className="btn-sm forest"
                            style={{ width: "100%", padding: "15px 0", fontSize: 15, borderRadius: 12, marginTop: 4 }}
                            disabled={submittingBooking || sendingBookingOtp || (bookingForm.isVip && !bookingForm.time)}
                            onClick={async () => {
                              if (user?.id) { submitBooking(); return; }
                              const guestName = guestCheckoutForm.name.trim();
                              const guestEmail = guestCheckoutForm.email.trim().toLowerCase();
                              if (!guestName) { setBookingError("Please enter your full name."); return; }
                              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) { setBookingError("Please enter a valid email address."); return; }
                              setBookingError("");
                              setSendingBookingOtp(true);
                              const { error } = await sendEmailOtp(guestEmail, { full_name: guestName });
                              setSendingBookingOtp(false);
                              if (error) { setBookingError("Couldn't send the code. Please try again."); return; }
                              setShowEmailAuthModal(true);
                            }}
                          >
                            {submittingBooking ? "Sending request..." : sendingBookingOtp ? "Sending code..." : user?.id ? (bookingForm.isVip ? "Send VIP request" : "Request booking") : "Continue"}
                          </button>
                          <p className="checkout-liability-note">
                            VaiBook is a scheduling platform. All payments and deposits are direct transactions between the client and the business. Vai Technologies is not liable for disputes.
                          </p>

                          {showEmailAuthModal && (
                            <EmailAuthModal
                              email={guestCheckoutForm.email.trim().toLowerCase()}
                              onClose={() => setShowEmailAuthModal(false)}
                              onResend={() => sendEmailOtp(guestCheckoutForm.email.trim().toLowerCase(), { full_name: guestCheckoutForm.name.trim() })}
                              onVerified={async (data) => {
                                setShowEmailAuthModal(false);
                                const uid = data?.user?.id;
                                const whatsapp = guestCheckoutForm.whatsapp.trim();
                                if (whatsapp && uid) {
                                  updateUserProfile(uid, { whatsapp_number: whatsapp }).catch(() => {});
                                }
                                submitBooking(uid);
                              }}
                            />
                          )}
                        </div>
                      ) : (
                        (selectedProvider.services || []).filter(s => s.is_active !== false).length === 0 ? (
                          <p style={{ fontSize: 13, color: "var(--muted)" }}>This provider hasn't listed any services yet.</p>
                        ) : (
                          <div>
                            {isProviderVipEligible(selectedProvider) && (
                              <div style={{ background: "var(--lime)", borderRadius: 8, padding: "12px 14px", marginBottom: 14, fontSize: 13 }}>
                                {isVipMember ? (
                                  <>⚡ <strong>VIP appointments available</strong> — {selectedProvider.business_name} will take requests outside normal hours for a BZ${selectedProvider.vip_surcharge} add-on. Tap "VIP request" on any service below.</>
                                ) : (
                                  <>⚡ {selectedProvider.business_name} accepts VIP off-hours requests. <span style={{ fontWeight: 700 }}>Become a VaiBook VIP member</span> (see Settings) to unlock this.</>
                                )}
                              </div>
                            )}
                            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 4px" }}>Tap a service to add it — booking more than one? Add them all, then pick one time for the whole visit.</p>
                            {(selectedProvider.services || []).filter(s => s.is_active !== false).map(s => {
                              const active = selectedServiceIds.includes(s.id);
                              return (
                                <div key={s.id} className={`service-card ${active ? "active" : ""}`} onClick={() => toggleServiceSelect(s)}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <span className="service-card-check">✓</span>
                                    <div>
                                      <div className="service-card-name" style={{ fontWeight: 600, fontSize: 14, color: "var(--dark-text)" }}>{s.name}</div>
                                      <div className="service-card-meta" style={{ fontSize: 12, color: "var(--muted)" }}>{s.duration_min} min · BZ${s.price}</div>
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                                    <button
                                      className="btn-sm ghost"
                                      onClick={() => shareService(s)}
                                      aria-label={`Share ${s.name}`}
                                      title="Share this service"
                                    >
                                      {copiedServiceId === s.id ? "Link copied" : "📤 Share"}
                                    </button>
                                    {isProviderVipEligible(selectedProvider) && isVipMember && (
                                      <button className="btn-sm ghost" onClick={() => startVipBookingForService(s)}>⚡ VIP request</button>
                                    )}
                                    <button className="btn-sm forest" onClick={() => startBookingForService(s)}>Book</button>
                                  </div>
                                </div>
                              );
                            })}
                            {selectedServiceIds.length > 0 && (
                              <div className="multi-fab">
                                <div className="totals">
                                  <strong>BZ${multiTotalPrice.toFixed(2)} · {multiTotalDuration} min</strong>
                                  {selectedServicesList.length} service{selectedServicesList.length === 1 ? "" : "s"} selected
                                </div>
                                <button onClick={proceedToMultiServiceTime}>Next: Pick Time →</button>
                              </div>
                            )}
                          </div>
                        )
                      )
                    )}

                    {profileTab === "portfolio" && (
                      photos.length > 0 ? (
                        <div className="portfolio-grid">
                          {photos.map((url) => (
                            <img key={url} src={url} alt="Provider work" className="portfolio-thumb" loading="lazy" decoding="async" onClick={() => setLightboxUrl(url)} />
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: 13, color: "var(--muted)" }}>No portfolio photos yet.</p>
                      )
                    )}

                    {profileTab === "reviews" && (
                      loadingReviews ? (
                        <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading reviews...</p>
                      ) : providerReviews.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--muted)" }}>No reviews yet.</p>
                      ) : (
                        <div>
                          <div className="reviews-summary">
                            <span className="big-rating">{rating || "—"}</span>
                            <div>
                              {rating ? <StarRating value={rating} size={16} /> : null}
                              <div style={{ fontSize: 12, color: "var(--muted)" }}>{providerReviews.length} review{providerReviews.length === 1 ? "" : "s"}</div>
                            </div>
                          </div>
                          <div className="reviews-grid">
                            {providerReviews.map((r) => (
                              <div key={r.id} className="review-card">
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                  <strong style={{ fontSize: 13 }}>{r.users?.full_name || "Customer"}</strong>
                                  <span className="stars">{"★".repeat(r.rating || 0)}{"☆".repeat(5 - (r.rating || 0))}</span>
                                </div>
                                {r.comment && <p style={{ fontSize: 13, color: "var(--dark-text)", marginTop: 4 }}>{r.comment}</p>}
                                {r.created_at && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString()}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    )}

                    {profileTab === "about" && (
                      <div>
                        {selectedProvider.bio ? (
                          <p style={{ fontSize: 13, color: "var(--dark-text)", marginBottom: 20, lineHeight: 1.6 }}>{selectedProvider.bio}</p>
                        ) : (
                          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>This provider hasn't added a description yet.</p>
                        )}

                        {selectedProvider.latitude != null && selectedProvider.longitude != null && (
                          <div style={{ marginBottom: 22 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--forest)", marginBottom: 10 }}>Location</div>
                            <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", marginBottom: 8 }}>
                              <Suspense fallback={<MapLoadingFallback height={200} />}>
                                <ProviderMiniMap lat={selectedProvider.latitude} lng={selectedProvider.longitude} height={200} />
                              </Suspense>
                            </div>
                            <p style={{ fontSize: 13 }}>
                              {selectedProvider.location_label || `${selectedProvider.district}, Belize`}{" "}
                              <a href={directionsUrl(selectedProvider.latitude, selectedProvider.longitude)} target="_blank" rel="noreferrer" style={{ color: "var(--forest)", fontWeight: 600 }}>Get directions</a>
                            </p>
                          </div>
                        )}

                        <div style={{ marginBottom: 22 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--forest)", marginBottom: 10 }}>Opening times</div>
                          <div className="hours-list">
                            {hoursRows.map((h) => (
                              <div key={h.i} className={`hours-row ${h.isToday ? "today" : ""}`}>
                                <span>{h.day}</span>
                                <span>{h.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {selectedProvider.whatsapp && (
                          <a href={`https://wa.me/${selectedProvider.whatsapp.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", fontSize: 13, color: "var(--forest)", fontWeight: 600, background: "var(--sand)", borderRadius: 8, padding: "10px 14px" }}>📞 {selectedProvider.whatsapp}</a>
                        )}
                      </div>
                    )}
                  </div>

                  {!bookingService && (
                  <aside className="profile-sidebar">
                    <div className="profile-sidebar-card">
                      <h3>{selectedProvider.business_name}</h3>
                      <div className="stars" style={{ marginBottom: 4, display: "block" }}>
                        {rating ? <>{"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))} <span style={{ color: "var(--muted)", fontWeight: 400 }}>{rating} ({selectedProvider.reviews.length})</span></> : <span style={{ color: "var(--muted)" }}>No reviews yet</span>}
                      </div>
                      {(() => { const badge = planBadge(selectedProvider); return badge && <span className={`chip ${selectedProvider.plan === "business" ? "chip-plan-business" : "chip-plan-pro"}`} style={{ marginRight: selectedProvider.is_featured ? 6 : 0 }}>{badge.label}</span>; })()}
                      {selectedProvider.is_featured && <span className="chip chip-featured">⭐ Featured</span>}
                      <button className="btn-sm forest" style={{ width: "100%", padding: "13px 0", marginTop: 4 }} onClick={() => setProfileTab("services")}>Book now</button>

                      <div className="sidebar-row clickable" onClick={() => setHoursExpanded(v => !v)}>
                        <span>🕐 <span className={openStatus.open ? "open-txt" : "closed-txt"}>{openStatus.label}</span></span>
                        <span style={{ color: "var(--muted)" }}>{hoursExpanded ? "▲" : "▼"}</span>
                      </div>
                      {hoursExpanded && (
                        <div className="hours-list">
                          {hoursRows.map((h) => (
                            <div key={h.i} className={`hours-row ${h.isToday ? "today" : ""}`}>
                              <span>{h.day}</span>
                              <span>{h.text}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {(selectedProvider.district || selectedProvider.location_label) && (
                        <div className="sidebar-row">
                          <span>📍 {selectedProvider.location_label || `${selectedProvider.district}, Belize`}</span>
                        </div>
                      )}
                      {selectedProvider.latitude != null && selectedProvider.longitude != null && (
                        <a href={directionsUrl(selectedProvider.latitude, selectedProvider.longitude)} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--forest)", fontWeight: 600 }}>Get directions</a>
                      )}
                    </div>
                  </aside>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Provider work" decoding="async" />
        </div>
      )}
    </div>
  );
}

// ── STAFF PORTAL ─────────────────────────────────────────────────
// A cut-down portal for a staff member's own login (separate from the
// business owner's account) — see supabase_staff_accounts.sql. Shows
// only bookings assigned to them; everything else about the business
// (settings, pricing, billing, other staff, loyalty) stays owner-only,
// only reachable from the owner's own login via ProviderPortal.
function StaffPortal({ onNav, session, staffProfile, onSignOut }) {
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [bookingTab, setBookingTab] = useState("upcoming");
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingSort, setBookingSort] = useState("newest");
  const [busyId, setBusyId] = useState(null);

  const staffId = staffProfile?.id;

  const loadBookings = async () => {
    if (!staffId) return;
    setLoadingBookings(true);
    const data = await getStaffBookings(staffId);
    setBookings(data || []);
    setLoadingBookings(false);
  };

  useEffect(() => {
    loadBookings();
  }, [staffId]);

  const markDone = async (bookingId) => {
    setBusyId(bookingId);
    const finished = bookings.find((b) => b.id === bookingId);
    const updated = await updateBooking(bookingId, { status: "completed" });
    if (!updated) {
      setBusyId(null);
      window.alert("Couldn't mark that done. Please check your connection and try again.");
      return;
    }
    // Same business event as the owner marking it done, so the customer
    // gets the same "leave a review" prompt — before, bookings finished by
    // a staff member silently never asked for a review.
    if (finished?.customer_id) {
      await createNotification({
        user_id: finished.customer_id,
        title: "Booking complete",
        body: `Your ${finished.services?.name || "appointment"} with ${staffProfile?.provider_profiles?.business_name || "the provider"} is marked done. Leave a review to let others know how it went!`,
        type: "booking_completed",
        booking_id: bookingId,
      });
    }
    await loadBookings();
    setBusyId(null);
  };

  if (!session) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--forest)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 28, fontWeight: 800, color: "var(--near-white)", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <VaiBookMark size={30} />vai<span style={{ color: "var(--lime)" }}>book</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, marginBottom: 24 }}>Sign in with Google to access your schedule.</p>
          <button className="btn-lime" style={{ width: "100%", padding: "12px 0" }} onClick={() => onNav("home")}>← Back to site</button>
        </div>
      </div>
    );
  }

  const upcomingBookings = bookings.filter((b) => ["pending", "awaiting_payment", "confirmed"].includes(b.status));
  const completedBookings = bookings.filter((b) => b.status === "completed");
  const rejectedBookings = bookings.filter((b) => b.status === "rejected" || b.status === "cancelled");
  const bookingNameFn = (b) => b.users?.full_name || b.walkin_customer_name || "";
  const visibleBookings = filterAndSortBookings(
    bookingTab === "upcoming" ? upcomingBookings : bookingTab === "completed" ? completedBookings : rejectedBookings,
    bookingSearch,
    bookingSort,
    bookingNameFn
  );

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 20, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}><VaiBookMark size={20} />vai<span style={{ color: "var(--lime)" }}>book</span> <span style={{ fontWeight: 500, fontSize: 14, color: "var(--muted)" }}>staff</span></div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
            {staffProfile?.name} · {staffProfile?.provider_profiles?.business_name || "your team"}
          </p>
        </div>
        <a style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer" }} onClick={onSignOut}>Sign out</a>
      </div>

      <div className="portal-header"><h2>My bookings</h2><p>Only appointments assigned to you show up here.</p></div>
      <div className="tab-row">
        {["Upcoming", "Completed", "Cancelled"].map((t, i) => (
          <div key={i} className={`tab ${bookingTab === t.toLowerCase() ? "active" : ""}`} onClick={() => setBookingTab(t.toLowerCase())}>{t}</div>
        ))}
      </div>
      <div className="form-row" style={{ marginBottom: 12 }}>
        <div className="input-group" style={{ flex: 2 }}>
          <input placeholder="Search by client name..." value={bookingSearch} onChange={e => setBookingSearch(e.target.value)} />
        </div>
        <div className="input-group" style={{ flex: 1 }}>
          <select value={bookingSort} onChange={e => setBookingSort(e.target.value)}>
            <option value="newest">Recently booked: newest first</option>
            <option value="oldest">Recently booked: oldest first</option>
          </select>
        </div>
      </div>
      <div className="card">
        {loadingBookings && <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>Loading...</p>}
        {!loadingBookings && visibleBookings.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{bookingSearch.trim() ? "No bookings match your search." : "Nothing here yet."}</p>
        )}
        {visibleBookings.map((b) => (
          <div key={b.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
            <div className="booking-item" style={{ padding: 0, border: "none" }}>
              <div className={`booking-dot ${bookingStatusClass(b.status)}`}></div>
              <div className="booking-info">
                <div className="title">{b.services?.name || "Service"}</div>
                <div className="meta">
                  {b.users?.full_name || b.walkin_customer_name || "Customer"}
                  {" · "}{formatBookingWhen(b)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="booking-amount">BZ${b.total_amount ?? b.services?.price ?? "—"}</span>
                <span className={`status-pill ${bookingStatusClass(b.status)}`}>{statusLabel(b.status)}</span>
                {b.status === "confirmed" && (
                  <button className="btn-sm forest" disabled={busyId === b.id} onClick={() => markDone(b.id)}>{busyId === b.id ? "Saving..." : "Mark done"}</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PROVIDER PORTAL ─────────────────────────────────────────────
function ProviderPortal({ onNav, session, user, providerProfile, onSignIn, onSignOut, onProviderProfileUpdate }) {
  const [tab, setTab] = useState("dashboard");

  // Lets the top nav's account dropdown (with the same tools list as the
  // sidebar) switch tabs while already inside the provider portal,
  // since the sidebar itself is hidden on mobile.
  useEffect(() => {
    const onSetTab = (e) => { if (e.detail && e.detail.tab) setTab(e.detail.tab); };
    window.addEventListener("vaibook-set-portal-tab", onSetTab);
    return () => window.removeEventListener("vaibook-set-portal-tab", onSetTab);
  }, []);
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingSort, setBookingSort] = useState("newest");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);

  // Every hook in this component has to be declared up here, above the
  // "not signed in" / "no provider profile yet" early returns further
  // down — React requires the same number of hooks on every render, and
  // ledgerStart/ledgerEnd used to be declared *after* those returns, which
  // white-screens the portal the moment either condition flips while the
  // component stays mounted.
  const nowForState = new Date();
  const [ledgerStart, setLedgerStart] = useState(new Date(nowForState.getFullYear(), nowForState.getMonth(), 1).toISOString().slice(0, 10));
  const [ledgerEnd, setLedgerEnd] = useState(new Date(nowForState.getFullYear(), nowForState.getMonth() + 1, 0).toISOString().slice(0, 10));
  const [ledgerTaxRate, setLedgerTaxRate] = useState("");
  // Calendar month being viewed, as an offset from the current month.
  const [calOffset, setCalOffset] = useState(0);
  // The provider's own reviews.
  const [myReviews, setMyReviews] = useState([]);
  const [loadingMyReviews, setLoadingMyReviews] = useState(false);
  // Rescheduling an existing booking.
  const [reschedulingId, setReschedulingId] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: "", time: "" });
  const [savingReschedule, setSavingReschedule] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");
  // The one real notification preference (see supabase_audit_fixes.sql).
  const [emailOnNewBooking, setEmailOnNewBooking] = useState(true);
  const [savingNotifyPref, setSavingNotifyPref] = useState(false);
  // Not every provider takes walk-ins (some are appointment-only) — this
  // gates whether the dashboard's Walk-In button shows at all. Defaults to
  // true so existing providers see no change until they turn it off.
  const [acceptsWalkins, setAcceptsWalkins] = useState(true);
  const [savingWalkinPref, setSavingWalkinPref] = useState(false);
  const { pushEnabled, subscribingPush, pushError, enablePushNotifications } = usePushSubscription(user?.id);

  // Per-booking unread message counts, so a waiting message is visible from
  // the list instead of only after opening that booking's chat.
  const [unreadByBooking, setUnreadByBooking] = useState({});
  const loadUnreadMessages = async () => {
    if (!user?.id) return;
    const rows = await getUnreadBookingMessages(user.id);
    const map = {};
    (rows || []).forEach((r) => { map[r.booking_id] = (map[r.booking_id] || 0) + 1; });
    setUnreadByBooking(map);
  };
  useEffect(() => {
    loadUnreadMessages();
    const t = setInterval(loadUnreadMessages, 30000);
    return () => clearInterval(t);
  }, [user?.id]);
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [savingHours, setSavingHours] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [profileForm, setProfileForm] = useState({ business_name: "", bio: "", district: "", whatsapp: "", tax_id: "", is_featured: false });
  const [savingFeatured, setSavingFeatured] = useState(false);

  // Loyalty & rewards program (Business plan) — provider-configurable,
  // saved as its own small form rather than folded into profileForm so
  // toggling it on doesn't require touching every other profile field.
  const [loyaltyForm, setLoyaltyForm] = useState({ enabled: false, pointsPerDollar: 1, threshold: 100, description: "" });
  const [savingLoyalty, setSavingLoyalty] = useState(false);
  const [loyaltyCustomers, setLoyaltyCustomers] = useState([]);
  const [loadingLoyaltyCustomers, setLoadingLoyaltyCustomers] = useState(false);

  // VIP appointments (Pro/Business) — a single flat add-on price the
  // provider charges on top of whatever service a VIP member books,
  // for a time outside their normal working hours. A blank/zero value
  // means the provider hasn't opted in.
  const [vipSurchargeForm, setVipSurchargeForm] = useState("");
  const [savingVipSurcharge, setSavingVipSurcharge] = useState(false);
  const [redeemingId, setRedeemingId] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [mapPosition, setMapPosition] = useState(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [services, setServices] = useState([]);
  const [serviceForm, setServiceForm] = useState({ name: "", price: "", duration_min: 15 });
  const [savingService, setSavingService] = useState(false);
  const [respondingId, setRespondingId] = useState(null);
  const [responseType, setResponseType] = useState(null);
  const [responseMessage, setResponseMessage] = useState("");
  const [confirmingPaymentId, setConfirmingPaymentId] = useState(null);
  const [depositForm, setDepositForm] = useState({ downpayment_required: false, downpayment_pct: 50, auto_confirm_bookings: false });
  const [savingDeposit, setSavingDeposit] = useState(false);
  // Set-and-forget daily lunch break — lives only in Settings, never on the
  // main dashboard, since the whole point is the provider sets it once and
  // never has to think about it again (see availableSlots in CustomerPortal
  // for where this actually gets subtracted from the calendar every day).
  const [lunchForm, setLunchForm] = useState({ enabled: false, lunch_break_start: "13:00", lunch_break_minutes: 30 });
  const [savingLunch, setSavingLunch] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethodForm, setPaymentMethodForm] = useState({ type: "bank", name: "", account_name: "", account_number: "" });
  const [savingPaymentMethod, setSavingPaymentMethod] = useState(false);

  const providerId = providerProfile?.id;

  // ── 1-tap dashboard blocking (walk-in "panic button" + custom block) ──
  // A block is a standalone row in provider_blocks — never a fake booking —
  // that just gets merged into busy windows for the customer-facing slot
  // picker (see getProviderBusyWindows). Nothing here needs a confirmation
  // step: the whole point is a barber mid-haircut can kill the next slot in
  // one tap without touching a form.
  const [blocks, setBlocks] = useState([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [resumingNow, setResumingNow] = useState(false);
  // Full-screen QR (Your Shopfront card) and the Rebooking Radar's
  // check-in modal — both dashboard-only, no data of their own to load.
  const [showQrModal, setShowQrModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [copiedShopfrontLink, setCopiedShopfrontLink] = useState(false);
  // "Elite Welcome" launch graphic — the "you're live!" banner dismisses
  // permanently per provider via localStorage (no DB column for this; it's
  // a one-time nudge, not something worth a schema change to track).
  const [showLaunchGraphic, setShowLaunchGraphic] = useState(false);
  const [launchBannerDismissed, setLaunchBannerDismissed] = useState(true);
  useEffect(() => {
    if (!providerId) return;
    try {
      setLaunchBannerDismissed(localStorage.getItem(`vaibook_launch_graphic_seen_${providerId}`) === "1");
    } catch (e) {
      setLaunchBannerDismissed(false);
    }
  }, [providerId]);
  const dismissLaunchBanner = () => {
    setLaunchBannerDismissed(true);
    try { if (providerId) localStorage.setItem(`vaibook_launch_graphic_seen_${providerId}`, "1"); } catch (e) { /* localStorage unavailable — banner just won't persist as dismissed */ }
  };
  // TOP NAV REDESIGN — the persistent left sidebar is gone; these drive the
  // new top bar's mobile hamburger (Dashboard/Bookings/Clients) and the
  // avatar's grouped "everything else" dropdown, both closed by default.
  const [providerMobileNavOpen, setProviderMobileNavOpen] = useState(false);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [showBlockSheet, setShowBlockSheet] = useState(false);
  // "in15m" | "in30m" | "in1h" | "custom" — the bottom sheet asks "when
  // will you be back" and works out the end time from that, rather than
  // asking for a duration. blockSheetResumeAt is only used when mode is
  // "custom", as an <input type="time"> value ("HH:MM").
  const [blockSheetResumeMode, setBlockSheetResumeMode] = useState("in15m");
  const [blockSheetResumeAt, setBlockSheetResumeAt] = useState("");
  const [savingBlock, setSavingBlock] = useState(false);
  const [blockError, setBlockError] = useState("");

  // Forces a re-render every 30s purely so "is a block active right now"
  // (and the Resume Bookings Now button below) stays accurate as the clock
  // ticks past a block's end time, without needing any user action.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setClockTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const loadBlocks = async () => {
    if (!providerId) return;
    setLoadingBlocks(true);
    const data = await getProviderBlocks(providerId, localDateStr());
    setBlocks(data || []);
    setLoadingBlocks(false);
  };

  useEffect(() => {
    loadBlocks();
  }, [providerId]);

  // Builds a { block_date, start_time, end_time } window starting right now
  // and ending at `end` (a Date), for whichever resume-time option the
  // Custom Block sheet's submit picked.
  const buildBlockWindow = (end) => {
    const now = new Date();
    return { block_date: localDateStr(now), start_time: localTimeStr(now), end_time: localTimeStr(end) };
  };

  // The block (if any) whose window covers this exact moment, today — drives
  // the "Resume Bookings Now" button. provider_blocks has no end_date, so a
  // block never spans midnight; "today" is the only day worth checking.
  const activeBlock = blocks.find((bl) => {
    if (bl.block_date !== localDateStr()) return false;
    const nowT = localTimeStr();
    return nowT >= bl.start_time && nowT < bl.end_time;
  }) || null;

  const openBlockSheet = () => {
    setBlockSheetResumeMode("in15m");
    setBlockSheetResumeAt(localTimeStr(new Date(Date.now() + 60 * 60000)));
    setBlockError("");
    setShowBlockSheet(true);
  };
  const closeBlockSheet = () => setShowBlockSheet(false);

  // Works out the actual end-of-block Date from whichever resume option is
  // selected. Returns null if a custom time hasn't been picked yet.
  const resolveBlockSheetEnd = () => {
    const now = new Date();
    if (blockSheetResumeMode === "in15m") return new Date(now.getTime() + 15 * 60000);
    if (blockSheetResumeMode === "in30m") return new Date(now.getTime() + 30 * 60000);
    if (blockSheetResumeMode === "in1h") return new Date(now.getTime() + 60 * 60000);
    if (!blockSheetResumeAt) return null;
    const [h, m] = blockSheetResumeAt.split(":").map(Number);
    const end = new Date(now);
    end.setHours(h, m, 0, 0);
    return end;
  };

  const submitBlockSheet = async () => {
    if (!providerId) return;
    const end = resolveBlockSheetEnd();
    if (!end || end <= new Date()) {
      setBlockError("Pick a resume time later today.");
      return;
    }
    setSavingBlock(true);
    setBlockError("");
    const window_ = buildBlockWindow(end);
    // Custom Block is now the only pause/break entry point on the
    // dashboard — "walk-in" is a separate, dedicated revenue action (see
    // Walk-In above), so every block created here is just "away from the
    // business" and tagged 'break' (the provider_blocks CHECK constraint
    // only allows 'walkin' | 'break' — no schema change needed to drop the
    // now-pointless walk-in/break choice from the UI).
    const created = await insertProviderBlock({ provider_id: providerId, block_type: "break", ...window_ });
    setSavingBlock(false);
    if (!created) { setBlockError("Couldn't save that block. Please try again."); return; }
    setShowBlockSheet(false);
    await loadBlocks();
  };

  const removeBlock = async (blockId) => {
    if (!window.confirm("Remove this block? The time will open back up for booking.")) return;
    await deleteProviderBlock(blockId);
    await loadBlocks();
  };

  // "I'm Back" — resuming early is the whole point of this feature, so it's
  // one tap and no confirmation dialog, unlike manually removing a block
  // from the list above.
  const resumeBookingsNow = async () => {
    if (!activeBlock || resumingNow) return;
    setResumingNow(true);
    await deleteProviderBlock(activeBlock.id);
    await loadBlocks();
    setResumingNow(false);
  };

  // WALK-IN SALE (POS) — for a customer standing right in front of you,
  // paying now. Different from "+ Add appointment" below (which schedules
  // someone in for a date/time and leaves them "confirmed" until you mark
  // the job done later): this logs the sale as done immediately — tap
  // their service(s), submit, and it counts toward today's revenue on the
  // spot, no second "mark complete" step.
  const [showWalkInSheet, setShowWalkInSheet] = useState(false);
  const [walkInSaleServiceIds, setWalkInSaleServiceIds] = useState([]);
  const [savingWalkInSale, setSavingWalkInSale] = useState(false);
  const [walkInSaleError, setWalkInSaleError] = useState("");

  const openWalkInSheet = () => {
    setWalkInSaleServiceIds([]);
    setWalkInSaleError("");
    setShowWalkInSheet(true);
  };
  const closeWalkInSheet = () => setShowWalkInSheet(false);
  const toggleWalkInSaleService = (id) => {
    setWalkInSaleServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const activeServices = services.filter((s) => s.is_active !== false);
  const walkInSaleServices = activeServices.filter((s) => walkInSaleServiceIds.includes(s.id));
  const walkInSaleTotal = walkInSaleServices.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  const walkInSaleDuration = walkInSaleServices.reduce((sum, s) => sum + (Number(s.duration_min) || 0), 0);

  const submitWalkInSale = async () => {
    if (!providerId || walkInSaleServiceIds.length === 0 || savingWalkInSale) return;
    setSavingWalkInSale(true);
    setWalkInSaleError("");
    const now = new Date();
    const order_number = `VB-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    let created = null;
    try {
      created = await createWalkInBooking({
        order_number,
        provider_id: providerId,
        service_id: walkInSaleServiceIds[0],
        booking_date: localDateStr(now),
        booking_time: localTimeStr(now),
        customer_name: "Walk-in",
        customer_phone: null,
        notes: null,
      });
      if (created && walkInSaleServiceIds.length > 1) {
        await attachBookingServices(created.id, walkInSaleServiceIds, walkInSaleDuration);
      }
    } catch (err) {
      setSavingWalkInSale(false);
      if (err?.code === "RATE_LIMITED") {
        setWalkInSaleError("You've logged several sales in a short time. Please wait a few minutes and try again.");
      } else if (err?.code === "MAINTENANCE_MODE") {
        setWalkInSaleError("New bookings are temporarily paused for maintenance. Please try again shortly.");
      } else if (err?.code === "STARTER_LIMIT_REACHED") {
        setWalkInSaleError("You've reached the free Starter plan's 30 bookings/month limit. Upgrade to Pro under My plan & billing for unlimited bookings.");
      } else {
        setWalkInSaleError("Something went wrong logging this sale. Please try again.");
      }
      return;
    }
    if (!created) {
      setSavingWalkInSale(false);
      setWalkInSaleError("Something went wrong logging this sale. Please try again.");
      return;
    }
    // The customer is being served right now — count the revenue
    // immediately rather than waiting on a separate "mark complete" tap.
    // No notification fires for this: create_walkin_booking never sets a
    // customer_id, so there's no account to notify.
    await updateBookingStatus(created.id, "completed");
    setSavingWalkInSale(false);
    setShowWalkInSheet(false);
    await loadBookings();
  };

  const loadPaymentMethods = async () => {
    if (!providerId) return;
    const data = await getPaymentMethods(providerId);
    setPaymentMethods(data);
  };

  useEffect(() => {
    loadPaymentMethods();
  }, [providerId]);

  const loadBookings = async () => {
    if (!providerId) return;
    setLoadingBookings(true);
    const data = await getProviderBookings(providerId);
    setBookings(data || []);
    setLoadingBookings(false);
  };

  useEffect(() => {
    loadBookings();
  }, [providerId]);

  // Walk-in / "add appointment for someone" — for a client who calls or
  // asks in person and doesn't have (or want) a VaiBook account, like an
  // older customer. No sign-in required on their end.
  const [addingWalkIn, setAddingWalkIn] = useState(false);
  const [walkInForm, setWalkInForm] = useState({ service_id: "", date: "", time: "10:00", name: "", phone: "", notes: "" });
  const [savingWalkIn, setSavingWalkIn] = useState(false);
  const [walkInError, setWalkInError] = useState("");

  const openWalkInForm = () => {
    setWalkInForm({ service_id: services[0]?.id || "", date: "", time: "10:00", name: "", phone: "", notes: "" });
    setWalkInError("");
    setAddingWalkIn(true);
  };
  const closeWalkInForm = () => { setAddingWalkIn(false); setWalkInError(""); };

  const submitWalkIn = async () => {
    if (!walkInForm.service_id || !walkInForm.date || !walkInForm.time) {
      setWalkInError("Please choose a service, date, and time.");
      return;
    }
    if (!walkInForm.name.trim()) {
      setWalkInError("Please enter the client's name.");
      return;
    }
    setSavingWalkIn(true);
    setWalkInError("");

    // Walk-ins skipped every availability check, so a provider could put an
    // appointment straight on top of a customer's confirmed booking without
    // either of them being told. Warn first — but still allow it, since a
    // provider sometimes genuinely does double up on purpose.
    const walkInService = services.find((sv) => sv.id === walkInForm.service_id);
    const clash = bookings.find((b) => {
      if (!["pending", "awaiting_payment", "confirmed"].includes(b.status)) return false;
      if (String(b.booking_date).slice(0, 10) !== walkInForm.date) return false;
      const startA = String(walkInForm.time).slice(0, 5);
      const startB = String(b.booking_time || "").slice(0, 5);
      const toMin = (t) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
      const aStart = toMin(startA);
      const aEnd = aStart + (Number(walkInService?.duration_min) || 60);
      const bStart = toMin(startB);
      const bEnd = bStart + (Number(b.services?.duration_min) || 60);
      return aStart < bEnd && bStart < aEnd;
    });
    if (clash) {
      const who = clash.users?.full_name || clash.walkin_customer_name || "another client";
      if (!window.confirm(`That overlaps your ${formatBookingTime(clash.booking_time)} booking with ${who}. Add it anyway?`)) {
        setSavingWalkIn(false);
        return;
      }
    }

    const order_number = `VB-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    let created = null;
    try {
      created = await createWalkInBooking({
        order_number,
        provider_id: providerId,
        service_id: walkInForm.service_id,
        booking_date: walkInForm.date,
        booking_time: walkInForm.time,
        customer_name: walkInForm.name.trim(),
        customer_phone: walkInForm.phone.trim() || null,
        notes: walkInForm.notes.trim() || null,
      });
    } catch (err) {
      setSavingWalkIn(false);
      if (err?.code === "RATE_LIMITED") {
        setWalkInError("You've added several appointments in a short time. Please wait a few minutes and try again.");
      } else if (err?.code === "MAINTENANCE_MODE") {
        setWalkInError("New bookings are temporarily paused for maintenance. Please try again shortly.");
      } else if (err?.code === "STARTER_LIMIT_REACHED") {
        setWalkInError("You've reached the free Starter plan's 30 bookings/month limit. Upgrade to Pro under My plan & billing for unlimited bookings.");
      } else {
        setWalkInError("Something went wrong saving this appointment. Please try again.");
      }
      return;
    }
    setSavingWalkIn(false);
    if (created) {
      await loadBookings();
      setAddingWalkIn(false);
    } else {
      setWalkInError("Something went wrong saving this appointment. Please try again.");
    }
  };

  // Refund proof — VaiBook doesn't process payments itself, so a refund
  // is the provider sending money back to the customer directly; this
  // just records proof of it on the specific cancelled/rejected booking.
  const [refundingBookingId, setRefundingBookingId] = useState(null);
  const [refundForm, setRefundForm] = useState({ amount: "", receipt: null, note: "" });
  const [refundFileKey, setRefundFileKey] = useState(0);
  const [savingRefund, setSavingRefund] = useState(false);
  const [refundError, setRefundError] = useState("");

  const openRefundForm = (booking) => {
    // If the customer only ever paid a deposit, that's what there is to
    // refund — prefilling the full price made a double-value refund one
    // click away, and refund records can't be edited afterwards.
    const paidDeposit = booking.payment_status === "paid" || booking.payment_status === "receipt_uploaded";
    const suggested = paidDeposit && booking.downpayment_amount
      ? booking.downpayment_amount
      : (booking.downpayment_amount || booking.total_amount || "");
    setRefundForm({ amount: suggested, receipt: null, note: "" });
    setRefundError("");
    setRefundingBookingId(booking.id);
  };
  const closeRefundForm = () => { setRefundingBookingId(null); setRefundError(""); };

  const submitRefund = async (bookingId) => {
    if (!refundForm.receipt) { setRefundError("Please attach a screenshot or receipt of the refund."); return; }
    if (!refundForm.amount || Number(refundForm.amount) <= 0) { setRefundError("Please enter the amount refunded."); return; }
    setSavingRefund(true);
    setRefundError("");
    const ok = await submitBookingRefund(bookingId, providerId, refundForm.receipt, {
      amount: Number(refundForm.amount),
      note: refundForm.note.trim() || null,
    });
    setSavingRefund(false);
    if (ok) {
      setRefundFileKey((k) => k + 1);
      await loadBookings();
      setRefundingBookingId(null);
    } else {
      setRefundError("Something went wrong uploading that. Please try again.");
    }
  };

  // Plan & billing — the provider's own VaiBook subscription payment,
  // separate from anything a customer pays for a booking.
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ periodLabel: "", receipt: null });
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  // Which plan this payment is for. Providers couldn't change plan from
  // inside the portal at all before — every "View plans" button just
  // dropped them on a screen that showed the plan they already had.
  const [payingForPlan, setPayingForPlan] = useState("");
  // Bumping this key remounts the file input so it stops showing the name
  // of a file that's already been submitted.
  const [paymentFileKey, setPaymentFileKey] = useState(0);

  const loadPayments = async () => {
    if (!providerId) return;
    setLoadingPayments(true);
    const data = await getMyProviderPayments(providerId);
    setPayments(data || []);
    setLoadingPayments(false);
  };

  useEffect(() => {
    loadPayments();
    // Default the period label to the current month whenever the tab's
    // form is fresh (e.g. after a submit resets it).
    setPaymentForm((f) => (f.periodLabel ? f : { ...f, periodLabel: new Date().toLocaleDateString([], { month: "long", year: "numeric" }) }));
  }, [providerId]);

  const submitPayment = async () => {
    if (!paymentForm.receipt) { setPaymentError("Please attach a receipt image or PDF."); return; }
    if (!paymentForm.periodLabel.trim()) { setPaymentError("Please say which period this payment covers."); return; }
    const plan = PLANS.find((p) => p.id === (payingForPlan || providerProfile?.plan || "starter"));
    if (!plan || plan.monthly <= 0) { setPaymentError("Pick the plan you're paying for first."); return; }
    setSubmittingPayment(true);
    setPaymentError("");
    const ok = await submitProviderPayment(providerId, paymentForm.receipt, {
      plan: plan.id,
      amount: plan.monthly,
      periodLabel: paymentForm.periodLabel.trim(),
    });
    setSubmittingPayment(false);
    if (ok) {
      setPaymentForm({ periodLabel: "", receipt: null });
      setPaymentFileKey((k) => k + 1);
      await loadPayments();
    } else {
      setPaymentError("Something went wrong uploading that. Please try again.");
    }
  };

  // Staff seats (Business plan) — owner-managed, no separate staff
  // logins. See supabase_provider_staff.sql.
  const [staff, setStaff] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPhone, setNewStaffPhone] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [staffFilter, setStaffFilter] = useState("all");
  const [editingStaffEmailId, setEditingStaffEmailId] = useState(null);
  const [editStaffEmailValue, setEditStaffEmailValue] = useState("");
  const isBusinessPlan = (providerProfile?.plan || "starter") === "business";
  // Loyalty & rewards and VIP appointments are both Pro-and-above (staff
  // seats and featured placement stay Business-only).
  const isProOrAbove = (providerProfile?.plan || "starter") !== "starter";

  const loadStaff = async () => {
    if (!providerId) return;
    setLoadingStaff(true);
    const data = await getProviderStaff(providerId);
    setStaff(data || []);
    setLoadingStaff(false);
  };

  useEffect(() => {
    loadStaff();
  }, [providerId]);

  const addStaff = async () => {
    if (!providerId || !newStaffName.trim()) { setStaffError("Enter a name."); return; }
    if (!newStaffEmail.trim()) { setStaffError("Enter the email they'll sign in with — that's how they get their own login."); return; }
    setSavingStaff(true);
    setStaffError("");
    const created = await addProviderStaff(providerId, { name: newStaffName.trim(), phone: newStaffPhone.trim(), email: newStaffEmail.trim() });
    setSavingStaff(false);
    if (created) {
      setNewStaffName("");
      setNewStaffPhone("");
      setNewStaffEmail("");
      await loadStaff();
    } else {
      setStaffError("Couldn't add that staff member. Please try again.");
    }
  };

  const toggleStaffActive = async (member) => {
    await updateProviderStaff(member.id, { is_active: !member.is_active });
    await loadStaff();
  };

  const startEditStaffEmail = (member) => {
    setEditingStaffEmailId(member.id);
    setEditStaffEmailValue(member.email || "");
  };

  const saveStaffEmail = async (member) => {
    if (!editStaffEmailValue.trim()) return;
    await updateProviderStaff(member.id, { email: editStaffEmailValue.trim() });
    setEditingStaffEmailId(null);
    await loadStaff();
  };

  const removeStaff = async (member) => {
    if (!window.confirm(`Remove ${member.name}? Past bookings stay on record, just unassigned.`)) return;
    await deleteProviderStaff(member.id);
    await loadStaff();
  };

  const assignBookingStaff = async (bookingId, staffId) => {
    await updateBooking(bookingId, { staff_id: staffId || null });
    await loadBookings();
  };

  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [loadingTrend, setLoadingTrend] = useState(false);

  const loadMonthlyTrend = async () => {
    if (!providerId) return;
    setLoadingTrend(true);
    const data = await getProviderMonthlyTrend(6);
    setMonthlyTrend(data || []);
    setLoadingTrend(false);
  };

  useEffect(() => {
    loadMonthlyTrend();
  }, [providerId]);

  useEffect(() => {
    (async () => {
      if (!providerId) return;
      const wh = await getWorkingHours(providerId);
      if (wh && wh.length) {
        setHours(DAY_NAMES.map((day, i) => {
          const match = wh.find(w => w.day_of_week === i);
          return match
            ? { day, day_of_week: i, is_open: !!match.is_open, start_time: match.start_time || "08:00", end_time: match.end_time || "18:00" }
            : { day, day_of_week: i, is_open: false, start_time: "08:00", end_time: "18:00" };
        }));
      }
    })();
  }, [providerId]);

  useEffect(() => {
    if (providerProfile) {
      setProfileForm({
        business_name: providerProfile.business_name || "",
        bio: providerProfile.bio || "",
        district: providerProfile.district || "",
        whatsapp: providerProfile.whatsapp || "",
        tax_id: providerProfile.tax_id || "",
        is_featured: !!providerProfile.is_featured,
      });
      setLoyaltyForm({
        enabled: !!providerProfile.loyalty_enabled,
        pointsPerDollar: providerProfile.loyalty_points_per_dollar ?? 1,
        threshold: providerProfile.loyalty_reward_threshold ?? 100,
        description: providerProfile.loyalty_reward_description || "",
      });
      setVipSurchargeForm(providerProfile.vip_surcharge != null ? String(providerProfile.vip_surcharge) : "");
      setPhotos(providerProfile.portfolio_urls || []);
      setServices(providerProfile.services || []);
      if (providerProfile.latitude != null && providerProfile.longitude != null) {
        setMapPosition([providerProfile.latitude, providerProfile.longitude]);
      }
      setLocationLabel(providerProfile.location_label || "");
      setDepositForm({
        downpayment_required: !!providerProfile.downpayment_required,
        downpayment_pct: providerProfile.downpayment_pct || 50,
        auto_confirm_bookings: !!providerProfile.auto_confirm_bookings,
      });
      setLunchForm({
        enabled: Number(providerProfile.lunch_break_minutes) > 0,
        lunch_break_start: providerProfile.lunch_break_start ? String(providerProfile.lunch_break_start).slice(0, 5) : "13:00",
        lunch_break_minutes: providerProfile.lunch_break_minutes || 30,
      });
      setEmailOnNewBooking(providerProfile.notify_email_new_booking !== false);
      setAcceptsWalkins(providerProfile.accepts_walkins !== false);
    }
  }, [providerProfile]);

  const act = async (id, status) => {
    const target = bookings.find((b) => b.id === id);
    // Cancelling and marking a no-show both end a booking the provider
    // already accepted, so both ask first — there's no undo.
    if (status === "cancelled" && !window.confirm("Cancel this booking? The customer will be notified, and the time slot is freed up. If they already paid a deposit, record the refund afterwards.")) return;
    if (status === "no_show" && !window.confirm("Mark this customer as a no-show? It frees the slot and keeps the booking out of your completion rate as a completed job.")) return;

    setBusyId(id);
    const updated = await updateBookingStatus(id, status);
    if (!updated) {
      setBusyId(null);
      window.alert("Couldn't update that booking. Please check your connection and try again.");
      return;
    }

    if (status === "completed" && target?.customer_id) {
      await createNotification({
        user_id: target.customer_id,
        title: "Booking complete",
        body: `Your ${target.services?.name || "appointment"} with ${providerProfile?.business_name || "the provider"} is marked done. Leave a review to let others know how it went!`,
        type: "booking_completed",
        booking_id: id,
      });
    }
    if (status === "cancelled" && target?.customer_id) {
      await createNotification({
        user_id: target.customer_id,
        title: "Booking cancelled",
        body: `${providerProfile?.business_name || "The provider"} had to cancel your ${target.services?.name || "appointment"} on ${formatBookingWhen(target)}. Get in touch with them to rebook.`,
        type: "booking_cancelled_by_provider",
        booking_id: id,
      });
      if (target.users?.email) {
        // Same "#book-<provider id>" deep link used for QR codes/share
        // links — lands the customer straight back on this provider's
        // public booking page so rescheduling is a single tap, not a
        // "go find them again" chore right after bad news.
        const rebookUrl = `${window.location.origin}/#book-${target.provider_id}`;
        await sendBookingEmail({
          to: target.users.email,
          subject: `Your booking with ${providerProfile?.business_name || "your provider"} was cancelled`,
          html: `<p>Hi ${target.users?.full_name || "there"},</p><p>${providerProfile?.business_name || "Your provider"} had to cancel your <strong>${target.services?.name || "appointment"}</strong> on <strong>${formatBookingWhen(target)}</strong>.</p>` +
            `<p style="text-align:center;margin:24px 0;"><a href="${rebookUrl}" style="background:#0D3D2E;color:#F5EFE0;padding:12px 28px;border-radius:100px;text-decoration:none;font-weight:700;display:inline-block;">Reschedule now</a></p>` +
            `<p style="font-size:13px;color:#5b6b62;">Or copy this link: ${rebookUrl}</p>`,
        });
      }
    }
    if (status === "no_show" && target?.customer_id) {
      await createNotification({
        user_id: target.customer_id,
        title: "Marked as a no-show",
        body: `${providerProfile?.business_name || "The provider"} marked your ${formatBookingWhen(target)} appointment as a no-show.`,
        type: "booking_no_show",
        booking_id: id,
      });
    }
    await loadBookings();
    // Points are awarded by a database trigger the moment a booking
    // completes, so the loyalty list on screen is now out of date.
    if (status === "completed" && providerProfile?.loyalty_enabled) await loadLoyaltyCustomers();
    setBusyId(null);
  };

  // ── RESCHEDULING ──────────────────────────────────────────────
  const openReschedule = (booking) => {
    setRescheduleForm({ date: String(booking.booking_date || "").slice(0, 10), time: String(booking.booking_time || "").slice(0, 5) });
    setRescheduleError("");
    setReschedulingId(booking.id);
  };
  const closeReschedule = () => { setReschedulingId(null); setRescheduleError(""); };

  const submitReschedule = async (booking) => {
    if (!rescheduleForm.date || !rescheduleForm.time) { setRescheduleError("Pick a new date and time."); return; }
    const check = validate(rescheduleProposalSchema, { date: rescheduleForm.date, time: rescheduleForm.time });
    if (!check.ok) { setRescheduleError(check.message); return; }
    setSavingReschedule(true);
    setRescheduleError("");
    const proposedWhen = formatBookingWhen({ booking_date: rescheduleForm.date, booking_time: rescheduleForm.time });
    try {
      await proposeBookingReschedule(booking.id, rescheduleForm.date, rescheduleForm.time);
    } catch (err) {
      setSavingReschedule(false);
      setRescheduleError(err.code === "SLOT_TAKEN"
        ? "You already have a booking overlapping that time. Pick another slot."
        : "Couldn't propose that time. Please try again.");
      return;
    }
    setSavingReschedule(false);

    if (booking.customer_id) {
      await createNotification({
        user_id: booking.customer_id,
        title: "New time proposed for your booking",
        body: `${providerProfile?.business_name || "Your provider"} would like to move your ${booking.services?.name || "appointment"} to ${proposedWhen}. Please confirm.`,
        type: "booking_reschedule_proposed",
        booking_id: booking.id,
      });
      if (booking.users?.email) {
        await sendBookingEmail({
          to: booking.users.email,
          subject: `${providerProfile?.business_name || "Your provider"} proposed a new time for your booking`,
          html: `<p>Hi ${booking.users?.full_name || "there"},</p><p>${providerProfile?.business_name || "Your provider"} would like to move your <strong>${booking.services?.name || "appointment"}</strong> to <strong>${proposedWhen}</strong>.</p><p>Nothing has changed yet — open VaiBook and confirm or keep your original time from your bookings list.</p>`,
        });
      }
    }
    setReschedulingId(null);
    await loadBookings();
  };

  const [withdrawingId, setWithdrawingId] = useState(null);
  const withdrawReschedule = async (booking) => {
    setWithdrawingId(booking.id);
    try {
      await withdrawBookingReschedule(booking.id);
    } catch (err) {
      setWithdrawingId(null);
      return;
    }
    setWithdrawingId(null);
    await loadBookings();
  };

  // ── THE PROVIDER'S OWN REVIEWS ───────────────────────────────
  const loadMyReviews = async () => {
    if (!providerId) return;
    setLoadingMyReviews(true);
    const data = await getProviderReviews(providerId);
    setMyReviews(data || []);
    setLoadingMyReviews(false);
  };
  useEffect(() => { loadMyReviews(); }, [providerId]);

  const toggleEmailOnNewBooking = async () => {
    if (!providerId || savingNotifyPref) return;
    const next = !emailOnNewBooking;
    setSavingNotifyPref(true);
    setEmailOnNewBooking(next);
    const saved = await upsertProviderProfile({ id: providerProfile.id, user_id: providerProfile.user_id, notify_email_new_booking: next });
    setSavingNotifyPref(false);
    if (saved) {
      onProviderProfileUpdate && onProviderProfileUpdate(saved);
    } else {
      setEmailOnNewBooking(!next);
      window.alert("Couldn't save that setting. Please try again.");
    }
  };

  const toggleAcceptsWalkins = async () => {
    if (!providerId || savingWalkinPref) return;
    const next = !acceptsWalkins;
    setSavingWalkinPref(true);
    setAcceptsWalkins(next);
    const saved = await upsertProviderProfile({ id: providerProfile.id, user_id: providerProfile.user_id, accepts_walkins: next });
    setSavingWalkinPref(false);
    if (saved) {
      onProviderProfileUpdate && onProviderProfileUpdate(saved);
    } else {
      setAcceptsWalkins(!next);
      window.alert("Couldn't save that setting. Please try again.");
    }
  };

  const openResponse = (bookingId, type) => {
    setRespondingId(bookingId);
    setResponseType(type);
    setResponseMessage("");
  };

  const cancelResponse = () => {
    setRespondingId(null);
    setResponseType(null);
    setResponseMessage("");
  };

  const submitResponse = async (booking) => {
    setBusyId(booking.id);
    const msg = responseMessage.trim() || null;
    const custEmail = booking.users?.email;
    const custName = booking.users?.full_name;
    const serviceName = booking.services?.name || "your service";
    const dateStr = formatBookingDate(booking.booking_date);
    const timeStr = booking.booking_time?.slice(0, 5);

    if (responseType === "accept") {
      const requiresDeposit = !!providerProfile?.downpayment_required;
      const nextStatus = requiresDeposit ? "awaiting_payment" : "confirmed";
      await updateBooking(booking.id, { status: nextStatus, provider_message: msg });
      if (custEmail) {
        const subject = requiresDeposit
          ? `${providerProfile.business_name} accepted your booking — deposit needed`
          : `${providerProfile.business_name} confirmed your booking`;
        const html = requiresDeposit
          ? `<p>Your booking for ${serviceName} on ${dateStr} has been accepted.</p>` +
            (msg ? `<p>Message from the provider: ${msg}</p>` : "") +
            `<p>Please upload your deposit receipt (BZ$${booking.downpayment_amount ?? ""}) in your VaiBook account to confirm your appointment.</p>`
          : bookingConfirmedEmailHtml({
              customerName: custName,
              providerProfile,
              serviceName,
              dateStr,
              timeStr,
              total: booking.total_amount,
              deposit: null,
            }) + (msg ? `<p style="max-width:520px;margin:12px auto 0;font-size:13px;color:#5b6b62;">Message from ${providerProfile.business_name}: ${msg}</p>` : "");
        await sendBookingEmail({ to: custEmail, subject, html });
      }
      if (booking.customer_id) {
        await createNotification({
          user_id: booking.customer_id,
          title: requiresDeposit ? "Booking accepted — deposit needed" : "Booking confirmed!",
          body: requiresDeposit
            ? `${providerProfile.business_name} accepted your ${serviceName} request. Upload your deposit to confirm.`
            : `${providerProfile.business_name} confirmed your ${serviceName} booking on ${dateStr}.`,
          type: requiresDeposit ? "booking_accepted_deposit" : "booking_confirmed",
          booking_id: booking.id,
        });
      }
    } else {
      await updateBooking(booking.id, { status: "rejected", provider_message: msg });
      if (custEmail) {
        await sendBookingEmail({
          to: custEmail,
          subject: `${providerProfile.business_name} declined your booking request`,
          html: `<p>Unfortunately your booking request for ${serviceName} on ${dateStr} was declined.</p>` +
            (msg ? `<p>Message from the provider: ${msg}</p>` : ""),
        });
      }
      if (booking.customer_id) {
        await createNotification({
          user_id: booking.customer_id,
          title: "Booking declined",
          body: `${providerProfile.business_name} declined your ${serviceName} request for ${dateStr}.`,
          type: "booking_rejected",
          booking_id: booking.id,
        });
      }
    }

    await loadBookings();
    setBusyId(null);
    cancelResponse();
  };

  const confirmPayment = async (booking) => {
    setConfirmingPaymentId(booking.id);
    await updateBooking(booking.id, { status: "confirmed", payment_status: "paid" });
    const custEmail = booking.users?.email;
    const serviceName = booking.services?.name || "your service";
    const dateStr = formatBookingDate(booking.booking_date);
    const timeStr = booking.booking_time?.slice(0, 5);
    if (custEmail) {
      await sendBookingEmail({
        to: custEmail,
        subject: `Payment confirmed — ${providerProfile.business_name}`,
        html: bookingConfirmedEmailHtml({
          customerName: booking.users?.full_name,
          providerProfile,
          serviceName,
          dateStr,
          timeStr,
          total: booking.total_amount,
          deposit: booking.downpayment_amount,
        }),
      });
    }
    if (booking.customer_id) {
      await createNotification({
        user_id: booking.customer_id,
        title: "Payment confirmed!",
        body: `Your deposit for ${serviceName} on ${dateStr} was confirmed. See you soon!`,
        type: "payment_confirmed",
        booking_id: booking.id,
      });
    }
    await loadBookings();
    setConfirmingPaymentId(null);
  };

  const saveDepositSettings = async () => {
    if (!providerId) return;
    setSavingDeposit(true);
    await upsertProviderProfile({
      id: providerProfile.id,
      user_id: providerProfile.user_id,
      downpayment_required: depositForm.downpayment_required,
      downpayment_pct: Number(depositForm.downpayment_pct) || 50,
      // Only meaningful when a deposit ISN'T required — a booking that
      // needs a deposit always waits for manual accept regardless of
      // this flag (see auto_confirm_no_deposit_booking() in the DB).
      auto_confirm_bookings: depositForm.auto_confirm_bookings,
    });
    setSavingDeposit(false);
  };

  const saveLunchSettings = async () => {
    if (!providerId) return;
    setSavingLunch(true);
    await upsertProviderProfile({
      id: providerProfile.id,
      user_id: providerProfile.user_id,
      lunch_break_start: lunchForm.enabled ? lunchForm.lunch_break_start : null,
      lunch_break_minutes: lunchForm.enabled ? Number(lunchForm.lunch_break_minutes) || 0 : 0,
    });
    setSavingLunch(false);
  };

  const toggleDay = (i) => setHours(h => h.map((d, idx) => (idx === i ? { ...d, is_open: !d.is_open } : d)));
  const setDayTime = (i, field, value) => setHours(h => h.map((d, idx) => (idx === i ? { ...d, [field]: value } : d)));

  const saveHours = async () => {
    if (!providerId) return;
    setSavingHours(true);
    await upsertWorkingHours(providerId, hours.map(h => ({ day_of_week: h.day_of_week, is_open: h.is_open, start_time: h.start_time, end_time: h.end_time })));
    setSavingHours(false);
  };

  const saveProfile = async () => {
    if (!providerId) return;
    setSavingProfile(true);
    const updated = await upsertProviderProfile({ id: providerProfile.id, user_id: providerProfile.user_id, ...profileForm });
    if (updated) onProviderProfileUpdate && onProviderProfileUpdate(updated);
    setSavingProfile(false);
  };

  // "Featured in district search" — Business plan only, saves immediately
  // on toggle rather than waiting for the main "Save profile" button.
  // Reads the value back from what the server actually saved (not just
  // the optimistic flip) since a Business-plan-only trigger silently
  // resets this to false for anyone not on that plan.
  const toggleFeatured = async () => {
    if (!providerId || savingFeatured) return;
    setSavingFeatured(true);
    const updated = await upsertProviderProfile({ id: providerProfile.id, user_id: providerProfile.user_id, is_featured: !profileForm.is_featured });
    if (updated) {
      setProfileForm((f) => ({ ...f, is_featured: !!updated.is_featured }));
      onProviderProfileUpdate && onProviderProfileUpdate(updated);
    }
    setSavingFeatured(false);
  };

  // Saves loyalty program settings as one batch (the toggle plus the rate,
  // threshold, and reward text) rather than saving the toggle immediately
  // like is_featured — these fields are meant to be set together.
  const saveLoyaltySettings = async () => {
    if (!providerId) return;
    setSavingLoyalty(true);
    const updated = await upsertProviderProfile({
      id: providerProfile.id,
      user_id: providerProfile.user_id,
      loyalty_enabled: loyaltyForm.enabled,
      loyalty_points_per_dollar: Number(loyaltyForm.pointsPerDollar) || 0,
      loyalty_reward_threshold: Number(loyaltyForm.threshold) || 0,
      loyalty_reward_description: loyaltyForm.description.trim() || null,
    });
    if (updated) {
      setLoyaltyForm({
        enabled: !!updated.loyalty_enabled,
        pointsPerDollar: updated.loyalty_points_per_dollar ?? 1,
        threshold: updated.loyalty_reward_threshold ?? 100,
        description: updated.loyalty_reward_description || "",
      });
      onProviderProfileUpdate && onProviderProfileUpdate(updated);
    }
    setSavingLoyalty(false);
  };

  // A blank or zero input turns VIP appointments back off (stored as null,
  // same "absence means not offering it" convention as vip_surcharge
  // elsewhere) rather than needing a separate toggle.
  const saveVipSurcharge = async () => {
    if (!providerId) return;
    setSavingVipSurcharge(true);
    const amount = Number(vipSurchargeForm) || 0;
    const updated = await upsertProviderProfile({
      id: providerProfile.id,
      user_id: providerProfile.user_id,
      vip_surcharge: amount > 0 ? amount : null,
    });
    if (updated) {
      setVipSurchargeForm(updated.vip_surcharge != null ? String(updated.vip_surcharge) : "");
      onProviderProfileUpdate && onProviderProfileUpdate(updated);
    }
    setSavingVipSurcharge(false);
  };

  const loadLoyaltyCustomers = async () => {
    if (!providerId) return;
    setLoadingLoyaltyCustomers(true);
    const data = await getProviderLoyaltyCustomers(providerId);
    setLoyaltyCustomers(data || []);
    setLoadingLoyaltyCustomers(false);
  };

  useEffect(() => {
    loadLoyaltyCustomers();
  }, [providerId]);

  // Redeeming subtracts the reward threshold rather than resetting to
  // zero, so any points earned past the threshold carry forward toward
  // the next reward instead of being lost.
  const redeemReward = async (account) => {
    if (redeemingId === account.id) return;
    const threshold = Number(providerProfile?.loyalty_reward_threshold) || 0;
    if (account.points_balance < threshold) return;
    if (!window.confirm(`Mark the reward as given to ${account.users?.full_name || "this customer"}? This will deduct ${threshold} points.`)) return;
    setRedeemingId(account.id);
    // Deducts against the balance as it stands in the database right now —
    // the figure on screen may be minutes old and points may have been
    // earned since.
    const updated = await redeemLoyaltyReward(account.id);
    await loadLoyaltyCustomers();
    setRedeemingId(null);
    if (!updated) window.alert("Couldn't apply that reward — their balance may have changed. The list has been refreshed.");
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !providerProfile?.user_id) return;
    setUploadingPhoto(true);
    const optimized = await compressImageFile(file);
    const url = await uploadProviderPhoto(providerProfile.user_id, optimized);
    if (url) {
      const next = [...photos, url];
      setPhotos(next);
      await upsertProviderProfile({ id: providerProfile.id, user_id: providerProfile.user_id, portfolio_urls: next });
    }
    setUploadingPhoto(false);
  };

  const handleDeletePhoto = async (url) => {
    if (!providerProfile?.user_id) return;
    const next = photos.filter((p) => p !== url);
    setPhotos(next);
    await deleteProviderPhoto(providerProfile.user_id, url);
    await upsertProviderProfile({ id: providerProfile.id, user_id: providerProfile.user_id, portfolio_urls: next });
  };

  const saveLocation = async () => {
    if (!providerId || !mapPosition) return;
    setSavingLocation(true);
    await upsertProviderProfile({
      id: providerProfile.id,
      user_id: providerProfile.user_id,
      latitude: mapPosition[0],
      longitude: mapPosition[1],
      location_label: locationLabel,
    });
    setSavingLocation(false);
  };

  const handleAddService = async () => {
    if (!providerId || !serviceForm.name.trim()) return;
    setSavingService(true);
    const created = await createService({
      provider_id: providerId,
      name: serviceForm.name.trim(),
      price: Number(serviceForm.price) || 0,
      duration_min: Number(serviceForm.duration_min) || 15,
      is_active: true,
    });
    if (created) {
      setServices((prev) => [...prev, created]);
      setServiceForm({ name: "", price: "", duration_min: 15 });
    }
    setSavingService(false);
  };

  const handleDeleteService = async (serviceId) => {
    setServices((prev) => prev.filter((s) => s.id !== serviceId));
    await deleteService(serviceId);
  };

  // TOP NAV REDESIGN — same destinations the old sidebar had, regrouped:
  // the 3 daily-use ones live in the top bar itself, the rest move into the
  // avatar dropdown in three labeled groups. The old "VIP clients"
  // (manually-starred subset) feature is gone entirely — "Clients" is now a
  // real directory built straight from booking history (see `allClients`
  // below), not a curated list. "Earnings" and "Monthly review" (not part
  // of the original 3-group spec) were folded into Operations rather than
  // dropped.
  const PROVIDER_TOP_NAV = [
    { id: "dashboard", label: "Dashboard" },
    { id: "bookings", label: "Bookings" },
    { id: "clients", label: "Clients" },
  ];
  const PROVIDER_MENU_GROUPS = [
    {
      label: "Operations",
      items: [
        { id: "services", icon: "✂️", label: "My services" },
        { id: "calendar", icon: "🗓️", label: "Availability" },
        { id: "staff", icon: "👥", label: "My staff" },
        { id: "earnings", icon: "💰", label: "Earnings" },
        { id: "review", icon: "📈", label: "Monthly review" },
      ],
    },
    {
      label: "Growth",
      items: [
        { id: "reviews", icon: "⭐", label: "My reviews" },
        { id: "modules", icon: "🧩", label: "Add-ons" },
      ],
    },
    {
      label: "Account",
      items: [
        { id: "profile", icon: "👤", label: "Public profile" },
        { id: "billing", icon: "🧾", label: "My plan & billing" },
        { id: "settings", icon: "⚙️", label: "Settings" },
      ],
    },
  ];
  const providerCategoryKey = providerProfile?.category_key || categoryForServiceType(providerProfile?.service_type);

  // Not signed in at all
  if (!session) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--forest)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 28, fontWeight: 800, color: "var(--near-white)", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <VaiBookMark size={30} />vai<span style={{ color: "var(--lime)" }}>book</span> <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 16 }}>providers</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, marginBottom: 24 }}>Sign in with Google to access your provider portal.</p>
          <button className="btn-lime" style={{ width: "100%", padding: "12px 0" }} onClick={onSignIn}>Sign in with Google</button>
          <div style={{ marginTop: 20 }}>
            <a style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }} onClick={() => onNav("home")}>← Back to site</a>
          </div>
        </div>
      </div>
    );
  }

  // Signed in but no provider profile yet
  if (!providerProfile) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--forest)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✂️</div>
          <h2 style={{ color: "var(--near-white)", fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 8 }}>No provider profile yet</h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, marginBottom: 24 }}>
            List your business to apply. Once we confirm your subscription payment, we'll activate your provider portal.
          </p>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 20, lineHeight: 1.6 }}>
            Work here as staff? Ask the owner to check that your seat is still active and registered to this exact
            email address — that's what opens your own staff view.
          </p>
          <button className="btn-lime" style={{ padding: "12px 24px" }} onClick={() => onNav("signup")}>List your business</button>
          <div style={{ marginTop: 20 }}>
            <a style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }} onClick={onSignOut}>Sign out</a>
          </div>
        </div>
      </div>
    );
  }

  const now = new Date();
  const todaysBookings = bookings.filter(b => isSameLocalDay(b.booking_date, now));
  const pendingBookings = bookings.filter(b => b.status === "pending");
  const confirmedBookings = bookings.filter(b => b.status === "confirmed");
  const completedBookings = bookings.filter(b => b.status === "completed" || b.status === "done");
  const thisMonthCompleted = completedBookings
    .filter(b => { const d = bookingDateOnly(b.booking_date); return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const thisMonthCompletedCount = thisMonthCompleted.length;
  const thisMonthEarnings = thisMonthCompleted.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);

  // "Today's Take" — same definition as thisMonthEarnings above (completed
  // revenue), just scoped to today. Walk-in sales are auto-completed at
  // creation, so they count the moment they're logged; a real appointment
  // counts once you mark it done.
  const todayRevenue = todaysBookings
    .filter((b) => b.status === "completed" || b.status === "done")
    .reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);

  // "Chairs Filled" — how much of today's open hours are actually spoken
  // for right now. Capacity is today's working hours minus the lunch
  // break, sliced into the same 30-minute step the booking flow itself
  // uses; filled time is every minute a live booking or an active block
  // occupies, rounded to that same slot size.
  const CHAIR_SLOT_MIN = 30;
  const todayHoursRow = hours.find((h) => h.day_of_week === now.getDay());
  let totalChairSlots = 0;
  if (todayHoursRow && todayHoursRow.is_open && todayHoursRow.start_time && todayHoursRow.end_time) {
    const openMin = Math.max(0, hhmmToMinutes(todayHoursRow.end_time) - hhmmToMinutes(todayHoursRow.start_time));
    const lunchMin = lunchForm.enabled ? Number(lunchForm.lunch_break_minutes) || 0 : 0;
    totalChairSlots = Math.round(Math.max(0, openMin - lunchMin) / CHAIR_SLOT_MIN);
  }
  const bookedMinutesToday = todaysBookings
    .filter((b) => ["pending", "awaiting_payment", "confirmed", "completed", "done"].includes(b.status))
    .reduce((sum, b) => sum + (Number(b.total_duration_min) || Number(b.services?.duration_min) || 30), 0);
  const blockedMinutesToday = blocks
    .filter((bl) => bl.block_date === localDateStr())
    .reduce((sum, bl) => sum + Math.max(0, hhmmToMinutes(bl.end_time) - hhmmToMinutes(bl.start_time)), 0);
  const filledChairSlots = totalChairSlots > 0
    ? Math.min(totalChairSlots, Math.round((bookedMinutesToday + blockedMinutesToday) / CHAIR_SLOT_MIN))
    : 0;
  const chairsBookedPct = totalChairSlots > 0 ? Math.round((filledChairSlots / totalChairSlots) * 100) : 0;

  // "Next in the Chair" — the next CONFIRMED appointment still ahead of
  // right now (pending doesn't count — it isn't locked in yet).
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nextBooking = todaysBookings
    .filter((b) => b.status === "confirmed" && hhmmToMinutes(b.booking_time) >= nowMinutes)
    .sort((a, b) => hhmmToMinutes(a.booking_time) - hhmmToMinutes(b.booking_time))[0] || null;
  const nextBookingName = nextBooking ? (nextBooking.users?.full_name || nextBooking.walkin_customer_name || "Customer") : "";
  const nextBookingPhone = nextBooking ? (nextBooking.users?.phone || nextBooking.walkin_customer_phone || null) : null;
  const nextBookingWhatsAppUrl = nextBooking && nextBookingPhone
    ? `https://wa.me/${nextBookingPhone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hey ${nextBookingName}, ready for you at ${formatBookingTime(nextBooking.booking_time)}!`)}`
    : null;

  // "Your Shopfront" — same booking-link/QR logic the standalone "My QR
  // code" tab used to have; that tab is gone now, this dashboard card is
  // the one place it lives.
  //
  // The link/QR feeding this card (and the Elite Welcome launch graphic,
  // which is meant to be downloaded, printed and posted permanently) must
  // always point at VaiBook's real, stable domain — never at whatever host
  // happens to be serving the page right now. Left as window.location.origin,
  // a provider who opened their dashboard from a Vercel *preview* deployment
  // (a branch/PR build, not the live site) would get a QR encoding that
  // temporary preview URL: it can go stale or vanish the moment that preview
  // is torn down, so a code printed from it would eventually stop working.
  // Localhost is kept as-is purely so local development can still generate
  // a working link while testing.
  const CANONICAL_SITE_ORIGIN = "https://vai-book.vercel.app";
  const siteOrigin = window.location.hostname === "localhost" ? window.location.origin : CANONICAL_SITE_ORIGIN;
  const bookingUrl = `${siteOrigin}/#book-${providerId}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=12&data=${encodeURIComponent(bookingUrl)}`;

  // "Rebooking Radar" — registered (non-walk-in) customers with 2+ real
  // visits, no upcoming booking on the books, whose last visit was 3+
  // weeks ago. Walk-ins are excluded: they have no customer_id, so there's
  // no reliable identity to track repeat visits by.
  const REBOOK_QUIET_DAYS = 21;
  const customerHistory = {};
  bookings.forEach((b) => {
    if (!b.customer_id) return;
    if (!["completed", "done", "confirmed", "pending", "awaiting_payment"].includes(b.status)) return;
    const d = bookingDateOnly(b.booking_date);
    if (!d) return;
    const entry = customerHistory[b.customer_id] || { id: b.customer_id, name: "Customer", email: null, phone: null, visits: 0, lastDate: null, hasUpcoming: false };
    entry.visits += 1;
    if (b.users?.full_name) entry.name = b.users.full_name;
    if (b.users?.email) entry.email = b.users.email;
    if (b.users?.phone) entry.phone = b.users.phone;
    if (!entry.lastDate || d > entry.lastDate) entry.lastDate = d;
    if (d >= bookingDateOnly(localDateStr()) && ["pending", "awaiting_payment", "confirmed"].includes(b.status)) entry.hasUpcoming = true;
    customerHistory[b.customer_id] = entry;
  });
  const quietSince = new Date(now.getTime() - REBOOK_QUIET_DAYS * 24 * 60 * 60 * 1000);
  const quietRegulars = Object.values(customerHistory)
    .filter((c) => c.visits >= 2 && !c.hasUpcoming && c.lastDate && c.lastDate < quietSince)
    .sort((a, b) => a.lastDate - b.lastDate);

  // "Clients" tab — replaces the old manually-starred "VIP clients" list
  // with a real directory: every registered customer who has ever actually
  // booked with this provider (walk-ins have no account/customer_id, so
  // they can't appear here), most recent visit first.
  const allClients = Object.values(customerHistory).sort((a, b) => (b.lastDate?.getTime() || 0) - (a.lastDate?.getTime() || 0));
  const [clientSearch, setClientSearch] = useState("");
  const filteredClients = clientSearch.trim()
    ? allClients.filter((c) => c.name.toLowerCase().includes(clientSearch.trim().toLowerCase()))
    : allClients;

  // Only bookings that actually reached an outcome count — pending and
  // upcoming ones aren't failures, and including them held the rate down
  // permanently for busy providers.
  const settledBookings = bookings.filter(b => ["completed", "done", "cancelled", "rejected", "no_show"].includes(b.status));
  const completionRate = settledBookings.length ? Math.round((completedBookings.length / settledBookings.length) * 100) : null;
  const bookingNameFn = (b) => b.users?.full_name || b.walkin_customer_name || "";
  // If the staff member being filtered on has since been removed, fall back
  // to everyone rather than showing a permanently empty list with no way to
  // clear the filter (their name is gone from the dropdown).
  const staffFilterActive = staffFilter === "all" || staffFilter === "unassigned" || staff.some((m) => m.id === staffFilter);
  const effectiveStaffFilter = staffFilterActive ? staffFilter : "all";
  const staffFilteredBookings = effectiveStaffFilter === "all"
    ? bookings
    : effectiveStaffFilter === "unassigned"
      ? bookings.filter((b) => !b.staff_id)
      : bookings.filter((b) => b.staff_id === effectiveStaffFilter);
  const statusFilteredBookings = bookingStatusFilter === "all"
    ? staffFilteredBookings
    : bookingStatusFilter === "needs_action"
      ? staffFilteredBookings.filter((b) => b.status === "pending" || (b.status === "awaiting_payment" && b.payment_status === "receipt_uploaded"))
      : bookingStatusFilter === "completed"
        ? staffFilteredBookings.filter((b) => b.status === "completed" || b.status === "done")
        : bookingStatusFilter === "cancelled"
          ? staffFilteredBookings.filter((b) => b.status === "cancelled" || b.status === "rejected")
          : staffFilteredBookings.filter((b) => b.status === bookingStatusFilter);
  const visibleBookings = filterAndSortBookings(statusFilteredBookings, bookingSearch, bookingSort, bookingNameFn);

  // VaiBook never touches the money — providers collect 100% directly and
  // pay only their monthly subscription — so every figure here is the real
  // amount taken, matching the invoices and the tax ledger exactly. (There
  // used to be a hardcoded 7% "platform fee" deducted from all of these,
  // which understated every provider's income by 7%.)
  const netAmount = (b) => (Number(b.total_amount) || 0);
  const totalNetEarned = completedBookings.reduce((sum, b) => sum + netAmount(b), 0);
  // Confirmed only: an awaiting_payment booking may never have its deposit
  // paid, so counting it as money on the way was wishful.
  const pendingEarnings = bookings
    .filter(b => b.status === "confirmed")
    .reduce((sum, b) => sum + netAmount(b), 0);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisMonthNetEarnings = completedBookings
    .filter(b => { const d = bookingDateOnly(b.booking_date); return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
    .reduce((sum, b) => sum + netAmount(b), 0);
  const lastMonthNetEarnings = completedBookings
    .filter(b => { const d = bookingDateOnly(b.booking_date); return d && d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear(); })
    .reduce((sum, b) => sum + netAmount(b), 0);
  const monthOverMonthPct = lastMonthNetEarnings > 0
    ? Math.round(((thisMonthNetEarnings - lastMonthNetEarnings) / lastMonthNetEarnings) * 100)
    : null;
  const currentMonthLabel = now.toLocaleDateString("en-US", { month: "long" });

  // Sales & tax ledger — separate from per-booking invoices on purpose,
  // see buildLedgerHtml. Defaults to the current calendar month (its state
  // is declared at the top of the component with every other hook).
  const printLedger = () => {
    const start = ledgerStart ? bookingDateOnly(ledgerStart) : null;
    const end = ledgerEnd ? bookingDateOnly(ledgerEnd) : null;
    if (end) end.setHours(23, 59, 59, 999);
    const rows = completedBookings
      .filter((b) => {
        const d = bookingDateOnly(b.booking_date);
        return (!start || d >= start) && (!end || d <= end);
      })
      .sort((a, b) => (bookingDateTime(a.booking_date, a.booking_time) || 0) - (bookingDateTime(b.booking_date, b.booking_time) || 0))
      .map((b) => ({
        dateLabel: formatBookingDate(b.booking_date),
        orderNumber: b.order_number || b.id?.slice(0, 8) || "—",
        serviceName: b.services?.name || "Service",
        customerName: b.users?.full_name || b.walkin_customer_name || "Customer",
        amount: b.total_amount,
      }));
    const periodLabel = ledgerStart && ledgerEnd
      ? `${formatBookingDate(ledgerStart)} – ${formatBookingDate(ledgerEnd)}`
      : "All completed bookings";
    printInvoice(buildLedgerHtml({
      providerName: providerProfile?.business_name || "Provider",
      providerTaxId: providerProfile?.tax_id || "",
      periodLabel,
      rows,
      taxRate: Number(ledgerTaxRate) || 0,
    }));
  };

  const handleAddPaymentMethod = async () => {
    if (!providerId || !paymentMethodForm.name.trim()) return;
    setSavingPaymentMethod(true);
    const created = await addPaymentMethod({
      provider_id: providerId,
      type: paymentMethodForm.type,
      name: paymentMethodForm.name.trim(),
      account_name: paymentMethodForm.account_name.trim() || null,
      account_number: paymentMethodForm.account_number.trim() || null,
    });
    if (created) {
      setPaymentMethods((prev) => [...prev, created]);
      setPaymentMethodForm({ type: "bank", name: "", account_name: "", account_number: "" });
    }
    setSavingPaymentMethod(false);
  };

  const handleDeletePaymentMethod = async (id) => {
    setPaymentMethods((prev) => prev.filter((m) => m.id !== id));
    await deletePaymentMethod(id);
  };

  const calCursor = new Date(now.getFullYear(), now.getMonth() + calOffset, 1);
  const calYear = calCursor.getFullYear();
  const calMonth = calCursor.getMonth();
  const monthLabel = calCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstWeekday = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calendarDays = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const bookedDaysInMonth = new Set(
    bookings
      .filter(b => { const d = bookingDateOnly(b.booking_date); return d && d.getFullYear() === calYear && d.getMonth() === calMonth; })
      .map(b => bookingDateOnly(b.booking_date).getDate())
  );
  const selectedDayBookings = selectedDay
    ? bookings.filter(b => { const d = bookingDateOnly(b.booking_date); return d && d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === selectedDay; })
    : [];

  return (
    <FeatureFlagsProvider providerId={providerId} categoryKey={providerCategoryKey}>
    <div className="provider-shell">
      <header className="provider-topbar">
        <div className="provider-topbar-left">
          <span className="nav-logo" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, color: "var(--near-white)", display: "inline-flex", alignItems: "center", gap: 7 }}><VaiBookMark size={19} />vai<span style={{ color: "var(--lime)" }}>book</span></span>
          <span className={`provider-status-pill ${providerProfile.is_active ? "" : "pending"}`}>
            {providerProfile.is_active ? "✓ Verified" : "Pending"}
          </span>
        </div>

        {/* Daily-use links, front and center — everything else lives in the
            avatar dropdown on the right. */}
        <nav className="provider-topnav-links">
          {PROVIDER_TOP_NAV.map((item) => (
            <button
              key={item.id}
              className={`provider-nav-link ${tab === item.id ? "active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Mobile-only: the same 3 links collapse behind a hamburger since
            there's no room for them inline on a phone screen. */}
        <button
          className="provider-hamburger"
          onClick={() => setProviderMobileNavOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={providerMobileNavOpen}
        >
          ☰
        </button>

        <div className="provider-topbar-right">
          <div className="provider-avatar-wrap" onMouseLeave={() => setProviderMenuOpen(false)}>
            <button
              className="provider-avatar-btn"
              onClick={() => setProviderMenuOpen((v) => !v)}
              aria-label="Account menu"
              aria-expanded={providerMenuOpen}
            >
              <span className="avatar">{(providerProfile.business_name || "V")[0].toUpperCase()}</span>
            </button>
            {providerMenuOpen && (
              <div className="nav-dropdown provider-account-dropdown">
                <div className="provider-dropdown-header">
                  <div className="name">{providerProfile.business_name || "Your business"}</div>
                  <div className="sub">{providerProfile.service_type} · {providerProfile.district}</div>
                </div>
                <hr />
                {PROVIDER_MENU_GROUPS.map((group, gi) => (
                  <div key={group.label}>
                    <div className="provider-dropdown-group-label">{group.label}</div>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        className="nav-dropdown-item"
                        onClick={() => { setTab(item.id); setProviderMenuOpen(false); }}
                      >
                        <span className="icn">{item.icon}</span>{item.label}
                      </button>
                    ))}
                    {gi < PROVIDER_MENU_GROUPS.length - 1 && <hr />}
                  </div>
                ))}
                <hr />
                <button className="nav-dropdown-item" onClick={onSignOut}>
                  <span className="icn">↪</span>Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        {providerMobileNavOpen && (
          <div className="provider-mobile-nav">
            {PROVIDER_TOP_NAV.map((item) => (
              <button
                key={item.id}
                className={`provider-mobile-nav-item ${tab === item.id ? "active" : ""}`}
                onClick={() => { setTab(item.id); setProviderMobileNavOpen(false); }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="portal-content">
        {tab === "dashboard" && (
          <>
            {/* ELITE WELCOME — one-time "you're live" nudge, only for an
                active provider who hasn't dismissed it. Dismissing (with
                or without downloading) hides it for good. */}
            {providerProfile.is_active && !launchBannerDismissed && (
              <div className="launch-banner">
                <div>
                  <div className="launch-banner-title">🎉 You're live on VaiBook!</div>
                  <div className="launch-banner-sub">Grab your official launch graphic to share on Instagram.</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button className="btn-sm ghost" onClick={dismissLaunchBanner}>Dismiss</button>
                  <button className="btn-sm lime" onClick={() => setShowLaunchGraphic(true)}>Get My Launch Graphic</button>
                </div>
              </div>
            )}

            <div className="portal-header">
              <h2>Dashboard</h2>
              <p>{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {todaysBookings.length} appointment{todaysBookings.length === 1 ? "" : "s"} today</p>
            </div>

            {/* THE DOPAMINE CARD — instant financial payoff the moment the
                dashboard opens. Today's Take is completed revenue only
                (same definition as "This month earnings" below, just for
                today); Chairs Filled is today's booked+blocked time against
                today's open hours. */}
            <div className="dopamine-card">
              <div className="dopamine-metric">
                <div className="dopamine-label">Today's Take</div>
                <div className="dopamine-value">BZ${todayRevenue.toFixed(0)}</div>
              </div>
              <div className="dopamine-divider"></div>
              <div className="dopamine-metric">
                <div className="dopamine-label">Chairs Filled</div>
                <div className="dopamine-value dopamine-value-sm">
                  {filledChairSlots}/{totalChairSlots} <span className="dopamine-pct">({chairsBookedPct}% booked)</span>
                </div>
              </div>
            </div>

            {/* ZERO-FRICTION QUICK ACTIONS — one or two buttons, never more.
                Normally: Walk-In (primary, revenue) + Custom Block
                (secondary, pause) — but Walk-In only shows for providers
                who take walk-ins (see Settings); appointment-only providers
                just get Custom Block, full-width. The instant a block is
                active, everything collapses into a single massive Resume
                Bookings Now button. */}
            {activeBlock ? (
              <button
                className="panic-btn"
                style={{ width: "100%", marginBottom: 20 }}
                onClick={resumeBookingsNow}
                disabled={resumingNow}
              >
                {resumingNow ? "Reopening..." : `✅ Resume Bookings Now (blocked until ${formatBookingTime(activeBlock.end_time)})`}
              </button>
            ) : acceptsWalkins ? (
              <>
                <div className="quick-actions-row" style={{ display: "flex", gap: 10, alignItems: "stretch", marginBottom: activeServices.length === 0 ? 4 : 20 }}>
                  <button
                    className="panic-btn"
                    style={{ flex: 3, marginBottom: 0 }}
                    onClick={openWalkInSheet}
                    disabled={activeServices.length === 0}
                  >
                    🧾 Walk-In
                  </button>
                  <button className="panic-btn-secondary" style={{ flex: 2 }} onClick={openBlockSheet}>
                    ⏸ Custom Block
                  </button>
                </div>
                {activeServices.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 20px" }}>Add a service under Services to start logging walk-in sales.</p>
                )}
              </>
            ) : (
              <button className="panic-btn" style={{ width: "100%", marginBottom: 20 }} onClick={openBlockSheet}>
                ⏸ Custom Block
              </button>
            )}

            <div className="metric-grid">
              <div className="metric"><div className="metric-label">This month earnings</div><div className="metric-value" style={{ color: "var(--forest-light)" }}>BZ${thisMonthEarnings.toFixed(0)}</div><div className="metric-sub">{thisMonthCompletedCount} completed this month</div></div>
              <div className="metric"><div className="metric-label">Bookings today</div><div className="metric-value">{todaysBookings.length}</div><div className="metric-sub">{todaysBookings.filter(b => b.status === "confirmed").length} confirmed, {pendingBookings.length} awaiting your reply</div></div>
              <div className="metric"><div className="metric-label">Total bookings</div><div className="metric-value">{bookings.length}</div><div className="metric-sub">All time</div></div>
              <div className="metric"><div className="metric-label">Completion rate</div><div className="metric-value">{completionRate === null ? "—" : `${completionRate}%`}</div><div className="metric-sub">{completionRate === null ? "No finished bookings yet" : `Of ${settledBookings.length} finished booking${settledBookings.length === 1 ? "" : "s"}`}</div></div>
            </div>

            {/* NEXT IN THE CHAIR — spotlight on the next confirmed
                appointment, with a one-tap WhatsApp heads-up. The full
                ordered list still lives in "Today's appointments" below;
                this just calls out the very next one so it isn't missed
                among blocks and past bookings. */}
            {nextBooking && (
              <div className="next-chair-card">
                <div className="next-chair-label">⏭ Next in the Chair</div>
                <div className="next-chair-body">
                  <div>
                    <div className="next-chair-name">{nextBookingName}</div>
                    <div className="next-chair-meta">{nextBooking.services?.name || "Service"} · {formatBookingTime(nextBooking.booking_time)}</div>
                  </div>
                  {nextBookingWhatsAppUrl && (
                    <a className="next-chair-whatsapp" href={nextBookingWhatsAppUrl} target="_blank" rel="noreferrer" aria-label={`Message ${nextBookingName} on WhatsApp`} title="Message on WhatsApp">💬</a>
                  )}
                </div>
              </div>
            )}

            {/* YOUR SHOPFRONT — the booking link + QR code, chairside-ready.
                This used to be its own "My QR code" tab; it lives here now
                so it's one tap away while the client is literally sitting
                in front of you, instead of buried in the sidebar. */}
            <div className="shopfront-card">
              <div className="shopfront-label">Your Shopfront</div>
              <div className="shopfront-url">{bookingUrl}</div>
              <div className="shopfront-actions">
                <button
                  className="shopfront-btn shopfront-btn-outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(bookingUrl);
                      setCopiedShopfrontLink(true);
                      setTimeout(() => setCopiedShopfrontLink(false), 2000);
                    } catch (e) { /* clipboard unavailable — link is shown above already */ }
                  }}
                >
                  {copiedShopfrontLink ? "Copied ✓" : "Copy Link"}
                </button>
                <button className="shopfront-btn shopfront-btn-lime" onClick={() => setShowQrModal(true)}>
                  Show QR Code
                </button>
              </div>
            </div>

            <div className="grid-2">
              <div className="card">
                <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Today's appointments</span>
                  <button className="btn-sm ghost" onClick={loadBookings} disabled={loadingBookings}>{loadingBookings ? "Refreshing..." : "Refresh"}</button>
                </div>
                {todaysBookings.length === 0 && blocks.filter(bl => bl.block_date === localDateStr()).length === 0 && <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>Nothing booked for today.</p>}
                {blocks.filter(bl => bl.block_date === localDateStr()).map((bl) => (
                  <div className="block-row" key={bl.id}>
                    <div className="dot"></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dark-text)" }}>⏸ Away</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{formatBookingTime(bl.start_time)} – {formatBookingTime(bl.end_time)} · calendar blocked</div>
                    </div>
                    <button className="btn-sm ghost" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => removeBlock(bl.id)}>Remove</button>
                  </div>
                ))}
                {todaysBookings.map((b) => (
                  <div className="booking-item" key={b.id}>
                    <div className={`booking-dot ${bookingStatusClass(b.status)}`}></div>
                    <div className="booking-info">
                      <div className="title">{b.services?.name || "Service"}</div>
                      <div className="meta">{b.users?.full_name || b.walkin_customer_name || "Customer"} · {formatBookingTime(b.booking_time)}</div>
                    </div>
                    <div>
                      <span className="booking-amount">BZ${b.total_amount ?? b.services?.price ?? "—"}</span>
                      <span className={`status-pill ${bookingStatusClass(b.status)}`}>{statusLabel(b.status)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="card-title">Recent bookings</div>
                {bookings.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{loadingBookings ? "Loading..." : "No bookings yet. Once customers book you, they'll show up here."}</p>}
                {bookings.slice(0, 6).map((b) => (
                  <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{b.services?.name || "Service"}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{formatBookingWhen(b)}</div>
                    </div>
                    <span className={`status-pill ${bookingStatusClass(b.status)}`}>{statusLabel(b.status)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* REBOOKING RADAR — a quiet retention nudge, not another
                inbox to manage: only surfaces when there's actually
                someone worth reaching out to. */}
            {quietRegulars.length > 0 && (
              <div className="rebook-radar">
                <div className="rebook-radar-text">
                  🔁 {quietRegulars.length} regular{quietRegulars.length === 1 ? "" : "s"} haven't booked in {REBOOK_QUIET_DAYS / 7}+ weeks.
                </div>
                <button className="rebook-radar-btn" onClick={() => setShowCheckInModal(true)}>Send Check-In</button>
              </div>
            )}
          </>
        )}

        {tab === "clients" && (
          <>
            <div className="portal-header"><h2>Clients</h2><p>Everyone who's booked with you, most recent visit first.</p></div>
            <div className="card">
              <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>All clients ({allClients.length})</span>
                <button className="btn-sm forest" onClick={loadBookings} disabled={loadingBookings}>{loadingBookings ? "Refreshing..." : "Refresh"}</button>
              </div>
              {allClients.length > 0 && (
                <div className="input-group" style={{ marginBottom: 12 }}>
                  <input placeholder="Search by name..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
                </div>
              )}
              {allClients.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>
                  {loadingBookings ? "Loading..." : "No clients yet — they'll show up here as soon as someone books with you. (Walk-in sales don't have an account, so they won't appear.)"}
                </p>
              )}
              {allClients.length > 0 && filteredClients.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>No clients match "{clientSearch}".</p>
              )}
              {filteredClients.map((c) => (
                <div key={c.id} className="booking-item" style={{ alignItems: "center" }}>
                  <div className="booking-info" style={{ flex: 1 }}>
                    <div className="title">
                      {c.name}
                      {c.hasUpcoming && (
                        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "var(--forest)", background: "var(--lime)", padding: "2px 7px", borderRadius: 5, verticalAlign: "middle" }}>Upcoming</span>
                      )}
                    </div>
                    <div className="meta">
                      {c.email || c.phone || "No contact on file"}
                      {" · "}{c.visits} visit{c.visits === 1 ? "" : "s"}
                      {c.lastDate && ` · last ${c.lastDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {isProOrAbove && providerProfile?.loyalty_enabled && (
              <div className="card" style={{ marginTop: 20 }}>
                <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Loyalty &amp; rewards</span>
                  <button className="btn-sm forest" onClick={loadLoyaltyCustomers} disabled={loadingLoyaltyCustomers}>{loadingLoyaltyCustomers ? "Refreshing..." : "Refresh"}</button>
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: -8, marginBottom: 12 }}>
                  {providerProfile.loyalty_points_per_dollar} point{Number(providerProfile.loyalty_points_per_dollar) === 1 ? "" : "s"} per BZ$1 spent · {providerProfile.loyalty_reward_threshold} points = {providerProfile.loyalty_reward_description || "a reward"}
                </p>
                {loyaltyCustomers.length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{loadingLoyaltyCustomers ? "Loading..." : "No customers with points yet."}</p>
                )}
                {loyaltyCustomers.map((account) => {
                  const threshold = Number(providerProfile.loyalty_reward_threshold) || 0;
                  const eligible = threshold > 0 && account.points_balance >= threshold;
                  return (
                    <div key={account.id} className="booking-item" style={{ alignItems: "center" }}>
                      <div className="booking-info" style={{ flex: 1 }}>
                        <div className="title">{account.users?.full_name || "Customer"}</div>
                        <div className="meta">{account.points_balance} points{threshold > 0 && !eligible ? ` · ${threshold - account.points_balance} to go` : ""}</div>
                      </div>
                      {eligible && (
                        <button className="btn-sm lime" disabled={redeemingId === account.id} onClick={() => redeemReward(account)}>
                          {redeemingId === account.id ? "Redeeming..." : "Mark reward given"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "bookings" && (
          <>
            <div className="portal-header"><h2>Bookings</h2><p>Manage your upcoming and past appointments.</p></div>
            <div className="card">
              <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>All bookings</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-sm lime" onClick={openWalkInForm}>+ Add appointment</button>
                  <button className="btn-sm forest" onClick={loadBookings} disabled={loadingBookings}>{loadingBookings ? "Refreshing..." : "Refresh"}</button>
                </div>
              </div>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: -8, marginBottom: 12 }}>
                Had someone ask you directly — in person, by phone, or WhatsApp — instead of booking through the app? Add it yourself with "+ Add appointment," no account needed on their end.
              </p>

              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="input-group" style={{ flex: 2 }}>
                  <input placeholder="Search by client name..." value={bookingSearch} onChange={e => setBookingSearch(e.target.value)} />
                </div>
                <div className="input-group" style={{ flex: 1 }}>
                  <select value={bookingSort} onChange={e => setBookingSort(e.target.value)}>
                    <option value="newest">Recently booked: newest first</option>
                    <option value="oldest">Recently booked: oldest first</option>
                  </select>
                </div>
                <div className="input-group" style={{ flex: 1 }}>
                  <select value={bookingStatusFilter} onChange={e => setBookingStatusFilter(e.target.value)}>
                    <option value="all">All statuses</option>
                    <option value="needs_action">Needs action ({pendingBookings.length})</option>
                    <option value="pending">Pending</option>
                    <option value="awaiting_payment">Awaiting payment</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled / declined</option>
                    <option value="no_show">No-shows</option>
                  </select>
                </div>
                {isBusinessPlan && staff.length > 0 && (
                  <div className="input-group" style={{ flex: 1 }}>
                    <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
                      <option value="all">Everyone's bookings</option>
                      <option value="unassigned">Unassigned</option>
                      {staff.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {addingWalkIn && (
                <div style={{ background: "var(--sand)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Add an appointment</div>
                  {services.length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--muted)" }}>Add a service under "My services" first, then come back here.</p>
                  ) : (
                    <>
                      <div className="input-group">
                        <label>Client's name *</label>
                        <input placeholder="e.g. Mrs. Alvarez" value={walkInForm.name} onChange={e => setWalkInForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div className="input-group">
                        <label>Client's phone (optional)</label>
                        <input placeholder="e.g. +501 600-0000" value={walkInForm.phone} onChange={e => setWalkInForm(f => ({ ...f, phone: e.target.value }))} />
                      </div>
                      <div className="input-group">
                        <label>Service *</label>
                        <select value={walkInForm.service_id} onChange={e => setWalkInForm(f => ({ ...f, service_id: e.target.value }))}>
                          {services.map(s => <option key={s.id} value={s.id}>{s.name} — BZ${s.price}</option>)}
                        </select>
                      </div>
                      <div className="form-row">
                        <div className="input-group">
                          <label>Date *</label>
                          <input type="date" value={walkInForm.date} onChange={e => setWalkInForm(f => ({ ...f, date: e.target.value }))} />
                        </div>
                        <div className="input-group">
                          <label>Time *</label>
                          <input type="time" value={walkInForm.time} onChange={e => setWalkInForm(f => ({ ...f, time: e.target.value }))} />
                        </div>
                      </div>
                      <div className="input-group">
                        <label>Notes (optional)</label>
                        <textarea placeholder="Anything you want to remember about this appointment..." value={walkInForm.notes} onChange={e => setWalkInForm(f => ({ ...f, notes: e.target.value }))} style={{ minHeight: 50 }} />
                      </div>
                      {walkInError && <p style={{ fontSize: 12, color: "#B91C1C", marginBottom: 8 }}>{walkInError}</p>}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn-sm lime" disabled={savingWalkIn} onClick={submitWalkIn}>{savingWalkIn ? "Saving..." : "Save appointment"}</button>
                        <button className="btn-sm ghost" onClick={closeWalkInForm}>Cancel</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {visibleBookings.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{loadingBookings ? "Loading..." : bookingSearch.trim() ? "No bookings match your search." : "No bookings yet."}</p>
              )}
              {visibleBookings.map((b) => (
                <div key={b.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                  <div className="booking-item" style={{ padding: 0, border: "none" }}>
                    <div className={`booking-dot ${bookingStatusClass(b.status)}`}></div>
                    <div className="booking-info">
                      <div className="title">
                        {b.services?.name || "Service"}
                        {b.is_vip && (
                          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "var(--forest)", background: "var(--lime)", padding: "2px 7px", borderRadius: 5, verticalAlign: "middle" }}>⚡ VIP</span>
                        )}
                        {b.created_by_provider && (
                          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--forest)", background: "var(--sand)", padding: "2px 7px", borderRadius: 5, verticalAlign: "middle" }}>Walk-in</span>
                        )}
                      </div>
                      <div className="meta">
                        {b.users?.full_name || b.walkin_customer_name || "Customer"}
                        {b.walkin_customer_phone && ` · ${b.walkin_customer_phone}`}
                        {" · "}{formatBookingWhen(b)}
                        {unreadByBooking[b.id] > 0 && (
                          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "var(--forest)", background: "var(--lime)", padding: "2px 7px", borderRadius: 999 }}>
                            💬 {unreadByBooking[b.id]} new
                          </span>
                        )}
                      </div>
                      {isBusinessPlan && staff.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <select
                            value={b.staff_id || ""}
                            onChange={(e) => assignBookingStaff(b.id, e.target.value || null)}
                            style={{ fontSize: 12, padding: "2px 6px" }}
                          >
                            <option value="">Unassigned</option>
                            {staff.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <span className="booking-amount">BZ${b.total_amount ?? b.services?.price ?? "—"}</span>
                      <span className={`status-pill ${bookingStatusClass(b.status)}`}>{statusLabel(b.status)}</span>
                      {b.status === "pending" && respondingId !== b.id && (
                        <>
                          <button className="btn-sm lime" disabled={busyId === b.id} onClick={() => openResponse(b.id, "accept")}>Accept</button>
                          <button className="btn-sm ghost" disabled={busyId === b.id} onClick={() => openResponse(b.id, "reject")}>Decline</button>
                        </>
                      )}
                      {b.status === "confirmed" && (
                        <button className="btn-sm forest" disabled={busyId === b.id} onClick={() => act(b.id, "completed")}>Mark done</button>
                      )}
                      {/* A booking you've already accepted has to be movable and
                          cancellable — otherwise a sick day, or a customer who
                          never pays their deposit, blocks that slot forever and
                          no refund can be recorded against it. */}
                      {["pending", "awaiting_payment", "confirmed"].includes(b.status) && reschedulingId !== b.id && !b.pending_reschedule_date && (
                        <button className="btn-sm ghost" disabled={busyId === b.id} onClick={() => openReschedule(b)}>Reschedule</button>
                      )}
                      {b.pending_reschedule_date && (
                        <button className="btn-sm ghost" disabled={withdrawingId === b.id} onClick={() => withdrawReschedule(b)}>
                          {withdrawingId === b.id ? "Withdrawing..." : "Withdraw proposal"}
                        </button>
                      )}
                      {["awaiting_payment", "confirmed"].includes(b.status) && (
                        <button className="btn-sm ghost" disabled={busyId === b.id} onClick={() => act(b.id, "cancelled")}>Cancel</button>
                      )}
                      {b.status === "confirmed" && (
                        <button className="btn-sm ghost" disabled={busyId === b.id} onClick={() => act(b.id, "no_show")}>No-show</button>
                      )}
                    </div>
                  </div>

                  {b.notes && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Customer note: {b.notes}</p>}

                  {b.pending_reschedule_date && (
                    <p style={{ fontSize: 12, color: "var(--forest)", marginTop: 6, fontWeight: 600 }}>
                      Waiting on customer to confirm the new time: {formatBookingWhen({ booking_date: b.pending_reschedule_date, booking_time: b.pending_reschedule_time })}
                    </p>
                  )}

                  {reschedulingId === b.id && (
                    <div style={{ marginTop: 10, background: "var(--sand)", borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Propose a new time</div>
                      <div className="form-row">
                        <div className="input-group">
                          <label>New date</label>
                          <input type="date" value={rescheduleForm.date} min={localDateStr()} onChange={e => setRescheduleForm(f => ({ ...f, date: e.target.value }))} />
                        </div>
                        <div className="input-group">
                          <label>New time</label>
                          <input type="time" value={rescheduleForm.time} onChange={e => setRescheduleForm(f => ({ ...f, time: e.target.value }))} />
                        </div>
                      </div>
                      {rescheduleError && <p style={{ color: "#B91C1C", fontSize: 12, marginBottom: 8 }}>{rescheduleError}</p>}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn-sm lime" disabled={savingReschedule} onClick={() => submitReschedule(b)}>{savingReschedule ? "Sending..." : "Propose new time"}</button>
                        <button className="btn-sm ghost" onClick={closeReschedule}>Cancel</button>
                      </div>
                      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                        The customer is notified and emailed, but the appointment won't move until they confirm the new time. They can also keep the original time instead.
                      </p>
                    </div>
                  )}

                  {respondingId === b.id && (
                    <div style={{ marginTop: 10, background: "var(--sand)", borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                        {responseType === "accept" ? "Accept this booking" : "Decline this booking"}
                      </div>
                      <textarea
                        placeholder={responseType === "accept" ? "Optional message for the customer..." : "Optional reason for declining..."}
                        value={responseMessage}
                        onChange={e => setResponseMessage(e.target.value)}
                        style={{ width: "100%", minHeight: 60, marginBottom: 8 }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className={`btn-sm ${responseType === "accept" ? "lime" : "forest"}`} disabled={busyId === b.id} onClick={() => submitResponse(b)}>
                          {busyId === b.id ? "Sending..." : responseType === "accept" ? "Confirm accept" : "Confirm decline"}
                        </button>
                        <button className="btn-sm ghost" onClick={cancelResponse}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {b.status !== "pending" && b.provider_message && (
                    <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Your note to customer: {b.provider_message}</p>
                  )}

                  {b.status === "awaiting_payment" && b.payment_status !== "receipt_uploaded" && (
                    <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Waiting for the customer to upload their deposit receipt.</p>
                  )}
                  {b.status === "awaiting_payment" && b.payment_status === "receipt_uploaded" && (
                    <div style={{ marginTop: 8, background: "var(--sand)", borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Deposit receipt uploaded</div>
                      {b.receipt_url && <a href="#" onClick={(e) => { e.preventDefault(); openPrivateFile(b.receipt_url); }} style={{ fontSize: 12 }}>View receipt</a>}
                      <div style={{ marginTop: 8 }}>
                        <button className="btn-sm lime" disabled={confirmingPaymentId === b.id} onClick={() => confirmPayment(b)}>
                          {confirmingPaymentId === b.id ? "Confirming..." : "Confirm payment received"}
                        </button>
                      </div>
                    </div>
                  )}

                  {b.status === "completed" && (
                    <>
                      <button
                        className="btn-sm ghost"
                        style={{ marginTop: 8, marginRight: 8, fontSize: 12 }}
                        onClick={() => printInvoice(buildInvoiceHtml({
                          orderNumber: b.order_number,
                          bookingDate: b.booking_date,
                          bookingTime: b.booking_time,
                          serviceName: b.services?.name || "Service",
                          amount: b.total_amount ?? b.services?.price,
                          depositAmount: b.downpayment_amount,
                          providerName: providerProfile?.business_name,
                          providerTaxId: providerProfile?.tax_id,
                          providerDistrict: providerProfile?.district,
                          providerWhatsapp: providerProfile?.whatsapp,
                          customerName: b.users?.full_name || b.walkin_customer_name || "Customer",
                          customerEmail: b.users?.email,
                        }))}
                      >
                        🧾 Print / download invoice
                      </button>
                      <FeatureGate flag="soap_charting">
                        <VisitNotesButton booking={b} />
                      </FeatureGate>
                    </>
                  )}

                  {["cancelled", "rejected"].includes(b.status) && (
                    b.booking_refunds && b.booking_refunds.length > 0 ? (
                      <div style={{ marginTop: 8, background: "#E7F5EC", borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--forest)" }}>💸 Refund recorded — BZ${b.booking_refunds[0].amount}</div>
                        {b.booking_refunds[0].note && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{b.booking_refunds[0].note}</p>}
                        {b.booking_refunds[0].receipt_url && <a href="#" onClick={(e) => { e.preventDefault(); openPrivateFile(b.booking_refunds[0].receipt_url); }} style={{ fontSize: 12 }}>View receipt</a>}
                      </div>
                    ) : refundingBookingId === b.id ? (
                      <div style={{ marginTop: 8, background: "var(--sand)", borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Record a refund for this booking</div>
                        <div className="input-group">
                          <label>Amount refunded (BZ$) *</label>
                          <input type="number" min="0" step="0.01" value={refundForm.amount} onChange={e => setRefundForm(f => ({ ...f, amount: e.target.value }))} />
                        </div>
                        <div className="input-group">
                          <label>Screenshot or receipt *</label>
                          <input key={refundFileKey} type="file" accept="image/*,application/pdf" onChange={e => setRefundForm(f => ({ ...f, receipt: e.target.files?.[0] || null }))} />
                        </div>
                        <div className="input-group">
                          <label>Note (optional)</label>
                          <input value={refundForm.note} onChange={e => setRefundForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Refunded via bank transfer" />
                        </div>
                        {refundError && <p style={{ fontSize: 12, color: "#B91C1C", marginBottom: 8 }}>{refundError}</p>}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn-sm lime" disabled={savingRefund} onClick={() => submitRefund(b.id)}>{savingRefund ? "Saving..." : "Save refund"}</button>
                          <button className="btn-sm ghost" onClick={closeRefundForm}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button className="btn-sm ghost" style={{ marginTop: 8, fontSize: 12 }} onClick={() => openRefundForm(b)}>Record a refund</button>
                    )
                  )}

                  {b.customer_id && ["pending", "awaiting_payment", "confirmed", "completed"].includes(b.status) && (
                    <BookingChat
                      bookingId={b.id}
                      currentUserId={user?.id}
                      currentRole="provider"
                      recipientUserId={b.customer_id}
                    />
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "calendar" && (
          <>
            <div className="portal-header"><h2>Availability</h2><p>Set your open slots. Customers can only book when you're available.</p></div>
            <div className="grid-2">
              <div className="card">
                <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <button className="btn-sm ghost" onClick={() => { setCalOffset(o => o - 1); setSelectedDay(null); }} aria-label="Previous month">‹</button>
                  <span>{monthLabel}</span>
                  <span style={{ display: "flex", gap: 6 }}>
                    {calOffset !== 0 && <button className="btn-sm ghost" onClick={() => { setCalOffset(0); setSelectedDay(null); }}>Today</button>}
                    <button className="btn-sm ghost" onClick={() => { setCalOffset(o => o + 1); setSelectedDay(null); }} aria-label="Next month">›</button>
                  </span>
                </div>
                <div className="cal-grid">
                  {DAYS.map(d => <div key={d} className="cal-day-label">{d}</div>)}
                  {calendarDays.map((d, i) => (
                    <div
                      key={i}
                      className={`cal-day ${d === null ? "empty" : ""} ${d === now.getDate() && calOffset === 0 ? "today" : ""} ${d && bookedDaysInMonth.has(d) ? "has-booking" : ""}`}
                      style={d && d === selectedDay ? { boxShadow: "inset 0 0 0 2px var(--forest)" } : undefined}
                      onClick={() => d && setSelectedDay(d === selectedDay ? null : d)}
                    >
                      {d || ""}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 12, color: "var(--muted)" }}>
                  <span>● Today</span>
                  <span style={{ color: "var(--lime)", fontSize: 14 }}>● </span><span>Has booking</span>
                </div>
                {selectedDay && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{monthLabel.split(" ")[0]} {selectedDay}</div>
                    {selectedDayBookings.length === 0 && <p style={{ fontSize: 12, color: "var(--muted)" }}>No bookings this day.</p>}
                    {selectedDayBookings.map(b => (
                      <div key={b.id} style={{ fontSize: 12, color: "var(--muted)", padding: "4px 0" }}>
                        {formatBookingTime(b.booking_time)} · {b.services?.name || "Service"} · {b.users?.full_name || b.walkin_customer_name || "Customer"}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="card">
                <div className="card-title">Working hours</div>
                {hours.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{d.day}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {d.is_open ? (
                        <>
                          <input type="time" value={d.start_time} onChange={e => setDayTime(i, "start_time", e.target.value)} style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "4px 6px" }} />
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>–</span>
                          <input type="time" value={d.end_time} onChange={e => setDayTime(i, "end_time", e.target.value)} style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "4px 6px" }} />
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>Closed</span>
                      )}
                      <div className={`toggle ${d.is_open ? "on" : ""}`} onClick={() => toggleDay(i)}></div>
                    </div>
                  </div>
                ))}
                <button className="btn-sm forest" style={{ marginTop: 12 }} onClick={saveHours} disabled={savingHours}>{savingHours ? "Saving..." : "Save hours"}</button>

                <div className="card-title" style={{ marginTop: 28 }}>Daily lunch break</div>
                <p style={{ fontSize: 13, color: "var(--muted)", marginTop: -8, marginBottom: 16 }}>Set it once and forget it — this time is automatically taken off your calendar every day, so you never have to block it yourself.</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: lunchForm.enabled ? "1px solid var(--border)" : "none" }}>
                  <span style={{ fontSize: 14 }}>Block my calendar for lunch every day</span>
                  <div className={`toggle ${lunchForm.enabled ? "on" : ""}`} onClick={() => setLunchForm(f => ({ ...f, enabled: !f.enabled }))}></div>
                </div>
                {lunchForm.enabled && (
                  <div className="form-row" style={{ marginTop: 12 }}>
                    <div className="input-group">
                      <label>Start time</label>
                      <select value={lunchForm.lunch_break_start} onChange={e => setLunchForm(f => ({ ...f, lunch_break_start: e.target.value }))}>
                        {Array.from({ length: 28 }, (_, i) => { const m = 6 * 60 + i * 30; const h = String(Math.floor(m / 60)).padStart(2, "0"); const mm = String(m % 60).padStart(2, "0"); return `${h}:${mm}`; }).map(t => {
                          const [h24, m] = t.split(":").map(Number);
                          const ampm = h24 >= 12 ? "PM" : "AM";
                          const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
                          return <option key={t} value={t}>{`${h12}:${String(m).padStart(2, "0")} ${ampm}`}</option>;
                        })}
                      </select>
                    </div>
                    <div className="input-group">
                      <label>Duration</label>
                      <select value={lunchForm.lunch_break_minutes} onChange={e => setLunchForm(f => ({ ...f, lunch_break_minutes: e.target.value }))}>
                        {[15, 30, 45, 60, 90].map(m => <option key={m} value={m}>{m} min</option>)}
                      </select>
                    </div>
                  </div>
                )}
                <button className="btn-sm forest" style={{ marginTop: 12 }} onClick={saveLunchSettings} disabled={savingLunch}>{savingLunch ? "Saving..." : "Save lunch break"}</button>
              </div>
            </div>

            {/* VAI CREATIVE — non-intrusive promo, bottom of Availability. */}
            <div className="vai-creative-promo">
              <div className="vai-creative-promo-text">
                <strong>✨ Vai Creative</strong>
                <span>Stand out from the crowd. Book a professional Vai Creative photo/video shoot for your shop.</span>
              </div>
              <a className="vai-creative-promo-btn" href={vaiCreativeWhatsAppUrl("provider dashboard")} target="_blank" rel="noreferrer">Contact Us</a>
            </div>
          </>
        )}

        {tab === "services" && (
          <>
            <div className="portal-header"><h2>My services</h2><p>The services customers can book from your profile.</p></div>
            <div className="card" style={{ maxWidth: 560 }}>
              <div className="card-title">Active services</div>
              {services.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "12px 0" }}>No services added yet. Add your first one below.</p>
              )}
              {services.map((s) => (
                <div className="provider-service" key={s.id}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{s.duration_min} min</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontWeight: 700, color: "var(--forest)" }}>BZ${s.price}</span>
                    <button className="btn-sm ghost" style={{ fontSize: 12 }} onClick={() => handleDeleteService(s.id)}>Remove</button>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <div className="card-title">Add a service</div>
                <div className="input-group"><label>Service name</label><input placeholder="e.g. Full Colour Treatment" value={serviceForm.name} onChange={e => setServiceForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="input-group"><label>Price (BZ$)</label><input type="number" placeholder="0" value={serviceForm.price} onChange={e => setServiceForm(f => ({ ...f, price: e.target.value }))} /></div>
                  <div className="input-group">
                    <label>Duration</label>
                    <select value={serviceForm.duration_min} onChange={e => setServiceForm(f => ({ ...f, duration_min: e.target.value }))}>
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>60 min</option>
                      <option value={90}>90 min</option>
                    </select>
                  </div>
                </div>
                <button className="btn-sm lime" onClick={handleAddService} disabled={savingService || !serviceForm.name.trim()}>{savingService ? "Adding..." : "Add service"}</button>
              </div>
            </div>
          </>
        )}

        {tab === "earnings" && (
          <>
            <div className="portal-header"><h2>Earnings</h2><p>Customers pay you directly — track your income here.</p></div>
            <div className="metric-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div className="metric"><div className="metric-label">Total earned</div><div className="metric-value" style={{ color: "var(--forest-light)" }}>BZ${totalNetEarned.toFixed(2)}</div><div className="metric-sub">All time, paid to you in full</div></div>
              <div className="metric"><div className="metric-label">Upcoming</div><div className="metric-value">BZ${pendingEarnings.toFixed(2)}</div><div className="metric-sub">Confirmed, not yet completed</div></div>
              <div className="metric"><div className="metric-label">This month ({currentMonthLabel})</div><div className="metric-value">BZ${thisMonthNetEarnings.toFixed(2)}</div><div className="metric-sub">{monthOverMonthPct === null ? "No data for last month" : `${monthOverMonthPct >= 0 ? "↑" : "↓"} ${Math.abs(monthOverMonthPct)}% vs last month`}</div></div>
            </div>
            <div className="card">
              <div className="card-title">Sales &amp; tax ledger</div>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
                Every completed booking in one printable/downloadable list, for your own tax filing — separate from the per-booking invoices you can print from each completed booking below.
              </p>
              <div className="form-row">
                <div className="input-group">
                  <label>From</label>
                  <input type="date" value={ledgerStart} onChange={e => setLedgerStart(e.target.value)} />
                </div>
                <div className="input-group">
                  <label>To</label>
                  <input type="date" value={ledgerEnd} onChange={e => setLedgerEnd(e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Tax rate % (optional)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder="e.g. 12.5"
                    value={ledgerTaxRate}
                    onChange={e => setLedgerTaxRate(e.target.value)}
                  />
                </div>
              </div>
              <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                Leave the rate blank for a plain sales total. Enter one and the ledger also shows the tax included in what you
                collected and the net figure underneath it — your prices are treated as tax-inclusive, which is how they're
                quoted to customers.
              </p>
              <button className="btn-sm forest" onClick={printLedger}>🧾 Print / download ledger</button>
            </div>
            <div className="card">
              <div className="card-title">Your payment details</div>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>Customers pay deposits and full payments straight to you — add a bank account, a mobile wallet, or both. This is what they'll see when it's time to pay.</p>

              {paymentMethods.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "8px 0" }}>No payment methods added yet. Add one below.</p>
              )}
              {paymentMethods.map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{m.type === "wallet" ? "📱" : "🏦"} {m.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{[m.account_name, m.account_number].filter(Boolean).join(" · ")}</div>
                  </div>
                  <button className="btn-sm ghost" style={{ fontSize: 12 }} onClick={() => handleDeletePaymentMethod(m.id)}>Remove</button>
                </div>
              ))}

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <div className="card-title">Add a payment method</div>
                <div className="input-group">
                  <label>Type</label>
                  <select value={paymentMethodForm.type} onChange={e => setPaymentMethodForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="bank">Bank account</option>
                    <option value="wallet">Mobile wallet</option>
                  </select>
                </div>
                <div className="grid-2">
                  <div className="input-group">
                    <label>{paymentMethodForm.type === "wallet" ? "Wallet name" : "Bank name"}</label>
                    <input value={paymentMethodForm.name} onChange={e => setPaymentMethodForm(f => ({ ...f, name: e.target.value }))} placeholder={paymentMethodForm.type === "wallet" ? "e.g. Wave, PayPal" : "e.g. Atlantic Bank"} />
                  </div>
                  <div className="input-group"><label>Account holder name</label><input value={paymentMethodForm.account_name} onChange={e => setPaymentMethodForm(f => ({ ...f, account_name: e.target.value }))} placeholder="Name on the account" /></div>
                </div>
                <div className="input-group">
                  <label>{paymentMethodForm.type === "wallet" ? "Wallet number / handle" : "Account number"}</label>
                  <input value={paymentMethodForm.account_number} onChange={e => setPaymentMethodForm(f => ({ ...f, account_number: e.target.value }))} placeholder={paymentMethodForm.type === "wallet" ? "Phone number or handle" : "Account number"} />
                </div>
                <button className="btn-sm lime" disabled={savingPaymentMethod || !paymentMethodForm.name.trim()} onClick={handleAddPaymentMethod}>{savingPaymentMethod ? "Adding..." : "Add payment method"}</button>
              </div>
            </div>
          </>
        )}

        {tab === "billing" && (() => {
          const currentPlan = PLANS.find((p) => p.id === (providerProfile?.plan || "starter")) || PLANS[0];
          const statusColor = { pending: "#B45309", confirmed: "var(--forest)", rejected: "#B91C1C" };
          const statusBg = { pending: "#FEF3C7", confirmed: "#E7F5EC", rejected: "#FEE2E2" };
          return (
            <>
              <div className="portal-header"><h2>My plan &amp; billing</h2><p>This is your VaiBook subscription — separate from what customers pay you for bookings.</p></div>

              <div className="card" style={{ maxWidth: 560 }}>
                <div className="card-title">Current plan</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{currentPlan.name} <span style={{ fontSize: 14, fontWeight: 500, color: "var(--muted)" }}>— {currentPlan.price}</span></div>
                <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{currentPlan.desc}</p>

                {currentPlan.monthly > 0 && providerProfile?.next_payment_due_date && (
                  <p style={{ fontSize: 13, fontWeight: 600, marginTop: 10, color: providerProfile.is_active ? "var(--dark-text)" : "#B91C1C" }}>
                    Next payment due {new Date(providerProfile.next_payment_due_date).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                )}
                {currentPlan.monthly > 0 && !providerProfile?.is_active && (
                  <div style={{ marginTop: 12, background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#B91C1C" }}>
                    Your listing is currently hidden from customers. If this is because a payment is overdue, upload your receipt below — you'll go back live as soon as it's confirmed.
                  </div>
                )}

                {currentPlan.monthly === 0 && (() => {
                  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
                  const usedThisMonth = bookings.filter((b) => new Date(b.created_at) >= monthStart).length;
                  const STARTER_CAP = 30;
                  const atCap = usedThisMonth >= STARTER_CAP;
                  return (
                    <>
                      <p style={{ fontSize: 13, color: "var(--forest)", fontWeight: 600, marginTop: 16 }}>You're on the free Starter plan — nothing to pay.</p>
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, color: atCap ? "#B91C1C" : "var(--muted)", fontWeight: 600, marginBottom: 4 }}>
                          {Math.min(usedThisMonth, STARTER_CAP)} of {STARTER_CAP} bookings used this month
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: "var(--sand)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(Math.min(usedThisMonth, STARTER_CAP) / STARTER_CAP) * 100}%`, background: atCap ? "#B91C1C" : "var(--forest)", borderRadius: 3 }} />
                        </div>
                        {atCap && (
                          <p style={{ fontSize: 12, color: "#B91C1C", marginTop: 6 }}>
                            You've hit this month's limit — new bookings will be turned away until next month, or you upgrade to Pro for unlimited bookings.
                          </p>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>

              {(() => {
                const chosenPlan = PLANS.find((p) => p.id === (payingForPlan || currentPlan.id)) || currentPlan;
                const isUpgrade = chosenPlan.id !== currentPlan.id;
                return (
                  <div className="card" style={{ maxWidth: 560, marginTop: 20 }}>
                    <div className="card-title">{currentPlan.monthly === 0 ? "Upgrade your plan" : "Pay for your plan"}</div>
                    <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
                      Pick the plan you're paying for, transfer the amount by bank or mobile wallet, and upload the receipt.
                      Admin confirms it, and your plan switches over as soon as they do — that's how an upgrade takes effect.
                    </p>

                    {PLANS.map((pl) => {
                      const selected = chosenPlan.id === pl.id;
                      return (
                        <label
                          key={pl.id}
                          style={{
                            display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", marginBottom: 8,
                            border: `1px solid ${selected ? "var(--forest)" : "var(--border)"}`,
                            background: selected ? "var(--sand)" : "transparent",
                            borderRadius: 10, cursor: "pointer",
                          }}
                        >
                          <input
                            type="radio"
                            name="plan-choice"
                            checked={selected}
                            onChange={() => setPayingForPlan(pl.id)}
                            style={{ marginTop: 3 }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>
                              {pl.name} <span style={{ fontWeight: 500, color: "var(--muted)" }}>— {pl.price}</span>
                              {pl.id === currentPlan.id && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "var(--forest)" }}>YOUR PLAN</span>}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{pl.desc}</div>
                          </div>
                        </label>
                      );
                    })}

                    {chosenPlan.monthly === 0 ? (
                      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
                        Starter is free — there's nothing to upload. To move down to Starter, email VaiBook and we'll switch you at the end of your paid period.
                      </p>
                    ) : (
                      <div style={{ marginTop: 8, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                        <p style={{ fontSize: 13, marginBottom: 12 }}>
                          {isUpgrade
                            ? `Send BZ$${chosenPlan.monthly} for the ${chosenPlan.name} plan, then upload the receipt — you'll move onto ${chosenPlan.name} once admin confirms it.`
                            : `Send BZ$${chosenPlan.monthly} for your ${chosenPlan.name} plan, then upload the receipt so admin can confirm it and keep your account active.`}
                        </p>
                        <div className="input-group">
                          <label>Which period is this for?</label>
                          <input value={paymentForm.periodLabel} onChange={e => setPaymentForm(f => ({ ...f, periodLabel: e.target.value }))} placeholder="e.g. September 2026" />
                        </div>
                        <div className="input-group">
                          <label>Receipt (image or PDF)</label>
                          <input key={paymentFileKey} type="file" accept="image/*,application/pdf" onChange={e => setPaymentForm(f => ({ ...f, receipt: e.target.files?.[0] || null }))} />
                        </div>
                        {paymentError && <p style={{ fontSize: 12, color: "#B91C1C", marginBottom: 8 }}>{paymentError}</p>}
                        <button className="btn-sm lime" disabled={submittingPayment} onClick={submitPayment}>
                          {submittingPayment ? "Uploading..." : isUpgrade ? `Submit payment for ${chosenPlan.name}` : "Submit payment"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="card" style={{ maxWidth: 560, marginTop: 20 }}>
                <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Payment history</span>
                  <button className="btn-sm forest" onClick={loadPayments} disabled={loadingPayments}>{loadingPayments ? "Refreshing..." : "Refresh"}</button>
                </div>
                {payments.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{loadingPayments ? "Loading..." : "No payments submitted yet."}</p>
                ) : (
                  payments.map((pmt) => (
                    <div key={pmt.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{pmt.period_label} — BZ${pmt.amount}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Submitted {new Date(pmt.submitted_at).toLocaleDateString()}</div>
                        {pmt.admin_note && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, fontStyle: "italic" }}>Admin note: {pmt.admin_note}</div>}
                        {pmt.receipt_url && <a href="#" onClick={(e) => { e.preventDefault(); openPrivateFile(pmt.receipt_url); }} style={{ fontSize: 12 }}>View receipt</a>}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: statusColor[pmt.status] || "var(--muted)", background: statusBg[pmt.status] || "var(--sand)", padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>
                        {pmt.status.charAt(0).toUpperCase() + pmt.status.slice(1)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          );
        })()}

        {tab === "staff" && (
          <>
            <div className="portal-header"><h2>My staff</h2><p>Add the people on your team — they'll sign in with their own Google account and only see their own bookings.</p></div>

            {!isBusinessPlan ? (
              <div className="card" style={{ maxWidth: 560 }}>
                <div className="card-title">This is a Business plan feature</div>
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
                  Staff seats let you add your team and each person gets their own login to see just their own bookings. Upgrade to the Business plan (BZ${PLANS.find(p => p.id === "business")?.monthly}/mo) to turn this on.
                </p>
                <button className="btn-sm lime" onClick={() => setTab("billing")}>View plans & billing</button>
              </div>
            ) : (
              <>
                <div className="card" style={{ maxWidth: 560 }}>
                  <div className="card-title">Add a staff member</div>
                  <div className="form-row">
                    <div className="input-group">
                      <label>Name *</label>
                      <input placeholder="e.g. Maria" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label>Phone (optional)</label>
                      <input placeholder="e.g. +501 600-0000" value={newStaffPhone} onChange={e => setNewStaffPhone(e.target.value)} />
                    </div>
                  </div>
                  <div className="input-group">
                    <label>Their email *</label>
                    <input type="email" placeholder="e.g. maria@gmail.com" value={newStaffEmail} onChange={e => setNewStaffEmail(e.target.value)} />
                  </div>
                  {staffError && <p style={{ fontSize: 12, color: "#B91C1C", marginBottom: 8 }}>{staffError}</p>}
                  <button className="btn-sm lime" disabled={savingStaff} onClick={addStaff}>{savingStaff ? "Adding..." : "Add staff member"}</button>
                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
                    They don't need an account yet — have them go to VaiBook, choose "VaiBook for professionals," and sign in with this exact email. Their own portal appears automatically, no chooser needed.
                  </p>
                </div>

                <div className="card" style={{ maxWidth: 560, marginTop: 20 }}>
                  <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Your team</span>
                    <button className="btn-sm forest" onClick={loadStaff} disabled={loadingStaff}>{loadingStaff ? "Refreshing..." : "Refresh"}</button>
                  </div>
                  {staff.length === 0 && (
                    <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{loadingStaff ? "Loading..." : "No staff added yet."}</p>
                  )}
                  {staff.map((member) => (
                    <div key={member.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>
                            {member.name}{!member.is_active && <span style={{ fontWeight: 500, color: "var(--muted)" }}> — inactive</span>}
                            {" "}
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: member.user_id ? "#E7F5EC" : "var(--sand)", color: member.user_id ? "var(--forest)" : "var(--muted)" }}>
                              {member.user_id ? "Signed in" : "Invited — hasn't signed in yet"}
                            </span>
                          </div>
                          {member.phone && <div style={{ fontSize: 12, color: "var(--muted)" }}>{member.phone}</div>}
                          {editingStaffEmailId === member.id ? (
                            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                              <input type="email" style={{ fontSize: 12, padding: "3px 6px" }} value={editStaffEmailValue} onChange={e => setEditStaffEmailValue(e.target.value)} />
                              <button className="btn-sm forest" style={{ padding: "2px 8px" }} onClick={() => saveStaffEmail(member)}>Save</button>
                              <button className="btn-sm ghost" style={{ padding: "2px 8px" }} onClick={() => setEditingStaffEmailId(null)}>Cancel</button>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>
                              {member.email || "No email set"}
                              {!member.user_id && (
                                <a href="#" style={{ marginLeft: 8 }} onClick={(e) => { e.preventDefault(); startEditStaffEmail(member); }}>{member.email ? "Edit" : "Add email"}</a>
                              )}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn-sm ghost" onClick={() => toggleStaffActive(member)}>{member.is_active ? "Set inactive" : "Set active"}</button>
                          <button className="btn-sm ghost" style={{ color: "#B91C1C" }} onClick={() => removeStaff(member)}>Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === "reviews" && (
          <>
            <div className="portal-header"><h2>My reviews</h2><p>What your customers said after their appointment. New 1-2 star reviews are held here privately for 48 hours before they're shown publicly, so the rating and count below can run ahead of what customers currently see on your profile.</p></div>
            <div className="card">
              <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  {myReviews.length > 0 && (
                    <>
                      <StarRating value={(myReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / myReviews.length).toFixed(1)} size={15} />{" "}
                      {(myReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / myReviews.length).toFixed(1)}{" "}
                    </>
                  )}
                  <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 13 }}>
                    {myReviews.length} review{myReviews.length === 1 ? "" : "s"}
                  </span>
                </span>
                <button className="btn-sm forest" onClick={loadMyReviews} disabled={loadingMyReviews}>{loadingMyReviews ? "Refreshing..." : "Refresh"}</button>
              </div>

              {myReviews.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "20px 0" }}>
                  {loadingMyReviews ? "Loading..." : "No reviews yet. Customers are invited to leave one as soon as you mark their booking done."}
                </p>
              )}

              {myReviews.map((r) => {
                const isHeld = r.hold_until && new Date(r.hold_until) > new Date();
                return (
                  <div key={r.id} className="booking-item" style={{ alignItems: "flex-start" }}>
                    <div className="booking-info" style={{ flex: 1 }}>
                      <div className="title" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <StarRating value={r.rating} />
                        <span>{r.users?.full_name || "Customer"}</span>
                        {isHeld && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--forest)", background: "var(--sand)", padding: "2px 8px", borderRadius: 999 }}>
                            🔒 Only you can see this — goes public {new Date(r.hold_until).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                      {r.comment && <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>{r.comment}</p>}
                      <div className="meta" style={{ marginTop: 6 }}>
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                      </div>
                      {isHeld && (
                        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
                          This customer's rating isn't visible to anyone else yet. If something went wrong, this is your window to reach out (their booking's chat, or WhatsApp) before it's public — if they update their rating, it'll reflect here right away.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 16, lineHeight: 1.6 }}>
                Reviews can't be edited or removed by a business — that's what makes them worth something to the customers
                reading them. If one is abusive or clearly not a real customer, email VaiBook and we'll look at it.
              </p>
            </div>
          </>
        )}

        {tab === "review" && (() => {
          const thisMonth = monthlyTrend.length ? monthlyTrend[monthlyTrend.length - 1] : null;
          const prevMonth = monthlyTrend.length > 1 ? monthlyTrend[monthlyTrend.length - 2] : null;
          const revenueDeltaPct = thisMonth && prevMonth && Number(prevMonth.revenue_total) > 0
            ? Math.round(((Number(thisMonth.revenue_total) - Number(prevMonth.revenue_total)) / Number(prevMonth.revenue_total)) * 100)
            : null;
          const completionPct = thisMonth && thisMonth.bookings_total > 0
            ? Math.round((thisMonth.bookings_completed / thisMonth.bookings_total) * 100)
            : null;
          const revenuePoints = monthlyTrend.map((m) => ({ label: monthLabelFromDateStr(m.month_start), y: Number(m.revenue_total) }));
          const bookingPoints = monthlyTrend.map((m) => ({ label: monthLabelFromDateStr(m.month_start), y: m.bookings_total }));
          const ratingPoints = monthlyTrend.map((m) => ({ label: monthLabelFromDateStr(m.month_start), y: m.avg_rating != null ? Number(m.avg_rating) : null }));

          return (
            <>
              <div className="portal-header">
                <h2>Monthly review</h2>
                <p>Your business, tracked month over month — the same trends a business owner watches.</p>
              </div>

              {loadingTrend && monthlyTrend.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>Loading...</p>
              ) : (
                <>
                  <div className="metric-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                    <div className="metric">
                      <div className="metric-label">Revenue this month</div>
                      <div className="metric-value" style={{ color: "var(--clay)" }}>BZ${thisMonth ? Number(thisMonth.revenue_total).toFixed(0) : "0"}</div>
                      <div className="metric-sub">{revenueDeltaPct === null ? "No data for last month" : `${revenueDeltaPct >= 0 ? "↑" : "↓"} ${Math.abs(revenueDeltaPct)}% vs last month`}</div>
                    </div>
                    <div className="metric">
                      <div className="metric-label">Bookings this month</div>
                      <div className="metric-value">{thisMonth ? thisMonth.bookings_total : 0}</div>
                      <div className="metric-sub">{completionPct === null ? "No bookings yet" : `${completionPct}% completed`}</div>
                    </div>
                    <div className="metric">
                      <div className="metric-label">Avg. rating this month</div>
                      <div className="metric-value">{thisMonth && thisMonth.avg_rating != null ? Number(thisMonth.avg_rating).toFixed(1) : "—"}</div>
                      <div className="metric-sub">{thisMonth && thisMonth.reviews_count ? `${thisMonth.reviews_count} review${thisMonth.reviews_count === 1 ? "" : "s"} this month` : "No reviews yet"}</div>
                    </div>
                  </div>

                  <div className="card" style={{ marginBottom: 20 }}>
                    <div className="card-title">Revenue trend</div>
                    <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: -8, marginBottom: 12 }}>Earnings from completed bookings, by month.</p>
                    <TrendChart points={revenuePoints} kind="line" color="#D4795A" formatValue={(v) => `$${Math.round(v)}`} />
                  </div>

                  <div className="card" style={{ marginBottom: 20 }}>
                    <div className="card-title">Booking volume</div>
                    <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: -8, marginBottom: 12 }}>Total bookings received each month.</p>
                    <TrendChart points={bookingPoints} kind="bar" color="#1BAF7A" formatValue={(v) => `${v}`} />
                  </div>

                  <div className="card">
                    <div className="card-title">Reviews &amp; ratings</div>
                    <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: -8, marginBottom: 12 }}>Your average star rating each month.</p>
                    <TrendChart points={ratingPoints} kind="line" color="#F59E0B" formatValue={(v) => `${v.toFixed(1)}★`} />
                    {monthlyTrend.some((m) => m.reviews_count > 0) && (
                      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 4, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                        {monthlyTrend.map((m) => (
                          <div key={m.month_start} style={{ textAlign: "center", fontSize: 11, color: "var(--muted)" }}>
                            {m.reviews_count} review{m.reviews_count === 1 ? "" : "s"}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 16 }}>
                    We also email you this summary automatically at the start of each month.
                  </p>
                </>
              )}
            </>
          );
        })()}

        {tab === "profile" && (
          <>
            <div className="portal-header"><h2>Public profile</h2><p>This is what customers see when they find you.</p></div>
            <div className="card" style={{ maxWidth: 560 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 72, height: 72, background: "var(--forest)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>✂️</div>
                <div>
                  <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 20, fontWeight: 700 }}>{providerProfile.business_name}</div>
                  <div style={{ color: "var(--muted)", fontSize: 14 }}>{providerProfile.service_type} · {providerProfile.district}</div>
                </div>
                <span className={`status-pill ${providerProfile.is_active ? "confirmed" : "pending"}`} style={{ marginLeft: "auto" }}>{providerProfile.is_active ? "✓ Verified" : "Pending activation"}</span>
              </div>
              <div className="input-group"><label>Business name</label><input value={profileForm.business_name} onChange={e => setProfileForm(f => ({ ...f, business_name: e.target.value }))} /></div>
              <div className="input-group"><label>About</label><textarea value={profileForm.bio} onChange={e => setProfileForm(f => ({ ...f, bio: e.target.value }))} /></div>
              <div className="input-group">
                <label>District</label>
                <select value={profileForm.district} onChange={e => setProfileForm(f => ({ ...f, district: e.target.value }))}>
                  {DISTRICTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="input-group"><label>WhatsApp / phone number</label><input placeholder="+501 600 0000" value={profileForm.whatsapp} onChange={e => setProfileForm(f => ({ ...f, whatsapp: e.target.value }))} /></div>
              <div className="input-group">
                <label>Business registration / TIN number (optional)</label>
                <input placeholder="Shows on your invoices once you're registered" value={profileForm.tax_id} onChange={e => setProfileForm(f => ({ ...f, tax_id: e.target.value }))} />
              </div>
              <button className="btn-sm forest" onClick={saveProfile} disabled={savingProfile}>{savingProfile ? "Saving..." : "Save profile"}</button>
            </div>

            <div className="card" style={{ maxWidth: 560, marginTop: 20 }}>
              <div className="card-title">Featured in district search</div>
              {isBusinessPlan ? (
                <>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
                    Turn this on and you'll show up at the top of "Find services" results for your district, ahead of non-featured listings — a Business plan perk.
                  </p>
                  <button className={profileForm.is_featured ? "btn-sm forest" : "btn-sm ghost"} disabled={savingFeatured} onClick={toggleFeatured}>
                    {savingFeatured ? "Saving..." : profileForm.is_featured ? "✓ Featured — tap to turn off" : "Turn on featured placement"}
                  </button>
                </>
              ) : (
                <p style={{ fontSize: 13, color: "var(--muted)" }}>
                  Business plan providers can turn on featured placement to show up at the top of search results in their district. <a href="#" onClick={(e) => { e.preventDefault(); setTab("billing"); }}>View plans</a>.
                </p>
              )}
            </div>

            <div className="card" style={{ maxWidth: 560, marginTop: 20 }}>
              <div className="card-title">Loyalty &amp; rewards program</div>
              {isProOrAbove ? (
                <>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
                    Turn this on to earn your customers points on every completed booking, based on how much they spend. When someone reaches your reward threshold, you'll see it here to redeem yourself, however you like — a discount, a free add-on, whatever you decide.
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div className={`toggle ${loyaltyForm.enabled ? "on" : ""}`} onClick={() => setLoyaltyForm(f => ({ ...f, enabled: !f.enabled }))}></div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{loyaltyForm.enabled ? "On" : "Off"}</span>
                  </div>
                  <div className="form-row">
                    <div className="input-group">
                      <label>Points per BZ$1 spent</label>
                      <input type="number" min="0" step="0.1" value={loyaltyForm.pointsPerDollar} onChange={e => setLoyaltyForm(f => ({ ...f, pointsPerDollar: e.target.value }))} />
                    </div>
                    <div className="input-group">
                      <label>Points needed for a reward</label>
                      <input type="number" min="1" step="1" value={loyaltyForm.threshold} onChange={e => setLoyaltyForm(f => ({ ...f, threshold: e.target.value }))} />
                    </div>
                  </div>
                  <div className="input-group">
                    <label>What's the reward?</label>
                    <input placeholder="e.g. 10% off your next visit, or a free add-on" value={loyaltyForm.description} onChange={e => setLoyaltyForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                  <button className="btn-sm forest" onClick={saveLoyaltySettings} disabled={savingLoyalty}>{savingLoyalty ? "Saving..." : "Save loyalty settings"}</button>
                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
                    Only bookings made by a signed-in customer earn points — walk-ins you add yourself don't have an account to attach points to.
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 13, color: "var(--muted)" }}>
                  Pro and Business plan providers can run their own loyalty program — set the earn rate and the reward yourself. <a href="#" onClick={(e) => { e.preventDefault(); setTab("billing"); }}>View plans</a>.
                </p>
              )}
            </div>

            <div className="card" style={{ maxWidth: 560, marginTop: 20 }}>
              <div className="card-title">VIP appointments</div>
              {isProOrAbove ? (
                <>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
                    VaiBook's VIP membership lets customers request an appointment with you outside your normal working hours — for a last-minute cut, an after-hours visit, whatever you're willing to take. Set one flat add-on price below and it's added on top of whatever service they book. Leave it blank to not offer this. You still see every VIP request as a normal booking request and can decline it like any other.
                  </p>
                  <div className="input-group">
                    <label>VIP add-on price (BZ$, on top of the service price)</label>
                    <input type="number" min="0" step="1" placeholder="e.g. 50" value={vipSurchargeForm} onChange={e => setVipSurchargeForm(e.target.value)} />
                  </div>
                  <button className="btn-sm forest" onClick={saveVipSurcharge} disabled={savingVipSurcharge}>
                    {savingVipSurcharge ? "Saving..." : Number(vipSurchargeForm) > 0 ? "Save VIP price" : "Save (VIP off)"}
                  </button>
                </>
              ) : (
                <p style={{ fontSize: 13, color: "var(--muted)" }}>
                  Pro and Business plan providers can accept VIP members' after-hours requests, at a price you set. <a href="#" onClick={(e) => { e.preventDefault(); setTab("billing"); }}>View plans</a>.
                </p>
              )}
            </div>

            <div className="card" style={{ maxWidth: 560, marginTop: 20 }}>
              <div className="card-title">Photos</div>
              <p style={{ color: "var(--muted)", fontSize: 13, marginTop: -8, marginBottom: 16 }}>Show off your work. Customers see these on your public profile.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                {photos.map((url) => (
                  <div key={url} style={{ position: "relative", width: 96, height: 96 }}>
                    <img src={url} alt="Provider work" loading="lazy" decoding="async" width={96} height={96} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }} />
                    <button
                      onClick={() => handleDeletePhoto(url)}
                      style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", background: "var(--forest)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, lineHeight: "22px" }}
                      title="Remove photo"
                    >×</button>
                  </div>
                ))}
                <label style={{ width: 96, height: 96, borderRadius: 10, border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
                  {uploadingPhoto ? "Uploading..." : "+ Add photo"}
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={uploadingPhoto} style={{ display: "none" }} />
                </label>
              </div>
            </div>

            <div className="card" style={{ maxWidth: 560, marginTop: 20 }}>
              <div className="card-title">Location</div>
              <p style={{ color: "var(--muted)", fontSize: 13, marginTop: -8, marginBottom: 16 }}>Click the map to drop a pin at your exact location. Customers will get a "Get Directions" link straight to it.</p>
              <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", marginBottom: 12 }}>
                <Suspense fallback={<MapLoadingFallback height={260} />}>
                  <ProviderLocationMap center={mapPosition || BELIZE_CENTER} zoom={mapPosition ? 15 : 8} position={mapPosition} onPick={setMapPosition} height={260} />
                </Suspense>
              </div>
              <div className="input-group"><label>Location label (optional)</label><input placeholder="e.g. Next to Brodie's, San Ignacio" value={locationLabel} onChange={e => setLocationLabel(e.target.value)} /></div>
              {mapPosition && (
                <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                  Pin set at {mapPosition[0].toFixed(5)}, {mapPosition[1].toFixed(5)} —{" "}
                  <a href={directionsUrl(mapPosition[0], mapPosition[1])} target="_blank" rel="noreferrer">preview directions</a>
                </p>
              )}
              <button className="btn-sm forest" onClick={saveLocation} disabled={savingLocation || !mapPosition}>{savingLocation ? "Saving..." : "Save location"}</button>
            </div>
          </>
        )}

        {tab === "modules" && <ModulesPanel />}

        {tab === "settings" && (
          <>
            <div className="portal-header"><h2>Settings</h2></div>
            <div className="card" style={{ maxWidth: 480 }}>
              <div className="card-title">Walk-ins</div>
              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: -8, marginBottom: 16 }}>Not every business takes walk-in customers. Turn this off if you're appointment-only — the Walk-In button will disappear from your dashboard, leaving just Custom Block.</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Accept walk-in customers</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Lets you log a walk-in sale from the dashboard as it happens.</div>
                </div>
                <div
                  className={`toggle ${acceptsWalkins ? "on" : ""}`}
                  style={{ opacity: savingWalkinPref ? 0.5 : 1, flexShrink: 0 }}
                  onClick={toggleAcceptsWalkins}
                ></div>
              </div>
            </div>

            <div className="card" style={{ maxWidth: 480, marginTop: 20 }}>
              <div className="card-title">Deposit requirement</div>
              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: -8, marginBottom: 16 }}>If turned on, customers must pay a deposit and upload a receipt before their booking is confirmed.</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 14 }}>Require a deposit before confirming</span>
                <div className={`toggle ${depositForm.downpayment_required ? "on" : ""}`} onClick={() => setDepositForm(f => ({ ...f, downpayment_required: !f.downpayment_required }))}></div>
              </div>
              {depositForm.downpayment_required && (
                <div className="input-group" style={{ marginTop: 12 }}>
                  <label>Deposit percentage</label>
                  <select value={depositForm.downpayment_pct} onChange={e => setDepositForm(f => ({ ...f, downpayment_pct: e.target.value }))}>
                    {[25, 50, 75, 100].map(p => <option key={p} value={p}>{p}%</option>)}
                  </select>
                </div>
              )}

              {!depositForm.downpayment_required && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)", gap: 16 }}>
                  <div>
                    <span style={{ fontSize: 14 }}>Skip review for these bookings</span>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Since no deposit is required, a booking can either wait in Pending for you to accept it, or book straight in as confirmed. This only applies when a deposit isn't required — a deposit booking always needs your accept.
                    </div>
                  </div>
                  <div className={`toggle ${depositForm.auto_confirm_bookings ? "on" : ""}`} onClick={() => setDepositForm(f => ({ ...f, auto_confirm_bookings: !f.auto_confirm_bookings }))}></div>
                </div>
              )}
              <button className="btn-sm forest" style={{ marginTop: 12 }} onClick={saveDepositSettings} disabled={savingDeposit}>{savingDeposit ? "Saving..." : "Save deposit settings"}</button>

              <div className="card-title" style={{ marginTop: 28 }}>Notifications</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Email me about new bookings</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Sends an email the moment a customer requests a booking, so you don't have to be in the app to know.
                  </div>
                </div>
                <div
                  className={`toggle ${emailOnNewBooking ? "on" : ""}`}
                  style={{ opacity: savingNotifyPref ? 0.5 : 1, flexShrink: 0 }}
                  onClick={toggleEmailOnNewBooking}
                ></div>
              </div>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.6 }}>
                Everything else — booking requests, cancellations, deposit receipts, completed bookings and new reviews —
                always shows up in your notification bell 🔔 at the top of the portal.
              </p>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)", gap: 16, marginTop: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Push notifications on this device</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Get a notification the instant a booking request comes in, even with VaiBook closed. Free — no SMS needed.
                  </div>
                </div>
                {pushEnabled ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--forest)", flexShrink: 0 }}>✓ On</span>
                ) : (
                  <button className="btn-sm forest" style={{ flexShrink: 0 }} onClick={enablePushNotifications} disabled={subscribingPush}>
                    {subscribingPush ? "Turning on..." : "Turn on"}
                  </button>
                )}
              </div>
              {pushError && <p style={{ fontSize: 12, color: "#B91C1C", marginTop: 8 }}>{pushError}</p>}

              <div className="card-title" style={{ marginTop: 24 }}>What VaiBook charges</div>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                Your monthly subscription, and nothing else. VaiBook never handles your customers' payments and takes no
                cut of a booking — every dollar a customer pays you is yours, which is why the Earnings figures above match
                your invoices and your tax ledger exactly.
              </p>
            </div>
          </>
        )}
      </main>

      {/* CUSTOM BLOCK — bottom sheet, not a modal: say when you'll be back —
          "15m", "30m", "1h", or an exact resume time. Purely a pause from
          the business (lunch, an errand, stepping away) — no "walk-in"
          option in here, since that word now means the separate revenue
          action above. The block always starts right now; only the end
          time is asked for. This is the ONLY pause/break entry point on
          the dashboard — the old standalone one-tap 30-min button was
          removed so there's exactly one place this can happen. */}
      {showBlockSheet && (
        <div className="sheet-overlay" onClick={closeBlockSheet}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle"></div>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 4px", color: "var(--dark-text)" }}>When will you be back?</h3>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>Blocks your calendar starting right now.</p>
            <div className="preset-row">
              <button className={`preset-btn ${blockSheetResumeMode === "in15m" ? "active" : ""}`} onClick={() => setBlockSheetResumeMode("in15m")}>15m</button>
              <button className={`preset-btn ${blockSheetResumeMode === "in30m" ? "active" : ""}`} onClick={() => setBlockSheetResumeMode("in30m")}>30m</button>
              <button className={`preset-btn ${blockSheetResumeMode === "in1h" ? "active" : ""}`} onClick={() => setBlockSheetResumeMode("in1h")}>1h</button>
              <button className={`preset-btn ${blockSheetResumeMode === "custom" ? "active" : ""}`} onClick={() => setBlockSheetResumeMode("custom")}>Resume at...</button>
            </div>
            {blockSheetResumeMode === "custom" && (
              <div className="input-group" style={{ marginBottom: 12 }}>
                <label>Resume at</label>
                <input type="time" value={blockSheetResumeAt} onChange={(e) => setBlockSheetResumeAt(e.target.value)} />
              </div>
            )}
            {blockError && <p style={{ fontSize: 12, color: "#B91C1C", marginBottom: 12 }}>{blockError}</p>}
            <button className="btn-sm forest" style={{ width: "100%", padding: "14px 0", fontSize: 15, borderRadius: 12 }} disabled={savingBlock} onClick={submitBlockSheet}>
              {savingBlock ? "Blocking..." : (() => {
                const end = resolveBlockSheetEnd();
                return end && end > new Date() ? `Block until ${formatBookingTime(localTimeStr(end))}` : "Block calendar";
              })()}
            </button>
            <button className="btn-sm ghost" style={{ width: "100%", padding: "12px 0", marginTop: 8 }} onClick={closeBlockSheet}>Cancel</button>
          </div>
        </div>
      )}

      {/* WALK-IN SALE — bottom sheet: tap the service(s) this customer is
          getting right now, see the running total, submit. Creates the
          booking as done and paid on the spot — no date/time/name form,
          unlike "+ Add appointment" in the Bookings tab. */}
      {showWalkInSheet && (
        <div className="sheet-overlay" onClick={closeWalkInSheet}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle"></div>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 4px", color: "var(--dark-text)" }}>Walk-In Sale</h3>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>Tap what they're getting today.</p>
            <div style={{ maxHeight: "45vh", overflowY: "auto", marginBottom: 12 }}>
              {activeServices.map((s) => {
                const active = walkInSaleServiceIds.includes(s.id);
                return (
                  <div key={s.id} className={`service-card ${active ? "active" : ""}`} onClick={() => toggleWalkInSaleService(s.id)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className="service-card-check">✓</span>
                      <div>
                        <div className="service-card-name" style={{ fontWeight: 600, fontSize: 14, color: "var(--dark-text)" }}>{s.name}</div>
                        <div className="service-card-meta" style={{ fontSize: 12, color: "var(--muted)" }}>{s.duration_min} min · BZ${s.price}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {walkInSaleServiceIds.length > 0 && (
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark-text)", margin: "0 0 12px" }}>
                Total: BZ${walkInSaleTotal.toFixed(2)} · {walkInSaleDuration} min · {walkInSaleServiceIds.length} service{walkInSaleServiceIds.length === 1 ? "" : "s"}
              </p>
            )}
            {walkInSaleError && <p style={{ fontSize: 12, color: "#B91C1C", marginBottom: 12 }}>{walkInSaleError}</p>}
            <button
              className="btn-sm forest"
              style={{ width: "100%", padding: "14px 0", fontSize: 15, borderRadius: 12 }}
              disabled={savingWalkInSale || walkInSaleServiceIds.length === 0}
              onClick={submitWalkInSale}
            >
              {savingWalkInSale ? "Logging sale..." : walkInSaleServiceIds.length > 0 ? `Log sale — BZ${walkInSaleTotal.toFixed(2)}` : "Log sale"}
            </button>
            <button className="btn-sm ghost" style={{ width: "100%", padding: "12px 0", marginTop: 8 }} onClick={closeWalkInSheet}>Cancel</button>
          </div>
        </div>
      )}

      {/* ELITE WELCOME — the launch graphic modal. Lazy-loaded (pulls in
          the qrcode package) so it only costs bandwidth the moment a
          provider actually opens it. */}
      {showLaunchGraphic && (
        <div className="qr-modal-overlay" onClick={() => setShowLaunchGraphic(false)}>
          <button className="qr-modal-close" onClick={() => setShowLaunchGraphic(false)} aria-label="Close launch graphic">✕</button>
          <div className="plaque-modal-panel" onClick={(e) => e.stopPropagation()}>
            <Suspense fallback={<div className="plaque-loading">Preparing your launch graphic...</div>}>
              <WelcomePlaqueGenerator businessName={providerProfile.business_name} bookingUrl={bookingUrl} />
            </Suspense>
          </div>
        </div>
      )}

      {/* SHOW QR CODE — full-screen so a customer standing next to you can
          just point their camera at the phone, no pinch-zooming a small
          card. Same qrserver.com-generated image the old QR tab used. */}
      {showQrModal && (
        <div className="qr-modal-overlay" onClick={() => setShowQrModal(false)}>
          <button className="qr-modal-close" onClick={() => setShowQrModal(false)} aria-label="Close QR code">✕</button>
          <div className="qr-modal-panel" onClick={(e) => e.stopPropagation()}>
            <img
              src={qrImageUrl}
              alt={`QR code linking to ${providerProfile?.business_name || "your"} booking page`}
              className="qr-modal-img"
            />
            <div className="qr-modal-business">{providerProfile?.business_name || "Book with us"}</div>
            <p className="qr-modal-hint">Scan to book instantly on VaiBook</p>
          </div>
        </div>
      )}

      {/* SEND CHECK-IN — no bulk SMS/WhatsApp API behind this (VaiBook has
          no messaging backend), so each quiet regular gets their own
          prefilled wa.me link, one tap each, instead of a fake "blast". */}
      {showCheckInModal && (
        <div className="sheet-overlay" onClick={() => setShowCheckInModal(false)}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle"></div>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 4px", color: "var(--dark-text)" }}>Send a check-in</h3>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>Tap a customer to open a prefilled WhatsApp message.</p>
            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              {quietRegulars.map((c, i) => {
                const daysAgo = Math.round((now.getTime() - c.lastDate.getTime()) / (24 * 60 * 60 * 1000));
                const msg = `Hi ${c.name}, it's been a while — ready to book your next appointment with ${providerProfile?.business_name || "us"}? You can grab a time right on VaiBook: ${bookingUrl}`;
                const waUrl = c.phone ? `https://wa.me/${c.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(msg)}` : null;
                return (
                  <div className="block-row" key={i}>
                    <div className="dot"></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dark-text)" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>Last visit {daysAgo} days ago</div>
                    </div>
                    {waUrl ? (
                      <a className="btn-sm forest" style={{ textDecoration: "none" }} href={waUrl} target="_blank" rel="noreferrer">💬 Message</a>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>No phone on file</span>
                    )}
                  </div>
                );
              })}
            </div>
            <button className="btn-sm ghost" style={{ width: "100%", padding: "12px 0", marginTop: 16 }} onClick={() => setShowCheckInModal(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
    </FeatureFlagsProvider>
  );
}

// ── PROVIDER SIGNUP ─────────────────────────────────────────────
const SIGNUP_CSS = `
  .signup-wrap {
    min-height: calc(100vh - 64px);
    background: var(--sand);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 48px 24px 80px;
  }
  .signup-box {
    width: 100%;
    max-width: 640px;
  }
  .signup-header {
    text-align: center;
    margin-bottom: 36px;
  }
  .signup-header h1 {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 34px;
    font-weight: 800;
    color: var(--forest);
    margin-bottom: 8px;
  }
  .signup-header p {
    font-size: 15px;
    color: var(--muted);
    line-height: 1.6;
  }
  .plan-selector {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 28px;
  }
  .plan-option {
    border: 2px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    cursor: pointer;
    background: white;
    transition: all .2s;
    text-align: center;
  }
  .plan-option:hover { border-color: var(--forest); }
  .plan-option.selected { border-color: var(--forest); background: var(--forest); }
  .plan-option.selected .plan-name { color: var(--lime); }
  .plan-option.selected .plan-price { color: white; }
  .plan-option.selected .plan-desc { color: rgba(255,255,255,0.6); }
  .plan-name { font-size: 13px; font-weight: 700; color: var(--forest); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
  .plan-price { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 22px; font-weight: 800; color: var(--forest); margin-bottom: 4px; }
  .plan-desc { font-size: 11px; color: var(--muted); line-height: 1.4; }
  .signup-form-card {
    background: white;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 32px;
    margin-bottom: 20px;
  }
  .form-section-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--forest);
    text-transform: uppercase;
    letter-spacing: .08em;
    margin-bottom: 18px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .signup-submit {
    width: 100%;
    padding: 16px;
    background: var(--forest);
    color: var(--near-white);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity .2s;
    font-family: 'Plus Jakarta Sans', sans-serif;
  }
  .signup-submit:hover { opacity: .88; }
  .signup-submit:disabled { opacity: .5; cursor: not-allowed; }
  .signup-success {
    text-align: center;
    padding: 60px 32px;
    background: white;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .signup-success .check { font-size: 56px; margin-bottom: 16px; }
  .signup-success h2 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 26px; color: var(--forest); margin-bottom: 10px; }
  .signup-success p { font-size: 15px; color: var(--muted); line-height: 1.6; max-width: 380px; margin: 0 auto 24px; }
  .payment-info {
    background: var(--sand);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 16px 20px;
    margin-top: 16px;
    text-align: left;
  }
  .payment-info h4 { font-size: 13px; font-weight: 700; color: var(--forest); margin-bottom: 8px; }
  .payment-info p { font-size: 13px; color: var(--muted); line-height: 1.65; }
  .payment-info strong { color: var(--dark-text); }
  @media (max-width: 600px) {
    .plan-selector { grid-template-columns: 1fr; }
    .form-row { grid-template-columns: 1fr; }
    .signup-form-card { padding: 20px; }
  }
`;

// PROVIDER LANDING — the premium, dark/neon marketing preamble that sits
// above the (light-mode, unchanged) application form below it. Written
// mobile-first on purpose: every rule here is the phone layout by default,
// and the @media (min-width: 860px) block is what adds the wider desktop
// treatment, not the other way around.
const PROVIDER_LANDING_CSS = `
  .pl-root { background: #081F17; overflow: hidden; }

  /* HERO */
  .pl-hero {
    position: relative;
    padding: 64px 20px 56px;
    background: radial-gradient(circle at 50% 0%, #123F2E 0%, #081F17 62%);
    text-align: center;
  }
  .pl-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--lime);
    background: rgba(198,241,53,0.1);
    border: 1px solid rgba(198,241,53,0.35);
    padding: 7px 14px;
    border-radius: 100px;
    margin-bottom: 22px;
  }
  .pl-hero h1 {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 800;
    font-size: 34px;
    line-height: 1.12;
    letter-spacing: -0.01em;
    color: #FFFFFF;
    max-width: 640px;
    margin: 0 auto 18px;
  }
  .pl-hero-sub {
    font-size: 15.5px;
    line-height: 1.6;
    color: rgba(245,239,224,0.68);
    max-width: 460px;
    margin: 0 auto 30px;
  }
  .pl-cta {
    display: inline-block;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 16.5px;
    font-weight: 800;
    color: #081F17;
    background: var(--lime);
    border: none;
    padding: 19px 40px;
    border-radius: 100px;
    cursor: pointer;
    box-shadow: 0 0 0 1px rgba(198,241,53,0.4), 0 18px 40px rgba(198,241,53,0.28);
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .pl-cta:hover { transform: translateY(-2px); box-shadow: 0 0 0 1px rgba(198,241,53,0.55), 0 22px 48px rgba(198,241,53,0.38); }

  /* PHONE MOCKUP — a CSS-drawn placeholder standing in for the real
     dashboard, not a screenshot, so it never goes stale as that UI evolves. */
  .pl-phone-stage { position: relative; margin: 52px auto 0; width: 260px; height: 360px; }
  .pl-phone-glow { position: absolute; inset: -30px; background: radial-gradient(circle, rgba(198,241,53,0.35) 0%, rgba(198,241,53,0) 70%); filter: blur(6px); }
  .pl-phone {
    position: relative;
    width: 260px;
    height: 360px;
    background: linear-gradient(160deg, #0D3D2E 0%, #061711 100%);
    border: 3px solid rgba(255,255,255,0.12);
    border-radius: 34px;
    box-shadow: 0 40px 80px rgba(0,0,0,0.55);
    transform: rotate(-6deg);
    padding: 20px 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .pl-phone::before {
    content: '';
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    width: 64px;
    height: 6px;
    border-radius: 4px;
    background: rgba(255,255,255,0.18);
  }
  .pl-phone-card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 14px; margin-top: 14px; }
  .pl-phone-label { font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: rgba(245,239,224,0.5); margin-bottom: 6px; }
  .pl-phone-value { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 24px; font-weight: 800; color: var(--lime); }
  .pl-phone-row { display: flex; align-items: center; justify-content: space-between; }
  .pl-phone-chip { font-size: 10px; font-weight: 700; color: #081F17; background: var(--lime); padding: 3px 8px; border-radius: 100px; }
  .pl-phone-name { font-size: 13px; font-weight: 700; color: #FFFFFF; margin-top: 10px; }
  .pl-phone-meta { font-size: 11px; color: rgba(245,239,224,0.55); margin-top: 2px; }

  /* FEATURES — alternating full-width rows, not a grid. */
  .pl-features { background: #081F17; padding: 64px 0 24px; }
  .pl-feature-row {
    display: flex;
    flex-direction: column;
    gap: 32px;
    align-items: center;
    padding: 40px 24px;
    border-top: 1px solid rgba(255,255,255,0.08);
  }
  .pl-feature-row:first-child { border-top: none; }
  .pl-feature-visual { width: 100%; max-width: 320px; flex-shrink: 0; }
  .pl-feature-text { max-width: 460px; text-align: center; }
  .pl-feature-kicker { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--lime); margin-bottom: 10px; }
  .pl-feature-text h3 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 26px; font-weight: 800; color: #FFFFFF; margin-bottom: 12px; line-height: 1.2; }
  .pl-feature-text p { font-size: 15px; line-height: 1.6; color: rgba(245,239,224,0.65); }

  /* Feature 1 visual — the "2-Tap" idea: two big numbered taps collapsing
     into a logged sale, echoing the real Walk-In flow. */
  .pl-tap-demo { display: flex; align-items: center; justify-content: center; gap: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 28px 16px; }
  .pl-tap-circle { width: 56px; height: 56px; border-radius: 50%; background: rgba(198,241,53,0.12); border: 1.5px solid var(--lime); color: var(--lime); font-weight: 800; font-size: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .pl-tap-arrow { color: rgba(245,239,224,0.35); font-size: 18px; }
  .pl-tap-result { background: var(--lime); color: #081F17; font-weight: 800; font-size: 13px; padding: 10px 14px; border-radius: 12px; white-space: nowrap; }

  /* Feature 2 visual — a stylized (non-functional, decorative) QR block. */
  .pl-qr-demo { display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 28px; }
  .pl-qr-card { background: #FAFAF7; border-radius: 14px; padding: 16px; display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; width: 132px; height: 132px; box-shadow: 0 0 0 1px rgba(198,241,53,0.3), 0 0 30px rgba(198,241,53,0.25); }
  .pl-qr-card span { background: #0D3D2E; border-radius: 2px; }
  .pl-qr-card span.off { background: transparent; }

  /* SOCIAL PROOF */
  .pl-social { background: linear-gradient(180deg, #081F17 0%, #0D3D2E 100%); padding: 56px 24px 0; text-align: center; }
  .pl-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .04em;
    color: var(--lime);
    background: rgba(198,241,53,0.1);
    border: 1px solid rgba(198,241,53,0.4);
    padding: 9px 18px;
    border-radius: 100px;
    margin-bottom: 20px;
    box-shadow: 0 0 24px rgba(198,241,53,0.35);
  }
  .pl-social p { font-size: 16px; font-weight: 600; color: #FFFFFF; max-width: 420px; margin: 0 auto 36px; line-height: 1.5; }
  .pl-ticker-mask { overflow: hidden; border-top: 1px solid rgba(255,255,255,0.08); padding: 22px 0; }
  .pl-ticker-track { display: flex; width: max-content; gap: 40px; animation: pl-scroll 22s linear infinite; }
  .pl-ticker-track span { font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: rgba(245,239,224,0.4); white-space: nowrap; }
  @keyframes pl-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  @media (prefers-reduced-motion: reduce) {
    .pl-ticker-track { animation: none; }
  }

  @media (min-width: 860px) {
    .pl-hero { padding: 100px 24px 80px; text-align: left; }
    .pl-hero-inner { display: flex; align-items: center; justify-content: center; gap: 72px; max-width: 1080px; margin: 0 auto; }
    .pl-hero-copy { flex: 1; max-width: 480px; }
    .pl-hero h1 { font-size: 48px; margin: 0 0 20px; }
    .pl-hero-sub { margin: 0 0 34px; }
    .pl-phone-stage { margin: 0; flex-shrink: 0; }
    .pl-feature-row { flex-direction: row; text-align: left; padding: 56px 48px; gap: 64px; max-width: 1080px; margin: 0 auto; }
    .pl-feature-row.reverse { flex-direction: row-reverse; }
    .pl-feature-text { text-align: left; }
    .pl-feature-visual { max-width: 380px; }
  }
`;

// `desc` stays a short one-liner for the compact pickers already using it
// (signup form, billing tab); `tagline`/`features`/`recommended` are for
// the public pricing section on the landing page. Every line in
// `features` is something actually built and enforced — nothing here
// should overclaim beyond what the app actually does.
//
// Loyalty & rewards moved from Business-only to Pro-and-above (both plans
// share it now — the only differences between Pro and Business are staff
// seats and featured search placement). The "✓ Pro"/"✓ Business" badge on
// a provider's listing is likewise real and enforced (see planBadge()) —
// it only reflects which plan a provider is paying for, nothing more.
// ── VAI CREATIVE — a separate, high-end agency add-on (photo/video shoots,
// social management), deliberately kept OUT of the self-serve plan grid
// above so it never shows a price or a "Buy" button next to it — it's an
// inquiry, not a checkout. Both CTAs below open a prefilled WhatsApp chat;
// TODO Abner: replace this placeholder number (and the fallback email) with
// Vai Creative's real contact info before this goes live.
const VAI_CREATIVE_WHATSAPP = "50100000000"; // digits only: country code + number, no +, no spaces
const VAI_CREATIVE_EMAIL = "creative@vaibook.bz";
const vaiCreativeWhatsAppUrl = (source) =>
  `https://wa.me/${VAI_CREATIVE_WHATSAPP}?text=${encodeURIComponent(`Hi! I'm interested in a Vai Creative photo/video shoot for my shop. (via ${source})`)}`;
const vaiCreativeMailtoUrl = () =>
  `mailto:${VAI_CREATIVE_EMAIL}?subject=${encodeURIComponent("Vai Creative inquiry")}&body=${encodeURIComponent("Hi, I'd like to book a Vai Creative photo/video shoot for my shop.")}`;

const PLANS = [
  {
    id: "starter", name: "Starter", price: "Free", desc: "Up to 30 bookings/month", monthly: 0,
    tagline: "Get listed and start taking bookings — no cost, no card required.",
    features: [
      "Up to 30 bookings a month",
      "Your own booking page & calendar",
      "Customer messaging & notifications",
      "Client reviews",
      "Invoices, refunds & sales ledger",
    ],
  },
  {
    id: "pro", name: "Pro", price: "BZ$50/mo", desc: "For solo practitioners", monthly: 50,
    tagline: "For solo practitioners who want frictionless booking, automated reminders, and deposits handled for them.",
    recommended: true,
    features: [
      "24/7 guest booking — no app download for your clients",
      "Automated appointment reminders to cut no-shows",
      "Customizable deposits routed to your bank",
      "Your own booking page & calendar",
      "Loyalty & rewards program",
      "A \"Pro\" badge customers see on your listing",
    ],
  },
  {
    id: "business", name: "Team", price: "BZ$120/mo", desc: "Base fee + per-seat pricing", monthly: 120,
    priceNote: "Base fee, plus a per-seat add-on as you bring on staff",
    tagline: "For teams — a base plan covering your shop, plus staff seats you add as you grow.",
    features: [
      "Everything in Pro",
      "Staff seats with their own logins",
      "Featured placement in district search",
      "A \"Team\" badge customers see on your listing",
    ],
  },
];

// Public-facing plan list for the marketing pricing section and the new
// provider signup picker — deliberately excludes "starter". Existing
// providers already on the free Starter plan (and the booking-cap
// enforcement in create_booking_safe / STARTER_CAP) are untouched: PLANS
// itself still carries the starter entry so every lookup that resolves an
// existing provider's plan (billing tab, admin, badges) keeps working.
// This list only controls what a NEW visitor is offered.
const PUBLIC_PLANS = PLANS.filter((p) => p.id !== "starter");

// VaiBook VIP — a customer-facing membership (separate from the provider
// plans above): once active, a customer can request an appointment outside
// a Pro/Business provider's normal hours, at that provider's own VIP price
// (set under their "VIP appointments" profile card). Billed the same
// hands-off way as provider plans — bank transfer + receipt, admin
// confirms, 30 days of VIP status per confirmed payment.
// PRICE NOT FINALIZED — change VIP_MEMBERSHIP.monthly here once decided;
// every place that shows the price (Settings, admin) reads from this one
// constant.
const VIP_MEMBERSHIP = { monthly: 25, label: "VaiBook VIP" };

const DISTRICTS = ["Belize City", "Cayo", "Corozal", "Orange Walk", "Stann Creek", "Toledo"];
const SERVICE_TYPES = ["Barber", "Hair Salon", "Nail Tech", "Spa", "Med Spa / Clinic", "Massage", "Skincare Studio", "Hair Removal Studio", "Tattoo & Piercing Studio", "Wellness Center", "Pet Grooming", "Fitness & Recovery", "Physical Therapy", "Photography", "Other"];

function ProviderSignup({ onNav }) {
  const [plan, setPlan] = useState(() => {
    try {
      const stashed = localStorage.getItem("vaibook_signup_plan");
      localStorage.removeItem("vaibook_signup_plan");
      if (stashed && PUBLIC_PLANS.some((p) => p.id === stashed)) return stashed;
    } catch (e) { /* ignore */ }
    return "pro";
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [form, setForm] = useState({
    businessName: "", ownerName: "", email: "", phone: "",
    serviceType: "", district: "", description: "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    const required = ["businessName", "ownerName", "email", "phone", "serviceType", "district"];
    if (required.some(k => !form[k].trim())) {
      alert("Please fill in all required fields.");
      return;
    }
    setLoading(true);
    setSubmitError("");

    const selectedPlan = PLANS.find(p => p.id === plan);

    // Save the application to Supabase so it shows up in the admin portal
    let saved = false;
    try {
      saved = await submitProviderApplication({
        business_name: form.businessName,
        owner_name: form.ownerName,
        email: form.email.trim().toLowerCase(),
        phone: form.phone,
        service_type: form.serviceType,
        district: form.district,
        description: form.description || null,
        plan: selectedPlan.id,
        status: "pending",
      });
    } catch (err) {
      setLoading(false);
      if (err?.code === "RATE_LIMITED") {
        setSubmitError("We've received a few applications from this email/address already. Please wait an hour and try again, or WhatsApp us directly.");
      } else if (err?.code === "MAINTENANCE_MODE") {
        setSubmitError("New applications are temporarily paused for maintenance. Please try again shortly.");
      } else {
        setSubmitError("Something went wrong saving your application. Please try again, or WhatsApp us directly if it keeps failing.");
      }
      return;
    }

    if (!saved) {
      setLoading(false);
      setSubmitError("Something went wrong saving your application. Please try again, or WhatsApp us directly if it keeps failing.");
      return;
    }

    // Notify admin by real email rather than window.open("mailto:") — that
    // ran two awaits after the click, so browsers blocked it as a popup,
    // and on a phone there's often no mail handler at all. The application
    // is already saved either way; this is just the heads-up.
    await sendBookingEmail({
      to: "martinezabner287@gmail.com",
      subject: `New VaiBook provider signup — ${form.businessName} (${selectedPlan.name})`,
      html: `<h3>New provider signup on VaiBook</h3>
<p><strong>Business:</strong> ${form.businessName}<br/>
<strong>Owner:</strong> ${form.ownerName}<br/>
<strong>Email:</strong> ${form.email}<br/>
<strong>Phone:</strong> ${form.phone}<br/>
<strong>Service:</strong> ${form.serviceType}<br/>
<strong>District:</strong> ${form.district}<br/>
<strong>Plan:</strong> ${selectedPlan.name} (${selectedPlan.price})<br/>
<strong>Description:</strong> ${form.description || "N/A"}</p>
<p>Activate them in the admin dashboard.</p>`,
    });

    // Send the applicant a confirmation too, so they know it arrived.
    await sendBookingEmail({
      to: form.email.trim().toLowerCase(),
      subject: "We got your VaiBook application",
      html: `<p>Hi ${form.ownerName},</p><p>Thanks for applying to list <strong>${form.businessName}</strong> on VaiBook. We review applications by hand — you'll get an email as soon as yours is approved, and then you sign in with <strong>${form.email.trim().toLowerCase()}</strong> to open your portal.</p><p>— VaiBook</p>`,
    });

    setLoading(false);
    setSubmitted(true);
  };

  const selectedPlan = PLANS.find(p => p.id === plan);

  if (submitted) {
    return (
      <div className="signup-wrap">
        <style>{SIGNUP_CSS}</style>
        <div className="signup-box">
          <div className="signup-success">
            <div className="check">✅</div>
            <h2>You're on the list, {form.businessName}!</h2>
            <p>We've received your application for the <strong>{selectedPlan.name}</strong> plan. We'll reach out to <strong>{form.email}</strong> within 24 hours to activate your profile.</p>
            {selectedPlan.monthly > 0 && (
              <div className="payment-info">
                <h4>How to pay your first month</h4>
                <p>
                  Send <strong>BZ${selectedPlan.monthly}</strong> via bank transfer to activate your listing:<br /><br />
                  <strong>Bank:</strong> Belize Bank<br />
                  <strong>Account name:</strong> VaiBook Ltd<br />
                  <strong>Account #:</strong> 1234-5678-9<br />
                  <strong>Reference:</strong> {form.businessName}<br /><br />
                  WhatsApp us your receipt at <strong>+501 XXX XXXX</strong> and we'll activate your profile same day.
                </p>
              </div>
            )}
            <p style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>
              Once we activate your listing, come back to vaibook.bz and click <strong>Provider login</strong> in the top menu to manage your bookings and calendar.
            </p>
            <button className="btn-sm forest" style={{ marginTop: 24 }} onClick={() => onNav("home")}>Back to home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{PROVIDER_LANDING_CSS}</style>
      <div className="pl-root">
        {/* HERO — the pitch runs first; the actual application form (below,
            unchanged, still light-mode) starts the moment someone scrolls
            or taps the CTA. */}
        <section className="pl-hero">
          <div className="pl-hero-inner">
            <div className="pl-hero-copy">
              <span className="pl-eyebrow">✓ Invite-only for top-tier shops</span>
              <h1>The operating system for top-tier shops.</h1>
              <p className="pl-hero-sub">No clunky sidebars. No confusing features. Just a lightning-fast booking engine built to pack your chairs and manage your money.</p>
              <button className="pl-cta" onClick={() => document.getElementById("signup-form")?.scrollIntoView({ behavior: "smooth" })}>
                Start Booking Today
              </button>
            </div>
            <div className="pl-phone-stage">
              <div className="pl-phone-glow"></div>
              {/* Illustrative mockup of the real Dashboard's "Dopamine Card" +
                  "Next in the Chair" — not a live screenshot, so it never
                  drifts out of sync with that UI. */}
              <div className="pl-phone">
                <div className="pl-phone-card">
                  <div className="pl-phone-label">Today's Take</div>
                  <div className="pl-phone-value">BZ$482</div>
                </div>
                <div className="pl-phone-card">
                  <div className="pl-phone-row">
                    <div className="pl-phone-label" style={{ marginBottom: 0 }}>Next in the Chair</div>
                    <span className="pl-phone-chip">2:30 PM</span>
                  </div>
                  <div className="pl-phone-name">Maria S.</div>
                  <div className="pl-phone-meta">Signature Fade</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES — alternating full-width rows, not a 3-column grid. */}
        <section className="pl-features">
          <div className="pl-feature-row">
            <div className="pl-feature-visual">
              <div className="pl-tap-demo">
                <span className="pl-tap-circle">1</span>
                <span className="pl-tap-arrow">→</span>
                <span className="pl-tap-circle">2</span>
                <span className="pl-tap-arrow">→</span>
                <span className="pl-tap-result">+ BZ$45 logged</span>
              </div>
            </div>
            <div className="pl-feature-text">
              <div className="pl-feature-kicker">Zero friction</div>
              <h3>The 2-Tap Walk-In.</h3>
              <p>Log walk-in revenue instantly without leaving the home screen.</p>
            </div>
          </div>

          <div className="pl-feature-row reverse">
            <div className="pl-feature-visual">
              <div className="pl-qr-demo">
                <div className="pl-qr-card">
                  {Array.from({ length: 25 }).map((_, i) => (
                    <span key={i} className={[0,1,2,3,4,5,9,10,14,15,19,20,21,22,23,24].includes(i) || i % 7 === 0 ? "" : "off"}></span>
                  ))}
                </div>
              </div>
            </div>
            <div className="pl-feature-text">
              <div className="pl-feature-kicker">Zero friction</div>
              <h3>Chair-Side QR Booking.</h3>
              <p>Let clients scan your screen before they leave the chair. Never lose a rebooking.</p>
            </div>
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section className="pl-social">
          <span className="pl-badge">✓ Verified Vai Partner</span>
          <p>Join the elite network of independent barbers and salons across Belize.</p>
          <div className="pl-ticker-mask">
            <div className="pl-ticker-track">
              {[...DISTRICTS, ...DISTRICTS].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
          </div>
        </section>
      </div>

    <div className="signup-wrap" id="signup-form">
      <style>{SIGNUP_CSS}</style>
      <div className="signup-box">
        <div className="signup-header">
          <h1>List your business on VaiBook</h1>
          <p>Join local providers already getting booked across Belize. Takes less than 3 minutes.</p>
        </div>

        {/* Plan selector */}
        <div style={{ marginBottom: 8 }}>
          <div className="form-section-title" style={{ borderBottom: "none", paddingBottom: 0, marginBottom: 12 }}>Choose your plan</div>
        </div>
        <div className="plan-selector">
          {PUBLIC_PLANS.map(p => (
            <div key={p.id} className={`plan-option ${plan === p.id ? "selected" : ""}`} onClick={() => setPlan(p.id)}>
              <div className="plan-name">{p.name}</div>
              <div className="plan-price">{p.price}</div>
              <div className="plan-desc">{p.desc}</div>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="signup-form-card">
          <div className="form-section-title">Business details</div>
          <div className="form-row">
            <div className="input-group">
              <label>Business name *</label>
              <input placeholder="e.g. Karim's Cuts" value={form.businessName} onChange={e => set("businessName", e.target.value)} />
            </div>
            <div className="input-group">
              <label>Owner / contact name *</label>
              <input placeholder="Your full name" value={form.ownerName} onChange={e => set("ownerName", e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="input-group">
              <label>Email *</label>
              <input type="email" placeholder="you@email.com" value={form.email} onChange={e => set("email", e.target.value)} />
            </div>
            <div className="input-group">
              <label>WhatsApp / Phone *</label>
              <input placeholder="+501 600 0000" value={form.phone} onChange={e => set("phone", e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="input-group">
              <label>Service type *</label>
              <select value={form.serviceType} onChange={e => set("serviceType", e.target.value)}>
                <option value="">Select a service</option>
                {SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>District *</label>
              <select value={form.district} onChange={e => set("district", e.target.value)}>
                <option value="">Select your district</option>
                {DISTRICTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="input-group">
            <label>Tell customers about your business (optional)</label>
            <textarea placeholder="Years of experience, specialties, location details..." value={form.description} onChange={e => set("description", e.target.value)} />
          </div>
        </div>

        <button className="signup-submit" onClick={handleSubmit} disabled={loading}>
          {loading ? "Submitting..." : `Apply for ${selectedPlan.name} plan →`}
        </button>
        {submitError && (
          <p style={{ textAlign: "center", fontSize: 13, color: "#B91C1C", marginTop: 12, fontWeight: 600 }}>
            {submitError}
          </p>
        )}
        <p style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
          We review every application within 24 hours. No credit card required to apply.
        </p>
      </div>
    </div>
    </>
  );
}

// ── Duplicate-application detection ──────────────────────────────
// Catches the exact mess that caused the "approved but he still can't
// sign in" bug: someone submits more than one application, or fat-fingers
// their email on one, so the "active" record on file doesn't match what
// they actually type in later. Flags it for the admin BEFORE approval
// instead of after, when it's much harder to untangle.

const normalizeForCompare = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

// Plain Levenshtein edit distance — small and dependency-free, good enough
// for "is this basically the same email/name with a typo" at this scale.
function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// Returns the other applications that look like they might be the same
// business/person as `app` — same or near-identical business name, or a
// near-identical (typo-distance) email — excluding rejected duplicates
// once one of the pair is already rejected, since that's the normal
// "they fixed the typo and reapplied" flow, not a live conflict.
const findSimilarApplications = (app, allApps) => {
  const name = normalizeForCompare(app.business_name);
  const email = normalizeForCompare(app.email);
  return allApps.filter((other) => {
    if (other.id === app.id) return false;
    if (app.status === "rejected" || other.status === "rejected") return false;
    const otherName = normalizeForCompare(other.business_name);
    const otherEmail = normalizeForCompare(other.email);
    const nameMatch = name.length > 2 && otherName.length > 2 && (name === otherName || editDistance(name, otherName) <= 2);
    const emailMatch = email && otherEmail && (email === otherEmail || editDistance(email, otherEmail) <= 2);
    return nameMatch || emailMatch;
  });
};

function AdminPortal({ session, user, onNav, onSignIn, onSignOut }) {
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [apps, setApps] = useState([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [tab, setTab] = useState("pending");

  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState(null);
  const [providerEditForm, setProviderEditForm] = useState({});
  const [savingProviderId, setSavingProviderId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [reviewingPaymentId, setReviewingPaymentId] = useState(null);

  const [vipPayments, setVipPayments] = useState([]);
  const [loadingVipPayments, setLoadingVipPayments] = useState(false);
  const [reviewingVipPaymentId, setReviewingVipPaymentId] = useState(null);

  const [refunds, setRefunds] = useState([]);
  const [loadingRefunds, setLoadingRefunds] = useState(false);

  // Emergency maintenance-mode switch — see supabase_security_hardening.sql.
  // Pauses new bookings and new provider applications app-wide, independent
  // of Vercel/DNS/Supabase dashboards, for the moment something looks
  // actively wrong and new writes need to stop while it's investigated.
  const [maintenance, setMaintenanceState] = useState({ on: false, message: "" });
  const [maintenanceDraft, setMaintenanceDraft] = useState("");
  const [loadingMaintenance, setLoadingMaintenance] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const loadMaintenance = async () => {
    setLoadingMaintenance(true);
    const s = await getMaintenanceStatus();
    setMaintenanceState(s);
    setMaintenanceDraft(s.message || "");
    setLoadingMaintenance(false);
  };

  // Site offline — a separate, stronger switch from the pause above: it
  // hides the whole site behind a "we'll be back shortly" page for
  // everyone except a signed-in admin (see SiteOffline / supabase_site_offline.sql),
  // for planned changes/deploys rather than an in-progress incident.
  const [siteOffline, setSiteOfflineState] = useState({ on: false, message: "" });
  const [siteOfflineDraft, setSiteOfflineDraft] = useState("");
  const [loadingSiteOffline, setLoadingSiteOffline] = useState(false);
  const [savingSiteOffline, setSavingSiteOffline] = useState(false);

  const loadSiteOffline = async () => {
    setLoadingSiteOffline(true);
    const s = await getSiteOfflineStatus();
    setSiteOfflineState(s);
    setSiteOfflineDraft(s.message || "");
    setLoadingSiteOffline(false);
  };

  const toggleSiteOffline = async () => {
    const turningOn = !siteOffline.on;
    if (turningOn && !window.confirm("Take VaiBook offline for everyone except admins? Visitors will see a \"we'll be back shortly\" page until you turn this off — you'll still be able to sign in and use the real site to make your changes.")) {
      return;
    }
    setSavingSiteOffline(true);
    const ok = await setSiteOffline(turningOn, turningOn ? siteOfflineDraft.trim() : null);
    if (ok) {
      await loadSiteOffline();
    } else {
      window.alert("Couldn't update site offline mode. Please check your connection and try again.");
    }
    setSavingSiteOffline(false);
  };

  // Lets the top nav's account dropdown (with the same tools list as the
  // sidebar) switch tabs while already inside the admin portal,
  // since the sidebar itself is hidden on mobile.
  useEffect(() => {
    const onSetTab = (e) => { if (e.detail && e.detail.tab) setTab(e.detail.tab); };
    window.addEventListener("vaibook-set-portal-tab", onSetTab);
    return () => window.removeEventListener("vaibook-set-portal-tab", onSetTab);
  }, []);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session?.user?.email) {
        setIsAdmin(false);
        setCheckingAdmin(false);
        return;
      }
      setCheckingAdmin(true);
      const ok = await checkIsAdmin(session.user.email);
      if (!cancelled) {
        setIsAdmin(ok);
        setCheckingAdmin(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  const loadApps = async () => {
    setLoadingApps(true);
    const data = await getProviderApplications();
    setApps(data);
    setLoadingApps(false);
  };

  const loadProviders = async () => {
    setLoadingProviders(true);
    const data = await adminListProviders();
    setProviders(data);
    setLoadingProviders(false);
  };

  const loadPayments = async () => {
    setLoadingPayments(true);
    const data = await adminListProviderPayments();
    setPayments(data);
    setLoadingPayments(false);
  };

  const reviewPayment = async (payment, status) => {
    const paymentId = payment.id || payment;
    const label = payment.business_name || "this provider";
    const planName = (PLANS.find((pl) => pl.id === payment.plan) || {}).name || payment.plan || "the plan on this payment";
    // Confirming extends the paid-through date and applies the plan the
    // payment was for; rejecting is what the provider sees as "declined".
    // Neither can be undone from this screen, so both ask first.
    if (status === "confirmed" && !window.confirm(`Confirm this payment from ${label}? Their plan moves to ${planName} and their next due date shifts a month forward.`)) return;

    let note = null;
    if (status === "rejected") {
      note = window.prompt(`Why is this payment being rejected? ${label} will see this note in their billing tab.`, "");
      if (note === null) return;   // cancelled the prompt
      note = note.trim() || null;
    }

    setReviewingPaymentId(paymentId);
    const ok = await adminReviewProviderPayment(paymentId, status, note);
    setReviewingPaymentId(null);
    if (ok) {
      await loadPayments();
      // Confirming can reactivate a provider suspended for non-payment, so
      // the Providers tab is stale until it's reloaded too.
      await loadProviders();
    } else {
      window.alert("That didn't save. Please try again.");
    }
  };

  const loadVipPayments = async () => {
    setLoadingVipPayments(true);
    const data = await adminListVipPayments();
    setVipPayments(data);
    setLoadingVipPayments(false);
  };

  const reviewVipPayment = async (payment, status) => {
    const paymentId = payment.id || payment;
    const label = payment.customer_name || payment.customer_email || "this customer";
    if (status === "confirmed" && !window.confirm(`Confirm this VIP payment from ${label}? Their VIP membership activates (or extends 30 days) immediately.`)) return;

    let note = null;
    if (status === "rejected") {
      note = window.prompt(`Why is this payment being rejected? ${label} will see this note.`, "");
      if (note === null) return;   // cancelled the prompt
      note = note.trim() || null;
    }

    setReviewingVipPaymentId(paymentId);
    const ok = await adminReviewVipPayment(paymentId, status, note);
    setReviewingVipPaymentId(null);
    if (ok) {
      await loadVipPayments();
    } else {
      window.alert("That didn't save. Please try again.");
    }
  };

  const loadRefunds = async () => {
    setLoadingRefunds(true);
    const data = await adminListBookingRefunds();
    setRefunds(data);
    setLoadingRefunds(false);
  };

  useEffect(() => {
    if (isAdmin) { loadApps(); loadProviders(); loadPayments(); loadVipPayments(); loadRefunds(); loadMaintenance(); loadSiteOffline(); }
  }, [isAdmin]);

  const toggleMaintenance = async () => {
    const turningOn = !maintenance.on;
    if (turningOn && !window.confirm("Pause new bookings and new provider applications site-wide? Everything else (sign-in, existing bookings, payments, messages) keeps working. You can turn this off again the moment you're ready.")) {
      return;
    }
    setSavingMaintenance(true);
    const ok = await setMaintenanceMode(turningOn, turningOn ? maintenanceDraft.trim() : null);
    if (ok) {
      await loadMaintenance();
    } else {
      window.alert("Couldn't update maintenance mode. Please check your connection and try again.");
    }
    setSavingMaintenance(false);
  };

  const act = async (id, status) => {
    const app = apps.find((a) => a.id === id);

    // Rejecting someone who is already live has to actually take them
    // offline — before, it only changed the application row, and the
    // provider stayed bookable and in search.
    let alsoSuspend = null;
    if (status === "rejected" && app?.email) {
      alsoSuspend = providers.find((p) => (p.contact_email || "").toLowerCase() === app.email.toLowerCase() && p.is_active);
      if (alsoSuspend && !window.confirm(`${alsoSuspend.business_name} is currently live on VaiBook. Rejecting this application will also suspend their listing. Continue?`)) return;
    }

    setBusyId(id);
    const updated = await updateApplicationStatus(id, status);
    if (!updated) {
      setBusyId(null);
      window.alert("That didn't save — the application wasn't changed. Please try again.");
      return;
    }

    if (alsoSuspend) await adminUpdateProvider(alsoSuspend.id, { is_active: false });

    // Activation alone doesn't make them live — they still need to sign in
    // once with this email for their provider profile to be created (see
    // loadProviderProfile). Tell them so, or they'll never know to. Sent
    // only after the status change actually succeeded.
    if (status === "active" && app?.email) {
      const sent = await sendBookingEmail({
        to: app.email,
        subject: "You're approved on VaiBook!",
        html: providerApprovedEmailHtml({ businessName: app.business_name, ownerName: app.owner_name }),
      });
      if (!sent) window.alert(`${app.business_name} is approved, but the approval email didn't go out. Let them know directly that they can sign in now.`);
    }
    await loadApps();
    await loadProviders();
    setBusyId(null);
  };

  const startEditProvider = (p) => {
    setEditingProviderId(p.id);
    setProviderEditForm({
      business_name: p.business_name || "",
      district: p.district || "",
      service_type: p.service_type || "",
      whatsapp: p.whatsapp || "",
      bio: p.bio || "",
      plan: p.plan || "starter",
    });
  };
  const cancelEditProvider = () => { setEditingProviderId(null); setProviderEditForm({}); };

  const saveProviderEdit = async (providerId) => {
    setSavingProviderId(providerId);
    const updated = await adminUpdateProvider(providerId, {
      ...providerEditForm,
      category_key: categoryForServiceType(providerEditForm.service_type),
    });
    setSavingProviderId(null);
    if (updated) {
      setProviders((prev) => prev.map((p) => (p.id === providerId ? updated : p)));
      setEditingProviderId(null);
    } else {
      // Every admin action used to fail in total silence — the spinner
      // stopped, nothing changed, and there was no way to tell a rejected
      // permission apart from a no-op.
      window.alert("That change didn't save. Please try again.");
    }
  };

  // Changing the plan here (a direct grant — no receipt, no payment
  // record) only ever touches the plan column itself. That's correct on
  // its own, but a plan alone doesn't help if the provider is currently
  // suspended: is_active is a separate field, so "Business" would sit on
  // their profile while they're still invisible to customers and can't
  // take bookings. Rather than silently reactivate them (which is exactly
  // the bug the 2026-09-01 audit fixed on the payment-confirmation side —
  // a suspension for unrelated reasons shouldn't be quietly undone), ask.
  const changeProviderPlan = async (providerId, plan) => {
    const provider = providers.find((p) => p.id === providerId);
    let alsoReactivate = false;
    if (provider && !provider.is_active && plan !== "starter") {
      const planName = PLANS.find((pl) => pl.id === plan)?.name || plan;
      alsoReactivate = window.confirm(
        `${provider.business_name} is currently suspended, so they still won't show up for customers or take bookings even on ${planName}. Reactivate them too?`
      );
    }
    setSavingProviderId(providerId);
    const updated = await adminUpdateProvider(providerId, alsoReactivate ? { plan, is_active: true } : { plan });
    setSavingProviderId(null);
    if (updated) setProviders((prev) => prev.map((p) => (p.id === providerId ? updated : p)));
    else window.alert("Couldn't change that plan. Please try again.");
  };

  const toggleProviderActive = async (provider) => {
    setSavingProviderId(provider.id);
    const updated = await adminUpdateProvider(provider.id, { is_active: !provider.is_active });
    setSavingProviderId(null);
    if (updated) setProviders((prev) => prev.map((p) => (p.id === provider.id ? updated : p)));
    else window.alert(`Couldn't ${provider.is_active ? "suspend" : "reactivate"} that provider. Please try again.`);
  };

  const confirmDeleteProvider = async (providerId) => {
    setDeletingId(providerId);
    const ok = await adminDeleteProvider(providerId);
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (ok) setProviders((prev) => prev.filter((p) => p.id !== providerId));
    else window.alert("Couldn't delete that provider. Please try again.");
  };

  // Not signed in at all
  if (!session) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--forest)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 28, fontWeight: 800, color: "var(--near-white)", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <VaiBookMark size={30} />vai<span style={{ color: "var(--lime)" }}>book</span> <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 16 }}>admin</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, marginBottom: 24 }}>Sign in with the Google account approved for admin access.</p>
          <button className="btn-lime" style={{ width: "100%", padding: "12px 0" }} onClick={onSignIn}>Sign in with Google</button>
          <div style={{ marginTop: 20 }}>
            <a style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }} onClick={() => onNav("home")}>← Back to site</a>
          </div>
        </div>
      </div>
    );
  }

  // Signed in, checking admin status
  if (checkingAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--forest)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Checking access...</div>
      </div>
    );
  }

  // Signed in but not on the admin allowlist
  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--forest)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <h2 style={{ color: "var(--near-white)", fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 8 }}>Not authorized</h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, marginBottom: 24 }}>
            {session.user.email} isn't on the VaiBook admin list. Ask an existing admin to add you in Supabase.
          </p>
          <button className="btn-ghost" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    );
  }

  const counts = {
    pending: apps.filter(a => a.status === "pending").length,
    active: apps.filter(a => a.status === "active").length,
    rejected: apps.filter(a => a.status === "rejected").length,
  };
  const filtered = apps.filter(a => a.status === tab);

  // An "active" application isn't actually live until the applicant signs
  // in once (that's what creates their real provider_profiles row — see
  // loadProviderProfile). Cross-reference by business name against the
  // real provider list so admins can see who's still waiting, since the
  // application list alone can't tell the two apart.
  const liveBusinessNames = new Set(providers.map((p) => (p.business_name || "").trim().toLowerCase()));
  const isApplicationLive = (app) => liveBusinessNames.has((app.business_name || "").trim().toLowerCase());

  const sideItems = [
    { id: "pending", icon: "\u23f3", label: "Pending" },
    { id: "active", icon: "\u2705", label: "Active" },
    { id: "rejected", icon: "\u2716", label: "Rejected" },
  ];

  const planLabel = (id) => (PLANS.find(p => p.id === id)?.name) || id;

  return (
    <div className="portal-layout">
      <aside className="sidebar">
        <div style={{ padding: "0 16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 20 }}>
          <span className="nav-logo" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, color: "var(--near-white)", display: "inline-flex", alignItems: "center", gap: 7 }}><VaiBookMark size={19} />vai<span style={{ color: "var(--lime)" }}>book</span></span>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>Admin portal</div>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-label">Applications</div>
          {sideItems.map(item => (
            <div key={item.id} className={`sidebar-item ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>
              <span className="icon">{item.icon}</span>{item.label} ({counts[item.id]})
            </div>
          ))}
        </div>
        <div className="sidebar-section">
          <div className="sidebar-label">Manage</div>
          <div className={`sidebar-item ${tab === "providers" ? "active" : ""}`} onClick={() => setTab("providers")}>
            <span className="icon">{"🏪"}</span>Providers ({providers.length})
          </div>
          <div className={`sidebar-item ${tab === "payments" ? "active" : ""}`} onClick={() => setTab("payments")}>
            <span className="icon">{"🧾"}</span>Payments ({payments.filter(p => p.status === "pending").length})
          </div>
          <div className={`sidebar-item ${tab === "vip" ? "active" : ""}`} onClick={() => setTab("vip")}>
            <span className="icon">{"⚡"}</span>VIP Memberships ({vipPayments.filter(p => p.status === "pending").length})
          </div>
          <div className={`sidebar-item ${tab === "refunds" ? "active" : ""}`} onClick={() => setTab("refunds")}>
            <span className="icon">{"💸"}</span>Refunds ({refunds.length})
          </div>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-label">System</div>
          <div className={`sidebar-item ${tab === "security" ? "active" : ""}`} onClick={() => setTab("security")}>
            <span className="icon">{"🚨"}</span>Emergency{siteOffline.on ? " (OFFLINE)" : maintenance.on ? " (PAUSED)" : ""}
          </div>
        </div>
        <div className="sidebar-avatar">
          <div className="avatar">{(user?.full_name || session.user.email)[0].toUpperCase()}</div>
          <div className="avatar-info">
            <div className="name">{user?.full_name || session.user.email}</div>
            <div className="role" style={{ cursor: "pointer" }} onClick={onSignOut}>Sign out</div>
          </div>
        </div>
      </aside>

      <main className="portal-content">
        {tab !== "providers" && tab !== "payments" && tab !== "refunds" && tab !== "security" && (
          <>
            <div className="portal-header">
              <h2>Provider applications</h2>
              <p>Review new signups, confirm bank transfer payment, then activate.</p>
            </div>

            <div className="metric-grid">
              <div className="metric"><div className="metric-label">Pending</div><div className="metric-value">{counts.pending}</div><div className="metric-sub">Awaiting review</div></div>
              <div className="metric"><div className="metric-label">Active</div><div className="metric-value" style={{ color: "var(--lime)" }}>{counts.active}</div><div className="metric-sub">Live on VaiBook</div></div>
              <div className="metric"><div className="metric-label">Rejected</div><div className="metric-value">{counts.rejected}</div><div className="metric-sub">Declined</div></div>
              <div className="metric"><div className="metric-label">Total</div><div className="metric-value">{apps.length}</div><div className="metric-sub">All time</div></div>
            </div>

            <div className="card">
              <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{tab.charAt(0).toUpperCase() + tab.slice(1)} applications</span>
                <button className="btn-sm forest" onClick={loadApps} disabled={loadingApps}>{loadingApps ? "Refreshing..." : "Refresh"}</button>
              </div>

              {filtered.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>
                  {loadingApps ? "Loading..." : `No ${tab} applications.`}
                </p>
              )}

              {filtered.map(app => (
                <div key={app.id} className="booking-item" style={{ alignItems: "flex-start" }}>
                  <div className="booking-info" style={{ flex: 1 }}>
                    <div className="title">{app.business_name} <span style={{ fontWeight: 500, color: "var(--muted)", fontSize: 12 }}>— {planLabel(app.plan)}</span></div>
                    <div className="meta">{app.owner_name} · {app.service_type} · {app.district}</div>
                    <div className="meta">{app.email} · {app.phone}</div>
                    {app.description && <div className="meta" style={{ marginTop: 4, fontStyle: "italic" }}>{app.description}</div>}
                    <div className="meta" style={{ marginTop: 4, fontSize: 11 }}>Applied {new Date(app.created_at).toLocaleDateString()}</div>
                    {(() => {
                      const similar = findSimilarApplications(app, apps);
                      if (!similar.length) return null;
                      return (
                        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: "#B91C1C", background: "#FEE2E2", display: "inline-block", padding: "3px 8px", borderRadius: 6 }}>
                          ⚠️ Possible duplicate — looks similar to {similar.map((s) => `"${s.business_name}" (${s.email}, ${s.status})`).join(", ")}. Double-check before activating so the wrong email doesn't end up "active."
                        </div>
                      );
                    })()}
                    {app.status === "active" && (
                      isApplicationLive(app) ? (
                        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: "var(--forest)" }}>✅ Live on VaiBook</div>
                      ) : (
                        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: "#B45309", background: "#FEF3C7", display: "inline-block", padding: "3px 8px", borderRadius: 6 }}>
                          ⏳ Approved, but not live yet — they haven't signed in to VaiBook with {app.email}. Follow up with them directly ({app.phone || "no phone on file"}); we've also emailed them, but it may not have gone through yet.
                        </div>
                      )
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {app.status !== "active" && (
                      <button className="btn-sm forest" disabled={busyId === app.id} onClick={() => act(app.id, "active")}>Activate</button>
                    )}
                    {app.status !== "rejected" && (
                      <button className="btn-sm" style={{ background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }} disabled={busyId === app.id} onClick={() => act(app.id, "rejected")}>Reject</button>
                    )}
                    {app.status !== "pending" && (
                      <button className="btn-sm" style={{ background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }} disabled={busyId === app.id} onClick={() => act(app.id, "pending")}>Reset</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "providers" && (
          <>
            <div className="portal-header">
              <h2>Providers</h2>
              <p>Change a provider's plan, suspend or reactivate them, edit their business details, or permanently delete their account.</p>
            </div>

            <div className="metric-grid">
              <div className="metric"><div className="metric-label">Total</div><div className="metric-value">{providers.length}</div><div className="metric-sub">All providers</div></div>
              <div className="metric"><div className="metric-label">Live providers</div><div className="metric-value" style={{ color: "var(--lime)" }}>{providers.filter(p => p.is_active).length}</div><div className="metric-sub">Signed in and visible in search</div></div>
              <div className="metric"><div className="metric-label">Suspended</div><div className="metric-value">{providers.filter(p => !p.is_active).length}</div><div className="metric-sub">Hidden from customers</div></div>
            </div>

            <div className="card">
              <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>All providers</span>
                <button className="btn-sm forest" onClick={loadProviders} disabled={loadingProviders}>{loadingProviders ? "Refreshing..." : "Refresh"}</button>
              </div>

              {providers.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>
                  {loadingProviders ? "Loading..." : "No providers yet."}
                </p>
              )}

              {providers.map(p => {
                const isEditing = editingProviderId === p.id;
                const isSaving = savingProviderId === p.id;
                const isConfirmingDelete = confirmDeleteId === p.id;
                const isDeleting = deletingId === p.id;

                if (isEditing) {
                  return (
                    <div key={p.id} className="booking-item" style={{ alignItems: "flex-start", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%" }}>
                        <input className="input" placeholder="Business name" value={providerEditForm.business_name || ""} onChange={e => setProviderEditForm(f => ({ ...f, business_name: e.target.value }))} />
                        <input className="input" placeholder="District" value={providerEditForm.district || ""} onChange={e => setProviderEditForm(f => ({ ...f, district: e.target.value }))} />
                        <select className="input" value={providerEditForm.service_type || ""} onChange={e => setProviderEditForm(f => ({ ...f, service_type: e.target.value }))}>
                          {SERVICE_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
                        </select>
                        <input className="input" placeholder="WhatsApp" value={providerEditForm.whatsapp || ""} onChange={e => setProviderEditForm(f => ({ ...f, whatsapp: e.target.value }))} />
                      </div>
                      <textarea className="input" placeholder="Bio" style={{ width: "100%", minHeight: 60 }} value={providerEditForm.bio || ""} onChange={e => setProviderEditForm(f => ({ ...f, bio: e.target.value }))} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn-sm forest" disabled={isSaving} onClick={() => saveProviderEdit(p.id)}>{isSaving ? "Saving..." : "Save"}</button>
                        <button className="btn-sm" style={{ background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }} disabled={isSaving} onClick={cancelEditProvider}>Cancel</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={p.id} className="booking-item" style={{ alignItems: "flex-start" }}>
                    <div className="booking-info" style={{ flex: 1 }}>
                      <div className="title">
                        {p.business_name}{" "}
                        <span style={{ fontWeight: 500, color: p.is_active ? "var(--lime)" : "var(--muted)", fontSize: 12 }}>
                          — {p.is_active ? "Active" : "Suspended"}
                        </span>
                      </div>
                      <div className="meta">{p.service_type} · {p.district}</div>
                      {p.whatsapp && <div className="meta">{p.whatsapp}</div>}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
                      <select
                        className="input"
                        style={{ padding: "4px 8px", fontSize: 12 }}
                        value={p.plan || "starter"}
                        disabled={isSaving}
                        onChange={e => changeProviderPlan(p.id, e.target.value)}
                      >
                        {PLANS.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                      </select>
                      {(p.plan || "starter") !== "starter" && p.next_payment_due_date && (
                        <span style={{ fontSize: 11, color: new Date(p.next_payment_due_date) < new Date() ? "#B91C1C" : "var(--muted)" }}>
                          {new Date(p.next_payment_due_date) < new Date() ? "Overdue since " : "Next due "}
                          {new Date(p.next_payment_due_date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      )}

                      {!isConfirmingDelete && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn-sm" style={{ background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }} disabled={isSaving} onClick={() => startEditProvider(p)}>Edit</button>
                          <button className="btn-sm" style={{ background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }} disabled={isSaving} onClick={() => toggleProviderActive(p)}>
                            {isSaving ? "..." : p.is_active ? "Suspend" : "Reactivate"}
                          </button>
                          <button className="btn-sm" style={{ background: "transparent", border: "1px solid #e05252", color: "#e05252" }} onClick={() => setConfirmDeleteId(p.id)}>Delete</button>
                        </div>
                      )}

                      {isConfirmingDelete && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                          <div style={{ fontSize: 12, color: "#e05252", maxWidth: 220, textAlign: "right" }}>
                            Delete {p.business_name} permanently? This removes their bookings, reviews, and services too.
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button className="btn-sm" style={{ background: "#e05252", border: "1px solid #e05252", color: "#fff" }} disabled={isDeleting} onClick={() => confirmDeleteProvider(p.id)}>
                              {isDeleting ? "Deleting..." : "Confirm delete"}
                            </button>
                            <button className="btn-sm" style={{ background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }} disabled={isDeleting} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "payments" && (() => {
          const statusColor = { pending: "#B45309", confirmed: "var(--forest)", rejected: "#B91C1C" };
          const statusBg = { pending: "#FEF3C7", confirmed: "#E7F5EC", rejected: "#FEE2E2" };
          return (
            <>
              <div className="portal-header">
                <h2>Provider payments</h2>
                <p>Plan-fee receipts providers have submitted — confirm the ones that check out.</p>
              </div>
              <div className="card">
                <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>All submissions</span>
                  <button className="btn-sm forest" onClick={loadPayments} disabled={loadingPayments}>{loadingPayments ? "Refreshing..." : "Refresh"}</button>
                </div>
                {payments.length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{loadingPayments ? "Loading..." : "No payments submitted yet."}</p>
                )}
                {payments.map((pmt) => (
                  <div key={pmt.id} className="booking-item" style={{ alignItems: "flex-start" }}>
                    <div className="booking-info" style={{ flex: 1 }}>
                      <div className="title">{pmt.business_name} <span style={{ fontWeight: 500, color: "var(--muted)", fontSize: 12 }}>— {planLabel(pmt.plan)}</span></div>
                      <div className="meta">{pmt.period_label} · BZ${pmt.amount}</div>
                      <div className="meta" style={{ fontSize: 11 }}>Submitted {new Date(pmt.submitted_at).toLocaleDateString()}</div>
                      {pmt.receipt_url && <a href="#" onClick={(e) => { e.preventDefault(); openPrivateFile(pmt.receipt_url); }} style={{ fontSize: 12 }}>View receipt</a>}
                      {pmt.reviewed_at && (
                        <div className="meta" style={{ fontSize: 11, marginTop: 4 }}>Reviewed {new Date(pmt.reviewed_at).toLocaleDateString()} by {pmt.reviewed_by}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: statusColor[pmt.status] || "var(--muted)", background: statusBg[pmt.status] || "var(--sand)", padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>
                        {pmt.status.charAt(0).toUpperCase() + pmt.status.slice(1)}
                      </span>
                      {pmt.status === "pending" && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn-sm lime" disabled={reviewingPaymentId === pmt.id} onClick={() => reviewPayment(pmt, "confirmed")}>Confirm</button>
                          <button className="btn-sm" style={{ background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }} disabled={reviewingPaymentId === pmt.id} onClick={() => reviewPayment(pmt, "rejected")}>Reject</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        })()}

        {tab === "vip" && (() => {
          const statusColor = { pending: "#B45309", confirmed: "var(--forest)", rejected: "#B91C1C" };
          const statusBg = { pending: "#FEF3C7", confirmed: "#E7F5EC", rejected: "#FEE2E2" };
          return (
            <>
              <div className="portal-header">
                <h2>VIP memberships</h2>
                <p>Customer VaiBook VIP membership receipts — confirm the ones that check out. Confirming activates (or extends 30 days from whichever is later) their VIP status immediately.</p>
              </div>
              <div className="card">
                <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>All submissions</span>
                  <button className="btn-sm forest" onClick={loadVipPayments} disabled={loadingVipPayments}>{loadingVipPayments ? "Refreshing..." : "Refresh"}</button>
                </div>
                {vipPayments.length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{loadingVipPayments ? "Loading..." : "No VIP payments submitted yet."}</p>
                )}
                {vipPayments.map((pmt) => (
                  <div key={pmt.id} className="booking-item" style={{ alignItems: "flex-start" }}>
                    <div className="booking-info" style={{ flex: 1 }}>
                      <div className="title">{pmt.customer_name || "Customer"} <span style={{ fontWeight: 500, color: "var(--muted)", fontSize: 12 }}>— {pmt.customer_email}</span></div>
                      <div className="meta">{pmt.period_label} · BZ${pmt.amount}</div>
                      <div className="meta" style={{ fontSize: 11 }}>Submitted {new Date(pmt.submitted_at).toLocaleDateString()}</div>
                      {pmt.receipt_url && <a href="#" onClick={(e) => { e.preventDefault(); openPrivateFile(pmt.receipt_url); }} style={{ fontSize: 12 }}>View receipt</a>}
                      {pmt.reviewed_at && (
                        <div className="meta" style={{ fontSize: 11, marginTop: 4 }}>Reviewed {new Date(pmt.reviewed_at).toLocaleDateString()} by {pmt.reviewed_by}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: statusColor[pmt.status] || "var(--muted)", background: statusBg[pmt.status] || "var(--sand)", padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>
                        {pmt.status.charAt(0).toUpperCase() + pmt.status.slice(1)}
                      </span>
                      {pmt.status === "pending" && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn-sm lime" disabled={reviewingVipPaymentId === pmt.id} onClick={() => reviewVipPayment(pmt, "confirmed")}>Confirm</button>
                          <button className="btn-sm" style={{ background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }} disabled={reviewingVipPaymentId === pmt.id} onClick={() => reviewVipPayment(pmt, "rejected")}>Reject</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        })()}

        {tab === "refunds" && (
          <>
            <div className="portal-header">
              <h2>Refunds</h2>
              <p>Refund proof providers have recorded on cancelled/rejected bookings — VaiBook doesn't process the refund itself, this is just the record.</p>
            </div>
            <div className="card">
              <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>All refunds</span>
                <button className="btn-sm forest" onClick={loadRefunds} disabled={loadingRefunds}>{loadingRefunds ? "Refreshing..." : "Refresh"}</button>
              </div>
              {refunds.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{loadingRefunds ? "Loading..." : "No refunds recorded yet."}</p>
              )}
              {refunds.map((r) => (
                <div key={r.id} className="booking-item" style={{ alignItems: "flex-start" }}>
                  <div className="booking-info" style={{ flex: 1 }}>
                    <div className="title">{r.business_name} <span style={{ fontWeight: 500, color: "var(--muted)", fontSize: 12 }}>— {r.order_number}</span></div>
                    <div className="meta">BZ${r.amount} refunded · {new Date(r.created_at).toLocaleDateString()}</div>
                    {r.note && <div className="meta" style={{ fontStyle: "italic" }}>{r.note}</div>}
                  </div>
                  {r.receipt_url && <a href="#" onClick={(e) => { e.preventDefault(); openPrivateFile(r.receipt_url); }} style={{ fontSize: 12, flexShrink: 0 }}>View receipt</a>}
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "security" && (
          <>
            <div className="portal-header">
              <h2>Emergency</h2>
              <p>Two independent switches: take the whole site offline for planned changes, or just pause new bookings and applications if something looks actively wrong. Both work in about a second, without touching Vercel, DNS, or Supabase.</p>
            </div>
            <div className="card">
              <div className="card-title">
                <span>{siteOffline.on ? "🚨 Site is OFFLINE to visitors" : "Site is online"}</span>
              </div>
              {loadingSiteOffline ? (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "12px 0" }}>Loading...</p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12 }}>
                    While on, every visitor sees a "we'll be back shortly" page instead of the site. You stay signed in as an admin and can use the real site normally to make your changes — flip it back off when you're done.
                  </p>
                  {siteOffline.on && siteOffline.message && (
                    <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>Message shown to visitors: "{siteOffline.message}"</p>
                  )}
                  {!siteOffline.on && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Message to show visitors while offline (optional)</label>
                      <input
                        type="text"
                        value={siteOfflineDraft}
                        onChange={(e) => setSiteOfflineDraft(e.target.value)}
                        placeholder="e.g. Quick update in progress — back in a few minutes."
                        style={{ width: "100%" }}
                      />
                    </div>
                  )}
                  <button
                    className={siteOffline.on ? "btn-sm forest" : "btn-sm"}
                    style={!siteOffline.on ? { background: "#B91C1C", color: "#fff" } : undefined}
                    onClick={toggleSiteOffline}
                    disabled={savingSiteOffline}
                  >
                    {savingSiteOffline ? "Saving..." : siteOffline.on ? "Bring site back online" : "🚨 Take site offline"}
                  </button>
                </>
              )}
            </div>
            <div className="card">
              <div className="card-title">
                <span>{maintenance.on ? "🚨 New bookings & signups are PAUSED" : "New bookings & signups are open"}</span>
              </div>
              {loadingMaintenance ? (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "12px 0" }}>Loading...</p>
              ) : (
                <>
                  {maintenance.on && maintenance.message && (
                    <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>Message shown to visitors: "{maintenance.message}"</p>
                  )}
                  {!maintenance.on && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Message to show visitors while paused (optional)</label>
                      <input
                        type="text"
                        value={maintenanceDraft}
                        onChange={(e) => setMaintenanceDraft(e.target.value)}
                        placeholder="e.g. We're doing quick maintenance — back in a few minutes."
                        style={{ width: "100%" }}
                      />
                    </div>
                  )}
                  <button
                    className={maintenance.on ? "btn-sm forest" : "btn-sm"}
                    style={!maintenance.on ? { background: "#B91C1C", color: "#fff" } : undefined}
                    onClick={toggleMaintenance}
                    disabled={savingMaintenance}
                  >
                    {savingMaintenance ? "Saving..." : maintenance.on ? "Resume new bookings & signups" : "🚨 Pause new bookings & signups"}
                  </button>
                </>
              )}
            </div>
            <div className="card">
              <div className="card-title"><span>What each switch does</span></div>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12 }}>
                <strong>Site offline</strong> hides the entire site behind a "we'll be back shortly" page for anyone who isn't signed in as an admin — use it while you (or Claude) are making changes you don't want visitors to see mid-update. It doesn't delete or change any data, and existing sessions/bookings are untouched — it's purely a front door that stays shut to the public until you reopen it.
              </p>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                <strong>Pausing new bookings &amp; signups</strong> is narrower: it blocks new rows being written to bookings and provider_applications, but leaves the rest of the site browsable — sign-in, existing bookings, payments, chat, and reviews all keep working. New booking requests, walk-ins, and new provider applications are declined with a friendly message until you resume. Use this if you suspect the site is being flooded or abused and want to stop new writes while you look into it, without hiding the whole site.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── APP ROOT ────────────────────────────────────────────────────
// ── AUTH-AWARE APP ROOT ──────────────────────────────────────────
// A provider's QR code links to "#book-<provider id>" so scanning it jumps
// straight to their booking page inside VaiBook, instead of the generic
// homepage. Kept as a plain helper so both the initial-load state and the
// hashchange listener below parse it identically.
const parseBookingHash = (h) => (h.startsWith("book-") ? h.slice(5) : null);

export default function App() {
  const [view, setView] = useState(() => {
    const h = window.location.hash.replace("#", "");
    if (parseBookingHash(h)) return "customer";
    return h === "admin" || h === "customer" || h === "provider" ? h : "home";
  });

  // Which provider a QR-code / booking-link deep link pointed at, if any —
  // consumed once by CustomerPortal to jump straight to that provider's
  // booking view instead of making the visitor search for them.
  const [deepLinkProviderId, setDeepLinkProviderId] = useState(() => {
    const h = window.location.hash.replace("#", "");
    return parseBookingHash(h);
  });

  // Keep view in sync if the URL hash changes without a full page reload
  // (e.g. typing/pasting a #admin or #customer link into an already-open tab).
  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash.replace("#", "");
      const bookingId = parseBookingHash(h);
      if (bookingId) {
        setDeepLinkProviderId(bookingId);
        setView("customer");
      } else if (h === "admin" || h === "customer" || h === "provider") {
        setView(h);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Site-wide offline takeover (see SiteOffline / AdminPortal's Emergency
  // tab). Checked independently of the session/loading flow below so it
  // still shows up even if, say, Google sign-in itself is having issues —
  // an admin can always get past it via the "Site owner? Sign in" link.
  const [siteOffline, setSiteOfflineState] = useState({ on: false, message: "" });
  const [siteOfflineAdminOk, setSiteOfflineAdminOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const s = await getSiteOfflineStatus();
      if (!cancelled) setSiteOfflineState(s);
    };
    check();
    const interval = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [providerProfile, setProviderProfile] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // If this account doesn't have a provider profile yet, check whether an
  // admin already activated an application submitted with this email — if
  // so, create the provider profile now so the portal has something to show.
  const loadProviderProfile = async (authUser) => {
    let p = await getProviderProfile(authUser.id);
    if (!p) {
      const app = await getActiveApplicationByEmail(authUser.email);
      if (app) {
        const created = await createProviderProfile({
          user_id: authUser.id,
          business_name: app.business_name,
          service_type: app.service_type,
          category_key: categoryForServiceType(app.service_type),
          district: app.district,
          bio: app.description,
          whatsapp: app.phone || null,
          is_active: true,
        });
        if (created) {
          p = await getProviderProfile(authUser.id);
        }
      }
    }
    return p;
  };

  // Same "claim on first sign-in" idea as loadProviderProfile above, for
  // a staff seat instead of a whole business — only called once we
  // already know this account doesn't own a business itself.
  const loadStaffProfile = async () => {
    // Both of these are SECURITY DEFINER RPCs that work off the caller's own
    // JWT, so they take no arguments — see supabase_audit_fixes.sql.
    let sp = await getMyStaffProfile();
    if (!sp) sp = await claimStaffSeatByEmail();
    return sp;
  };

  const applyPendingView = () => {
    try {
      const pending = localStorage.getItem("vaibook_pending_view");
      if (pending === "admin" || pending === "customer" || pending === "provider") {
        setView(pending);
        localStorage.removeItem("vaibook_pending_view");
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  };

  // Mirrors Vai Buy: once an admin account is signed in, land straight in
  // the admin portal instead of the regular homepage. Skipped when a deep
  // link (a QR booking link, or an explicit #customer/#provider URL) or a
  // pending "sign in to do X" flow already decided where to go — an admin
  // opening a booking link or the provider portal on purpose should still
  // land there, not get bounced.
  const maybeGoToAdmin = async (email, hadPendingView) => {
    if (hadPendingView) return false;
    const h = window.location.hash.replace("#", "");
    if (h === "customer" || h === "provider" || parseBookingHash(h)) return false;
    const ok = await checkIsAdmin(email);
    if (ok) { setView("admin"); return true; }
    return false;
  };

  // A plain refresh re-derives `view` from the URL hash alone (see the
  // useState initializer above) — but navigating BETWEEN portals in-app
  // (the account-switcher, "For business" links, etc.) only ever calls
  // setView, never touches window.location.hash. So someone who signed
  // in, switched into the provider portal, and hit refresh would have
  // the hash still pointing at whatever it last was (often empty, or a
  // stale #customer from earlier in the session) and land back on the
  // generic homepage or the wrong portal — not where they actually were.
  // This restores the last portal the account was sitting in, but only
  // when nothing more specific already claimed the view (an explicit
  // #admin/#customer/#provider/#book- link, a pending "sign in to do X"
  // redirect, or this being an admin account).
  const restoreLastPortalView = (hadPendingView, wasAdmin, canUseProviderPortal) => {
    if (hadPendingView || wasAdmin) return;
    const h = window.location.hash.replace("#", "");
    if (h === "customer" || h === "provider" || h === "admin" || parseBookingHash(h)) return;
    try {
      const last = localStorage.getItem("vaibook_last_view");
      if (last === "provider" && canUseProviderPortal) setView("provider");
      else if (last === "customer") setView("customer");
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) {
        const u = await getOrCreateUser(session.user);
        setUser(u);
        const p = await loadProviderProfile(session.user);
        setProviderProfile(p);
        const sp = p ? null : await loadStaffProfile();
        setStaffProfile(sp);
        const hadPending = applyPendingView();
        const wasAdmin = await maybeGoToAdmin(session.user.email, hadPending);
        restoreLastPortalView(hadPending, wasAdmin, !!p || !!sp);
      }
      setLoading(false);
    });

    // Listen for auth changes. Gated to the actual SIGNED_IN event (not
    // TOKEN_REFRESHED, which also fires this callback roughly hourly) so an
    // admin who's deliberately browsing the customer/provider portal isn't
    // suddenly bounced back to the admin portal mid-session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (session) {
        const u = await getOrCreateUser(session.user);
        setUser(u);
        const p = await loadProviderProfile(session.user);
        setProviderProfile(p);
        setStaffProfile(p ? null : await loadStaffProfile());
        const hadPending = applyPendingView();
        if (event === "SIGNED_IN") {
          await maybeGoToAdmin(session.user.email, hadPending);
        }
      } else {
        setUser(null);
        setProviderProfile(null);
        setStaffProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Re-check admin status whenever the site is offline and we have (or
  // gain) a signed-in user — this is what lets the "Site owner? Sign in"
  // link on SiteOffline actually get you past it once you're recognized.
  useEffect(() => {
    let cancelled = false;
    if (!siteOffline.on) { setSiteOfflineAdminOk(false); return; }
    if (!session?.user?.email) { setSiteOfflineAdminOk(false); return; }
    checkIsAdmin(session.user.email).then((ok) => { if (!cancelled) setSiteOfflineAdminOk(ok); });
    return () => { cancelled = true; };
  }, [siteOffline.on, session?.user?.email]);

  // Remembers whichever real portal the account is currently sitting in,
  // so restoreLastPortalView (above) can put a refresh back where it
  // belongs instead of always falling back to the homepage.
  useEffect(() => {
    if (view !== "provider" && view !== "customer" && view !== "admin") return;
    try { localStorage.setItem("vaibook_last_view", view); } catch (e) { /* ignore */ }
  }, [view]);

  const handleSignOut = async () => {
    await signOut();
    setView("home");
    try { localStorage.removeItem("vaibook_last_view"); } catch (e) { /* ignore */ }
  };

  if (loading) {
    return (
      <>
        <style>{css}</style>
        <div style={{ minHeight: "100vh", background: "var(--forest)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 32, fontWeight: 800, color: "var(--near-white)", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <VaiBookMark size={34} />vai<span style={{ color: "var(--lime)" }}>book</span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading...</div>
          </div>
        </div>
      </>
    );
  }

  // Checked after the loading splash (not before) so we know the real
  // session first — otherwise a returning admin would flash-see this
  // page for a moment before the admin check catches up.
  if (siteOffline.on && !siteOfflineAdminOk) {
    return <SiteOffline message={siteOffline.message} onSignIn={signInWithGoogle} />;
  }

  const authProps = { session, user, providerProfile, onSignIn: signInWithGoogle, onSignOut: handleSignOut, onUserUpdate: setUser, onProviderProfileUpdate: setProviderProfile };

  return (
    <>
      <style>{css}</style>
      <MaintenanceBanner />
      <InstallAppGuide />
      {/* The Provider Portal now has its own top bar (logo, nav links, avatar
          menu) replacing the persistent sidebar, so the global site nav
          would just be a redundant second header above it. Every other
          view — including the Staff Portal, which still uses the old
          sidebar layout — keeps the global nav as before. */}
      {view !== "auth" && !(view === "provider" && providerProfile) && <Nav onNav={setView} current={view} {...authProps} />}
      {view === "home" && <LandingPage onNav={setView} {...authProps} />}
      {view === "customer" && (
        <CustomerPortal
          onNav={setView}
          {...authProps}
          deepLinkProviderId={deepLinkProviderId}
          onDeepLinkConsumed={() => setDeepLinkProviderId(null)}
        />
      )}
      {view === "provider" && (
        !providerProfile && staffProfile
          ? <StaffPortal onNav={setView} session={session} staffProfile={staffProfile} onSignOut={handleSignOut} />
          : <ProviderPortal onNav={setView} {...authProps} />
      )}
      {view === "signup" && <ProviderSignup onNav={setView} {...authProps} />}
      {view === "admin" && <AdminPortal onNav={setView} {...authProps} />}
      {view === "auth" && <AuthChoice onNav={setView} {...authProps} />}
    </>
  );
}
