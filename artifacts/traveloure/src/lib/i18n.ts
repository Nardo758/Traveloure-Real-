/**
 * i18n.ts — CHROME internationalization (ruling 60 Phase A).
 *
 * Ruling 60 names TWO systems and forbids conflating them:
 *   (A) CHROME — menus, buttons, labels, notifications. Platform-owned copy, translated by the
 *       platform via a standard i18n library with locale files. THIS FILE IS (A) AND ONLY (A).
 *   (B) PROVIDER CONTENT — listing names/descriptions/meeting-point text/storefront bios.
 *       Translated only by the provider or as a clearly-labeled machine draft, with an honest
 *       "shown in English" fallback tag. NOT BUILT (Phase B; `service_translations` is the
 *       ruling's named storage and does not exist yet). Never route content strings through
 *       `t()` — a chrome key that silently falls back to English is correct chrome behavior and
 *       exactly the DISHONEST behavior ruling 60 forbids for content.
 *
 * `fallbackLng: 'en'` is deliberate and is the chrome contract: an untranslated chrome key
 * renders its English string silently. Ruling 60's honest-labeling rule binds CONTENT, not
 * chrome — a half-translated menu must never render a raw key ("nav.dashboard"), which is why
 * every call site also carries the English text as a defaultValue where the key is dynamic.
 *
 * Currency display is explicitly OUT of ruling 60's scope (a separate later ruling). Nothing in
 * this module formats money.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "@/locales/en/common.json";
import enNav from "@/locales/en/nav.json";
import enProvider from "@/locales/en/provider.json";
import enCatalog from "@/locales/en/catalog.json";
import enSettings from "@/locales/en/settings.json";
import enAuth from "@/locales/en/auth.json";

import jaCommon from "@/locales/ja/common.json";
import jaNav from "@/locales/ja/nav.json";
import jaProvider from "@/locales/ja/provider.json";
import jaCatalog from "@/locales/ja/catalog.json";
import jaSettings from "@/locales/ja/settings.json";
import jaAuth from "@/locales/ja/auth.json";

/** The chrome locales this phase ships. Kyoto market ⇒ EN + 日本語 (ruling 60). */
export const SUPPORTED_LOCALES = ["en", "ja"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

/** localStorage key holding a GUEST's chosen locale (resolution step 2). */
export const LOCALE_STORAGE_KEY = "traveloure_locale";

export function isSupportedLocale(v: unknown): v is SupportedLocale {
  return typeof v === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(v);
}

/**
 * Narrows a raw language tag to a supported locale, or null.
 * Accepts region subtags ("ja-JP" → "ja", "en-US" → "en") so an Accept-Language header or a
 * navigator.language value resolves without a second table.
 */
export function normalizeLocale(raw: unknown): SupportedLocale | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const base = raw.trim().toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(base) ? base : null;
}

/** Step 2 of the resolution order: the guest's chosen locale, persisted on this device. */
export function readStoredLocale(): SupportedLocale | null {
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    // Private-mode / disabled storage — fall through to the next step, never throw.
    return null;
  }
}

export function writeStoredLocale(locale: SupportedLocale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* best-effort; the account preference (when signed in) is the durable copy */
  }
}

/**
 * Step 3: the browser's Accept-Language preference. `navigator.languages` is the ordered list
 * the browser would send in the Accept-Language header, so honoring it in order IS honoring
 * Accept-Language on a SPA that has no server-rendered shell to read the real header from.
 */
export function readAcceptLanguage(): SupportedLocale | null {
  const candidates =
    typeof navigator !== "undefined"
      ? [...(navigator.languages ?? []), navigator.language]
      : [];
  for (const c of candidates) {
    const hit = normalizeLocale(c);
    if (hit) return hit;
  }
  return null;
}

/**
 * RULING 60 RESOLUTION ORDER, in exactly this sequence:
 *   1. the authenticated user's saved preference (users.preferences.settings.language)
 *   2. the guest's chosen locale (localStorage)
 *   3. Accept-Language
 *   4. en
 *
 * `accountLocale` is passed in rather than read here so this stays a pure function: the caller
 * (useLocale) owns the session. An unauthenticated caller passes null and step 1 is skipped.
 */
export function resolveLocale(accountLocale: unknown): SupportedLocale {
  return (
    normalizeLocale(accountLocale) ??
    readStoredLocale() ??
    readAcceptLanguage() ??
    DEFAULT_LOCALE
  );
}

/** Mirrors the active locale onto <html lang> (ruling 60: "Set <html lang> accordingly"). */
export function applyDocumentLang(locale: SupportedLocale): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", locale);
  }
}

export const resources = {
  en: {
    common: enCommon,
    nav: enNav,
    provider: enProvider,
    catalog: enCatalog,
    settings: enSettings,
    auth: enAuth,
  },
  ja: {
    common: jaCommon,
    nav: jaNav,
    provider: jaProvider,
    catalog: jaCatalog,
    settings: jaSettings,
    auth: jaAuth,
  },
} as const;

// Initial language: steps 2-4 only. Step 1 (the account preference) needs the session, which
// isn't loaded at module-evaluation time — useLocale applies it as soon as /api/auth/user
// resolves. Starting from the guest/browser answer rather than a hardcoded "en" means a
// Japanese-browser guest never sees an English flash first.
const initialLocale = resolveLocale(null);

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES as unknown as string[],
  ns: ["common", "nav", "provider", "catalog", "settings", "auth"],
  defaultNS: "common",
  interpolation: {
    // React already escapes; double-escaping mangles Japanese punctuation in interpolations.
    escapeValue: false,
  },
  returnNull: false,
  // A missing key renders its English string (fallbackLng) — never the raw key. See header.
  parseMissingKeyHandler: (key: string) => {
    const leaf = key.split(":").pop() ?? key;
    return leaf.split(".").pop() ?? leaf;
  },
});

applyDocumentLang(initialLocale);

export default i18n;
