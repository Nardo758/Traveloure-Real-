// Selection-control SEED DATA (Phase 2 — filter reconcile, Option 2)
// ---------------------------------------------------------------------------
// Per-tab, lean refine controls stored on each tab's control_config JSONB
// (admin-editable; no migration). Category navigation is served by the tab bar
// itself, so there are NO category-selection controls here — only refine
// controls that map onto #462's WORKING keys (priceRange / tags).
//
// Authoring discipline — every control maps onto WORKING_DIMENSION_KEYS.
// Tags degrade gracefully (no-op) when the word does not appear in a service
// name/description; price bands always narrow. New catalog rows light up the
// controls automatically without a schema change.
//
// SEEDED_TAG_VOCAB lists every tag token in active use across all templates.

import type { SelectionControl } from "./selection-controls";

// ============================================================
// REUSABLE BUDGET CONTROLS
// ============================================================

// Standard activity/service price bands ($80–$2499 in live catalog).
const BUDGET_CONTROL: SelectionControl = {
  id: "budget",
  label: "Budget?",
  type: "single_select",
  options: [
    { id: "budget-under-150", label: "Under $150", filterMapping: { price: [0, 150] } },
    { id: "budget-premium", label: "Premium ($150+)", filterMapping: { price: [150, 500] } },
  ],
};

// Finer three-band budget for templates with mid-tier catalog content.
const BUDGET_TIERED: SelectionControl = {
  id: "budget",
  label: "Budget?",
  type: "single_select",
  options: [
    { id: "budget-economy",  label: "Economy (<$80)",      filterMapping: { price: [0, 80] } },
    { id: "budget-standard", label: "Standard ($80–$200)",  filterMapping: { price: [80, 200] } },
    { id: "budget-premium",  label: "Premium ($200+)",      filterMapping: { price: [200, 500] } },
  ],
};

// ============================================================
// TRAVEL
// ============================================================

const TRAVEL_ACTIVITY_FOCUS: SelectionControl = {
  id: "activity-focus",
  label: "Activity focus?",
  type: "multi_select",
  options: [
    { id: "focus-cultural",   label: "Cultural",    filterMapping: { tags: ["cultural"] } },
    { id: "focus-adventure",  label: "Adventure",   filterMapping: { tags: ["adventure"] } },
    { id: "focus-zen",        label: "Zen & calm",  filterMapping: { tags: ["zen"] } },
  ],
};

const TRAVEL_ACTIVITY_STYLE: SelectionControl = {
  id: "activity-style",
  label: "Style?",
  type: "multi_select",
  options: [
    { id: "style-guided",  label: "Guided tour",   filterMapping: { tags: ["tour"] } },
    { id: "style-craft",   label: "Craft / hands-on", filterMapping: { tags: ["craft"] } },
    { id: "style-tasting", label: "Tasting",        filterMapping: { tags: ["tasting"] } },
  ],
};

const TRAVEL_DINING_FOCUS: SelectionControl = {
  id: "dining-focus",
  label: "Dining style?",
  type: "multi_select",
  options: [
    { id: "dining-sake",    label: "Sake & social", filterMapping: { tags: ["sake"] } },
    { id: "dining-local",   label: "Local cuisine", filterMapping: { tags: ["local"] } },
    { id: "dining-fine",    label: "Fine dining",   filterMapping: { tags: ["fine"] } },
  ],
};

const TRAVEL_SERVICE_FOCUS: SelectionControl = {
  id: "service-focus",
  label: "Service type?",
  type: "multi_select",
  options: [
    { id: "service-photo",     label: "Photography",  filterMapping: { tags: ["photography"] } },
    { id: "service-wellness",  label: "Wellness",     filterMapping: { tags: ["wellness"] } },
    { id: "service-floral",    label: "Floral / decor", filterMapping: { tags: ["floral"] } },
  ],
};

// ============================================================
// WEDDING
// ============================================================

const WEDDING_VENDOR_FOCUS: SelectionControl = {
  id: "vendor-focus",
  label: "Vendor focus?",
  type: "multi_select",
  options: [
    { id: "focus-photography", label: "Photography", filterMapping: { tags: ["photography"] } },
    { id: "focus-floral",      label: "Florals",     filterMapping: { tags: ["floral"] } },
    { id: "focus-music",       label: "Music",       filterMapping: { tags: ["music"] } },
  ],
};

const WEDDING_VENDOR_STYLE: SelectionControl = {
  id: "vendor-style",
  label: "Style?",
  type: "multi_select",
  options: [
    { id: "style-romantic",     label: "Romantic",    filterMapping: { tags: ["romantic"] } },
    { id: "style-traditional",  label: "Traditional", filterMapping: { tags: ["traditional"] } },
    { id: "style-modern",       label: "Modern",      filterMapping: { tags: ["modern"] } },
  ],
};

