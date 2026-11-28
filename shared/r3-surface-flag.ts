/**
 * The R3 planning surface switch, as ONE rule (ledger `2026-11-27-s5-r3-surface-flag`).
 *
 * RUNTIME, not build-time (Leon, Nov 22 2026): the server reads its own env and answers
 * `GET /api/public/r3-surface` with `{ on: boolean }`, so staging can turn the surface on without
 * rebuilding a bundle. The rule is the exact string `"1"` and nothing else: an unset variable, an
 * empty string, `"true"`, `"yes"` or `" 1"` are all OFF. A near-miss must never switch a surface on.
 *
 * `?surface=r3` ALONE CHANGES NOTHING (Leon, Nov 23 2026): the query parameter is the client's own
 * question, asked of a page load (`client/src/lib/r3-surface.ts:16-20` requires the flag AND the
 * parameter). It is never read here, so a URL cannot turn the argument on by itself.
 */

/** True only for `R3_SURFACE=1`. Every other value, and an absent variable, is false. */
export function r3SurfaceFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.R3_SURFACE === "1";
}
