import { useTranslation } from "react-i18next";

// ── LANGUAGE SELECTOR (EN/ES) ─────────────────────────────────────────
//
// Drop-anywhere component: reads/writes the shared i18n instance directly
// via useTranslation(), so it needs no props threaded down through
// authProps — it can sit in the Landing Page Nav, inside an account
// dropdown, or in the Provider Portal topbar, with no extra wiring.
//
// `variant`:
//   "icon"   — compact EN/ES pill button (nav bars / topbars, dark chrome)
//   "menu"   — a labeled row matching .nav-dropdown-item, for dropdowns
//   "footer" — globe icon + "Translate", in the site footer's bottom bar.
//              NOT an EN/ES toggle like the other two variants — VaiBook's
//              own translations stop at EN/ES on purpose (see the comment
//              above handleTranslateClick below for why), so this button
//              instead hands the page to Google Translate, which is the
//              same engine behind Chrome/Edge's built-in "Translate this
//              page" feature and works the same way regardless of which
//              browser the visitor is on — covering every language Google
//              Translate supports instead of just the two VaiBook
//              maintains itself.
export default function LanguageSelector({ variant = "icon", onAfterChange }) {
  const { t, i18n } = useTranslation();
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

  if (variant === "footer") {
    // Opens Google Translate's own translated view of the CURRENT page
    // (whichever one the visitor is actually on — landing, help, a
    // provider's profile) in a new tab, targeting their browser's own
    // language. This is the same translation engine Chrome/Edge's
    // built-in page-translate feature already uses, so it's effectively
    // "connect to whatever translate the browser already has" — except
    // there's no web API a page can call to pop open the browser's own
    // native translate bar on demand (that's deliberately not something
    // a website can trigger), so a Google Translate link is the real-
    // world equivalent: same engine, same language list, just reached
    // via a link instead of a browser-chrome button.
    //
    // Deliberately opens a NEW tab rather than navigating in place: the
    // original tab (and anyone's logged-in session in it) is completely
    // untouched. The translated copy is a live proxy of the real app, so
    // it won't carry that login session over (different origin = fresh
    // cookies/localStorage) — fine for browsing the public pages, but
    // someone translating mid-booking should expect to need to sign in
    // again over there. Machine translation quality also isn't
    // guaranteed, especially around prices/service names — this is why
    // the real EN/ES switcher above stays hand-maintained instead of
    // just relying on this for Spanish too.
    const handleTranslateClick = () => {
      try {
        const targetLang = (navigator.language || "en").slice(0, 2).toLowerCase();
        const pageUrl = window.location.href;
        const translateUrl = `https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(targetLang)}&u=${encodeURIComponent(pageUrl)}`;
        window.open(translateUrl, "_blank", "noopener,noreferrer");
      } catch (e) { /* window/navigator unavailable — nothing to do */ }
      if (onAfterChange) onAfterChange();
    };
    return (
      <button
        type="button"
        className="lang-toggle-footer"
        onClick={handleTranslateClick}
        aria-label={t("footer.translate")}
        title={t("footer.translate")}
      >
        <span aria-hidden="true">🌐</span>
        <span>{t("footer.translate")}</span>
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