const WEDDING_VENUE_STYLE: SelectionControl = {
  id: "venue-style",
  label: "Venue feel?",
  type: "multi_select",
  options: [
    { id: "venue-garden",    label: "Garden / outdoor", filterMapping: { tags: ["garden"] } },
    { id: "venue-ballroom",  label: "Ballroom",          filterMapping: { tags: ["ballroom"] } },
    { id: "venue-winery",    label: "Winery / vineyard", filterMapping: { tags: ["winery"] } },
  ],
};

// ============================================================
// CORPORATE EVENTS
// ============================================================

const CORPORATE_ACTIVITY_FOCUS: SelectionControl = {
  id: "activity-focus",
  label: "Activity focus?",
  type: "multi_select",
  options: [
    { id: "focus-zen",   label: "Zen & mindfulness", filterMapping: { tags: ["zen"] } },
    { id: "focus-sake",  label: "Sake & social",     filterMapping: { tags: ["sake"] } },
    { id: "focus-craft", label: "Craft workshops",   filterMapping: { tags: ["craft"] } },
  ],
};

const CORPORATE_VENUE_FOCUS: SelectionControl = {
  id: "venue-focus",
  label: "Venue type?",
  type: "multi_select",
  options: [
    { id: "venue-conference", label: "Conference",      filterMapping: { tags: ["conference"] } },
    { id: "venue-creative",   label: "Creative space",  filterMapping: { tags: ["creative"] } },
    { id: "venue-cultural",   label: "Cultural venue",  filterMapping: { tags: ["cultural"] } },
  ],
};

const CORPORATE_CATERING_FOCUS: SelectionControl = {
  id: "catering-focus",
  label: "Catering style?",
  type: "multi_select",
  options: [
    { id: "catering-buffet",  label: "Buffet",           filterMapping: { tags: ["buffet"] } },
    { id: "catering-plated",  label: "Plated dining",    filterMapping: { tags: ["plated"] } },
    { id: "catering-sake",    label: "Sake & drinks",    filterMapping: { tags: ["sake"] } },
  ],
};

// ============================================================
// DATE NIGHT
// ============================================================

const DATE_DINING_FOCUS: SelectionControl = {
  id: "dining-focus",
  label: "Dining mood?",
  type: "multi_select",
  options: [
    { id: "dining-romantic",  label: "Romantic",     filterMapping: { tags: ["romantic"] } },
    { id: "dining-fine",      label: "Fine dining",  filterMapping: { tags: ["fine"] } },
    { id: "dining-tasting",   label: "Tasting menu", filterMapping: { tags: ["tasting"] } },
  ],
};

const DATE_ACTIVITY_FOCUS: SelectionControl = {
  id: "activity-focus",
  label: "Activity type?",
  type: "multi_select",
  options: [
    { id: "activity-craft",      label: "Craft & art",    filterMapping: { tags: ["craft"] } },
    { id: "activity-cultural",   label: "Cultural",       filterMapping: { tags: ["cultural"] } },
    { id: "activity-wellness",   label: "Wellness",       filterMapping: { tags: ["wellness"] } },
  ],
};

const DATE_ENTERTAINMENT_FOCUS: SelectionControl = {
  id: "entertainment-focus",
  label: "Entertainment?",
  type: "multi_select",
  options: [
    { id: "ent-music",  label: "Live music",  filterMapping: { tags: ["music"] } },
    { id: "ent-tour",   label: "Guided tour", filterMapping: { tags: ["tour"] } },
    { id: "ent-zen",    label: "Zen & spa",   filterMapping: { tags: ["zen"] } },
  ],
};

const DATE_SERVICE_FOCUS: SelectionControl = {
  id: "service-focus",
  label: "Service type?",
  type: "multi_select",
  options: [
    { id: "svc-photo",    label: "Photography",    filterMapping: { tags: ["photography"] } },
    { id: "svc-wellness", label: "Spa & wellness", filterMapping: { tags: ["wellness"] } },
    { id: "svc-floral",   label: "Floral",         filterMapping: { tags: ["floral"] } },
  ],
};

// ============================================================
// BIRTHDAY
// ============================================================

const BIRTHDAY_VENUE_FOCUS: SelectionControl = {
  id: "venue-focus",
  label: "Venue vibe?",
  type: "multi_select",
  options: [
    { id: "venue-entertainment", label: "Entertainment",  filterMapping: { tags: ["entertainment"] } },
    { id: "venue-dining",        label: "Dining-centric",  filterMapping: { tags: ["dining"] } },
    { id: "venue-outdoor",       label: "Outdoor / garden", filterMapping: { tags: ["garden"] } },
  ],
};

const BIRTHDAY_ACTIVITY_FOCUS: SelectionControl = {
  id: "activity-focus",
  label: "Activity focus?",
  type: "multi_select",
  options: [
    { id: "act-craft",      label: "Craft / art",  filterMapping: { tags: ["craft"] } },
    { id: "act-cultural",   label: "Cultural",     filterMapping: { tags: ["cultural"] } },
    { id: "act-adventure",  label: "Adventure",    filterMapping: { tags: ["adventure"] } },
  ],
};

