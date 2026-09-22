import type { ZodError, ZodIssue } from "zod";

/**
 * ONE shape for a validation-failure response body (#302).
 *
 * The problem this solves is not the status code — all ~78 ZodError handlers under `server/`
 * already answer 400. It is that ~48 of them answer with `err.errors[0].message` and DISCARD every
 * issue after the first, so a caller who got three fields wrong is told about one, fixes it, and is
 * handed a new error. That is a partial answer presented as the whole one (§13).
 *
 * `message` IS DELIBERATELY UNCHANGED — it stays the first issue's message, byte for byte, so no
 * existing consumer, surface or test moves. This helper is strictly ADDITIVE: it puts the issues
 * that were being thrown away into `errors`, beside the message that was already there.
 *
 * `errors` is a PROJECTION (`{ field, message }`), never the raw `ZodIssue[]`. A raw issue carries
 * `code`, `expected`, `received` and the full `path` — internals of the admission schema, which on
 * a §19 allowlist rail describes which privileged fields exist. `content.routes.ts` already chose
 * this projection independently; this makes it the one spelling (§18 rule 1).
 *
 * STATED NEGATIVE SPACE: this does NOT touch the ~27 sites that answer `errors: err.errors` with
 * the raw issue array. Those have a different, pre-existing contract and a consumer may read
 * `path` off them, so converting them is a separate, client-visible decision — not this lane's.
 */
export type ZodErrorBody = {
  message: string;
  errors: Array<{ field: string; message: string }>;
};

function projectIssue(issue: ZodIssue): { field: string; message: string } {
  return { field: issue.path.join("."), message: issue.message };
}

/**
 * @param err      the caught ZodError (call sites have already narrowed with `instanceof`)
 * @param fallback used only when the error carries NO issues at all — a shape zod does not
 *                 normally produce, so the honest answer is a stated fallback rather than
 *                 `undefined` reaching the wire as `{"message": null}`.
 */
export function zodErrorBody(err: ZodError, fallback = "Invalid input"): ZodErrorBody {
  const issues = err.errors ?? [];
  return {
    message: issues[0]?.message ?? fallback,
    errors: issues.map(projectIssue),
  };
}
