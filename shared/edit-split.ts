/**
 * The §23 / ruling 112 Q8 EDIT SPLIT — the ONE authored statement of which fields on an
 * APPROVED listing re-enter review when edited (identity edits → `pending_changes`, the
 * approved version stays live) versus applying to the live row immediately (safe edits).
 *
 * S-1 (ledger 2026-08-16-console-sweep, P1): the split is decided ONLY server-side in the
 * PATCH /api/provider/services/:id handler — but the provider was never TOLD the split
 * before editing. The fix's binding constraint: any UI that states the split must READ the
 * server's own list, never restate it client-side (§18 rule 1 — derivation delegates,
 * never re-implements; a client-side copy is the derivation-drift class lane M3 removed
 * from the Catalog preview). This module is that one list: the PATCH handler imports
 * IDENTITY_EDIT_FIELDS from here (so the module IS the handler's own predicate, by
 * construction), and the listing home's "Editing a live listing" panel renders from the
 * same export. A field moving lanes is one edit here, seen by both sides at once.
 *
 * The SAFE lane below is a display summary of the complement ("everything else applies
 * immediately") — the handler never reads it; it exists so the panel can name the common
 * cases in the mock's own words instead of leaving "everything else" implicit.
 */

/** Fields that re-enter review on an approved listing (staged into pending_changes). */
export const IDENTITY_EDIT_FIELDS = [
  "serviceName", "categoryId", "subcategoryId",
  "serviceOfferingTypeId", "expertOfferingTypeId", "offeringTypeKey",
  "deliveryMethod", "productShape",
] as const;

export type IdentityEditField = (typeof IDENTITY_EDIT_FIELDS)[number];

/**
 * Human labels for the identity lane, grouped the way the ratified mock's panel draws them
 * (several columns collapse into one human line — e.g. the three offering FKs are one
 * "Category and offering" row). Keyed by the columns they cover so the grouping provably
 * spans the whole predicate — see IDENTITY_EDIT_LANE_COVERAGE below.
 */
export const IDENTITY_EDIT_LANE: { fields: IdentityEditField[]; label: string }[] = [
  { fields: ["serviceName"], label: "Listing name" },
  {
    fields: ["categoryId", "subcategoryId", "serviceOfferingTypeId", "expertOfferingTypeId", "offeringTypeKey"],
    label: "Category and offering",
  },
  { fields: ["deliveryMethod"], label: "Delivery method" },
  { fields: ["productShape"], label: "Product shape (service / bundle / property)" },
];

// Every identity field must be named by exactly one display row — a field added to
// IDENTITY_EDIT_FIELDS without a display home fails this at type/test time rather than
// silently rendering a panel that under-states the review lane.
export const IDENTITY_EDIT_LANE_COVERAGE: ReadonlySet<IdentityEditField> = new Set(
  IDENTITY_EDIT_LANE.flatMap((row) => row.fields),
);

/**
 * The safe lane, in the mock's own words — edits that apply to the live row immediately.
 * Display copy only (the server's rule is "not identity ⇒ immediate"); listed so the
 * panel can say the common cases out loud.
 */
export const SAFE_EDIT_LANE_LABELS: string[] = [
  "Price and pricing settings",
  "Photos and gallery order",
  "Availability, slots and blackouts",
  "Description wording",
  "What to bring · access notes",
  "Meeting-point pin position",
];
