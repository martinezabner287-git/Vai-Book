import { createContext, useContext, useEffect, useState } from "react";

// ── GLOBAL THEME CONTEXT ──────────────────────────────────────────────
//
// One global light/dark preference, available anywhere in the tree via
// useTheme() instead of being threaded through props (authProps, Nav,
// ProviderPortal, etc.) page by page. Applied as a `data-theme` attribute
// on <html> so plain CSS can key off it with a single
// `:root[data-theme="light"]` block (see App.jsx's css template's THEME
// TOKENS section, and the .cx-account-page / .provider-shell /
// .portal-content dark-mode blocks) rather than a React-tree class
// needing to reach every themed component.
//
// Init order: localStorage (an explicit earlier choice) → the OS/browser's
// prefers-color-scheme (a first-time visitor's system setting) → "dark"
// (this app's original, always-shipped look, used only when neither of
// the above is available — e.g. matchMedia unsupported).
const STORAGE_KEY = "vaibook_theme";

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch (e) { /* ignore storage errors (private browsing, disabled storage) */ }
  try {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches === false) {
      // Only trust an explicit "light" system preference here — a
      // "dark" or unsupported/undetermined match both fall through to
      // this app's own default below, since "dark" is already that
      // default and an indeterminate query shouldn't be treated as a
      // real signal either way.
      return "light";
    }
  } catch (e) { /* matchMedia not available */ }
  return "dark";
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* ignore storage errors */ }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Throws if used outside a <ThemeProvider> rather than silently falling
// back — every consumer (ThemeToggle, Nav, etc.) sits under the provider
// wrapping <App/> in index.js, so a null context here means a real
// wiring mistake, not a legitimate standalone-usage case.
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used inside a <ThemeProvider>");
  return ctx;
}
