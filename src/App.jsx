
import { useState, useEffect, useLayoutEffect, useRef, useContext, createContext } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { supabase, signInWithGoogle, signOut, getOrCreateUser, getProviderProfile, checkIsAdmin, getProviderApplications, updateApplicationStatus, submitProviderApplication, getProviderBookings, updateBookingStatus, updateBooking, upsertProviderProfile, getWorkingHours, upsertWorkingHours, getActiveApplicationByEmail, uploadProviderPhoto, deleteProviderPhoto, createService, deleteService, getActiveProviders, getProviderDirectory, createBooking, getProviderBusyWindows, createBookingSafe, cancelBooking, getCustomerBookings, uploadReceipt, submitReview, getProviderReviews, updateReview, sendBookingEmail, updateUserProfile, getPaymentMethods, addPaymentMethod, deletePaymentMethod, createNotification, getNotifications, markNotificationRead, markAllNotificationsRead, getCategoryDefaultFeatures, getProviderFeatureOverrides, setProviderFeatureOverride, getVisitNotes, upsertVisitNote, adminListProviders, adminUpdateProvider, adminDeleteProvider, tagVIP, untagVIP, getVIPClients, getFavoriteProviderIds, getFavoriteProviders, addFavorite, removeFavorite, getBookingMessages, sendBookingMessage, markBookingMessagesRead, getUnreadBookingMessages, getProviderMonthlyTrend, createProviderProfile, getProviderById, createWalkInBooking, submitProviderPayment, getMyProviderPayments, adminListProviderPayments, adminReviewProviderPayment, submitVipPayment, getMyVipPayments, adminListVipPayments, adminReviewVipPayment, createVipBooking, submitBookingRefund, adminListBookingRefunds, openPrivateFile, getProviderStaff, addProviderStaff, updateProviderStaff, deleteProviderStaff, getLoyaltyAccount, getProviderLoyaltyCustomers, redeemLoyaltyReward, getMyStaffProfile, claimStaffSeatByEmail, getStaffBookings, rescheduleBooking, getProviderNotifyEmail, getMaintenanceStatus, setMaintenanceMode, getSiteOfflineStatus, setSiteOffline, sendEmailOtp, verifyEmailOtp, savePushSubscription } from "./supabase";

// Leaflet's default marker icons reference image paths that don't resolve
// correctly under CRA's bundler unless re-pointed at the imported assets.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Default map center: Belize (roughly Belmopan) for providers who haven't set a pin yet.
const BELIZE_CENTER = [17.25, -88.77];

