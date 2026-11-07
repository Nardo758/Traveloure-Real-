/**
 * Phase 1 (Leon's go): the canvas token mode. Default is the slip's current style; `canvas` is the
 * same token names with the canvas block applied, selected by ONE root attribute.
 *
 * Opting in is explicit and local: `?tokens=canvas` on the URL, or `slip-tokens=canvas` in
 * localStorage for a device that should keep it. Nothing else in the app changes mode.
 */
export type SlipTokensMode = "default" | "canvas";

export const SLIP_TOKENS_STORAGE_KEY = "slip-tokens";

/** Pure: the mode from a query string (no `?`) and a stored preference. */
export function slipTokensMode(search: string, stored: string | null | undefined): SlipTokensMode {
  if (new URLSearchParams(search).get("tokens") === "canvas") return "canvas";
  return stored === "canvas" ? "canvas" : "default";
}

/** The attributes a `.slip-surface` root spreads. Default mode spreads nothing. */
export function slipTokensAttr(mode: SlipTokensMode): { "data-slip-tokens"?: "canvas" } {
  return mode === "canvas" ? { "data-slip-tokens": "canvas" } : {};
}

/** Browser-side read (once per mount; a root attribute is not reactive state). */
export function readSlipTokensMode(): SlipTokensMode {
  if (typeof window === "undefined") return "default";
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(SLIP_TOKENS_STORAGE_KEY);
  } catch {
    stored = null; // a blocked storage is not a mode
  }
  return slipTokensMode(window.location.search.replace(/^\?/, ""), stored);
}