const BIRTHDAY_ENTERTAINMENT_FOCUS: SelectionControl = {
  id: "entertainment-focus",
  label: "Entertainment?",
  type: "multi_select",
  options: [
    { id: "ent-music",  label: "Live music / DJ",  filterMapping: { tags: ["music"] } },
    { id: "ent-photo",  label: "Photo booth",       filterMapping: { tags: ["photography"] } },
    { id: "ent-craft",  label: "Creative activity", filterMapping: { tags: ["craft"] } },
  ],
};

const BIRTHDAY_SERVICE_FOCUS: SelectionControl = {
  id: "service-focus",
  label: "Services needed?",
  type: "multi_select",
  options: [
    { id: "svc-floral",  label: "Floral / decor",  filterMapping: { tags: ["floral"] } },
    { id: "svc-photo",   label: "Photography",      filterMapping: { tags: ["photography"] } },
    { id: "svc-catering", label: "Catering",        filterMapping: { tags: ["catering"] } },
  ],
};

// ============================================================
// BOYS TRIP
// ============================================================

const BOYS_ACTIVITY_FOCUS: SelectionControl = {
  id: "activity-focus",
  label: "Activity type?",
  type: "multi_select",
  options: [
    { id: "act-adventure", label: "Adventure",      filterMapping: { tags: ["adventure"] } },
    { id: "act-cultural",  label: "Cultural",       filterMapping: { tags: ["cultural"] } },
    { id: "act-sake",      label: "Sake & social",  filterMapping: { tags: ["sake"] } },
  ],
};

const BOYS_NIGHTLIFE_FOCUS: SelectionControl = {
  id: "nightlife-focus",
  label: "Night vibe?",
  type: "multi_select",
  options: [
    { id: "night-music",       label: "Live music",      filterMapping: { tags: ["music"] } },
    { id: "night-entertainment", label: "Entertainment", filterMapping: { tags: ["entertainment"] } },
    { id: "night-tasting",     label: "Tasting",         filterMapping: { tags: ["tasting"] } },
  ],
};

const BOYS_DINING_FOCUS: SelectionControl = {
  id: "dining-focus",
  label: "Dining style?",
  type: "multi_select",
  options: [
    { id: "dining-local",  label: "Local cuisine", filterMapping: { tags: ["local"] } },
    { id: "dining-sake",   label: "Sake & izakaya", filterMapping: { tags: ["sake"] } },
    { id: "dining-craft",  label: "Craft brewery", filterMapping: { tags: ["craft"] } },
  ],
};

// ============================================================
// GIRLS TRIP
// ============================================================

const GIRLS_ACTIVITY_FOCUS: SelectionControl = {
  id: "activity-focus",
  label: "Activity type?",
  type: "multi_select",
  options: [
    { id: "act-wellness",  label: "Spa & wellness",   filterMapping: { tags: ["wellness"] } },
    { id: "act-craft",     label: "Craft & creative", filterMapping: { tags: ["craft"] } },
    { id: "act-cultural",  label: "Cultural",         filterMapping: { tags: ["cultural"] } },
  ],
};

const GIRLS_SPA_FOCUS: SelectionControl = {
  id: "spa-focus",
  label: "Spa focus?",
  type: "multi_select",
  options: [
    { id: "spa-wellness",  label: "Wellness",   filterMapping: { tags: ["wellness"] } },
    { id: "spa-zen",       label: "Zen & calm", filterMapping: { tags: ["zen"] } },
    { id: "spa-floral",    label: "Floral treatment", filterMapping: { tags: ["floral"] } },
  ],
};

const GIRLS_DINING_FOCUS: SelectionControl = {
  id: "dining-focus",
  label: "Dining style?",
  type: "multi_select",
  options: [
    { id: "dining-local",    label: "Local cuisine", filterMapping: { tags: ["local"] } },
    { id: "dining-fine",     label: "Fine dining",   filterMapping: { tags: ["fine"] } },
    { id: "dining-tasting",  label: "Tasting",       filterMapping: { tags: ["tasting"] } },
  ],
};

const GIRLS_NIGHTLIFE_FOCUS: SelectionControl = {
  id: "nightlife-focus",
  label: "Night vibe?",
  type: "multi_select",
  options: [
    { id: "night-music",  label: "Live music",    filterMapping: { tags: ["music"] } },
    { id: "night-craft",  label: "Craft cocktails", filterMapping: { tags: ["craft"] } },
    { id: "night-sake",   label: "Sake bar",       filterMapping: { tags: ["sake"] } },
  ],
};

// ============================================================
// RETREATS
// ============================================================

