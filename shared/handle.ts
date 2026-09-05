/**
 * shared/handle.ts — the ONE handle shape.
 *
 * Ledger `2026-09-05-user-id-is-internal` (CLAUDE.md Locked Decision 40): `users.handle` is an
 * earner's PUBLIC identity, and `users.id` is internal. The handle is therefore the thing a contact
 * rail is addressed by, which means two places now need to know what a handle looks like — the
 * storefront claim/read routes and the contact start rail.
 *
 * It was previously a `const HANDLE_RE` local to `server/routes/storefront.routes.ts`. A second copy
 * would be the derivation-drift class §18 rule 1 names (the two would disagree the day the length
 * or the hyphen rule moves), so it lives here and that file imports it. It is in `shared/` rather
 * than `server/` so a client and a pure unit test can read it without pulling in the server.
 *
 * NEGATIVE SPACE: this is a SHAPE check only. It says nothing about whether a handle is claimed,
 * reserved (`RESERVED_HANDLES` in storefront.routes.ts owns that), or belongs to a live account —
 * those are database questions and stay on the routes that ask them.
 */

/** lowercase alnum + hyphens, 3–30 chars, no leading/trailing/double hyphen. */
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,28}[a-z0-9]$/;

/** True iff `value` has the handle SHAPE. Never claims the handle exists. */
export function isHandleShape(value: string | null | undefined): boolean {
  return typeof value === "string" && HANDLE_RE.test(value);
}

/** Lowercase + trim, the normalization every handle lookup applies before comparing. */
export function normalizeHandle(value: string): string {
  return value.trim().toLowerCase();
}
