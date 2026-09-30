import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";

// ── i18n SETUP (EN / ES) ────────────────────────────────────────────────
//
// Resources are bundled directly as plain JSON (no async HTTP backend), so
// there's no loading flicker and no need to wrap the app tree in
// React Suspense — the dictionaries are just two small files today
// (Landing Page Hero only, per the initial rollout) and are meant to grow
// section by section, the same incremental approach ThemeContext.jsx used
// for the dark-mode rollout (see its rollout note): add keys to
// src/locales/en.json + es.json and swap the matching hardcoded string in
// App.jsx for t('...') as each section gets translated, rather than
// blocking on translating the whole app up front.
//
// Language choice persists the same way the theme preference does:
// localStorage first (an explicit earlier choice), then the browser's own
// language setting, falling back to English — this app's default.
const STORAGE_KEY = "vaibook_lang";

function getInitialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch (e) { /* ignore storage errors (private browsing, disabled storage) */ }
  try {
    const browserLang = (navigator.language || "").slice(0, 2).toLowerCase();
    if (browserLang === "es") return "es";
  } catch (e) { /* navigator unavailable */ }
  return "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React already escapes — avoids double-escaping.
  react: { useSuspense: false }, // resources are bundled, not fetched — nothing to suspend on.
});

// Keep the explicit choice made via LanguageSelector across reloads/visits.
i18n.on("languageChanged", (lng) => {
  try { localStorage.setItem(STORAGE_KEY, lng); } catch (e) { /* ignore storage errors */ }
});

export default i18n;
