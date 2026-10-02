import { useTranslation } from "react-i18next";

// ── LANGUAGE SELECTOR (EN/ES) ─────────────────────────────────────────
//
// Drop-anywhere component: reads/writes the shared i18n instance directly
// via useTranslation(), so it needs no props threaded down through
// authProps — it can sit in the Landing Page Nav, inside an account
// dropdown, or in the Provider Portal topbar, with no extra wiring.
//
// `variant`:
//   "icon" — compact EN/ES pill button (nav bars / topbars, dark chrome)
//   "menu" — a labeled row matching .nav-dropdown-item, for dropdowns
export default function LanguageSelector({ variant = "icon", onAfterChange }) {
  const { i18n } = useTranslation();
  const current = i18n.language === "es" ? "es" : "en";
  const other = current === "en" ? "es" : "en";
  const label = current === "en" ? "Switch to Spanish" : "Cambiar a inglés";

  const handleClick = () => {
    i18n.changeLanguage(other);
    if (onAfterChange) onAfterChange();
  };

  if (variant === "menu") {
    return (
      <button
        type="button"
        className="nav-dropdown-item lang-toggle-menu-item"
        onClick={handleClick}
        aria-label={label}
      >
        <span className="icn">🌐</span>
        <span>{current === "en" ? "Español" : "English"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="lang-toggle"
      onClick={handleClick}
      aria-label={label}
      title={label}
    >
      {current.toUpperCase()}
    </button>
  );
}
