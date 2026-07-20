// Content origin taxonomy (provider-hub Phase 5).
//
// The central content system splits into three origins, so the admin console can group by where a
// piece of content CAME FROM (not just what type it is), and travelers get an honest label:
//
//   • platform  — Platform-Originated content the platform/its experts & providers authored:
//                 provider services, Ready Made Trips (templates), itineraries, experiences, etc.
//   • affiliate — paid partner products surfaced via an affiliate link (traveler label: "Paid partner").
//   • sourced   — machine/DMO-scraped research content. Expert-facing research material only; it is
//                 NEVER shown to travelers on its own (it is transformed into a platform-origin trip/
//                 itinerary first — see CLAUDE.md DMO content model), so it does not appear in the
//                 traveler feed. Included here for completeness / future admin surfaces.
//
// Derived from content_registry.contentType — NO new column, NO backfill. A single source of truth
// shared by server and client.

export type ContentOrigin = "platform" | "affiliate" | "sourced";

// contentType (contentTypeEnum) → origin. Anything not explicitly affiliate/sourced is platform.
const AFFILIATE_TYPES = new Set<string>(["affiliate_product"]);
// No content_registry contentType is 'sourced' today (DMO lives in dmo_raw_content, not the registry);
// mapping kept for when/if sourced content is registered centrally.
const SOURCED_TYPES = new Set<string>([]);

export function contentOriginFor(contentType: string | null | undefined): ContentOrigin {
  const t = (contentType ?? "").toLowerCase();
  if (AFFILIATE_TYPES.has(t)) return "affiliate";
  if (SOURCED_TYPES.has(t)) return "sourced";
  return "platform";
}

export const CONTENT_ORIGIN_LABEL: Record<ContentOrigin, string> = {
  platform: "Platform-Originated",
  affiliate: "Affiliate",
  sourced: "Sourced",
};

// Short traveler-facing label. Platform content carries no badge (it's the default); affiliate is
// disclosed as a paid partner; sourced never reaches travelers directly (see note above).
export const CONTENT_ORIGIN_TRAVELER_LABEL: Record<ContentOrigin, string> = {
  platform: "",
  affiliate: "Paid partner",
  sourced: "",
};
