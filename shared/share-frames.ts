/**
 * share-frames.ts — the closed vocabulary of real share-image frames (D4 of
 * docs/briefs/SERVICE_FUNDAMENTALS_DECISIONS.md, decision-maker ratified Aug 10 2026).
 *
 * ONE definition of "what frame is this", shared by the frame-aware short-link column
 * (short-links.routes.ts, shared/schema.ts) and the opportunity->frame suggestion engine
 * (expert-console.routes.ts), so the server never validates against a vocabulary the client
 * doesn't render and vice versa.
 *
 * Derived DIRECTLY from the real share-image render surface — no invented frame names (§13):
 *   - server/routes/share-images.routes.ts `GET /api/share-image/service/:id.png?format=...`
 *     accepts feed | story | route (ruling 22(d) — route only exists for a service that HAS
 *     route stops; the endpoint 404s otherwise, never a fabricated route card).
 *   - the same route's `GET /api/share-image/ready-made/:id.png?format=...` accepts feed | story
 *     (no route format for Ready Made Trips — they carry no route_points).
 *   - `GET /api/share-image/review/:id.png` has no format query param at all; it is its own
 *     single frame, named "review" here to give it a first-class identity on the link rail.
 * There are FOUR real frames across every share-image endpoint in the codebase: feed, story,
 * route, review. That is the complete allowlist — nothing here is a guess.
 */

export const SHARE_FRAMES = ["feed", "story", "route", "review"] as const;
export type ShareFrame = (typeof SHARE_FRAMES)[number];

export function isShareFrame(value: unknown): value is ShareFrame {
  return typeof value === "string" && (SHARE_FRAMES as readonly string[]).includes(value);
}

export const SHARE_FRAME_LABEL: Record<ShareFrame, string> = {
  feed: "Feed",
  story: "Story",
  route: "Route",
  review: "Review",
};

/** Display label for a link-analytics frame bucket, including the honest "untagged" bucket for
 *  legacy/generic links that never carried a frame (§13 — never dropped, never guessed). */
export const UNTAGGED_FRAME_LABEL = "Untagged";
