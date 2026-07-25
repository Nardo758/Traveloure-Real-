/**
 * ready-made-plan-types.ts — the "Type of Plan" vocabulary for Ready Made Trips store stock.
 *
 * Decision-maker model (2026-07-25): "template" is not a product — it is the QUALITY STRUCTURE
 * every store itinerary ships in: a branded page header (logo), a declared plan type, then the
 * structured content. The plan type is the headline of that structure, so it is (a) required at
 * submit, (b) validated against this closed vocabulary rather than free text, and (c) a material
 * field — changing it on an approved listing re-enters review (§10 A3).
 *
 * Seeded from the decision-maker's named examples (Hiking Itinerary, Road Trip Itinerary,
 * Birthday Plan) plus the platform's existing experience-type taxonomy (wedding / proposal /
 * corporate — the coordination-engine event branches). Editorial vocabulary, not fee config —
 * extend it here, in one place; client picker and server validation both read this list.
 */
export const READY_MADE_PLAN_TYPES = [
  { key: "hiking_itinerary", label: "Hiking Itinerary" },
  { key: "road_trip_itinerary", label: "Road Trip Itinerary" },
  { key: "city_itinerary", label: "City Itinerary" },
  { key: "food_culture_itinerary", label: "Food & Culture Itinerary" },
  { key: "birthday_plan", label: "Birthday Plan" },
  { key: "wedding_plan", label: "Wedding Plan" },
  { key: "proposal_plan", label: "Proposal Plan" },
  { key: "corporate_retreat_plan", label: "Corporate Retreat Plan" },
] as const;

export type ReadyMadePlanTypeKey = (typeof READY_MADE_PLAN_TYPES)[number]["key"];

export const READY_MADE_PLAN_TYPE_KEYS = READY_MADE_PLAN_TYPES.map((t) => t.key) as ReadyMadePlanTypeKey[];

export function planTypeLabel(key: string | null | undefined): string | null {
  return READY_MADE_PLAN_TYPES.find((t) => t.key === key)?.label ?? null;
}
