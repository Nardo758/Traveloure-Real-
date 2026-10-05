/**
 * Feedback at the moments it means something (ledger `2026-10-04-feedback-phase-a`). THE registry:
 * every moment, the surface it lives on, and the codes it accepts — stated ONCE and read by the
 * server's admission, the component and the admin read (§18 rule 1). A moment/code pair this file
 * does not name is refused (409). Free text rides only with `other`, capped, never rendered on a
 * public surface. Pure.
 *
 * Phase A wires `post_draft` only. Phase B adds codes here — `post_optimize` (versions board),
 * `post_handoff` (approval, step 7), `post_trip` (Trip Card at T+1, step 6) — with no schema change;
 * they are listed below as empty so the moment value set is complete and nothing can be recorded
 * against them until their codes land.
 */

export const FEEDBACK_MOMENTS = ["post_draft", "post_optimize", "post_handoff", "post_trip"] as const;
export type FeedbackMoment = (typeof FEEDBACK_MOMENTS)[number];

export type FeedbackSurface = "slip" | "versions" | "card" | "handoff";

/** The surface each moment is captured on — server-filled, never taken from a body. */
export const FEEDBACK_SURFACE: Readonly<Record<FeedbackMoment, FeedbackSurface>> = {
  post_draft: "slip",
  post_optimize: "versions",
  post_handoff: "handoff",
  post_trip: "card",
};

/** Answers, by moment. Order is the order the chips render in. */
export const FEEDBACK_CODES: Readonly<Record<FeedbackMoment, readonly string[]>> = {
  post_draft: ["fits", "too_packed", "too_light", "wrong_areas", "wrong_stops", "other"],
  // Phase B — codes land with their surfaces: least_travel / best_mornings / kept_favourites / other.
  post_optimize: [],
  // Step 7b (R323): on approval of a handoff.
  post_handoff: ["helped", "some", "no"],
  // Step 6 (Trip Card, T+1): great / fine / rough (+ text).
  post_trip: ["great", "fine", "rough"],
};

/**
 * The traveler closed the tap without answering. Recorded as a row (so the tap never reappears for
 * that plan and moment, and the admin read can count dismissals beside answers), accepted for any
 * moment that has codes.
 */
export const FEEDBACK_DISMISSED = "dismissed";
export const FEEDBACK_OTHER = "other";
/** The codes free text may ride with: `other`, and step 6's `rough` (the post-trip "+ text"). */
export const FEEDBACK_TEXT_CODES: readonly string[] = [FEEDBACK_OTHER, "rough"];
export const TAP_TEXT_MAX = 500;

export function isFeedbackMoment(m: unknown): m is FeedbackMoment {
  return typeof m === "string" && (FEEDBACK_MOMENTS as readonly string[]).includes(m);
}

/** Is this an accepted moment/code pair? A moment with no codes yet accepts nothing. */
export function isFeedbackPair(moment: unknown, code: unknown): boolean {
  if (!isFeedbackMoment(moment) || typeof code !== "string") return false;
  const codes = FEEDBACK_CODES[moment];
  if (!codes.length) return false;
  return code === FEEDBACK_DISMISSED || codes.includes(code);
}

/**
 * The stored text: only with `other`, trimmed, and REFUSED (not cut) past the cap — the caller
 * answers 400. Null when there is none.
 */
export function feedbackText(code: string, text: unknown): { ok: true; text: string | null } | { ok: false } {
  if (!FEEDBACK_TEXT_CODES.includes(code) || typeof text !== "string" || !text.trim()) return { ok: true, text: null };
  const t = text.trim();
  if (t.length > TAP_TEXT_MAX) return { ok: false };
  return { ok: true, text: t };
}

/**
 * The plan's time noun for chip copy, from the group manifest's `timeUnit`: "days" → "Days",
 * "hours" / "one day, hours" → "Hours", "run of show" → "Run of show". Unknown ⇒ "Days" (the Trip
 * default the manifest itself falls back to).
 */
export function feedbackTimeNoun(timeUnit: string | null | undefined): string {
  const u = (timeUnit ?? "").toLowerCase();
  if (u.includes("run of show")) return "Run of show";
  if (u.includes("hour")) return "Hours";
  return "Days";
}

export const FEEDBACK_PROMPT: Readonly<Partial<Record<FeedbackMoment, string>>> = {
  post_draft: "Does this draft fit?",
  post_trip: "How was the trip?",
  post_handoff: "Did your local help?",
};

/**
 * Step 6: `post_trip` opens on the Trip Card from T+1 — the day after the plan's last day (UTC
 * calendar), and only for a plan that was made final (it has a card). No end date ⇒ never (§13).
 */
export function postTripOpen(endDate: string | Date | null | undefined, hasFinal: boolean, now: Date): boolean {
  if (!hasFinal) return false;
  const iso = endDate instanceof Date ? endDate.toISOString().slice(0, 10) : typeof endDate === "string" ? endDate.slice(0, 10) : null;
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return now.toISOString().slice(0, 10) > iso;
}

/** A chip's words. Copy that refers to time uses the plan group's own unit. */
export function feedbackChipLabel(code: string, timeUnit: string | null | undefined): string {
  const noun = feedbackTimeNoun(timeUnit);
  switch (code) {
    case "fits":
      return "Fits";
    case "too_packed":
      return `${noun} too packed`;
    case "too_light":
      return `${noun} too light`;
    case "wrong_areas":
      return "Wrong areas";
    case "wrong_stops":
      return "Wrong stops";
    case "other":
      return "Something else";
    case "great":
      return "Great";
    case "fine":
      return "Fine";
    case "rough":
      return "Rough";
    case "helped":
      return "Helped";
    case "some":
      return "Some";
    case "no":
      return "Not really";
    default:
      return code;
  }
}
