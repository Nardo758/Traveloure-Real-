/**
 * THE browser's Google Maps key (R300, ledger `2026-10-04-maps-session-and-browser-key`). Every Maps
 * JavaScript load reads this one value, never `import.meta.env` directly.
 *
 *   1. `GOOGLE_MAPS_BROWSER_KEY` — the browser key, restricted apart from the server key
 *      (HTTP referrers + Maps JavaScript / Places library only). Exposed by `envPrefix` in vite.config.
 *   2. `VITE_GOOGLE_MAPS_API_KEY` — the older client variable, read only while a deployment has not
 *      set (1), so a build made before the operator adds it keeps its maps.
 *
 * Empty ⇒ no key: every map surface already renders its keyless fallback. The server's
 * `GOOGLE_MAPS_API_KEY` is never read here and cannot be: its name matches no exposed prefix.
 */
export function resolveMapsBrowserKey(env: Record<string, unknown>): string {
  const pick = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return pick(env.GOOGLE_MAPS_BROWSER_KEY) || pick(env.VITE_GOOGLE_MAPS_API_KEY);
}

export const MAPS_BROWSER_KEY: string = resolveMapsBrowserKey(((import.meta as any).env ?? {}) as Record<string, unknown>);
