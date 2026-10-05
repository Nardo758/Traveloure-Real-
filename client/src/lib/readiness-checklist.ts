/**
 * THE READY-MADE READINESS CHECKLIST, CLIENT SIDE (work plan L2-5, enhancement 1; spec v1.3.5 §1,
 * ruling R-bi; ledger `2026-10-05-readiness-checklist-ui`).
 *
 * The server's `GET /api/expert/ready-made/:id/readiness` (R305) returns `{ blocking, advisory }`.
 * `blocking` IS the publish gate's own output (`assertReadyMadeComplete`), so this module NEVER
 * restates a rule (§18 rule 1): no title / hero / price / empty-day / leg check lives here. It only
 * decides, from the ids a line already carries, WHERE a line jumps and WHETHER submit is offered.
 *
 * Pure — no DOM, no network.
 */

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

/** Where a line jumps. `null` = the line names nothing the workspace can show; it still renders. */
export type ReadinessJump =
  | { kind: "leg"; legId: string | null; fromItemId: string | null; toItemId: string | null }
  | { kind: "item"; itemId: string }
  | { kind: "day"; dayNumber: number }
  | null;

/**
 * Most specific target first: a leg (its id, or the stop pair a missing leg sits between), then a
 * stop, then a day. An anchor line has no Workstation target yet and does not jump (§13 — never a
 * guessed destination).
 */
export function readinessJumpTarget(line: ReadinessLine): ReadinessJump {
  if (line.legId || (line.fromItemId && line.toItemId)) {
    return { kind: "leg", legId: line.legId ?? null, fromItemId: line.fromItemId ?? null, toItemId: line.toItemId ?? null };
  }
  if (line.itemId) return { kind: "item", itemId: line.itemId };
  if (typeof line.dayNumber === "number" && Number.isFinite(line.dayNumber)) return { kind: "day", dayNumber: line.dayNumber };
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