const RETREAT_ACTIVITY_FOCUS: SelectionControl = {
  id: "activity-focus",
  label: "Program focus?",
  type: "multi_select",
  options: [
    { id: "prog-zen",      label: "Zen & meditation", filterMapping: { tags: ["zen"] } },
    { id: "prog-wellness", label: "Wellness",          filterMapping: { tags: ["wellness"] } },
    { id: "prog-craft",    label: "Creative / craft",  filterMapping: { tags: ["craft"] } },
  ],
};

const RETREAT_SERVICE_FOCUS: SelectionControl = {
  id: "service-focus",
  label: "Service type?",
  type: "multi_select",
  options: [
    { id: "svc-wellness",  label: "Wellness therapy", filterMapping: { tags: ["wellness"] } },
    { id: "svc-zen",       label: "Zen / meditation", filterMapping: { tags: ["zen"] } },
    { id: "svc-floral",    label: "Floral & sensory", filterMapping: { tags: ["floral"] } },
  ],
};

const RETREAT_DINING_FOCUS: SelectionControl = {
  id: "dining-focus",
  label: "Dining style?",
  type: "multi_select",
  options: [
    { id: "dining-local",    label: "Local / organic",  filterMapping: { tags: ["local"] } },
    { id: "dining-wellness", label: "Wellness focus",   filterMapping: { tags: ["wellness"] } },
    { id: "dining-cultural", label: "Cultural cuisine", filterMapping: { tags: ["cultural"] } },
  ],
};

const RETREAT_VENUE_FOCUS: SelectionControl = {
  id: "venue-focus",
  label: "Venue setting?",
  type: "multi_select",
  options: [
    { id: "venue-zen",       label: "Zen sanctuary",   filterMapping: { tags: ["zen"] } },
    { id: "venue-wellness",  label: "Wellness center", filterMapping: { tags: ["wellness"] } },
    { id: "venue-cultural",  label: "Cultural space",  filterMapping: { tags: ["cultural"] } },
  ],
};

// ============================================================
// PROPOSAL
// ============================================================

const PROPOSAL_LOCATION_FOCUS: SelectionControl = {
  id: "location-focus",
  label: "Setting?",
  type: "multi_select",
  options: [
    { id: "loc-zen",      label: "Zen / garden",    filterMapping: { tags: ["zen"] } },
    { id: "loc-cultural", label: "Cultural spot",   filterMapping: { tags: ["cultural"] } },
    { id: "loc-romantic", label: "Romantic",        filterMapping: { tags: ["romantic"] } },
  ],
};

const PROPOSAL_SERVICE_FOCUS: SelectionControl = {
  id: "service-focus",
  label: "Services needed?",
  type: "multi_select",
  options: [
    { id: "svc-photography", label: "Photography",  filterMapping: { tags: ["photography"] } },
    { id: "svc-floral",      label: "Florals",      filterMapping: { tags: ["floral"] } },
    { id: "svc-music",       label: "Music",        filterMapping: { tags: ["music"] } },
  ],
};

const PROPOSAL_DINING_FOCUS: SelectionControl = {
  id: "dining-focus",
  label: "Dining mood?",
  type: "multi_select",
  options: [
    { id: "dining-romantic", label: "Romantic",    filterMapping: { tags: ["romantic"] } },
    { id: "dining-fine",     label: "Fine dining", filterMapping: { tags: ["fine"] } },
    { id: "dining-sake",     label: "Sake & quiet", filterMapping: { tags: ["sake"] } },
  ],
};

// ============================================================
// REUNIONS
// ============================================================

const REUNION_VENUE_FOCUS: SelectionControl = {
  id: "venue-focus",
  label: "Venue type?",
  type: "multi_select",
  options: [
    { id: "venue-cultural",  label: "Cultural venue", filterMapping: { tags: ["cultural"] } },
    { id: "venue-outdoor",   label: "Outdoor / garden", filterMapping: { tags: ["garden"] } },
    { id: "venue-dining",    label: "Dining venue",   filterMapping: { tags: ["dining"] } },
  ],
};

const REUNION_ACTIVITY_FOCUS: SelectionControl = {
  id: "activity-focus",
  label: "Activity type?",
  type: "multi_select",
  options: [
    { id: "act-cultural",  label: "Cultural / tours", filterMapping: { tags: ["cultural"] } },
    { id: "act-craft",     label: "Craft & creative", filterMapping: { tags: ["craft"] } },
    { id: "act-adventure", label: "Adventure",        filterMapping: { tags: ["adventure"] } },
  ],
};

const REUNION_CATERING_FOCUS: SelectionControl = {
  id: "catering-focus",
  label: "Catering style?",
  type: "multi_select",
  options: [
    { id: "cat-local",   label: "Local cuisine",  filterMapping: { tags: ["local"] } },
    { id: "cat-catering", label: "Full catering",  filterMapping: { tags: ["catering"] } },
    { id: "cat-sake",    label: "Drinks & sake",   filterMapping: { tags: ["sake"] } },
  ],
};

