import { useTheme } from "./ThemeContext";

// ── UNIVERSAL THEME TOGGLE ────────────────────────────────────────────
//
// A single reusable Sun/Moon control, wired straight to ThemeContext, so
// it can be dropped anywhere in the tree with no props threaded down to
// it: the Landing Page Nav (the circular icon button next to "Log in"),
// the account dropdown menu (Customer/Provider/Admin, as a labeled row
// alongside Sign out), and the Provider Portal's own topbar (which
// doesn't render the shared Nav once a provider is signed in — see
// App()'s render condition — so without this it would have no toggle at
// all).
//
// `variant`:
//   "icon"   — bare circular icon button (nav bars / topbars, dark chrome)
//   "menu"   — a labeled row matching .nav-dropdown-item, for dropdowns
function SunIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <line x1="12" y1="1.5" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22.5" />
      <line x1="4" y1="12" x2="1.5" y2="12" />
      <line x1="22.5" y1="12" x2="20" y2="12" />
      <line x1="5.6" y1="5.6" x2="3.9" y2="3.9" />
      <line x1="20.1" y1="20.1" x2="18.4" y2="18.4" />
      <line x1="5.6" y1="18.4" x2="3.9" y2="20.1" />
      <line x1="20.1" y1="3.9" x2="18.4" y2="5.6" />
    </svg>
  );
}
function MoonIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.7 14.3a8.5 8.5 0 1 1-11-11 7 7 0 0 0 11 11z" />
    </svg>
  );
}

export default function ThemeToggle({ variant = "icon", onAfterToggle }) {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  const handleClick = () => {
    toggleTheme();
    if (onAfterToggle) onAfterToggle();
  };

  if (variant === "menu") {
    return (
      <button
        type="button"
        className="nav-dropdown-item theme-toggle-menu-item"
        onClick={handleClick}
        aria-label={label}
      >
        {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
        <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={handleClick}
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
