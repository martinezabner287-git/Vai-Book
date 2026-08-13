
import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { supabase, signInWithGoogle, signOut, getOrCreateUser, getProviderProfile, checkIsAdmin, getProviderApplications, updateApplicationStatus, submitProviderApplication, getProviderBookings, updateBookingStatus, updateBooking, upsertProviderProfile, getWorkingHours, upsertWorkingHours, getActiveApplicationByEmail, uploadProviderPhoto, deleteProviderPhoto, createService, deleteService, getActiveProviders, createBooking, getCustomerBookings, uploadReceipt, submitReview, sendBookingEmail } from "./supabase";

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

// ── DESIGN TOKENS ──────────────────────────────────────────────
// Palette: deep forest green (#0D3D2E) + warm sand (#F5EFE0) + 
// electric lime accent (#C6F135) + soft clay (#D4795A) + near-white (#FAFAF7)
// Type: "Syne" display (bold, geometric) + "Inter" body
// Signature: the lime accent used sparingly — only on the ONE thing that matters per screen

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&display=swap');

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
    padding: 16px 48px; background: var(--forest); position: sticky; top: 0; z-index: 100;
  }
  .nav-logo { font-family: 'Syne', sans-serif; font-size: 22px; color: var(--near-white); letter-spacing: -0.5px; }
  .nav-logo span { color: var(--lime); }
  .nav-links { display: flex; gap: 32px; }
  .nav-links a { color: rgba(255,255,255,0.7); font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; transition: color .2s; }
  .nav-links a:hover { color: var(--near-white); }
  .nav-cta { display: flex; gap: 10px; }
  .btn-ghost { background: transparent; border: 1px solid rgba(255,255,255,0.3); color: var(--near-white); padding: 8px 20px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 500; cursor: pointer; transition: all .2s; }
  .btn-ghost:hover { border-color: var(--lime); color: var(--lime); }
  .btn-lime { background: var(--lime); border: none; color: var(--forest); padding: 8px 20px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity .2s; }
  .btn-lime:hover { opacity: 0.85; }

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
  .search-hero h1 { font-family: 'Syne', sans-serif; font-weight: 800; font-size: clamp(34px, 5vw, 58px); color: var(--forest); line-height: 1.08; margin-bottom: 16px; }
  .search-sub { font-size: 17px; color: var(--muted); max-width: 560px; margin: 0 auto 40px; line-height: 1.5; }
  .search-bar-pill { max-width: 760px; margin: 0 auto; background: white; border-radius: 100px; box-shadow: 0 12px 40px rgba(13,61,46,0.14); display: flex; align-items: center; padding: 8px; gap: 4px; }
  .search-bar-pill .field { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 10px 18px; }
  .search-bar-pill .field input, .search-bar-pill .field select { border: none; outline: none; background: transparent; font-size: 14px; width: 100%; color: var(--dark-text); font-family: 'Inter', sans-serif; }
  .search-bar-pill .sep { width: 1px; height: 28px; background: var(--border); flex-shrink: 0; }
  .search-submit { background: var(--forest); color: var(--near-white); border: none; border-radius: 100px; padding: 14px 30px; font-weight: 600; font-size: 15px; cursor: pointer; white-space: nowrap; transition: opacity .2s; font-family: 'Inter', sans-serif; }
  .search-submit:hover { opacity: .87; }
  .search-hero-tagline { margin-top: 26px; font-size: 13px; color: var(--muted); }
  .search-hero-tagline a { color: var(--forest); font-weight: 600; cursor: pointer; text-decoration: underline; }
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
  .search-bar { background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 20px; display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
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

  .tab-row { display: flex; gap: 4px; margin-bottom: 24px; background: white; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px; }
  .tab { flex: 1; text-align: center; padding: 8px; font-size: 13px; font-weight: 500; color: var(--muted); cursor: pointer; border-radius: 6px; transition: all .2s; }
  .tab.active { background: var(--forest); color: var(--near-white); }

  .input-group { margin-bottom: 14px; }
  .input-group label { font-size: 12px; font-weight: 600; color: var(--dark-text); display: block; margin-bottom: 6px; letter-spacing: .02em; }
  .input-group input, .input-group select, .input-group textarea { width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; font-size: 14px; font-family: 'Inter', sans-serif; color: var(--dark-text); background: white; outline: none; transition: border-color .2s; }
  .input-group input:focus, .input-group select:focus, .input-group textarea:focus { border-color: var(--forest); }
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
    .nav-links { display: none; }
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
  }
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


