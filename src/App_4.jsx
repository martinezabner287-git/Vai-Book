
import { useState, useEffect, useLayoutEffect, useRef, useContext, createContext } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { supabase, signInWithGoogle, signOut, getOrCreateUser, getProviderProfile, checkIsAdmin, getProviderApplications, updateApplicationStatus, submitProviderApplication, getProviderBookings, updateBookingStatus, updateBooking, upsertProviderProfile, getWorkingHours, upsertWorkingHours, getActiveApplicationByEmail, uploadProviderPhoto, deleteProviderPhoto, createService, deleteService, getActiveProviders, getProviderDirectory, createBooking, getProviderBusyWindows, createBookingSafe, cancelBooking, getCustomerBookings, uploadReceipt, submitReview, getProviderReviews, sendBookingEmail, updateUserProfile, getPaymentMethods, addPaymentMethod, deletePaymentMethod, createNotification, getNotifications, markNotificationRead, markAllNotificationsRead, getLandingStats, getRecommendedServices, getCategoryDefaultFeatures, getProviderFeatureOverrides, setProviderFeatureOverride, getVisitNotes, upsertVisitNote, adminListProviders, adminUpdateProvider, adminDeleteProvider, tagVIP, untagVIP, getVIPClients, getFavoriteProviderIds, getFavoriteProviders, addFavorite, removeFavorite } from "./supabase";

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
// Type: "Syne" display (bold, geometric) + "Inter" body
// Signature: the lime accent used sparingly — only on the ONE thing that matters per screen

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600;700;800&display=swap');

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

  body { font-family: 'Inter', sans-serif; background: var(--near-white); color: var(--dark-text); }

  /* NAV */
  .nav {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 48px; background: var(--near-white); position: sticky; top: 0; z-index: 100;
    border-bottom: 1px solid var(--border);
  }
  .nav-logo { font-family: 'Syne', sans-serif; font-size: 22px; color: var(--forest); letter-spacing: -0.5px; }
  .nav-logo span { color: var(--clay); }
  .nav-cta { display: flex; align-items: center; gap: 18px; position: relative; }

  /* NAV SEARCH (pinned between the logo and menu/account controls) */
  .nav-search-wrap { flex: 1; display: flex; justify-content: center; min-width: 0; padding: 0 24px; opacity: 0; pointer-events: none; transform: translateY(-4px); transition: opacity .2s ease, transform .2s ease; }
  .nav-search-wrap.visible { opacity: 1; pointer-events: auto; transform: none; }
  .nav-search { position: relative; width: 100%; max-width: 420px; }
  .nav-search-input-wrap { display: flex; align-items: center; gap: 8px; background: var(--sand); border-radius: 100px; padding: 9px 16px; }
  .nav-search-input-wrap input { border: none; outline: none; background: transparent; font-size: 13px; width: 100%; font-family: 'Inter', sans-serif; color: var(--dark-text); }
  .nav-search-icon { font-size: 14px; color: var(--muted); flex-shrink: 0; }
  .nav-search-toggle { display: none; background: transparent; border: 1px solid var(--border); width: 38px; height: 38px; border-radius: 50%; align-items: center; justify-content: center; cursor: pointer; font-size: 15px; color: var(--dark-text); flex-shrink: 0; opacity: 0; pointer-events: none; transition: opacity .2s ease; }
  .nav-search-toggle.visible { opacity: 1; pointer-events: auto; }
  .nav-search-mobile-panel { display: none; }
  @media (max-width: 768px) {
    .nav-search-wrap { display: none; }
    .nav-search-toggle { display: flex; }
    .nav-search-mobile-panel { display: block; position: absolute; top: 100%; left: 0; right: 0; background: white; border-bottom: 1px solid var(--border); padding: 14px 20px 18px; box-shadow: 0 12px 24px rgba(13,61,46,0.08); }
  }

  /* NOTIFICATION BELL */
  .notif-bell-btn { position: relative; background: transparent; border: 1px solid var(--border); width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; flex-shrink: 0; }
  .notif-bell-btn:hover { border-color: var(--forest); }
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
  .nav-login-link { background: none; border: none; color: var(--dark-text); font-size: 14px; font-weight: 500; cursor: pointer; padding: 4px; }
  .nav-login-link:hover { color: var(--forest); }
  .btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--dark-text); padding: 9px 20px; border-radius: 100px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all .2s; }
  .btn-ghost:hover { border-color: var(--forest); color: var(--forest); }
  .btn-lime { background: var(--lime); border: none; color: var(--forest); padding: 8px 20px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity .2s; }
  .btn-lime:hover { opacity: 0.85; }
  .nav-menu-btn { display: flex; align-items: center; gap: 8px; background: transparent; border: 1px solid var(--border); color: var(--dark-text); padding: 9px 18px 9px 22px; border-radius: 100px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all .2s; }
  .nav-menu-btn:hover { border-color: var(--forest); color: var(--forest); }
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
  .auth-choice-body h1 { font-family: 'Syne', sans-serif; font-size: 30px; font-weight: 800; color: var(--forest); margin-bottom: 32px; text-align: center; }
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
  .auth-choice-panel-logo { position: relative; z-index: 1; font-family: 'Syne', sans-serif; font-size: 44px; font-weight: 800; color: var(--near-white); }
  .auth-choice-panel-logo span { color: var(--lime); }
  @media (max-width: 768px) {
    .auth-choice { grid-template-columns: 1fr; }
    .auth-choice-panel { display: none; }
  }

  /* ACCOUNT DROPDOWN */
  .nav-avatar-btn { display: flex; align-items: center; gap: 8px; background: transparent; border: 1px solid var(--border); border-radius: 100px; padding: 4px 12px 4px 4px; cursor: pointer; transition: border-color .2s; }
  .nav-avatar-btn:hover { border-color: var(--forest); }
  .nav-avatar-circle { width: 30px; height: 30px; border-radius: 50%; background: var(--lime); color: var(--forest); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
  .profile-avatar-circle { width: 84px; height: 84px; border-radius: 50%; background: var(--lime); color: var(--forest); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 30px; }
  .nav-avatar-caret { font-size: 10px; color: var(--muted); }
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
  .hero-title { font-family: 'Syne', sans-serif; font-size: clamp(40px, 5vw, 64px); line-height: 1.05; color: var(--near-white); margin-bottom: 24px; }
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

  /* SEARCH HERO */
  .search-hero { position: relative; overflow: hidden; padding: 120px 24px 96px; text-align: center; background: var(--sand); }
  .search-hero::before {
    content: '';
    position: absolute; inset: -25%;
    background:
      radial-gradient(circle at 18% 25%, rgba(198,241,53,0.38), transparent 50%),
      radial-gradient(circle at 82% 20%, rgba(212,121,90,0.22), transparent 50%),
      radial-gradient(circle at 50% 95%, rgba(13,61,46,0.16), transparent 55%);
    filter: blur(50px);
    z-index: 0;
  }
  .search-hero > * { position: relative; z-index: 1; }
  .search-hero > .search-bar-pill { z-index: 10; }
  .search-hero h1 { font-family: 'Inter', sans-serif; font-weight: 800; font-size: clamp(28px, 4.4vw, 52px); color: var(--forest); line-height: 1.2; letter-spacing: -0.5px; margin: 0 auto 16px; max-width: 780px; }
  @media (max-width: 480px) {
    .search-hero h1 { font-size: clamp(26px, 8vw, 34px); }
  }
  .search-sub { font-size: 17px; color: var(--muted); max-width: 560px; margin: 0 auto 40px; line-height: 1.5; }
  .search-bar-pill { position: relative; max-width: 760px; margin: 0 auto; background: white; border-radius: 100px; box-shadow: 0 12px 40px rgba(13,61,46,0.14); display: flex; align-items: center; padding: 8px; gap: 4px; }
  .search-bar-pill .field { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 10px 18px; }
  .search-bar-pill .field input, .search-bar-pill .field select { border: none; outline: none; background: transparent; font-size: 14px; width: 100%; color: var(--dark-text); font-family: 'Inter', sans-serif; }
  .search-bar-pill .sep { width: 1px; height: 28px; background: var(--border); flex-shrink: 0; }
  .search-submit { background: var(--forest); color: var(--near-white); border: none; border-radius: 100px; padding: 14px 30px; font-weight: 600; font-size: 15px; cursor: pointer; white-space: nowrap; transition: opacity .2s; font-family: 'Inter', sans-serif; }
  .search-submit:hover { opacity: .87; }
  .search-hero-tagline { margin-top: 26px; font-size: 13px; color: var(--muted); }
  .search-hero-tagline a { color: var(--forest); font-weight: 600; cursor: pointer; text-decoration: underline; }

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
  .stats-bar { background: var(--sand); padding: 40px 48px; display: flex; justify-content: space-around; gap: 32px; flex-wrap: wrap; }
  .stat { text-align: center; }
  .stat-num { font-family: 'Syne', sans-serif; font-size: 36px; font-weight: 800; color: var(--forest); }
  .stat-num span { color: var(--clay); }
  .stat-label { font-size: 13px; color: var(--muted); margin-top: 4px; }

  /* HOW IT WORKS */
  .section { padding: 80px 48px; }
  .section-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--clay); margin-bottom: 12px; }
  .section-title { font-family: 'Syne', sans-serif; font-size: clamp(28px, 4vw, 44px); color: var(--forest); margin-bottom: 16px; line-height: 1.1; }
  .section-sub { font-size: 16px; color: var(--muted); max-width: 520px; line-height: 1.65; margin-bottom: 48px; }
  .steps-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; }
  .step-card { background: var(--near-white); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px 24px; position: relative; overflow: hidden; }
  .step-card::before { content: attr(data-n); position: absolute; top: -10px; right: 16px; font-family: 'Syne', sans-serif; font-size: 72px; font-weight: 800; color: var(--forest); opacity: 0.04; line-height: 1; }
  .step-icon { font-size: 28px; margin-bottom: 16px; }
  .step-card h3 { font-size: 16px; font-weight: 600; color: var(--forest); margin-bottom: 8px; }
  .step-card p { font-size: 14px; color: var(--muted); line-height: 1.6; }

  /* SERVICES SECTION */
  .services-section { background: var(--forest); padding: 80px 48px; }
  .services-section .section-title { color: var(--near-white); }
  .services-section .section-sub { color: rgba(255,255,255,0.55); }
  .services-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
  .svc-tile { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius); padding: 28px 20px; text-align: center; cursor: pointer; transition: all .2s; }
  .svc-tile:hover { background: rgba(198,241,53,0.1); border-color: var(--lime); }
  .svc-tile .icon { font-size: 36px; margin-bottom: 12px; }
  .svc-tile h4 { font-size: 14px; font-weight: 600; color: var(--near-white); margin-bottom: 4px; }
  .svc-tile p { font-size: 12px; color: rgba(255,255,255,0.45); }

  /* PRICING */
  .pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; max-width: 960px; margin: 0 auto; }
  .price-card { background: var(--near-white); border: 1px solid var(--border); border-radius: var(--radius); padding: 32px 28px; position: relative; }
  .price-card.popular { border-color: var(--forest); box-shadow: 0 0 0 1px var(--forest); }
  .popular-badge { position: absolute; top: -12px; left: 24px; background: var(--forest); color: var(--lime); font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; letter-spacing: .04em; text-transform: uppercase; }
  .price-tier { font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: .06em; }
  .price-amount { font-family: 'Syne', sans-serif; font-size: 40px; font-weight: 800; color: var(--forest); margin-bottom: 4px; }
  .price-amount sup { font-size: 20px; vertical-align: super; }
  .price-period { font-size: 13px; color: var(--muted); margin-bottom: 24px; }
  .price-features { list-style: none; margin-bottom: 28px; display: flex; flex-direction: column; gap: 10px; }
  .price-features li { font-size: 14px; color: var(--dark-text); display: flex; align-items: flex-start; gap: 8px; line-height: 1.4; }
  .price-features li::before { content: '✓'; color: var(--forest-light); font-weight: 700; margin-top: 1px; flex-shrink: 0; }
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
  .portal-header h2 { font-family: 'Syne', sans-serif; font-size: 26px; font-weight: 700; color: var(--forest); }
  .portal-header p { font-size: 14px; color: var(--muted); margin-top: 4px; }

  /* CARDS / WIDGETS */
  .card { background: var(--near-white); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
  .card-sm { background: var(--near-white); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
  .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .metric { background: var(--near-white); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
  .metric-label { font-size: 12px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
  .metric-value { font-family: 'Syne', sans-serif; font-size: 30px; font-weight: 800; color: var(--forest); }
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
  .search-bar input { border: none; outline: none; font-size: 15px; flex: 1; font-family: 'Inter', sans-serif; color: var(--dark-text); background: transparent; }
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

  /* PROVIDER PROFILE MODAL (Services / Portfolio / Reviews / About) */
  .modal-panel.profile-panel { max-width: 580px; }
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
  .input-group input, .input-group select, .input-group textarea { width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; font-size: 14px; font-family: 'Inter', sans-serif; color: var(--dark-text); background: white; outline: none; transition: border-color .2s; }
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
    .hero { grid-template-columns: 1fr; padding: 60px 24px; min-height: auto; }
    .hero-card-wrap { display: none; }
    .section { padding: 60px 24px; }
    .stats-bar { padding: 32px 24px; }
    .portal-layout { grid-template-columns: 1fr; }
    .sidebar { display: none; }
    .portal-content { padding: 20px; }
    .grid-2 { grid-template-columns: 1fr; }
    .grid-3 { grid-template-columns: 1fr; }
    .metric-grid { grid-template-columns: 1fr 1fr; }
    .services-grid { grid-template-columns: repeat(2, 1fr); }
    .footer { padding: 40px 24px 24px; }
    .a2hs-banner { left: 12px; right: 12px; bottom: 12px; padding: 12px; }
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
  .a2hs-modal-title { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 800; color: var(--forest); margin: 0 0 8px; }
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

// ── DATA ────────────────────────────────────────────────────────
const SERVICES = [
  { icon: "✂️", name: "Barbers", desc: "Cuts & styles", bg: "#1A5C44" },
  { icon: "💅", name: "Nail Techs", desc: "Nails & art", bg: "#2A4A3E" },
  { icon: "🏠", name: "Home Cleaning", desc: "Deep & regular", bg: "#1E4035" },
  { icon: "🚗", name: "Car Wash", desc: "Mobile & fixed", bg: "#163626" },
  { icon: "🐾", name: "Pet Grooming", desc: "All breeds", bg: "#1C4A38" },
  { icon: "🔧", name: "Handyman", desc: "Repairs & more", bg: "#244530" },
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
  "Nail Tech": "hair_salon",
  "Beauty Salon": "hair_salon",
  "Massage": "spa_massage",
  "Med Spa / Clinic": "med_spa",
  "Tattoo & Piercing Studio": "tattoo_piercing",
  "Home Cleaning": "general",
  "Car Wash": "general",
  "Pet Grooming": "general",
  "Handyman": "general",
  "Photography": "general",
  "Other": "general",
};
const categoryForServiceType = (serviceType) => SERVICE_TYPE_TO_CATEGORY[serviceType] || "general";

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

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DEFAULT_HOURS = DAY_NAMES.map((day, i) => ({
  day, day_of_week: i, is_open: i !== 0, start_time: i === 6 ? "09:00" : "08:00", end_time: i === 6 ? "15:00" : "18:00",
}));

function bookingStatusClass(status) {
  if (status === "confirmed") return "confirmed";
  if (status === "pending") return "pending";
  if (status === "awaiting_payment") return "awaiting";
  if (status === "rejected" || status === "cancelled") return "rejected";
  return "done";
}

function statusLabel(status) {
  if (status === "awaiting_payment") return "awaiting payment";
  return status;
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
        <div className="auth-choice-panel-logo">vai<span>book</span></div>
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

function NotificationBell({ userId }) {
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
    { id: "profile", icon: "👤", label: "Public profile" },
    { id: "modules", icon: "🧩", label: "Modules" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ],
  admin: [
    { id: "pending", icon: "⏳", label: "Pending" },
    { id: "active", icon: "✅", label: "Active" },
    { id: "rejected", icon: "✖", label: "Rejected" },
    { id: "providers", icon: "🏪", label: "Providers" },
  ],
};

function setPortalTab(tabId) {
  window.dispatchEvent(new CustomEvent("vaibook-set-portal-tab", { detail: { tab: tabId } }));
}

function Nav({ onNav, current, session, user, onSignIn, onSignOut }) {
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

  return (
    <nav className="nav" ref={navRef}>
      <span className="nav-logo" style={{ cursor: "pointer" }} onClick={() => onNav("home")}>vai<span>book</span></span>

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
      <button className={`nav-search-toggle ${navSearchActive ? "visible" : ""}`} onClick={() => setMobileSearchOpen(v => !v)} aria-label="Search">🔍</button>

      {session && user && <NotificationBell userId={user.id} />}

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
            <button className="btn-ghost" onClick={() => onNav("signup")}>List your business</button>
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
        <div style={{ position: "relative" }}>
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
    </nav>
  );
}

function LandingPage({ onNav, session, onSignIn }) {
  const [heroQuery, setHeroQuery] = useState("");
  const [heroDistrict, setHeroDistrict] = useState("");
  const [heroDirectory, setHeroDirectory] = useState([]);
  const [showHeroSuggestions, setShowHeroSuggestions] = useState(false);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [recommended, setRecommended] = useState([]);
  const [loadingRecommended, setLoadingRecommended] = useState(true);

  useEffect(() => {
    getProviderDirectory().then((data) => setHeroDirectory(data || []));
    getLandingStats().then((data) => { setStats(data); setLoadingStats(false); });
    getRecommendedServices(6).then((data) => { setRecommended(data || []); setLoadingRecommended(false); });
  }, []);

  const heroSuggestions = buildSuggestions(heroDirectory, heroQuery);

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
      {/* HERO */}
      <section className="search-hero">
        <h1>Book local services, the easy way</h1>
        <p className="search-sub">Find trusted barbers, nail techs, cleaners, and more near you in Belize.</p>
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
        <div className="search-hero-tagline">
          Own a business? <a onClick={() => onNav("signup")}>List it on VaiBook, free to start</a>
        </div>
      </section>

      {/* STATS — live counts from the database, not placeholders */}
      <div className="stats-bar">
        <div className="stat"><div className="stat-num">{loadingStats ? "—" : (stats?.bookingsCompleted ?? 0).toLocaleString()}</div><div className="stat-label">Bookings completed</div></div>
        <div className="stat"><div className="stat-num">{loadingStats ? "—" : (stats?.activeProviders ?? 0).toLocaleString()}</div><div className="stat-label">Verified providers</div></div>
        <div className="stat"><div className="stat-num">{loadingStats ? "—" : (stats?.districts ?? 0)}<span> district{stats?.districts === 1 ? "" : "s"}</span></div><div className="stat-label">Across Belize</div></div>
        <div className="stat"><div className="stat-num">{loadingStats ? "—" : (stats?.avgRating != null ? `${stats.avgRating}★` : "New")}</div><div className="stat-label">{stats?.avgRating != null ? `Average rating (${stats.reviewCount})` : "Average rating"}</div></div>
      </div>

      {/* RECOMMENDED — surfaces services from the highest-rated providers
          (2+ reviews required so one 5-star review can't dominate). Hidden
          entirely once loaded if there isn't enough review data yet. */}
      {!loadingRecommended && recommended.length > 0 && (
        <section className="section" id="recommended" style={{ paddingBottom: 24 }}>
          <div className="section-eyebrow">Loved by customers</div>
          <h2 className="section-title">Recommended for you</h2>
          <p className="section-sub">The highest-rated providers on VaiBook right now.</p>
          <div className="steps-grid">
            {recommended.map((r) => (
              <div
                className="step-card"
                key={`${r.provider_id}-${r.service_id}`}
                style={{ cursor: "pointer", textAlign: "left" }}
                onClick={() => enterCustomerPortal(onNav, session, onSignIn)}
              >
                <div className="step-icon">⭐</div>
                <h3>{r.service_name}</h3>
                <p style={{ marginBottom: 4 }}>{r.business_name} · {r.service_type} · {r.district}</p>
                <p style={{ fontWeight: 700, color: "var(--forest)" }}>{r.rating}★ <span style={{ fontWeight: 400, color: "var(--muted)" }}>({r.reviewCount} review{r.reviewCount === 1 ? "" : "s"})</span> · BZ${r.price}</p>
              </div>
            ))}
          </div>
        </section>
      )}

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

      {/* SERVICES */}
      <section className="services-section" id="services">
        <div className="section-eyebrow" style={{ color: "var(--lime)" }}>What's on VaiBook</div>
        <h2 className="section-title">Every local service. One platform.</h2>
        <p className="section-sub">From a fresh fade to a spotless car — all bookable in your district.</p>
        <div className="services-grid">
          {SERVICES.map((s, i) => (
            <div className="svc-tile" key={i} onClick={() => enterCustomerPortal(onNav, session, onSignIn)}>
              <div className="icon">{s.icon}</div>
              <h4>{s.name}</h4>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section className="section" id="pricing" style={{ background: "var(--sand)" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="section-eyebrow" style={{ justifyContent: "center", display: "flex" }}>For providers</div>
          <h2 className="section-title">Simple pricing. Grow your clientele.</h2>
          <p className="section-sub" style={{ margin: "0 auto" }}>Start free, upgrade when you're ready. No hidden fees.</p>
        </div>
        <div className="pricing-grid">
          <div className="price-card">
            <div className="price-tier">Starter</div>
            <div className="price-amount"><sup>BZ$</sup>0</div>
            <div className="price-period">Free forever</div>
            <ul className="price-features">
              <li>Basic public profile</li>
              <li>Up to 10 bookings/month</li>
              <li>Customer ratings visible</li>
              <li>WhatsApp notification</li>
            </ul>
            <button className="btn-outline-forest" onClick={() => onNav("signup")}>Get started free</button>
          </div>
          <div className="price-card popular">
            <div className="popular-badge">Most Popular</div>
            <div className="price-tier">Pro</div>
            <div className="price-amount"><sup>BZ$</sup>50</div>
            <div className="price-period">per month</div>
            <ul className="price-features">
              <li>Everything in Starter</li>
              <li>Unlimited bookings</li>
              <li>Live calendar scheduling</li>
              <li>Deposit receipt tracking</li>
              <li>Custom booking link</li>
              <li>SMS & email reminders to clients</li>
            </ul>
            <button className="btn-forest" onClick={() => onNav("signup")}>Start Pro trial</button>
          </div>
          <div className="price-card">
            <div className="price-tier">Business</div>
            <div className="price-amount"><sup>BZ$</sup>120</div>
            <div className="price-period">per month</div>
            <ul className="price-features">
              <li>Everything in Pro</li>
              <li>Multiple staff seats</li>
              <li>Loyalty & rewards program</li>
              <li>Analytics dashboard</li>
              <li>Featured in district search</li>
              <li>Priority customer support</li>
            </ul>
            <button className="btn-outline-forest" onClick={() => onNav("signup")}>Start Business trial</button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-top">
          <div className="footer-brand">
            <span className="nav-logo">vai<span>book</span></span>
            <p>Local services. Booked easily. Built for Belize.</p>
          </div>
          <div className="footer-links">
            <h5>Services</h5>
            <ul>
              <li>Barbers</li><li>Nail Techs</li><li>Home Cleaning</li><li>Car Wash</li>
            </ul>
          </div>
          <div className="footer-links">
            <h5>Company</h5>
            <ul>
              <li>About Vai</li><li>How it works</li><li>Pricing</li><li>Blog</li>
            </ul>
          </div>
          <div className="footer-links">
            <h5>Support</h5>
            <ul>
              <li>Help center</li><li>Contact us</li><li>Privacy policy</li><li>Terms</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 VaiBook. Built in Belize 🇧🇿</span>
          <span>Part of the Vai platform</span>
        </div>
      </footer>
    </>
  );
}

// ── CUSTOMER PORTAL ─────────────────────────────────────────────
function CustomerPortal({ onNav, user, session, onSignOut, onUserUpdate }) {
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

  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providerSearch, setProviderSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("All");

  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState(null);
  const [bookingForm, setBookingForm] = useState({ service_id: "", date: "", time: "10:00", notes: "" });
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [providerHours, setProviderHours] = useState([]);
  const [busyWindows, setBusyWindows] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [profileTab, setProfileTab] = useState("services");
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
    setBookingService(null);
    setProviderReviews([]);
    setLightboxUrl(null);
    setSelectedProvider(provider);
    setProviderHours([]);
    setBusyWindows([]);
    if (provider?.id) {
      getWorkingHours(provider.id).then((hrs) => setProviderHours(hrs || []));
    }
  };

  const startBookingForService = (service) => {
    setBookingForm({
      service_id: service.id,
      date: new Date().toISOString().slice(0, 10),
      time: "",
      notes: "",
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
    const isToday = bookingForm.date === new Date().toISOString().slice(0, 10);
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

  const submitBooking = async () => {
    if (!user?.id) { setBookingError("Please sign in again to book."); return; }
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
    const downpayment = dpPct ? Math.round(total * dpPct) / 100 : null;
    const order_number = `VB-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    let created = null;
    try {
      created = await createBookingSafe({
        order_number,
        customer_id: user.id,
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
      } else {
        setBookingError("Something went wrong sending your request. Please try again.");
      }
      return;
    }

    setSubmittingBooking(false);

    if (created) {
      if (selectedProvider.user_id) {
        await createNotification({
          user_id: selectedProvider.user_id,
          title: "New booking request",
          body: `${user?.full_name || "A customer"} requested ${service.name} on ${new Date(bookingForm.date).toLocaleDateString()}.`,
          type: "booking_requested",
          booking_id: created.id,
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
    setUploadingReceiptId(bookingId);
    await uploadReceipt(bookingId, file);
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

  const openReview = (bookingId) => {
    setReviewingId(bookingId);
    setReviewForm({ rating: 5, comment: "" });
  };

  const submitBookingReview = async (booking) => {
    if (!user?.id) return;
    setSubmittingReview(true);
    await submitReview({
      booking_id: booking.id,
      customer_id: user.id,
      provider_id: booking.provider_id,
      rating: reviewForm.rating,
      comment: reviewForm.comment ? reviewForm.comment.trim() : null,
    });
    if (booking.provider_profiles?.user_id) {
      await createNotification({
        user_id: booking.provider_profiles.user_id,
        title: "New review received",
        body: `${user?.full_name || "A customer"} left a ${reviewForm.rating}-star review${reviewForm.comment ? `: "${reviewForm.comment.trim().slice(0, 80)}"` : "."}`,
        type: "review",
        booking_id: booking.id,
      });
    }
    await loadBookings();
    setReviewingId(null);
    setSubmittingReview(false);
  };

  const upcomingBookings = bookings.filter((b) => ["pending", "awaiting_payment", "confirmed"].includes(b.status));
  const completedBookings = bookings.filter((b) => b.status === "completed");
  const rejectedBookings = bookings.filter((b) => b.status === "rejected" || b.status === "cancelled");
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
          <span className="nav-logo" style={{ fontFamily: "Syne, sans-serif", fontSize: 18, color: "var(--near-white)" }}>vai<span style={{ color: "var(--lime)" }}>book</span></span>
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
                      <div className="meta">{b.provider_profiles?.business_name || "Provider"} · {new Date(b.booking_date).toLocaleDateString()}</div>
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
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>What do you need today?</p>
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
                placeholder="Search barbers, nail techs, cleaners, or 'haircut'..."
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
                      <div className="provider-card-img" style={{ background: "#E8F5EF" }}>{p.service_type === "Barber" ? "✂️" : p.service_type === "Nail Tech" ? "💅" : p.service_type === "Car Wash" ? "🚗" : p.service_type === "Pet Grooming" ? "🐾" : p.service_type === "Home Cleaning" ? "🏠" : "🛠️"}</div>
                    )}
                    <div className="provider-card-body">
                      <h4>{p.business_name}</h4>
                      <div className="trade">{p.service_type} · {p.district}</div>
                      <div className="stars">{rating ? `★★★★★ ` : "No reviews yet "}<span style={{ color: "var(--muted)", fontSize: 12 }}>{rating ? `${rating} (${p.reviews.length})` : ""}</span></div>
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
                      <div className="provider-card-img" style={{ background: "#E8F5EF" }}>{p.service_type === "Barber" ? "✂️" : p.service_type === "Nail Tech" ? "💅" : p.service_type === "Car Wash" ? "🚗" : p.service_type === "Pet Grooming" ? "🐾" : p.service_type === "Home Cleaning" ? "🏠" : "🛠️"}</div>
                    )}
                    <div className="provider-card-body">
                      <h4>{p.business_name}</h4>
                      <div className="trade">{p.service_type} · {p.district}</div>
                      <div className="stars">{rating ? `★★★★★ ` : "No reviews yet "}<span style={{ color: "var(--muted)", fontSize: 12 }}>{rating ? `${rating} (${p.reviews.length})` : ""}</span></div>
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
            <div className="card">
              {loadingBookings && <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>Loading...</p>}
              {!loadingBookings && (bookingTab === "upcoming" ? upcomingBookings : bookingTab === "completed" ? completedBookings : rejectedBookings).length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>Nothing here yet.</p>
              )}
              {(bookingTab === "upcoming" ? upcomingBookings : bookingTab === "completed" ? completedBookings : rejectedBookings).map((b) => {
                const hasReview = b.reviews && b.reviews.length > 0;
                return (
                  <div key={b.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                    <div className="booking-item" style={{ padding: 0, border: "none" }}>
                      <div className={`booking-dot ${bookingStatusClass(b.status)}`}></div>
                      <div className="booking-info">
                        <div className="title">{b.services?.name || "Service"}</div>
                        <div className="meta">{b.provider_profiles?.business_name || "Provider"} · {new Date(b.booking_date).toLocaleDateString()} {b.booking_time?.slice(0,5)}</div>
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

                    {b.status === "completed" && !hasReview && reviewingId !== b.id && (
                      <button className="btn-sm ghost" style={{ marginTop: 8 }} onClick={() => openReview(b.id)}>Leave a review</button>
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
                    {b.status === "completed" && hasReview && (
                      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>You rated this {"★".repeat(b.reviews[0].rating)}{b.reviews[0].comment ? ` — "${b.reviews[0].comment}"` : ""}</p>
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
                  <div className="booking-info"><div className="title">{b.services?.name || "Service"}</div><div className="meta">{b.provider_profiles?.business_name || "Provider"}{b.receipt_url ? " · " : ""}{b.receipt_url && <a href={b.receipt_url} target="_blank" rel="noreferrer">receipt</a>}</div></div>
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
          </>
        )}
      </main>

      {selectedProvider && (
        <div className="modal-overlay" onClick={() => setSelectedProvider(null)}>
          <div className="modal-panel profile-panel" onClick={(e) => e.stopPropagation()}>
            <span className="modal-close" onClick={() => setSelectedProvider(null)}>✕ Close</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>{selectedProvider.business_name}</div>
              <button
                onClick={(e) => toggleFavorite(e, selectedProvider.id)}
                aria-label={favoriteIds.has(selectedProvider.id) ? "Remove from favorites" : "Add to favorites"}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 0 }}
              >
                {favoriteIds.has(selectedProvider.id) ? "❤️" : "🤍"}
              </button>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              {providerRating(selectedProvider) ? (
                <span className="stars">★★★★★ {providerRating(selectedProvider)} <span style={{ color: "var(--muted)" }}>({selectedProvider.reviews.length})</span></span>
              ) : "No reviews yet"}
              {" · "}{selectedProvider.service_type} · {selectedProvider.district}
            </p>

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

            {profileTab === "services" && (
              bookingService ? (
                <>
                  <div onClick={backToServices} style={{ fontSize: 12, color: "var(--forest)", fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>← Back to services</div>
                  <div style={{ background: "var(--sand)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 13 }}>
                    <strong>{bookingService.name}</strong> — BZ${bookingService.price} · {bookingService.duration_min} min
                  </div>
                  <div className="input-group">
                    <label>Date</label>
                    <input type="date" min={new Date().toISOString().slice(0,10)} value={bookingForm.date} onChange={e => setBookingForm(f => ({ ...f, date: e.target.value, time: "" }))} />
                  </div>
                  <div className="input-group">
                    <label>Available times</label>
                    {loadingSlots ? (
                      <p style={{ fontSize: 12, color: "var(--muted)" }}>Checking live availability...</p>
                    ) : !providerHours.length ? (
                      <p style={{ fontSize: 12, color: "var(--muted)" }}>This provider hasn't set their working hours yet — try again later or send a note with your preferred time.</p>
                    ) : availableSlots.length === 0 ? (
                      <p style={{ fontSize: 12, color: "var(--clay)" }}>No open slots on this date. Please choose another day.</p>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8, maxHeight: 180, overflowY: "auto", paddingTop: 4 }}>
                        {availableSlots.map((t) => (
                          <button
                            type="button"
                            key={t}
                            onClick={() => setBookingForm(f => ({ ...f, time: t }))}
                            className="btn-sm"
                            style={{
                              padding: "6px 4px",
                              fontSize: 12,
                              border: bookingForm.time === t ? "2px solid var(--forest)" : "1px solid var(--border, #ddd)",
                              background: bookingForm.time === t ? "var(--forest)" : "#fff",
                              color: bookingForm.time === t ? "#fff" : "var(--dark-text)",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            {formatTimeLabel(t)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="input-group"><label>Notes (optional)</label><textarea placeholder="Anything the provider should know?" value={bookingForm.notes} onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))} style={{ minHeight: 60 }} /></div>

                  {selectedProvider.downpayment_required && (
                    <p style={{ fontSize: 12, color: "var(--clay)", marginBottom: 12 }}>This provider requires a {selectedProvider.downpayment_pct || 50}% deposit after they accept your booking.</p>
                  )}
                  {bookingError && <p style={{ fontSize: 12, color: "#B91C1C", marginBottom: 12 }}>{bookingError}</p>}

                  <button className="btn-sm forest" style={{ width: "100%", padding: "10px 0" }} disabled={submittingBooking} onClick={submitBooking}>
                    {submittingBooking ? "Sending request..." : "Request booking"}
                  </button>
                </>
              ) : (
                (selectedProvider.services || []).filter(s => s.is_active !== false).length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--muted)" }}>This provider hasn't listed any services yet.</p>
                ) : (
                  <div>
                    {(selectedProvider.services || []).filter(s => s.is_active !== false).map(s => (
                      <div key={s.id} className="service-row">
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--dark-text)" }}>{s.name}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>{s.duration_min} min · BZ${s.price}</div>
                        </div>
                        <button className="btn-sm forest" onClick={() => startBookingForService(s)}>Book</button>
                      </div>
                    ))}
                  </div>
                )
              )
            )}

            {profileTab === "portfolio" && (
              (selectedProvider.portfolio_urls && selectedProvider.portfolio_urls.length > 0) ? (
                <div className="portfolio-grid">
                  {selectedProvider.portfolio_urls.map((url) => (
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
              )
            )}

            {profileTab === "about" && (
              <div>
                {selectedProvider.bio && (
                  <p style={{ fontSize: 13, color: "var(--dark-text)", marginBottom: 12 }}>{selectedProvider.bio}</p>
                )}
                {(selectedProvider.whatsapp || (selectedProvider.latitude != null && selectedProvider.longitude != null)) && (
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, background: "var(--sand)", borderRadius: 8, padding: "10px 12px" }}>
                    {selectedProvider.whatsapp && (
                      <a href={`https://wa.me/${selectedProvider.whatsapp.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer" style={{ color: "var(--forest)", fontWeight: 600 }}>📞 {selectedProvider.whatsapp}</a>
                    )}
                    {selectedProvider.latitude != null && selectedProvider.longitude != null && (
                      <a href={directionsUrl(selectedProvider.latitude, selectedProvider.longitude)} target="_blank" rel="noreferrer" style={{ color: "var(--forest)", fontWeight: 600 }}>
                        📍 {selectedProvider.location_label || "Get directions"}
                      </a>
                    )}
                  </div>
                )}
                {!selectedProvider.bio && !selectedProvider.whatsapp && selectedProvider.latitude == null && (
                  <p style={{ fontSize: 13, color: "var(--muted)" }}>No additional details yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Provider work" />
        </div>
      )}
    </div>
  );
}

// ── PROVIDER PORTAL ─────────────────────────────────────────────
function ProviderPortal({ onNav, session, user, providerProfile, onSignIn, onSignOut }) {
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
  const [busyId, setBusyId] = useState(null);
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [savingHours, setSavingHours] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [profileForm, setProfileForm] = useState({ business_name: "", bio: "", district: "", whatsapp: "" });
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
      });
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
    }
  }, [providerProfile]);

  const act = async (id, status) => {
    setBusyId(id);
    await updateBookingStatus(id, status);
    if (status === "completed") {
      const finished = bookings.find((b) => b.id === id);
      if (finished?.customer_id) {
        await createNotification({
          user_id: finished.customer_id,
          title: "Booking complete",
          body: `Your ${finished.services?.name || "appointment"} with ${providerProfile?.business_name || "the provider"} is marked done. Leave a review to let others know how it went!`,
          type: "booking_completed",
          booking_id: id,
        });
      }
    }
    await loadBookings();
    setBusyId(null);
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
    const dateStr = new Date(booking.booking_date).toLocaleDateString();
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
    const dateStr = new Date(booking.booking_date).toLocaleDateString();
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
    await upsertProviderProfile({ id: providerProfile.id, user_id: providerProfile.user_id, ...profileForm });
    setSavingProfile(false);
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
    { id: "profile", icon: "👤", label: "Public profile" },
    { id: "modules", icon: "🧩", label: "Modules" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];
  const providerCategoryKey = providerProfile?.category_key || categoryForServiceType(providerProfile?.service_type);

  // Not signed in at all
  if (!session) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--forest)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ fontFamily: "Syne, sans-serif", fontSize: 28, fontWeight: 800, color: "var(--near-white)", marginBottom: 8 }}>
            vai<span style={{ color: "var(--lime)" }}>book</span> <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 16 }}>providers</span>
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
          <h2 style={{ color: "var(--near-white)", fontFamily: "Syne, sans-serif", marginBottom: 8 }}>No provider profile yet</h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, marginBottom: 24 }}>
            List your business to apply. Once we confirm your subscription payment, we'll activate your provider portal.
          </p>
          <button className="btn-lime" style={{ padding: "12px 24px" }} onClick={() => onNav("signup")}>List your business</button>
          <div style={{ marginTop: 20 }}>
            <a style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }} onClick={onSignOut}>Sign out</a>
          </div>
        </div>
      </div>
    );
  }

  const isSameDay = (isoDate, d) => {
    if (!isoDate) return false;
    const bd = new Date(isoDate);
    return bd.getFullYear() === d.getFullYear() && bd.getMonth() === d.getMonth() && bd.getDate() === d.getDate();
  };

  const now = new Date();
  const todaysBookings = bookings.filter(b => isSameDay(b.booking_date, now));
  const pendingBookings = bookings.filter(b => b.status === "pending");
  const confirmedBookings = bookings.filter(b => b.status === "confirmed");
  const completedBookings = bookings.filter(b => b.status === "completed" || b.status === "done");
  const thisMonthEarnings = completedBookings
    .filter(b => { const d = new Date(b.booking_date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
    .reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);
  const completionRate = bookings.length ? Math.round((completedBookings.length / bookings.length) * 100) : null;

  const FEE_RATE = 0.07;
  const netAmount = (b) => (Number(b.total_amount) || 0) * (1 - FEE_RATE);
  const totalNetEarned = completedBookings.reduce((sum, b) => sum + netAmount(b), 0);
  const pendingEarnings = bookings
    .filter(b => b.status === "confirmed" || b.status === "awaiting_payment")
    .reduce((sum, b) => sum + netAmount(b), 0);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisMonthNetEarnings = completedBookings
    .filter(b => { const d = new Date(b.booking_date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
    .reduce((sum, b) => sum + netAmount(b), 0);
  const lastMonthNetEarnings = completedBookings
    .filter(b => { const d = new Date(b.booking_date); return d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear(); })
    .reduce((sum, b) => sum + netAmount(b), 0);
  const monthOverMonthPct = lastMonthNetEarnings > 0
    ? Math.round(((thisMonthNetEarnings - lastMonthNetEarnings) / lastMonthNetEarnings) * 100)
    : null;
  const currentMonthLabel = now.toLocaleDateString("en-US", { month: "long" });

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

  const calYear = now.getFullYear();
  const calMonth = now.getMonth();
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstWeekday = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calendarDays = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const bookedDaysInMonth = new Set(
    bookings
      .filter(b => { const d = new Date(b.booking_date); return d.getFullYear() === calYear && d.getMonth() === calMonth; })
      .map(b => new Date(b.booking_date).getDate())
  );
  const selectedDayBookings = selectedDay
    ? bookings.filter(b => { const d = new Date(b.booking_date); return d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === selectedDay; })
    : [];

  return (
    <FeatureFlagsProvider providerId={providerId} categoryKey={providerCategoryKey}>
    <div className="portal-layout">
      <aside className="sidebar">
        <div style={{ padding: "0 16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 20 }}>
          <span className="nav-logo" style={{ fontFamily: "Syne, sans-serif", fontSize: 18, color: "var(--near-white)" }}>vai<span style={{ color: "var(--lime)" }}>book</span></span>
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
              <div className="metric"><div className="metric-label">This month earnings</div><div className="metric-value" style={{ color: "var(--forest-light)" }}>BZ${thisMonthEarnings.toFixed(0)}</div><div className="metric-sub">{completedBookings.length} completed</div></div>
              <div className="metric"><div className="metric-label">Bookings today</div><div className="metric-value">{todaysBookings.length}</div><div className="metric-sub">{confirmedBookings.length} confirmed, {pendingBookings.length} pending</div></div>
              <div className="metric"><div className="metric-label">Total bookings</div><div className="metric-value">{bookings.length}</div><div className="metric-sub">All time</div></div>
              <div className="metric"><div className="metric-label">Completion rate</div><div className="metric-value">{completionRate === null ? "—" : `${completionRate}%`}</div><div className="metric-sub">{completionRate === null ? "No bookings yet" : "Of all bookings"}</div></div>
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
                      <div className="meta">{b.users?.full_name || "Customer"} · {new Date(b.booking_date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                    </div>
                    <div>
                      <span className="booking-amount">BZ${b.total_amount ?? b.services?.price ?? "—"}</span>
                      <span className={`status-pill ${bookingStatusClass(b.status)}`}>{b.status}</span>
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
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{new Date(b.booking_date).toLocaleDateString()}</div>
                    </div>
                    <span className={`status-pill ${bookingStatusClass(b.status)}`}>{b.status}</span>
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
          </>
        )}

        {tab === "bookings" && (
          <>
            <div className="portal-header"><h2>Bookings</h2><p>Manage your upcoming and past appointments.</p></div>
            <div className="card">
              <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>All bookings</span>
                <button className="btn-sm forest" onClick={loadBookings} disabled={loadingBookings}>{loadingBookings ? "Refreshing..." : "Refresh"}</button>
              </div>
              {bookings.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>{loadingBookings ? "Loading..." : "No bookings yet."}</p>
              )}
              {bookings.map((b) => (
                <div key={b.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                  <div className="booking-item" style={{ padding: 0, border: "none" }}>
                    <div className={`booking-dot ${bookingStatusClass(b.status)}`}></div>
                    <div className="booking-info">
                      <div className="title">{b.services?.name || "Service"}</div>
                      <div className="meta">
                        {b.users?.full_name || "Customer"} · {new Date(b.booking_date).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
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
                    </div>
                  </div>

                  {b.notes && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Customer note: {b.notes}</p>}

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
                      {b.receipt_url && <a href={b.receipt_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>View receipt</a>}
                      <div style={{ marginTop: 8 }}>
                        <button className="btn-sm lime" disabled={confirmingPaymentId === b.id} onClick={() => confirmPayment(b)}>
                          {confirmingPaymentId === b.id ? "Confirming..." : "Confirm payment received"}
                        </button>
                      </div>
                    </div>
                  )}

                  {b.status === "completed" && (
                    <FeatureGate flag="soap_charting">
                      <VisitNotesButton booking={b} />
                    </FeatureGate>
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
                <div className="card-title">{monthLabel}</div>
                <div className="cal-grid">
                  {DAYS.map(d => <div key={d} className="cal-day-label">{d}</div>)}
                  {calendarDays.map((d, i) => (
                    <div
                      key={i}
                      className={`cal-day ${d === null ? "empty" : ""} ${d === now.getDate() ? "today" : ""} ${d && bookedDaysInMonth.has(d) ? "has-booking" : ""}`}
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
                        {new Date(b.booking_date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {b.services?.name || "Service"} · {b.users?.full_name || "Customer"}
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
              <div className="metric"><div className="metric-label">Total earned</div><div className="metric-value" style={{ color: "var(--forest-light)" }}>BZ${totalNetEarned.toFixed(2)}</div><div className="metric-sub">All time, after 7% fee</div></div>
              <div className="metric"><div className="metric-label">Upcoming</div><div className="metric-value">BZ${pendingEarnings.toFixed(2)}</div><div className="metric-sub">Confirmed, not yet completed</div></div>
              <div className="metric"><div className="metric-label">This month ({currentMonthLabel})</div><div className="metric-value">BZ${thisMonthNetEarnings.toFixed(2)}</div><div className="metric-sub">{monthOverMonthPct === null ? "No data for last month" : `${monthOverMonthPct >= 0 ? "↑" : "↓"} ${Math.abs(monthOverMonthPct)}% vs last month`}</div></div>
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

        {tab === "profile" && (
          <>
            <div className="portal-header"><h2>Public profile</h2><p>This is what customers see when they find you.</p></div>
            <div className="card" style={{ maxWidth: 560 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 72, height: 72, background: "var(--forest)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>✂️</div>
                <div>
                  <div style={{ fontFamily: "Syne, sans-serif", fontSize: 20, fontWeight: 700 }}>{providerProfile.business_name}</div>
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
              <button className="btn-sm forest" onClick={saveProfile} disabled={savingProfile}>{savingProfile ? "Saving..." : "Save profile"}</button>
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
              {[["New booking request", true], ["Booking confirmed", true], ["Payment received", true], ["Review posted", false]].map(([label, on], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 14 }}>{label}</span>
                  <div className={`toggle ${on ? "on" : ""}`} onClick={() => {}}></div>
                </div>
              ))}
              <div className="card-title" style={{ marginTop: 24 }}>Platform fee</div>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>VaiBook charges a 7% transaction fee on completed bookings. This is automatically deducted before your payout. Your Pro subscription reduces this to 5%.</p>
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
    font-family: 'Syne', sans-serif;
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
  .plan-price { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 800; color: var(--forest); margin-bottom: 4px; }
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
    font-family: 'Inter', sans-serif;
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
  .signup-success h2 { font-family: 'Syne', sans-serif; font-size: 26px; color: var(--forest); margin-bottom: 10px; }
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

const PLANS = [
  { id: "starter", name: "Starter", price: "Free", desc: "Up to 10 bookings/month", monthly: 0 },
  { id: "pro", name: "Pro", price: "BZ$50/mo", desc: "Unlimited bookings + calendar", monthly: 50 },
  { id: "business", name: "Business", price: "BZ$120/mo", desc: "Multi-staff + analytics", monthly: 120 },
];

const DISTRICTS = ["Belize City", "Cayo", "Corozal", "Orange Walk", "Stann Creek", "Toledo"];
const SERVICE_TYPES = ["Barber", "Nail Tech", "Home Cleaning", "Car Wash", "Pet Grooming", "Handyman", "Beauty Salon", "Massage", "Med Spa / Clinic", "Tattoo & Piercing Studio", "Photography", "Other"];

function ProviderSignup({ onNav }) {
  const [plan, setPlan] = useState("pro");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(false);
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
    setSubmitError(false);

    const selectedPlan = PLANS.find(p => p.id === plan);

    // Save the application to Supabase so it shows up in the admin portal
    const saved = await submitProviderApplication({
      business_name: form.businessName,
      owner_name: form.ownerName,
      email: form.email,
      phone: form.phone,
      service_type: form.serviceType,
      district: form.district,
      description: form.description || null,
      plan: selectedPlan.id,
      status: "pending",
    });

    if (!saved) {
      setLoading(false);
      setSubmitError(true);
      return;
    }

    const subject = encodeURIComponent(`New VaiBook Provider Signup — ${form.businessName} (${selectedPlan.name})`);
    const body = encodeURIComponent(
`New provider signup on VaiBook!

Business: ${form.businessName}
Owner: ${form.ownerName}
Email: ${form.email}
Phone: ${form.phone}
Service: ${form.serviceType}
District: ${form.district}
Plan: ${selectedPlan.name} (${selectedPlan.price})
Description: ${form.description || "N/A"}

---
Activate this provider in your admin dashboard.`
    );

    // Open mailto so you get notified immediately
    window.open(`mailto:hello@vaibook.bz?subject=${subject}&body=${body}`);

    // Simulate brief processing
    await new Promise(r => setTimeout(r, 800));
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
          {PLANS.map(p => (
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
            Something went wrong saving your application. Please try again, or WhatsApp us directly if it keeps failing.
          </p>
        )}
        <p style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
          We review every application within 24 hours. No credit card required to apply.
        </p>
      </div>
    </div>
  );
}

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

  useEffect(() => {
    if (isAdmin) { loadApps(); loadProviders(); }
  }, [isAdmin]);

  const act = async (id, status) => {
    setBusyId(id);
    await updateApplicationStatus(id, status);
    await loadApps();
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
    }
  };

  const changeProviderPlan = async (providerId, plan) => {
    setSavingProviderId(providerId);
    const updated = await adminUpdateProvider(providerId, { plan });
    setSavingProviderId(null);
    if (updated) setProviders((prev) => prev.map((p) => (p.id === providerId ? updated : p)));
  };

  const toggleProviderActive = async (provider) => {
    setSavingProviderId(provider.id);
    const updated = await adminUpdateProvider(provider.id, { is_active: !provider.is_active });
    setSavingProviderId(null);
    if (updated) setProviders((prev) => prev.map((p) => (p.id === provider.id ? updated : p)));
  };

  const confirmDeleteProvider = async (providerId) => {
    setDeletingId(providerId);
    const ok = await adminDeleteProvider(providerId);
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (ok) setProviders((prev) => prev.filter((p) => p.id !== providerId));
  };

  // Not signed in at all
  if (!session) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--forest)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ fontFamily: "Syne, sans-serif", fontSize: 28, fontWeight: 800, color: "var(--near-white)", marginBottom: 8 }}>
            vai<span style={{ color: "var(--lime)" }}>book</span> <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 16 }}>admin</span>
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
          <h2 style={{ color: "var(--near-white)", fontFamily: "Syne, sans-serif", marginBottom: 8 }}>Not authorized</h2>
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
          <span className="nav-logo" style={{ fontFamily: "Syne, sans-serif", fontSize: 18, color: "var(--near-white)" }}>vai<span style={{ color: "var(--lime)" }}>book</span></span>
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
        {tab !== "providers" && (
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
              <div className="metric"><div className="metric-label">Active</div><div className="metric-value" style={{ color: "var(--lime)" }}>{providers.filter(p => p.is_active).length}</div><div className="metric-sub">Live on VaiBook</div></div>
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
      </main>
    </div>
  );
}

// ── APP ROOT ────────────────────────────────────────────────────
// ── AUTH-AWARE APP ROOT ──────────────────────────────────────────
export default function App() {
  const [view, setView] = useState(() => {
    const h = window.location.hash.replace("#", "");
    return h === "admin" || h === "customer" || h === "provider" ? h : "home";
  });

  // Keep view in sync if the URL hash changes without a full page reload
  // (e.g. typing/pasting a #admin or #customer link into an already-open tab).
  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash.replace("#", "");
      if (h === "admin" || h === "customer" || h === "provider") setView(h);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [providerProfile, setProviderProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // If this account doesn't have a provider profile yet, check whether an
  // admin already activated an application submitted with this email — if
  // so, create the provider profile now so the portal has something to show.
  const loadProviderProfile = async (authUser) => {
    let p = await getProviderProfile(authUser.id);
    if (!p) {
      const app = await getActiveApplicationByEmail(authUser.email);
      if (app) {
        p = await upsertProviderProfile({
          user_id: authUser.id,
          business_name: app.business_name,
          service_type: app.service_type,
          category_key: categoryForServiceType(app.service_type),
          district: app.district,
          bio: app.description,
          whatsapp: app.phone || null,
          is_active: true,
        });
      }
    }
    return p;
  };

  const applyPendingView = () => {
    try {
      const pending = localStorage.getItem("vaibook_pending_view");
      if (pending === "admin" || pending === "customer" || pending === "provider") {
        setView(pending);
        localStorage.removeItem("vaibook_pending_view");
      }
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
        applyPendingView();
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        const u = await getOrCreateUser(session.user);
        setUser(u);
        const p = await loadProviderProfile(session.user);
        setProviderProfile(p);
        applyPendingView();
      } else {
        setUser(null);
        setProviderProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
            <div style={{ fontFamily: "Syne, sans-serif", fontSize: 32, fontWeight: 800, color: "var(--near-white)", marginBottom: 12 }}>
              vai<span style={{ color: "var(--lime)" }}>book</span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading...</div>
          </div>
        </div>
      </>
    );
  }

  const authProps = { session, user, providerProfile, onSignIn: signInWithGoogle, onSignOut: handleSignOut, onUserUpdate: setUser };

  return (
    <>
      <style>{css}</style>
      <InstallAppGuide />
      {view !== "auth" && <Nav onNav={setView} current={view} {...authProps} />}
      {view === "home" && <LandingPage onNav={setView} {...authProps} />}
      {view === "customer" && <CustomerPortal onNav={setView} {...authProps} />}
      {view === "provider" && <ProviderPortal onNav={setView} {...authProps} />}
      {view === "signup" && <ProviderSignup onNav={setView} {...authProps} />}
      {view === "admin" && <AdminPortal onNav={setView} {...authProps} />}
      {view === "auth" && <AuthChoice onNav={setView} {...authProps} />}
    </>
  );
}
