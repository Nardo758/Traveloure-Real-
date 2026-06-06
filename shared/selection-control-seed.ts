// Selection-control SEED DATA (Phase 2 — filter reconcile, Option 2)
// ---------------------------------------------------------------------------
// Per-tab, lean refine controls stored on each tab's control_config JSONB
// (admin-editable; no migration). Category navigation is served by the tab bar
// itself, so there are NO category-selection controls here — only refine
// controls that map onto #462's WORKING keys (priceRange / minRating / tags).
//
// Authoring discipline (decision-maker rules) — every control here is proven by
// the narrowing/parity test (shared/__tests__/selection-filter.test.ts) to
// actually narrow real seeded rows; controls that don't were dropped:
//   * Tag values are verified to appear in real service NAME/DESCRIPTION content
//     (the engine matches selectedFilters[] as substrings of name/desc, NOT
//     contentAffinityTags).
//   * Budget (priceRange) is seeded only on travel — its prices (80–2499) span
//     the bands. Wedding/corporate vendor prices exceed #462's 0–500 sentinel,
//     so a budget band there would empty results; omitted.
//   * Quality bar (minRating) is NOT seeded anywhere: travel ratings are all
//     4.7–5.0 (a >=4 floor is a no-op) and wedding/corporate rows have no rating
//     (a floor empties them). Rating population is an inventory gap — when
//     ratings are seeded, a quality control can be added (seed-only, no resolver
//     change). See the catalog-enrichment brief.
//
// Inventory gaps deliberately NOT seeded (light up when catalog grows / the
// enrichment brief lands): travel outdoor/nature/nightlife tags; corporate
// "team building" tag; musician/videographer/cake/kids categories; ratings.

import type { SelectionControl } from "./selection-controls";

// --- Reusable refine controls -------------------------------------------------

// Budget — priceRange bands honoring #462's 0–500 engine (max>=500 == uncapped).
const BUDGET_CONTROL: SelectionControl = {
  id: "budget",
  label: "Budget?",
  type: "single_select",
  options: [
    { id: "budget-under-150", label: "Under $150", filterMapping: { price: [0, 150] } },
    { id: "budget-premium", label: "Premium ($150+)", filterMapping: { price: [150, 500] } },
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
    activities: [BUDGET_CONTROL],
    dining: [BUDGET_CONTROL],
    services: [BUDGET_CONTROL],
  },
  wedding: {
    vendors: [WEDDING_VENDOR_FOCUS],
  },
  "corporate-events": {
    "team-activities": [CORPORATE_ACTIVITY_FOCUS],
  },
};

/** Tag values seeded into active controls — must exist in live catalog name/desc. */
export const SEEDED_TAG_VOCAB = ["photography", "floral", "music", "zen", "sake", "craft"] as const;
