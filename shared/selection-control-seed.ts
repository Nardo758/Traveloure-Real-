// Selection-control SEED DATA (Phase 2 — filter reconcile, Option 2)
// ---------------------------------------------------------------------------
// Per-tab, lean refine controls stored on each tab's control_config JSONB
// (admin-editable; no migration). Category navigation is served by the tab bar
// itself, so there are NO category-selection controls here — only refine
// controls that map onto #462's WORKING keys (priceRange / minRating / tags).
//
// Authoring discipline (decision-maker rules):
//   * Only seed controls that narrow for real. No true-dimension control is
//     faked as a keyword (intensity/capacity/etc. live in the enrichment brief).
//   * Every `tags` value is verified to appear in real service NAME/DESCRIPTION
//     content (the engine matches selectedFilters[] as substrings of name/desc,
//     NOT contentAffinityTags). Tag values with no / near-zero catalog presence
//     are omitted and tracked as an inventory gap, not shipped as dead controls.
//   * priceRange (budget) is only seeded where catalog prices fit #462's
//     0–500 engine band (per-activity travel). It is intentionally OMITTED on
//     wedding/corporate, whose vendor prices (thousands) exceed the engine's
//     500 sentinel — a budget band there would filter everything out.
//
// Inventory gaps deliberately NOT seeded (light up when catalog grows / the
// enrichment brief lands): travel outdoor/nature/nightlife; corporate
// "team building" tag; musician/videographer/cake/kids categories.

import type { SelectionControl } from "./selection-controls";

// --- Reusable refine controls -------------------------------------------------

// Budget — priceRange bands honoring #462's 0–500 engine (max>=500 == uncapped).
const BUDGET_CONTROL: SelectionControl = {
  id: "budget",
  label: "Budget?",
  type: "single_select",
  options: [
    { id: "budget-under-50", label: "Under $50", filterMapping: { price: [0, 50] } },
    { id: "budget-under-150", label: "Under $150", filterMapping: { price: [0, 150] } },
    { id: "budget-premium", label: "Premium ($150+)", filterMapping: { price: [150, 500] } },
  ],
};

// Quality bar — minRating. A real working key; narrowing is data-dependent
// (inventory), not faked. "Any" resolves to a no-op floor.
const QUALITY_CONTROL: SelectionControl = {
  id: "quality",
  label: "Quality bar?",
  type: "single_select",
  options: [
    { id: "quality-any", label: "Any", filterMapping: { rating: 0 } },
    { id: "quality-high", label: "Highly rated", filterMapping: { rating: 4 } },
    { id: "quality-exceptional", label: "Exceptional", filterMapping: { rating: 4.5 } },
  ],
};

// Wedding vendors — topical tags verified present in name/description content.
const WEDDING_VENDOR_FOCUS: SelectionControl = {
  id: "vendor-focus",
  label: "Vendor focus?",
  type: "multi_select",
  options: [
    { id: "focus-photography", label: "Photography", filterMapping: { tags: ["photography"] } },
    { id: "focus-floral", label: "Florals", filterMapping: { tags: ["floral"] } },
    { id: "focus-music", label: "Music", filterMapping: { tags: ["music"] } },
  ],
};

// Corporate team activities — Kyoto cultural team experiences (verified tags).
const CORPORATE_ACTIVITY_FOCUS: SelectionControl = {
  id: "activity-focus",
  label: "Activity focus?",
  type: "multi_select",
  options: [
    { id: "focus-zen", label: "Zen & mindfulness", filterMapping: { tags: ["zen"] } },
    { id: "focus-sake", label: "Sake & social", filterMapping: { tags: ["sake"] } },
    { id: "focus-craft", label: "Craft workshops", filterMapping: { tags: ["craft"] } },
  ],
};

// --- Per-template, per-tab assignment ----------------------------------------

export type TabSelectionControls = Record<string /* tabSlug */, SelectionControl[]>;

export const SELECTION_CONTROL_SEED: Record<string /* templateSlug */, TabSelectionControls> = {
  travel: {
    activities: [BUDGET_CONTROL, QUALITY_CONTROL],
    dining: [BUDGET_CONTROL, QUALITY_CONTROL],
    services: [BUDGET_CONTROL, QUALITY_CONTROL],
  },
  wedding: {
    vendors: [WEDDING_VENDOR_FOCUS, QUALITY_CONTROL],
    venues: [QUALITY_CONTROL],
  },
  "corporate-events": {
    "team-activities": [CORPORATE_ACTIVITY_FOCUS, QUALITY_CONTROL],
    venues: [QUALITY_CONTROL],
  },
};

/** Tag values seeded into active controls — must exist in live catalog name/desc. */
export const SEEDED_TAG_VOCAB = ["photography", "floral", "music", "zen", "sake", "craft"] as const;