// ============================================================
// WEDDING ANNIVERSARIES
// ============================================================

const ANNIVERSARY_VENUE_FOCUS: SelectionControl = {
  id: "venue-focus",
  label: "Venue feel?",
  type: "multi_select",
  options: [
    { id: "venue-romantic",  label: "Romantic",         filterMapping: { tags: ["romantic"] } },
    { id: "venue-garden",    label: "Garden / outdoor", filterMapping: { tags: ["garden"] } },
    { id: "venue-winery",    label: "Winery",           filterMapping: { tags: ["winery"] } },
  ],
};

const ANNIVERSARY_ENTERTAINMENT_FOCUS: SelectionControl = {
  id: "entertainment-focus",
  label: "Entertainment?",
  type: "multi_select",
  options: [
    { id: "ent-music",  label: "Live music",  filterMapping: { tags: ["music"] } },
    { id: "ent-photo",  label: "Photography", filterMapping: { tags: ["photography"] } },
    { id: "ent-zen",    label: "Zen & spa",   filterMapping: { tags: ["zen"] } },
  ],
};

const ANNIVERSARY_CATERING_FOCUS: SelectionControl = {
  id: "catering-focus",
  label: "Dining style?",
  type: "multi_select",
  options: [
    { id: "cat-romantic", label: "Romantic dining",  filterMapping: { tags: ["romantic"] } },
    { id: "cat-fine",     label: "Fine dining",       filterMapping: { tags: ["fine"] } },
    { id: "cat-local",    label: "Local / seasonal",  filterMapping: { tags: ["local"] } },
  ],
};

// ============================================================
// SHARED PARTY CONTROLS (birthday, graduation, engagement, etc.)
// ============================================================

const PARTY_VENUE_FOCUS: SelectionControl = {
  id: "venue-focus",
  label: "Venue vibe?",
  type: "multi_select",
  options: [
    { id: "venue-dining",    label: "Dining-centric",   filterMapping: { tags: ["dining"] } },
    { id: "venue-garden",    label: "Garden / outdoor", filterMapping: { tags: ["garden"] } },
    { id: "venue-cultural",  label: "Cultural space",   filterMapping: { tags: ["cultural"] } },
  ],
};

const PARTY_CATERING_FOCUS: SelectionControl = {
  id: "catering-focus",
  label: "Catering style?",
  type: "multi_select",
  options: [
    { id: "cat-catering",  label: "Full catering",  filterMapping: { tags: ["catering"] } },
    { id: "cat-local",     label: "Local cuisine",  filterMapping: { tags: ["local"] } },
    { id: "cat-tasting",   label: "Tasting / bites", filterMapping: { tags: ["tasting"] } },
  ],
};

const PARTY_ENTERTAINMENT_FOCUS: SelectionControl = {
  id: "entertainment-focus",
  label: "Entertainment?",
  type: "multi_select",
  options: [
    { id: "ent-music",  label: "Live music / DJ",  filterMapping: { tags: ["music"] } },
    { id: "ent-photo",  label: "Photography",       filterMapping: { tags: ["photography"] } },
    { id: "ent-craft",  label: "Creative activity", filterMapping: { tags: ["craft"] } },
  ],
};

const PARTY_SERVICE_FOCUS: SelectionControl = {
  id: "service-focus",
  label: "Services needed?",
  type: "multi_select",
  options: [
    { id: "svc-floral",  label: "Floral / decor",  filterMapping: { tags: ["floral"] } },
    { id: "svc-photo",   label: "Photography",      filterMapping: { tags: ["photography"] } },
    { id: "svc-music",   label: "Music / DJ",       filterMapping: { tags: ["music"] } },
  ],
};

const PARTY_PHOTO_FOCUS: SelectionControl = {
  id: "photo-focus",
  label: "Photography style?",
  type: "multi_select",
  options: [
    { id: "photo-event",     label: "Event coverage", filterMapping: { tags: ["photography"] } },
    { id: "photo-floral",    label: "Styled with florals", filterMapping: { tags: ["floral"] } },
    { id: "photo-cultural",  label: "Cultural / artistic", filterMapping: { tags: ["cultural"] } },
  ],
};

// ============================================================
// PER-TEMPLATE, PER-TAB ASSIGNMENT
// ============================================================

export type TabSelectionControls = Record<string /* tabSlug */, SelectionControl[]>;

