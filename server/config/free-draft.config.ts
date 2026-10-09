/**
 * FD-1 — THE FREE-DRAFT CAP'S NUMBERS (decision-maker, Oct 9, 2026; ledger `2026-10-09-fd1-free-draft-cap`;
 * content-tiers ruling rev 1 §6). Counts and a window, never rates (§8). Env-overridable; an unset,
 * non-numeric or non-positive value reads the ruled default.
 */
function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** §6: free drafts an account may run per window. */
export function freeDraftsPerWindow(): number {
  return positiveIntEnv("FREE_DRAFTS_PER_WINDOW", 3);
}

/** §6: the rolling window, in days. */
export function freeDraftWindowDays(): number {
  return positiveIntEnv("FREE_DRAFT_WINDOW_DAYS", 30);
}

/** §6: free drafts a guest record may run (it enforces once E2/E3 mint a server guest record). */
export function freeDraftsPerGuest(): number {
  return positiveIntEnv("FREE_DRAFTS_PER_GUEST", 1);
}
