/**
 * THE READY-MADE READINESS CHECKLIST, CLIENT SIDE (work plan L2-5, enhancement 1; spec v1.3.5 §1,
 * ruling R-bi; ledger `2026-10-05-readiness-checklist-ui`).
 *
 * The server's `GET /api/expert/ready-made/:id/readiness` (R305) returns `{ blocking, advisory }`.
 * `blocking` IS the publish gate's own output (`assertReadyMadeComplete`), so this module NEVER
 * restates a rule (§18 rule 1): no title / hero / price / empty-day / leg check lives here. It only
 * decides, through step 7a's shared jump-target helper, WHERE a line jumps and WHETHER submit is offered.
 *
 * Pure — no DOM, no network.
 */
import { readinessJumpTargets } from "@shared/plan-jump-targets";

/** One line as the server sends it. Unknown requirements are rendered by their message as-is. */
export interface ReadinessLine {
  requirement: string;
  message: string;
  dayNumber?: number;
  itemId?: string;
  fromItemId?: string;
  toItemId?: string;
  legId?: string;
  anchorId?: string;
}

export interface ReadinessResponse {
  blocking: ReadinessLine[];
  advisory: ReadinessLine[];
}

/**
 * The DOM ids a line can jump to, most specific first. ONE resolution, owned by step 7a's
 * `@shared/plan-jump-targets` (`readinessJumpTargets`) — the same module that stamps those ids on the
 * Workstation's days, stops, legs and gaps — so the checklist and the surface cannot disagree (§18
 * rule 1). A line naming nothing has no targets and offers no "Show" (§13 — never a guessed target).
 */
export function readinessLineTargets(line: ReadinessLine): string[] {
  return readinessJumpTargets(line);
}

/**
 * The first target actually on the page. A collapsed day hides its stops and legs, so the day id
 * (always last in the list) is the honest fallback; null when nothing the line names is on the page.
 */
export function firstPresentTarget(ids: readonly string[], isPresent: (id: string) => boolean): string | null {
  for (const id of ids) if (isPresent(id)) return id;
  return null;
}

/**
 * Submit is disabled only on a KNOWN blocking line. A readiness read that is loading or failed is no
 * answer, and the server runs the same gate on submit anyway — so an unknown never disables the
 * button (it would block a ready listing on a failed advisory read).
 */
export function submitBlockedByReadiness(readiness: ReadinessResponse | undefined | null): boolean {
  return !!readiness && Array.isArray(readiness.blocking) && readiness.blocking.length > 0;
}

/** The query key for one listing's readiness read — one spelling for the panel and its invalidators. */
export function readinessQueryKey(listingId: string): [string] {
  return [`/api/expert/ready-made/${listingId}/readiness`];
}

/** True for any listing's readiness key: a leg or item write invalidates every open checklist. */
export function isReadinessQueryKey(key: readonly unknown[]): boolean {
  return typeof key[0] === "string" && /^\/api\/expert\/ready-made\/[^/]+\/readiness$/.test(key[0]);
}