function LocationPicker({ position, onPick }) {
  useMapEvents({
    click(e) {
      onPick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return position ? <Marker position={position} /> : null;
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
  .platform-preview-img { display: block; width: 100%; max-width: 1100px; margin: 0 auto; border-radius: 20px; box-shadow: 0 24px 60px rgba(13,61,46,0.14); }

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
    .grid-2 { grid-template-columns: 1fr; }
    .grid-3 { grid-template-columns: 1fr; }
    .metric-grid { grid-template-columns: 1fr 1fr; }
    .services-section { padding: 60px 24px; }
    .for-business-cta { padding: 72px 20px; }
    .for-business-headline { font-size: 30px; }
    .for-business-sub { font-size: 15.5px; }
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

function enterCustomerPortal(onNav, session, onSignIn) {
  if (session) {
    onNav("customer");
  } else {
    try { localStorage.setItem("vaibook_pending_view", "customer"); } catch (e) { /* ignore */ }
    onSignIn();
  }
}

function enterProviderPortal(onNav, session, onSignIn) {
  if (session) {
    onNav("provider");
  } else {
    try { localStorage.setItem("vaibook_pending_view", "provider"); } catch (e) { /* ignore */ }
    onSignIn();
  }
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

function AuthChoice({ onNav, session, onSignIn }) {
  return (
    <div className="auth-choice">
      <div className="auth-choice-left">
        <button className="auth-back" onClick={() => onNav("home")} aria-label="Back">←</button>
        <div className="auth-choice-body">
          <h1>Sign up / log in</h1>
          <div className="auth-option-card" onClick={() => enterCustomerPortal(onNav, session, onSignIn)}>
            <div>
              <h3>VaiBook for customers</h3>
              <p>Book local services near you</p>
            </div>
            <span className="auth-option-arrow">→</span>
          </div>
          <div className="auth-option-card" onClick={() => enterProviderPortal(onNav, session, onSignIn)}>
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
    { id: "vip", icon: "⭐", label: "VIP clients" },
    { id: "calendar", icon: "🗓️", label: "Availability" },
    { id: "services", icon: "✂️", label: "My services" },
    { id: "earnings", icon: "💰", label: "Earnings" },
    { id: "billing", icon: "🧾", label: "My plan & billing" },
    { id: "staff", icon: "👥", label: "My staff" },
    { id: "reviews", icon: "⭐", label: "My reviews" },
    { id: "review", icon: "📈", label: "Monthly review" },
    { id: "profile", icon: "👤", label: "Public profile" },
    { id: "qr", icon: "📱", label: "My QR code" },
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
    enterCustomerPortal(onNav, session, onSignIn);
  };

  const selectNavSuggestion = (s) => {
    setNavQuery(s.label);
    submitNavSearch(s.label);
  };

  const go = (fn) => { fn(); closeMenu(); };
  const goAccount = (fn) => { fn(); closeAccount(); };

  const openTab = (tabId) => {
    try { localStorage.setItem("vaibook_pending_tab", tabId); } catch (e) { /* ignore */ }
    onNav("customer");
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
                  <button className="nav-dropdown-item for-biz" onClick={() => goAccount(() => enterProviderPortal(onNav, session, onSignIn))}>
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
                    <button className="nav-dropdown-item" onClick={() => go(() => enterProviderPortal(onNav, session, onSignIn))}>
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
                    <button className="nav-dropdown-item" onClick={() => goAccount(() => enterCustomerPortal(onNav, session, onSignIn))}>
                      <span className="icn">🛍️</span> Switch to customer
                    </button>
                  ) : (
                    <button className="nav-dropdown-item for-biz" onClick={() => goAccount(() => enterProviderPortal(onNav, session, onSignIn))}>
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

function LandingPage({ onNav, session, onSignIn }) {
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
    enterCustomerPortal(onNav, session, onSignIn);
  };

  const submitHeroSearch = (queryOverride) => {
    const q = (queryOverride != null ? queryOverride : heroQuery).trim();
    try {
      localStorage.setItem("vaibook_pending_search", JSON.stringify({ query: q, district: heroDistrict || "All" }));
    } catch (e) { /* ignore storage errors */ }
    enterCustomerPortal(onNav, session, onSignIn);
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
            <button className="service-pill" key={i} onClick={() => enterCustomerPortal(onNav, session, onSignIn)}>
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
        <img
          className="platform-preview-img"
          src="data:image/jpeg;base64,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"
          alt="VaiBook scheduling dashboard and customer booking screen preview"
        />
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

  const [bookingForm, setBookingForm] = useState({ service_id: "", date: "", time: "10:00", notes: "" });
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
      date: localDateStr(),
      time: "",
      notes: "",
      isVip: false,
    });
    setBookingError("");
    setBookingService(service);
  };

  // A VIP request is for a time OUTSIDE the provider's normal working
  // hours, so it doesn't use the slot picker built from providerHours —
  // the customer just names a time and the provider accepts or declines,
  // same as any other booking request.
  const startVipBookingForService = (service) => {
    setBookingForm({
      service_id: service.id,
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
    const service = (selectedProvider?.services || []).find((s) => s.id === bookingForm.service_id);
    const durationMin = Number(service?.duration_min) || 30;
    const dow = new Date(bookingForm.date + "T00:00:00").getDay();
    const dayHours = providerHours.find((h) => h.day_of_week === dow);
    if (!dayHours || !dayHours.is_open || !dayHours.start_time || !dayHours.end_time) return [];
    const startM = timeToMinutes(dayHours.start_time);
    const endM = timeToMinutes(dayHours.end_time);
    const isToday = bookingForm.date === localDateStr();
    const nowM = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1;
    const step = 30;
    const slots = [];
    for (let m = startM; m + durationMin <= endM; m += step) {
      if (isToday && m <= nowM) continue;
      const slotEnd = m + durationMin;
      const busy = busyWindows.some((w) => {
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
    const service = (selectedProvider.services || []).find((s) => s.id === bookingForm.service_id);
    if (!service) { setBookingError("Please choose a service."); return; }

    setSubmittingBooking(true);
    setBookingError("");

    const total = Number(service.price) || 0;
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
          body: `${user?.full_name || guestCheckoutForm.name || "A customer"} requested ${service.name} on ${whenLabel}${bookingForm.isVip ? " (VIP — outside your normal hours)" : ""}.`,
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
          subject: `New${bookingForm.isVip ? " VIP" : ""} booking request — ${service.name}, ${whenLabel}`,
          html: `<p>Hi ${selectedProvider.business_name || "there"},</p><p><strong>${user?.full_name || guestCheckoutForm.name || "A customer"}</strong> just requested <strong>${service.name}</strong> for <strong>${whenLabel}</strong> (BZ$${finalTotal.toFixed(2)})${bookingForm.isVip ? " — this is a VIP request, outside your normal working hours" : ""}.</p>${bookingForm.notes ? `<p>Their note: "${bookingForm.notes.trim()}"</p>` : ""}<p>Open VaiBook to accept or decline it. You can turn these emails off under Settings → Notifications.</p>`,
        });
      }
      setSelectedProvider(null);
      setBookingService(null);
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
                            {(selectedProvider.services || []).filter(s => s.is_active !== false).map(s => (
                              <div key={s.id} className="service-row">
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--dark-text)" }}>{s.name}</div>
                                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{s.duration_min} min · BZ${s.price}</div>
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
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
                            ))}
                          </div>
                        )
                      )
                    )}

                    {profileTab === "portfolio" && (
                      photos.length > 0 ? (
                        <div className="portfolio-grid">
                          {photos.map((url) => (
                            <img key={url} src={url} alt="Provider work" className="portfolio-thumb" onClick={() => setLightboxUrl(url)} />
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
                              <MapContainer center={[selectedProvider.latitude, selectedProvider.longitude]} zoom={15} style={{ height: 200, width: "100%" }} scrollWheelZoom={false} dragging={false} doubleClickZoom={false} zoomControl={false} attributionControl={false}>
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <Marker position={[selectedProvider.latitude, selectedProvider.longitude]} />
                              </MapContainer>
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
          <img src={lightboxUrl} alt="Provider work" />
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
  const [depositForm, setDepositForm] = useState({ downpayment_required: false, downpayment_pct: 50 });
  const [savingDeposit, setSavingDeposit] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethodForm, setPaymentMethodForm] = useState({ type: "bank", name: "", account_name: "", account_number: "" });
  const [savingPaymentMethod, setSavingPaymentMethod] = useState(false);

  const providerId = providerProfile?.id;

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

  const [vipClients, setVipClients] = useState([]);
  const [loadingVip, setLoadingVip] = useState(false);
  const [togglingVipId, setTogglingVipId] = useState(null);
  const vipCustomerIds = new Set(vipClients.map((v) => v.customer_id));

  const loadVIPClients = async () => {
    if (!providerId) return;
    setLoadingVip(true);
    const data = await getVIPClients(providerId);
    setVipClients(data || []);
    setLoadingVip(false);
  };

  useEffect(() => {
    loadVIPClients();
  }, [providerId]);

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

  const toggleVIP = async (customerId) => {
    if (!providerId || !customerId || togglingVipId === customerId) return;
    setTogglingVipId(customerId);
    const isVip = vipCustomerIds.has(customerId);
    if (isVip) {
      const ok = await untagVIP(providerId, customerId);
      if (ok) setVipClients((prev) => prev.filter((v) => v.customer_id !== customerId));
    } else {
      await tagVIP(providerId, customerId);
      loadVIPClients();
    }
    setTogglingVipId(null);
  };

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
      });
      setEmailOnNewBooking(providerProfile.notify_email_new_booking !== false);
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
    setSavingReschedule(true);
    setRescheduleError("");
    let moved = null;
    try {
      moved = await rescheduleBooking(booking.id, rescheduleForm.date, rescheduleForm.time);
    } catch (err) {
      setSavingReschedule(false);
      setRescheduleError(err.code === "SLOT_TAKEN"
        ? "You already have a booking overlapping that time. Pick another slot."
        : "Couldn't move that booking. Please try again.");
      return;
    }
    setSavingReschedule(false);
    if (!moved) { setRescheduleError("Couldn't move that booking. Please try again."); return; }

    if (booking.customer_id) {
      await createNotification({
        user_id: booking.customer_id,
        title: "Your booking was moved",
        body: `${providerProfile?.business_name || "Your provider"} moved your ${booking.services?.name || "appointment"} to ${formatBookingWhen(moved)}.`,
        type: "booking_rescheduled",
        booking_id: booking.id,
      });
      if (booking.users?.email) {
        await sendBookingEmail({
          to: booking.users.email,
          subject: `Your booking has been moved to ${formatBookingWhen(moved)}`,
          html: `<p>Hi ${booking.users?.full_name || "there"},</p><p>${providerProfile?.business_name || "Your provider"} moved your <strong>${booking.services?.name || "appointment"}</strong> to <strong>${formatBookingWhen(moved)}</strong>.</p><p>If that doesn't work for you, reply to them directly through the booking chat on VaiBook.</p>`,
        });
      }
    }
    setReschedulingId(null);
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
    });
    setSavingDeposit(false);
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
    const url = await uploadProviderPhoto(providerProfile.user_id, file);
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

  const sideItems = [
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "bookings", icon: "📅", label: "Bookings" },
    { id: "vip", icon: "⭐", label: "VIP clients" },
    { id: "calendar", icon: "🗓️", label: "Availability" },
    { id: "services", icon: "✂️", label: "My services" },
    { id: "earnings", icon: "💰", label: "Earnings" },
    { id: "billing", icon: "🧾", label: "My plan & billing" },
    { id: "staff", icon: "👥", label: "My staff" },
    { id: "reviews", icon: "⭐", label: "My reviews" },
    { id: "review", icon: "📈", label: "Monthly review" },
    { id: "profile", icon: "👤", label: "Public profile" },
    { id: "qr", icon: "📱", label: "My QR code" },
    { id: "modules", icon: "🧩", label: "Modules" },
    { id: "settings", icon: "⚙️", label: "Settings" },
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
    <div className="portal-layout">
      <aside className="sidebar">
        <div style={{ padding: "0 16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 20 }}>
          <span className="nav-logo" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, color: "var(--near-white)", display: "inline-flex", alignItems: "center", gap: 7 }}><VaiBookMark size={19} />vai<span style={{ color: "var(--lime)" }}>book</span></span>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>Provider portal</div>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-label">Provider tools</div>
          {sideItems.map(item => (
            <div key={item.id} className={`sidebar-item ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>
              <span className="icon">{item.icon}</span>{item.label}
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 16px", marginTop: 4 }}>
          <div style={{ background: "rgba(198,241,53,0.12)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "var(--lime)", fontWeight: 600, marginBottom: 4 }}>{providerProfile.is_active ? "ACTIVE PROVIDER" : "PENDING ACTIVATION"}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{providerProfile.service_type} · {providerProfile.district}</div>
          </div>
        </div>
        <div className="sidebar-avatar">
          <div className="avatar">{(providerProfile.business_name || "V")[0].toUpperCase()}</div>
          <div className="avatar-info">
            <div className="name">{providerProfile.business_name || "Your business"}</div>
            <div className="role" style={{ cursor: "pointer" }} onClick={onSignOut}>Sign out</div>
          </div>
        </div>
      </aside>

      <main className="portal-content">
        {tab === "dashboard" && (
          <>
            <div className="portal-header">
              <h2>Dashboard</h2>
              <p>{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {todaysBookings.length} appointment{todaysBookings.length === 1 ? "" : "s"} today</p>
            </div>
            <div className="metric-grid">
              <div className="metric"><div className="metric-label">This month earnings</div><div className="metric-value" style={{ color: "var(--forest-light)" }}>BZ${thisMonthEarnings.toFixed(0)}</div><div className="metric-sub">{thisMonthCompletedCount} completed this month</div></div>
              <div className="metric"><div className="metric-label">Bookings today</div><div className="metric-value">{todaysBookings.length}</div><div className="metric-sub">{todaysBookings.filter(b => b.status === "confirmed").length} confirmed, {pendingBookings.length} awaiting your reply</div></div>
              <div className="metric"><div className="metric-label">Total bookings</div><div className="metric-value">{bookings.length}</div><div className="metric-sub">All time</div></div>
              <div className="metric"><div className="metric-label">Completion rate</div><div className="metric-value">{completionRate === null ? "—" : `${completionRate}%`}</div><div className="metric-sub">{completionRate === null ? "No finished bookings yet" : `Of ${settledBookings.length} finished booking${settledBookings.length === 1 ? "" : "s"}`}</div></div>
            </div>
            <div className="grid-2">
              <div className="card">
                <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Today's appointments</span>
                  <button className="btn-sm ghost" onClick={loadBookings} disabled={loadingBookings}>{loadingBookings ? "Refreshing..." : "Refresh"}</button>
                </div>
                {todaysBookings.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>Nothing booked for today.</p>}
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
          </>
        )}

        {tab === "vip" && (
          <>
            <div className="portal-header"><h2>VIP clients</h2><p>Customers you've flagged for extra attention — tap the star next to a customer's name on any booking to add or remove them.</p></div>
            <div className="card">
              <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>All VIP clients</span>
                <button className="btn-sm forest" onClick={loadVIPClients} disabled={loadingVip}>{loadingVip ? "Refreshing..." : "Refresh"}</button>
              </div>
              {vipClients.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{loadingVip ? "Loading..." : "No VIP clients yet."}</p>
              )}
              {vipClients.map((v) => (
                <div key={v.customer_id} className="booking-item" style={{ alignItems: "center" }}>
                  <div className="booking-info" style={{ flex: 1 }}>
                    <div className="title">⭐ {v.users?.full_name || "Customer"}</div>
                    <div className="meta">{v.users?.email}</div>
                  </div>
                  <button
                    className="btn-sm"
                    style={{ background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }}
                    disabled={togglingVipId === v.customer_id}
                    onClick={() => toggleVIP(v.customer_id)}
                  >
                    Remove
                  </button>
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
                        {b.customer_id && (
                          <button
                            onClick={() => toggleVIP(b.customer_id)}
                            disabled={togglingVipId === b.customer_id}
                            title={vipCustomerIds.has(b.customer_id) ? "Remove VIP tag" : "Mark this customer as VIP"}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, marginLeft: 6, padding: 0, verticalAlign: "middle" }}
                          >
                            {vipCustomerIds.has(b.customer_id) ? "⭐" : "☆"}
                          </button>
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
                      {["pending", "awaiting_payment", "confirmed"].includes(b.status) && reschedulingId !== b.id && (
                        <button className="btn-sm ghost" disabled={busyId === b.id} onClick={() => openReschedule(b)}>Reschedule</button>
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

                  {reschedulingId === b.id && (
                    <div style={{ marginTop: 10, background: "var(--sand)", borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Move this appointment</div>
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
                        <button className="btn-sm lime" disabled={savingReschedule} onClick={() => submitReschedule(b)}>{savingReschedule ? "Moving..." : "Save new time"}</button>
                        <button className="btn-sm ghost" onClick={closeReschedule}>Cancel</button>
                      </div>
                      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                        The customer is notified and emailed the new time. VaiBook won't let you move it on top of another booking.
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
              </div>
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
                    <img src={url} alt="Provider work" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }} />
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
                <MapContainer center={mapPosition || BELIZE_CENTER} zoom={mapPosition ? 15 : 8} style={{ height: 260, width: "100%" }}>
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <LocationPicker position={mapPosition} onPick={setMapPosition} />
                </MapContainer>
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

        {tab === "qr" && (() => {
          const bookingUrl = `${window.location.origin}/#book-${providerId}`;
          const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(bookingUrl)}`;
          return (
            <>
              <div className="portal-header">
                <h2>My QR code</h2>
                <p>Print this and put it up in your shop — customers scan it and go straight to your booking page on VaiBook, no searching needed.</p>
              </div>
              <div className="card" style={{ maxWidth: 420 }}>
                <div style={{ textAlign: "center" }}>
                  <img
                    src={qrImageUrl}
                    alt={`QR code linking to ${providerProfile?.business_name || "your"} booking page`}
                    style={{ width: 240, height: 240, borderRadius: 12, border: "1px solid var(--border)", background: "#fff", padding: 12 }}
                  />
                  <div style={{ marginTop: 16, fontSize: 13, color: "var(--muted)", wordBreak: "break-all" }}>{bookingUrl}</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
                    <button
                      className="btn-sm forest"
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(bookingUrl); } catch (e) { /* clipboard unavailable — link is shown below already */ }
                      }}
                    >
                      Copy link
                    </button>
                    <a className="btn-sm lime" href={qrImageUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                      Open full-size to save/print
                    </a>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 16 }}>
                    On phone or desktop: open the full-size image above, then save or print it like any picture — it never expires or changes, so one printout works forever.
                  </p>
                </div>
              </div>
            </>
          );
        })()}

        {tab === "modules" && <ModulesPanel />}

        {tab === "settings" && (
          <>
            <div className="portal-header"><h2>Settings</h2></div>
            <div className="card" style={{ maxWidth: 480 }}>
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
    <div className="signup-wrap">
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
    if (hadPendingView) return;
    const h = window.location.hash.replace("#", "");
    if (h === "customer" || h === "provider" || parseBookingHash(h)) return;
    const ok = await checkIsAdmin(email);
    if (ok) setView("admin");
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
        setStaffProfile(p ? null : await loadStaffProfile());
        const hadPending = applyPendingView();
        await maybeGoToAdmin(session.user.email, hadPending);
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

  const handleSignOut = async () => {
    await signOut();
    setView("home");
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
      {view !== "auth" && <Nav onNav={setView} current={view} {...authProps} />}
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
