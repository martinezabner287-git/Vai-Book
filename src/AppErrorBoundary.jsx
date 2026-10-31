import React from "react";
import { supabase } from "./supabase";
import i18n from "./i18n";

// Crash screen (2026-10-30). Before this, any error while drawing a screen
// left people looking at a blank white page with no way back. Now they get
// a friendly message and a Reload button, and the error is logged to the
// client_errors table so we find out about it without anyone reporting it.
//
// Also handles the classic "a new version was deployed while this tab was
// open, and a lazy-loaded piece of the old version is gone" error by quietly
// reloading once instead of showing the crash screen.

const RELOAD_KEY = "vaibook_chunk_reload_at";

function isChunkError(error) {
  const msg = String((error && (error.message || error)) || "");
  return /Loading (CSS )?chunk [\w-]+ failed|ChunkLoadError|Failed to fetch dynamically imported module/i.test(msg);
}

let lastReported = { msg: "", at: 0 };
export function reportClientError(error, stack) {
  try {
    const msg = String((error && (error.message || error)) || "");
    // Browser noise, not crashes: an interrupted page transition.
    if (/view transition|AbortError|InvalidStateError: .*transition/i.test(msg) || (error && /AbortError|InvalidStateError/.test(error.name || "") && /transition/i.test(msg + String(error.stack || "")))) return;
    if (msg === lastReported.msg && Date.now() - lastReported.at < 5000) return;
    lastReported = { msg, at: Date.now() };
    supabase
      .from("client_errors")
      .insert({
        message: String((error && (error.message || error)) || "Unknown error").slice(0, 1000),
        stack: String(stack || (error && error.stack) || "").slice(0, 4000),
        url: String(window.location.href || "").slice(0, 500),
        user_agent: String(navigator.userAgent || "").slice(0, 300),
      })
      .then(() => {}, () => {});
  } catch (e) {
    /* logging must never cause a second crash */
  }
}

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    if (isChunkError(error)) {
      let last = 0;
      try { last = Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch (e) { /* ignore */ }
      if (Date.now() - last > 60000) {
        try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch (e) { /* ignore */ }
        window.location.reload();
        return;
      }
    }
    reportClientError(error, info && info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const es = String(i18n.language || "").toLowerCase().startsWith("es");
    return (
      <div role="alert" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#F7F6F2", fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif", color: "#16181D" }}>
        <div style={{ maxWidth: 380, width: "100%", textAlign: "center", background: "#FFFFFF", borderRadius: 20, padding: "32px 24px", boxShadow: "0 8px 30px rgba(22,24,29,0.08)" }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
            <span style={{ fontWeight: 500 }}>vai</span><span style={{ color: "#4C3DC4" }}>book</span>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: "16px 0 8px" }}>
            {es ? "Algo salió mal" : "Something went wrong"}
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: "#5B5E6B", margin: "0 0 22px" }}>
            {es
              ? "No es tu culpa. Tus reservas y datos están seguros. Vuelve a cargar para seguir."
              : "It's not you. Your bookings and data are safe — reload to keep going."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ width: "100%", padding: "14px 18px", borderRadius: 999, border: "none", background: "#4C3DC4", color: "#FFFFFF", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            {es ? "Recargar VaiBook" : "Reload VaiBook"}
          </button>
          <button
            type="button"
            onClick={() => { window.location.href = window.location.origin + "/"; }}
            style={{ width: "100%", marginTop: 10, padding: "12px 18px", borderRadius: 999, border: "1px solid #E4E2EC", background: "transparent", color: "#16181D", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            {es ? "Ir al inicio" : "Go to the home page"}
          </button>
        </div>
      </div>
    );
  }
}
