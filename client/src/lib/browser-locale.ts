/**
 * Row 159 (ledger `2026-10-29-trip-dates-locale`): the browser's language, for a formatter that takes
 * a locale. Undefined where there is no navigator (server render, tests without one) or it reports no
 * language, so the caller falls back to its own default.
 */
export function browserLocale(): string | undefined {
  return typeof navigator !== "undefined" && typeof navigator.language === "string" && navigator.language
    ? navigator.language
    : undefined;
}
