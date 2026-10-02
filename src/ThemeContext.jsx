import { createContext, useContext, useEffect } from "react";

// ── GLOBAL THEME CONTEXT ──────────────────────────────────────────────
//
// Dark mode has been removed (explicit instruction: "let us remove dark
// mode. let us just keep it in light mode") — this now just pins
// `data-theme="light"` on <html> permanently, so the existing
// `:root[data-theme="light"]` CSS block (see App.jsx's css template's
// THEME TOKENS section) is the only one that ever applies. No toggle, no
// localStorage preference, no system `prefers-color-scheme` detection —
// every visitor always sees the light theme.
//
// The `:root[data-theme="dark"]` blocks still in App.jsx's CSS (the
// THEME TOKENS default, plus the .cx-account-page / .provider-shell /
// .portal-content dark-mode rules) are now dead/unreachable — left in
// place rather than hunting down and deleting every one across an
// 11,000+ line stylesheet, since an attribute that's never set to "dark"
// means they simply never match. Harmless, just inert.
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "light" }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Throws if used outside a <ThemeProvider> rather than silently falling
// back — a null context here means a real wiring mistake, not a
// legitimate standalone-usage case.
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used inside a <ThemeProvider>");
  return ctx;
}