const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DEFAULT_HOURS = DAY_NAMES.map((day, i) => ({
  day, day_of_week: i, is_open: i !== 0, start_time: i === 6 ? "09:00" : "08:00", end_time: i === 6 ? "15:00" : "18:00",
}));

function bookingStatusClass(status) {
  if (status === "confirmed") return "confirmed";
  if (status === "pending") return "pending";
  if (status === "awaiting_payment") return "awaiting";
  if (status === "rejected") return "rejected";
  return "done";
}

function statusLabel(status) {
  if (status === "awaiting_payment") return "awaiting payment";
  return status;
}

// ── COMPONENTS ──────────────────────────────────────────────────

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
    window.location.hash = "customer";
    onSignIn();
  }
}

function enterProviderPortal(onNav, session, onSignIn) {
  if (session) {
    onNav("provider");
  } else {
    window.location.hash = "provider";
    onSignIn();
  }
}

function Nav({ onNav, current, session, user, onSignIn }) {
  return (
    <nav className="nav">
      <span className="nav-logo" style={{ cursor: "pointer" }} onClick={() => onNav("home")}>vai<span>book</span></span>
      <div className="nav-links">
        <a onClick={() => onNav("home")}>Home</a>
        <a onClick={() => scrollToSection("services", onNav, current)}>Services</a>
        <a onClick={() => scrollToSection("how-it-works", onNav, current)}>How it works</a>
        <a onClick={() => scrollToSection("pricing", onNav, current)}>Pricing</a>
      </div>
      {(current === "home" || (current === "customer" && !session)) && (
        <div className="nav-cta">
          <button className="btn-ghost" onClick={() => enterCustomerPortal(onNav, session, onSignIn)}>
            {session ? (user?.full_name?.split(" ")[0] || "My account") : "Customer login"}
          </button>
          {current === "home" && (
            <>
              <button className="btn-ghost" onClick={() => enterProviderPortal(onNav, session, onSignIn)}>
                Provider login
              </button>
              <button className="btn-lime" onClick={() => onNav("signup")}>List your business</button>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

function LandingPage({ onNav, session, onSignIn }) {
  const [heroQuery, setHeroQuery] = useState("");
  const [heroDistrict, setHeroDistrict] = useState("");

  const submitHeroSearch = () => {
    try {
      localStorage.setItem("vaibook_pending_search", JSON.stringify({ query: heroQuery.trim(), district: heroDistrict || "All" }));
    } catch (e) { /* ignore storage errors */ }
    enterCustomerPortal(onNav, session, onSignIn);
  };

  return (
    <>
      {/* HERO */}
      <section className="search-hero">
        <h1>Book local services,<br />the easy way</h1>
        <p className="search-sub">Find trusted barbers, nail techs, cleaners, and more near you in Belize.</p>
        <div className="search-bar-pill">
          <div className="field">
            <span>🔍</span>
            <input
              placeholder="What service do you need?"
              value={heroQuery}
              onChange={e => setHeroQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitHeroSearch(); }}
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
          <button className="search-submit" onClick={submitHeroSearch}>Search</button>
        </div>
        <div className="search-hero-tagline">
          Own a business? <a onClick={() => onNav("signup")}>List it on VaiBook, free to start</a>
        </div>
      </section>

      {/* STATS */}
      <div className="stats-bar">
        <div className="stat"><div className="stat-num">2<span>,400</span>+</div><div className="stat-label">Bookings completed</div></div>
        <div className="stat"><div className="stat-num">180<span>+</span></div><div className="stat-label">Verified providers</div></div>
        <div className="stat"><div className="stat-num">6<span> districts</span></div><div className="stat-label">Across Belize</div></div>
        <div className="stat"><div className="stat-num">4.9<span>★</span></div><div className="stat-label">Average rating</div></div>
      </div>

      {/* HOW IT WORKS */}
      <section className="section" id="how-it-works">
        <div className="section-eyebrow">Simple process</div>
        <h2 className="section-title">From search to booked in under 2 minutes</h2>
        <p className="section-sub">No more messaging back and forth just to get a haircut. Pick your time, confirm, show up.</p>
        <div className="steps-grid">
          {[
            { n: "1", icon: "🔍", title: "Find your provider", desc: "Search by service type and district. See real ratings from real customers." },
            { n: "2", icon: "📅", title: "Pick your slot", desc: "View live availability. No more 'are you free Friday?' messages." },
            { n: "3", icon: "💳", title: "Pay securely", desc: "Payment held in escrow until your service is complete. You're protected." },
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
              <li>Escrow payments</li>
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
function CustomerPortal({ onNav, user, session, onSignOut }) {
  const [tab, setTab] = useState("home");
  const displayName = user?.full_name || session?.user?.email || "there";
  const firstName = displayName.split(" ")[0].split("@")[0];
  const initial = displayName[0]?.toUpperCase() || "?";
  const [bookingTab, setBookingTab] = useState("upcoming");

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

  const [uploadingReceiptId, setUploadingReceiptId] = useState(null);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [submittingReview, setSubmittingReview] = useState(false);

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

  const sideItems = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "browse", icon: "🔍", label: "Find services" },
    { id: "bookings", icon: "📅", label: "My bookings" },
    { id: "payments", icon: "💳", label: "Payments" },
    { id: "reviews", icon: "⭐", label: "My reviews" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  const openBooking = (provider) => {
    const firstService = (provider.services || []).find((s) => s.is_active !== false);
    setBookingForm({
      service_id: firstService?.id || "",
      date: new Date().toISOString().slice(0, 10),
      time: "10:00",
      notes: "",
    });
    setBookingError("");
    setSelectedProvider(provider);
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

    const created = await createBooking({
      order_number,
      customer_id: user.id,
      provider_id: selectedProvider.id,
      service_id: service.id,
      booking_date: bookingForm.date,
      booking_time: bookingForm.time,
      status: "pending",
      total_amount: total,
      downpayment_amount: downpayment,
      payment_status: "unpaid",
      notes: bookingForm.notes ? bookingForm.notes.trim() : null,
    });

    setSubmittingBooking(false);

    if (created) {
      setSelectedProvider(null);
      await loadBookings();
      setTab("bookings");
      setBookingTab("upcoming");
    } else {
      setBookingError("Something went wrong sending your request. Please try again.");
    }
  };

  const handleUploadReceipt = async (bookingId, file) => {
    if (!file) return;
    setUploadingReceiptId(bookingId);
    await uploadReceipt(bookingId, file);
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
    await loadBookings();
    setReviewingId(null);
    setSubmittingReview(false);
  };

  const upcomingBookings = bookings.filter((b) => ["pending", "awaiting_payment", "confirmed"].includes(b.status));
  const completedBookings = bookings.filter((b) => b.status === "completed");
  const rejectedBookings = bookings.filter((b) => b.status === "rejected");
  const totalSpent = completedBookings.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);
  const reviewedBookings = bookings.filter((b) => b.reviews && b.reviews.length > 0);

  const filteredProviders = providers.filter((p) => {
    if (!providerSearch.trim()) return true;
    const q = providerSearch.trim().toLowerCase();
    return (p.business_name || "").toLowerCase().includes(q) || (p.service_type || "").toLowerCase().includes(q);
  });

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
            <div className="search-bar">
              <span className="search-icon">🔍</span>
              <input placeholder="Search barbers, nail techs, cleaners..." value={providerSearch} onChange={e => setProviderSearch(e.target.value)} />
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
                  <div className="provider-card" key={p.id} style={{ cursor: "pointer" }} onClick={() => openBooking(p)}>
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

        {tab === "bookings" && (
          <>
            <div className="portal-header"><h2>My bookings</h2><p>Track all your appointments in one place.</p></div>
            <div className="tab-row">
              {["Upcoming", "Completed", "Rejected"].map((t, i) => (
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

                    {b.status === "awaiting_payment" && b.payment_status === "unpaid" && (
                      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                        <label className="btn-sm lime" style={{ cursor: "pointer" }}>
                          {uploadingReceiptId === b.id ? "Uploading..." : `Upload deposit receipt (BZ$${b.downpayment_amount ?? "—"})`}
                          <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} disabled={uploadingReceiptId === b.id} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handleUploadReceipt(b.id, f); }} />
                        </label>
                      </div>
                    )}
                    {b.status === "awaiting_payment" && b.payment_status === "receipt_uploaded" && (
                      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Receipt submitted — waiting for the provider to confirm payment.</p>
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
                  <div className="card-title">Account settings</div>
                  <div className="input-group"><label>Full name</label><input defaultValue={user?.full_name || ""} disabled /></div>
                  <div className="input-group"><label>Email</label><input defaultValue={user?.email || session?.user?.email || ""} disabled /></div>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>Your name and email are managed through your Google sign-in.</p>
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
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <span className="modal-close" onClick={() => setSelectedProvider(null)}>✕ Close</span>
            <div className="card-title" style={{ marginBottom: 4 }}>Book {selectedProvider.business_name}</div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>{selectedProvider.service_type} · {selectedProvider.district}</p>

            {selectedProvider.portfolio_urls && selectedProvider.portfolio_urls.length > 0 && (
              <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 12 }}>
                {selectedProvider.portfolio_urls.map((url) => (
                  <img key={url} src={url} alt="Provider work" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "1px solid var(--border)" }} />
                ))}
              </div>
            )}

            {selectedProvider.bio && (
              <p style={{ fontSize: 13, color: "var(--dark-text)", marginBottom: 12 }}>{selectedProvider.bio}</p>
            )}

            {(selectedProvider.whatsapp || (selectedProvider.latitude != null && selectedProvider.longitude != null)) && (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, marginBottom: 16, background: "var(--sand)", borderRadius: 8, padding: "10px 12px" }}>
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

            {(selectedProvider.services || []).filter(s => s.is_active !== false).length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>This provider hasn't listed any services yet.</p>
            ) : (
              <>
                <div className="input-group">
                  <label>Service</label>
                  <select value={bookingForm.service_id} onChange={e => setBookingForm(f => ({ ...f, service_id: e.target.value }))}>
                    {(selectedProvider.services || []).filter(s => s.is_active !== false).map(s => (
                      <option key={s.id} value={s.id}>{s.name} — BZ${s.price} ({s.duration_min} min)</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="input-group"><label>Date</label><input type="date" min={new Date().toISOString().slice(0,10)} value={bookingForm.date} onChange={e => setBookingForm(f => ({ ...f, date: e.target.value }))} /></div>
                  <div className="input-group"><label>Time</label><input type="time" value={bookingForm.time} onChange={e => setBookingForm(f => ({ ...f, time: e.target.value }))} /></div>
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PROVIDER PORTAL ─────────────────────────────────────────────
function ProviderPortal({ onNav, session, user, providerProfile, onSignIn, onSignOut }) {
  const [tab, setTab] = useState("dashboard");
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

  const providerId = providerProfile?.id;

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
    const serviceName = booking.services?.name || "your service";
    const dateStr = new Date(booking.booking_date).toLocaleDateString();

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
          : `<p>Your booking for ${serviceName} on ${dateStr} is confirmed!</p>` +
            (msg ? `<p>Message from the provider: ${msg}</p>` : "");
        await sendBookingEmail({ to: custEmail, subject, html });
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
    }

    await loadBookings();
    setBusyId(null);
    cancelResponse();
  };

  const confirmPayment = async (booking) => {
    setConfirmingPaymentId(booking.id);
    await updateBooking(booking.id, { status: "confirmed", payment_status: "paid" });
    const custEmail = booking.users?.email;
    if (custEmail) {
      const serviceName = booking.services?.name || "your service";
      const dateStr = new Date(booking.booking_date).toLocaleDateString();
      const balance = (Number(booking.total_amount || 0) - Number(booking.downpayment_amount || 0)).toFixed(2);
      await sendBookingEmail({
        to: custEmail,
        subject: `Payment confirmed — ${providerProfile.business_name}`,
        html: `<p>Your deposit payment has been confirmed for ${serviceName} on ${dateStr}.</p>` +
          `<p><strong>Invoice</strong><br/>Total: BZ$${booking.total_amount ?? "—"}<br/>Deposit paid: BZ$${booking.downpayment_amount ?? "—"}<br/>Balance due at appointment: BZ$${balance}</p>` +
          `<p>See you soon!</p>`,
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
    { id: "calendar", icon: "🗓️", label: "Availability" },
    { id: "services", icon: "✂️", label: "My services" },
    { id: "earnings", icon: "💰", label: "Earnings" },
    { id: "profile", icon: "👤", label: "Public profile" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

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
                      <div className="meta">{b.users?.full_name || "Customer"} · {new Date(b.booking_date).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
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
            <div className="portal-header"><h2>Earnings</h2><p>Track your income and request payouts.</p></div>
            <div className="metric-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div className="metric"><div className="metric-label">Available to withdraw</div><div className="metric-value" style={{ color: "var(--forest-light)" }}>BZ$980</div><div className="metric-sub">Cleared funds</div></div>
              <div className="metric"><div className="metric-label">Pending (in escrow)</div><div className="metric-value">BZ$260</div><div className="metric-sub">Releases after service</div></div>
              <div className="metric"><div className="metric-label">Total earned (June)</div><div className="metric-value">BZ$1,240</div><div className="metric-sub">↑ 18% vs May</div></div>
            </div>
            <div className="grid-2">
              <div className="card">
                <div className="card-title">Request payout</div>
                <div className="input-group"><label>Amount (BZ$)</label><input type="number" placeholder="0.00" /></div>
                <div className="input-group"><label>Bank / method</label><select><option>Atlantic Bank — Chequing</option><option>Belize Bank</option><option>Vai Wallet</option></select></div>
                <button className="btn-sm forest">Request withdrawal</button>
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>Payouts process within 1–2 business days.</p>
              </div>
              <div className="card">
                <div className="card-title">Recent payouts</div>
                {[["Jun 1", "BZ$600", "Atlantic Bank"], ["May 15", "BZ$450", "Atlantic Bank"], ["May 1", "BZ$520", "Atlantic Bank"]].map(([d, a, b], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <div><div style={{ fontSize: 14, fontWeight: 600 }}>{a}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{d} · {b}</div></div>
                    <span className="status-pill confirmed">paid</span>
                  </div>
                ))}
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
const SERVICE_TYPES = ["Barber", "Nail Tech", "Home Cleaning", "Car Wash", "Pet Grooming", "Handyman", "Beauty Salon", "Massage", "Photography", "Other"];

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
          <p>Join 180+ providers already getting booked across Belize. Takes less than 3 minutes.</p>
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

  useEffect(() => {
    if (isAdmin) loadApps();
  }, [isAdmin]);

  const act = async (id, status) => {
    setBusyId(id);
    await updateApplicationStatus(id, status);
    await loadApps();
    setBusyId(null);
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
        <div className="sidebar-avatar">
          <div className="avatar">{(user?.full_name || session.user.email)[0].toUpperCase()}</div>
          <div className="avatar-info">
            <div className="name">{user?.full_name || session.user.email}</div>
            <div className="role" style={{ cursor: "pointer" }} onClick={onSignOut}>Sign out</div>
          </div>
        </div>
      </aside>

      <main className="portal-content">
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
          district: app.district,
          bio: app.description,
          whatsapp: app.phone || null,
          is_active: true,
        });
      }
    }
    return p;
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

  const authProps = { session, user, providerProfile, onSignIn: signInWithGoogle, onSignOut: handleSignOut };

  return (
    <>
      <style>{css}</style>
      <Nav onNav={setView} current={view} {...authProps} />
      {view === "home" && <LandingPage onNav={setView} {...authProps} />}
      {view === "customer" && <CustomerPortal onNav={setView} {...authProps} />}
      {view === "provider" && <ProviderPortal onNav={setView} {...authProps} />}
      {view === "signup" && <ProviderSignup onNav={setView} {...authProps} />}
      {view === "admin" && <AdminPortal onNav={setView} {...authProps} />}
    </>
  );
}
