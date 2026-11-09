/**
 * Phase 1 + UI-flip (ruled 2026-11-09): the canvas token mode. The PLANNER CONTAINERS now DEFAULT to
 * it — the slip, the map, the Trip Card and the two planner pages spread the root attribute without
 * being asked. `?tokens=default` (or `slip-tokens=default` in localStorage) is the one-step way back
 * and the flip's own revert; nothing else in the app changes mode, and `<html>` is never touched, so
 * the nav, the sign-in modal and the console shell keep their own look.
 */
export type SlipTokensMode = "default" | "canvas";

export const SLIP_TOKENS_STORAGE_KEY = "slip-tokens";

/** Pure: the mode from a query string (no `?`) and a stored preference. */
export function slipTokensMode(search: string, stored: string | null | undefined): SlipTokensMode {
  const asked = new URLSearchParams(search).get("tokens");
  if (asked === "canvas") return "canvas";
  // THE FLIP IS THIS LINE. Reverting it — `return "default"` — is the whole safety story.
  if (asked === "default") return "default";
  if (stored === "default") return "default";
  return "canvas";
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
