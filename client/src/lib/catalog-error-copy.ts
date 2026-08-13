/**
 * FP-2 / Package A item 5 — human error copy for the Catalog card mutations.
 *
 * WHAT WAS WRONG: `apiRequest` (client/src/lib/queryClient.ts) throws
 * `Error("<status>: <raw body>")`, and every card mutation on `/provider/services` passed that
 * string straight into a toast as `description: error.message`. A provider who flipped a listing
 * to Active without a meeting point was shown, verbatim:
 *
 *     400: {"message":"In-person services need a meeting point before publishing. Save as
 *     draft to finish later.","code":"MEETING_POINT_REQUIRED"}
 *
 * The server's sentence was already honest and already human — it was simply buried inside a
 * status prefix and a JSON envelope. So this is a CLIENT mapping only: no server response
 * changes, no new refusal is invented, and no refusal is softened or hidden.
 *
 * WHAT THIS ADDS on top of `parseApiErrorMessage`:
 *   1. A per-action TITLE, so the toast says which action failed rather than "Error".
 *   2. `fixInEditor` — true for the refusals a provider fixes inside the listing editor, which
 *      is what lets the caller offer the mock's "Fix it →" action instead of leaving them to
 *      guess where the missing thing lives.
 *   3. An honest fallback when the body is not JSON at all (a proxy 502, an HTML error page):
 *      the caller's own sentence, never a fabricated reason.
 *
 * §13: the code is read from the server's own envelope. An UNRECOGNISED code is not guessed at
 * — it simply doesn't get a "Fix it" affordance, and the server's message is still shown.
 */
import { parseApiErrorMessage } from "@/lib/api-error";

/** Refusal codes a provider resolves by editing the listing (server: routes.ts POST/PATCH). */
export const EDITOR_FIXABLE_CODES: readonly string[] = [
  "MEETING_POINT_REQUIRED",
  "PRICE_REQUIRED",
  "DELIVERABLE_FILE_REQUIRED",
  "INVALID_LOCATION_POINT",
  "ATTESTATION_GATE",
];

export type CatalogAction = "activate" | "pause" | "display" | "delete" | "duplicate";

const ACTION_TITLES: Record<CatalogAction, string> = {
  activate: "Couldn't make this listing active",
  pause: "Couldn't pause this listing",
  display: "Couldn't save that card setting",
  delete: "Couldn't delete this listing",
  duplicate: "Couldn't duplicate this listing",
};

const ACTION_FALLBACKS: Record<CatalogAction, string> = {
  activate: "Something went wrong on our side. Please try again.",
  pause: "Something went wrong on our side. Please try again.",
  display: "Something went wrong on our side. Please try again.",
  delete: "Something went wrong on our side — the listing was not deleted. Please try again.",
  duplicate: "Something went wrong on our side — no copy was made. Please try again.",
};

/** The server's `code` field, when the thrown error carries a JSON envelope with one. */
export function refusalCode(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const match = err.message.match(/^\d+:\s*([\s\S]*)$/);
  const body = match ? match[1] : err.message;
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.code === "string" ? parsed.code : null;
  } catch {
    return null;
  }
}

export interface CatalogRefusalCopy {
  title: string;
  description: string;
  /** The server's refusal code, or null when the response carried none. */
  code: string | null;
  /** True when this refusal is resolved inside the listing editor. */
  fixInEditor: boolean;
}

export function describeCatalogRefusal(action: CatalogAction, err: unknown): CatalogRefusalCopy {
  const code = refusalCode(err);
  return {
    title: ACTION_TITLES[action],
    description: parseApiErrorMessage(err, ACTION_FALLBACKS[action]),
    code,
    fixInEditor: code != null && EDITOR_FIXABLE_CODES.includes(code),
  };
}
