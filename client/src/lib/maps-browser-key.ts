/**
 * THE browser's Google Maps key (R312, ledger `2026-10-04-maps-session-and-browser-key`). Every Maps
 * JavaScript load reads this one value, never `import.meta.env` directly.
 *
 * The one name is `GOOGLE_MAPS_BROWSER_KEY` — the browser key, restricted apart from the server key
 * (HTTP referrers + Maps JavaScript / Places library only), exposed by `envPrefix` in vite.config.
 * `VITE_GOOGLE_MAPS_API_KEY` is retired and never read (ledger `2026-10-17-maps-browser-key-one-name`);
 * the build and the server boot warn when it is still set.
 *
 * Empty ⇒ no key: every map surface already renders its keyless fallback. The server's
 * `GOOGLE_MAPS_API_KEY` is never read here and cannot be: its name matches no exposed prefix.
 */
export function resolveMapsBrowserKey(env: Record<string, unknown>): string {
  const pick = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return pick(env.GOOGLE_MAPS_BROWSER_KEY);
}

// Read by NAME, never the whole env object, so Vite inlines only this one variable here.
export const MAPS_BROWSER_KEY: string = resolveMapsBrowserKey({
  GOOGLE_MAPS_BROWSER_KEY: (import.meta as any).env?.GOOGLE_MAPS_BROWSER_KEY,
});
