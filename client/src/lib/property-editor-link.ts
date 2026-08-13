/**
 * FP-3 — where a property / property_room row is EDITED (decision-maker ratified, from the
 * service-creation redesign mock):
 *
 *   "A property room's Edit opens its property's editor at the Rooms step — a room has no
 *    service checklist / delivery-method of its own, and sending it into the generic
 *    ServiceForm is a dishonest surface."
 *
 * A property and its rooms ARE `provider_services` rows (migration 153, CLAUDE.md canonical-table
 * rule), so they arrive on every owner read beside ordinary listings. That is a STORAGE fact, not
 * a UI one: the ServiceForm questionnaire asks "how is this delivered / what's included / which
 * delivery method", and a guest room answers none of it. Property + room authoring lives in the
 * Workstation property surface, which is the ONE place that knows about parent/child rooms,
 * per-night pricing and the A3 room-set re-review rule.
 *
 * This module is the single home for that routing decision, so Catalog (the card + preview + pin
 * chip Edit affordances) and the ServiceForm back-door guard can never disagree about which rows
 * belong in the Workstation. The classification is read from the SERVER-derived `productShape`
 * on the fetched row — never from a URL, a query param or any other client-supplied value.
 */

/** Product shapes whose editor is the Workstation property surface, not the ServiceForm. */
export const PROPERTY_EDITOR_SHAPES: ReadonlySet<string> = new Set(["property", "property_room"]);

export interface ProductShapeRow {
  id: string;
  productShape?: string | null;
  /** Set on a `property_room` row — the `provider_services.id` of its parent property. */
  parentServiceId?: string | null;
}

/** True when this row's editor is the Workstation property surface (property or room). */
export function isPropertyEditorShape(productShape: string | null | undefined): boolean {
  return !!productShape && PROPERTY_EDITOR_SHAPES.has(productShape);
}

export function isPropertyRoom(productShape: string | null | undefined): boolean {
  return productShape === "property_room";
}

/**
 * The Workstation deep link for a property/room row, using the `?param=` convention this console
 * already uses for deep links (provider inbox `?tab=`, settings `?tab=`).
 *
 *   property row → /provider/workstation?property=<id>              (opens at Basics)
 *   room row     → /provider/workstation?property=<parent>&room=<id> (opens at the Rooms step)
 *
 * §13: a room whose `parentServiceId` did not arrive is NOT given a guessed parent — the link
 * carries only the room id and the Workstation resolves the parent from its own property read
 * (and says so honestly when it cannot).
 *
 * Returns `null` for any other shape — the caller keeps its existing ServiceForm route.
 */
export function propertyEditorHref(row: ProductShapeRow): string | null {
  if (!isPropertyEditorShape(row.productShape)) return null;
  const params = new URLSearchParams();
  if (isPropertyRoom(row.productShape)) {
    if (row.parentServiceId) params.set("property", row.parentServiceId);
    params.set("room", row.id);
  } else {
    params.set("property", row.id);
  }
  return `/provider/workstation?${params.toString()}`;
}

/**
 * The Edit destination for ANY owner-console listing row. Bundles keep their existing
 * Workstation destination (the bundle builder is a dialog with no deep link yet — filed as the
 * FP-2 "bundle edit links carrying ids" item); everything else keeps the ServiceForm route.
 */
export function listingEditHref(row: ProductShapeRow): string {
  return (
    propertyEditorHref(row) ??
    (row.productShape === "bundle"
      ? "/provider/workstation"
      : `/provider/services/${row.id}/edit`)
  );
}