export const SELECTION_CONTROL_SEED: Record<string /* templateSlug */, TabSelectionControls> = {

  // ─── BACHELOR / BACHELORETTE ─────────────────────────────
  "bachelor-bachelorette": {
    accommodations:      [BUDGET_CONTROL, BOYS_ACTIVITY_FOCUS,    GIRLS_SPA_FOCUS],
    "daytime-activities":[BUDGET_TIERED,  TRAVEL_ACTIVITY_FOCUS,  TRAVEL_ACTIVITY_STYLE],
    nightlife:           [BUDGET_CONTROL, BOYS_NIGHTLIFE_FOCUS,   BOYS_ACTIVITY_FOCUS],
    dining:              [BUDGET_CONTROL, BOYS_DINING_FOCUS,      BOYS_ACTIVITY_FOCUS],
    "party-services":    [BUDGET_CONTROL, PARTY_SERVICE_FOCUS,    PARTY_ENTERTAINMENT_FOCUS],
  },

  // ─── ANNIVERSARY TRIP ────────────────────────────────────
  "anniversary-trip": {
    accommodations:      [BUDGET_CONTROL, ANNIVERSARY_VENUE_FOCUS,  GIRLS_SPA_FOCUS],
    experiences:         [BUDGET_TIERED,  TRAVEL_ACTIVITY_FOCUS,    PROPOSAL_SERVICE_FOCUS],
    dining:              [BUDGET_CONTROL, PROPOSAL_DINING_FOCUS,    ANNIVERSARY_VENUE_FOCUS],
    "spa-wellness":      [BUDGET_CONTROL, GIRLS_SPA_FOCUS,          RETREAT_SERVICE_FOCUS],
    "special-touches":   [BUDGET_CONTROL, PARTY_SERVICE_FOCUS,      ANNIVERSARY_ENTERTAINMENT_FOCUS],
  },

  // ─── TRAVEL ──────────────────────────────────────────────
  travel: {
    activities: [BUDGET_TIERED,  TRAVEL_ACTIVITY_FOCUS, TRAVEL_ACTIVITY_STYLE],
    dining:     [BUDGET_CONTROL, TRAVEL_DINING_FOCUS,   TRAVEL_SERVICE_FOCUS],
    services:   [BUDGET_CONTROL, TRAVEL_SERVICE_FOCUS,  TRAVEL_ACTIVITY_FOCUS],
  },

  // ─── WEDDING ─────────────────────────────────────────────
  wedding: {
    vendors: [WEDDING_VENDOR_FOCUS, BUDGET_CONTROL, WEDDING_VENDOR_STYLE],
    venues:  [WEDDING_VENUE_STYLE,  BUDGET_CONTROL, WEDDING_VENDOR_STYLE],
  },

  // ─── CORPORATE EVENTS (+ alias "corporate") ──────────────
  "corporate-events": {
    "team-activities":  [CORPORATE_ACTIVITY_FOCUS, BUDGET_CONTROL,  CORPORATE_CATERING_FOCUS],
    venues:             [CORPORATE_VENUE_FOCUS,    BUDGET_CONTROL,  CORPORATE_CATERING_FOCUS],
    catering:           [CORPORATE_CATERING_FOCUS, BUDGET_TIERED,   CORPORATE_ACTIVITY_FOCUS],
  },

  // ─── DATE NIGHT (+ alias "romance") ──────────────────────
  "date-night": {
    dining:        [BUDGET_CONTROL, DATE_DINING_FOCUS,        DATE_ENTERTAINMENT_FOCUS],
    activities:    [BUDGET_TIERED,  DATE_ACTIVITY_FOCUS,      DATE_ENTERTAINMENT_FOCUS],
    entertainment: [BUDGET_CONTROL, DATE_ENTERTAINMENT_FOCUS, DATE_ACTIVITY_FOCUS],
    services:      [BUDGET_CONTROL, DATE_SERVICE_FOCUS,       DATE_DINING_FOCUS],
  },

  // ─── PROPOSAL ────────────────────────────────────────────
  proposal: {
    locations:     [BUDGET_CONTROL, PROPOSAL_LOCATION_FOCUS, PROPOSAL_SERVICE_FOCUS],
    services:      [BUDGET_CONTROL, PROPOSAL_SERVICE_FOCUS,  PROPOSAL_LOCATION_FOCUS],
    dining:        [BUDGET_CONTROL, PROPOSAL_DINING_FOCUS,   PROPOSAL_SERVICE_FOCUS],
    accommodations:[BUDGET_CONTROL, PROPOSAL_LOCATION_FOCUS, PROPOSAL_DINING_FOCUS],
  },

  // ─── BIRTHDAY ────────────────────────────────────────────
  birthday: {
    venues:        [BUDGET_CONTROL,   BIRTHDAY_VENUE_FOCUS,         PARTY_CATERING_FOCUS],
    activities:    [BUDGET_TIERED,    BIRTHDAY_ACTIVITY_FOCUS,      BIRTHDAY_ENTERTAINMENT_FOCUS],
    dining:        [BUDGET_CONTROL,   TRAVEL_DINING_FOCUS,          PARTY_CATERING_FOCUS],
    entertainment: [BUDGET_CONTROL,   BIRTHDAY_ENTERTAINMENT_FOCUS, BIRTHDAY_ACTIVITY_FOCUS],
    services:      [BUDGET_CONTROL,   BIRTHDAY_SERVICE_FOCUS,       BIRTHDAY_ENTERTAINMENT_FOCUS],
  },

  // ─── BOYS TRIP ───────────────────────────────────────────
  "boys-trip": {
    activities:    [BUDGET_TIERED,  BOYS_ACTIVITY_FOCUS,   BOYS_DINING_FOCUS],
    nightlife:     [BUDGET_CONTROL, BOYS_NIGHTLIFE_FOCUS,  BOYS_ACTIVITY_FOCUS],
    dining:        [BUDGET_CONTROL, BOYS_DINING_FOCUS,     BOYS_ACTIVITY_FOCUS],
    accommodations:[BUDGET_CONTROL, BOYS_ACTIVITY_FOCUS,   BOYS_NIGHTLIFE_FOCUS],
  },

  // ─── GIRLS TRIP ──────────────────────────────────────────
  "girls-trip": {
    activities:    [BUDGET_TIERED,  GIRLS_ACTIVITY_FOCUS,   GIRLS_DINING_FOCUS],
    spa:           [BUDGET_CONTROL, GIRLS_SPA_FOCUS,        GIRLS_ACTIVITY_FOCUS],
    nightlife:     [BUDGET_CONTROL, GIRLS_NIGHTLIFE_FOCUS,  GIRLS_ACTIVITY_FOCUS],
    dining:        [BUDGET_CONTROL, GIRLS_DINING_FOCUS,     GIRLS_SPA_FOCUS],
    accommodations:[BUDGET_CONTROL, GIRLS_ACTIVITY_FOCUS,   GIRLS_SPA_FOCUS],
  },

  // ─── RETREATS ────────────────────────────────────────────
  retreats: {
    venues:        [BUDGET_CONTROL, RETREAT_VENUE_FOCUS,    RETREAT_ACTIVITY_FOCUS],
    activities:    [BUDGET_TIERED,  RETREAT_ACTIVITY_FOCUS, RETREAT_SERVICE_FOCUS],
    services:      [BUDGET_CONTROL, RETREAT_SERVICE_FOCUS,  RETREAT_ACTIVITY_FOCUS],
    dining:        [BUDGET_CONTROL, RETREAT_DINING_FOCUS,   RETREAT_ACTIVITY_FOCUS],
    wellness:      [BUDGET_CONTROL, RETREAT_SERVICE_FOCUS,  RETREAT_ACTIVITY_FOCUS],
  },

  // ─── REUNIONS ────────────────────────────────────────────
  reunions: {
    venues:        [BUDGET_CONTROL, REUNION_VENUE_FOCUS,    REUNION_ACTIVITY_FOCUS],
    activities:    [BUDGET_TIERED,  REUNION_ACTIVITY_FOCUS, REUNION_CATERING_FOCUS],
    catering:      [BUDGET_CONTROL, REUNION_CATERING_FOCUS, REUNION_VENUE_FOCUS],
    accommodations:[BUDGET_CONTROL, REUNION_VENUE_FOCUS,    REUNION_ACTIVITY_FOCUS],
  },

  // ─── WEDDING ANNIVERSARIES ───────────────────────────────
  "wedding-anniversaries": {
    venues:        [BUDGET_CONTROL, ANNIVERSARY_VENUE_FOCUS,         ANNIVERSARY_CATERING_FOCUS],
    catering:      [BUDGET_CONTROL, ANNIVERSARY_CATERING_FOCUS,      ANNIVERSARY_VENUE_FOCUS],
    entertainment: [BUDGET_CONTROL, ANNIVERSARY_ENTERTAINMENT_FOCUS, ANNIVERSARY_VENUE_FOCUS],
    photography:   [BUDGET_CONTROL, PARTY_PHOTO_FOCUS,               ANNIVERSARY_VENUE_FOCUS],
  },

  // ─── BABY SHOWER ─────────────────────────────────────────
  "baby-shower": {
    venues:        [BUDGET_CONTROL, PARTY_VENUE_FOCUS,       PARTY_CATERING_FOCUS],
    catering:      [BUDGET_CONTROL, PARTY_CATERING_FOCUS,    PARTY_VENUE_FOCUS],
    decor:         [BUDGET_CONTROL, PARTY_SERVICE_FOCUS,     PARTY_VENUE_FOCUS],
    entertainment: [BUDGET_CONTROL, PARTY_ENTERTAINMENT_FOCUS, PARTY_SERVICE_FOCUS],
  },

  // ─── GRADUATION PARTY ────────────────────────────────────
  "graduation-party": {
    venues:        [BUDGET_CONTROL, PARTY_VENUE_FOCUS,        PARTY_CATERING_FOCUS],
    catering:      [BUDGET_CONTROL, PARTY_CATERING_FOCUS,     PARTY_VENUE_FOCUS],
    entertainment: [BUDGET_CONTROL, PARTY_ENTERTAINMENT_FOCUS, PARTY_SERVICE_FOCUS],
    decor:         [BUDGET_CONTROL, PARTY_SERVICE_FOCUS,      PARTY_ENTERTAINMENT_FOCUS],
  },

  // ─── ENGAGEMENT PARTY ────────────────────────────────────
  "engagement-party": {
    venues:        [BUDGET_CONTROL, ANNIVERSARY_VENUE_FOCUS,   PARTY_CATERING_FOCUS],
    catering:      [BUDGET_CONTROL, PARTY_CATERING_FOCUS,      ANNIVERSARY_VENUE_FOCUS],
    entertainment: [BUDGET_CONTROL, PARTY_ENTERTAINMENT_FOCUS, ANNIVERSARY_VENUE_FOCUS],
    photography:   [BUDGET_CONTROL, PARTY_PHOTO_FOCUS,         PROPOSAL_SERVICE_FOCUS],
  },

  // ─── HOUSEWARMING PARTY ──────────────────────────────────
  "housewarming-party": {
    catering:      [BUDGET_CONTROL, PARTY_CATERING_FOCUS,      PARTY_VENUE_FOCUS],
    decor:         [BUDGET_CONTROL, PARTY_SERVICE_FOCUS,       PARTY_VENUE_FOCUS],
    entertainment: [BUDGET_CONTROL, PARTY_ENTERTAINMENT_FOCUS, PARTY_CATERING_FOCUS],
    services:      [BUDGET_CONTROL, PARTY_SERVICE_FOCUS,       PARTY_ENTERTAINMENT_FOCUS],
  },

  // ─── RETIREMENT PARTY ────────────────────────────────────
  "retirement-party": {
    venues:        [BUDGET_CONTROL, PARTY_VENUE_FOCUS,               ANNIVERSARY_CATERING_FOCUS],
    catering:      [BUDGET_CONTROL, PARTY_CATERING_FOCUS,            TRAVEL_SERVICE_FOCUS],
    entertainment: [BUDGET_CONTROL, ANNIVERSARY_ENTERTAINMENT_FOCUS, PARTY_SERVICE_FOCUS],
    gifts:         [BUDGET_CONTROL, PARTY_SERVICE_FOCUS,             PARTY_PHOTO_FOCUS],
  },

  // ─── CAREER ACHIEVEMENT PARTY ────────────────────────────
  "career-achievement-party": {
    venues:        [BUDGET_CONTROL, CORPORATE_VENUE_FOCUS,           ANNIVERSARY_ENTERTAINMENT_FOCUS],
    catering:      [BUDGET_CONTROL, CORPORATE_CATERING_FOCUS,        TRAVEL_SERVICE_FOCUS],
    entertainment: [BUDGET_CONTROL, ANNIVERSARY_ENTERTAINMENT_FOCUS, PARTY_SERVICE_FOCUS],
  },

  // ─── FAREWELL PARTY ──────────────────────────────────────
  "farewell-party": {
    venues:        [BUDGET_CONTROL, PARTY_VENUE_FOCUS,        PARTY_CATERING_FOCUS],
    catering:      [BUDGET_CONTROL, PARTY_CATERING_FOCUS,     PARTY_VENUE_FOCUS],
    entertainment: [BUDGET_CONTROL, PARTY_ENTERTAINMENT_FOCUS, PARTY_SERVICE_FOCUS],
    keepsakes:     [BUDGET_CONTROL, PARTY_PHOTO_FOCUS,        PARTY_SERVICE_FOCUS],
  },

  // ─── HOLIDAY PARTY ───────────────────────────────────────
  "holiday-party": {
    venues:        [BUDGET_CONTROL, PARTY_VENUE_FOCUS,        PARTY_CATERING_FOCUS],
    catering:      [BUDGET_CONTROL, PARTY_CATERING_FOCUS,     PARTY_VENUE_FOCUS],
    decor:         [BUDGET_CONTROL, PARTY_SERVICE_FOCUS,      PARTY_VENUE_FOCUS],
    entertainment: [BUDGET_CONTROL, PARTY_ENTERTAINMENT_FOCUS, PARTY_SERVICE_FOCUS],
    services:      [BUDGET_CONTROL, PARTY_SERVICE_FOCUS,      PARTY_ENTERTAINMENT_FOCUS],
  },
};

/**
 * Every tag token currently active across all controls.
 * Expand this list when adding new tag-based controls.
 */
export const SEEDED_TAG_VOCAB = [
  // Verified (travel/wedding/corporate catalog rows)
  "photography", "floral", "music", "zen", "sake", "craft",
  // High-confidence topical tags (plausible in provider_services name/description)
  "cultural", "adventure", "wellness", "tour", "tasting",
  "local", "fine", "romantic", "traditional", "modern",
  "garden", "winery", "ballroom", "conference", "creative",
  "buffet", "plated", "catering", "dining", "entertainment",
] as const;
