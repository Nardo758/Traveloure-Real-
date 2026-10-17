/**
 * The browser's Google Maps key has ONE name, `GOOGLE_MAPS_BROWSER_KEY` (ledger
 * `2026-10-17-maps-browser-key-one-name`, amending R312). `VITE_GOOGLE_MAPS_API_KEY` is retired and
 * never read. This is the warning the build (vite.config.ts) and the server boot print when the retired
 * name is still set; it names the variable and never its value.
 */
export const RETIRED_MAPS_BROWSER_KEY_NAME = "VITE_GOOGLE_MAPS_API_KEY";

export const RETIRED_MAPS_BROWSER_KEY_WARNING =
  "VITE_GOOGLE_MAPS_API_KEY is retired and ignored; set GOOGLE_MAPS_BROWSER_KEY";

export function retiredMapsBrowserKeyWarning(env: Record<string, string | undefined>): string | null {
  const v = env[RETIRED_MAPS_BROWSER_KEY_NAME];
  return typeof v === "string" && v.trim() !== "" ? RETIRED_MAPS_BROWSER_KEY_WARNING : null;
}
