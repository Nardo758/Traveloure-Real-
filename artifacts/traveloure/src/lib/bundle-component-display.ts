/**
 * S10 (bundle composition, execution-map Gate G4) — pure display helpers for a bundle's component
 * list on the traveler service-detail page (client/src/pages/service-detail.tsx).
 *
 * The server (server/routes/content.routes.ts, GET /api/services/:id bundle branch) already
 * enforces the F2 read-gate per component: an `available: true` row is a still-approved+active
 * public listing (only shape that carries an `id`, so only that shape can ever be linked); an
 * `available: false` row is unapproved/paused/missing and carries a `serviceName` ONLY — no id, no
 * image, no method, no description (§13: never a broken link, never invented detail). These
 * helpers are the ONE place that turns that server shape into what the card renders, so the
 * link-or-name-only decision is made in exactly one spot and is unit-testable without a browser.
 *
 * Run: npx tsx --test client/src/lib/__tests__/bundle-component-display.test.ts
 */

export interface AvailableBundleComponentSummary {
  available: true;
  id: string;
  serviceName: string;
  shortDescription: string | null;
  deliveryMethod: string | null;
  serviceImage: string | null;
}

export interface UnavailableBundleComponentSummary {
  available: false;
  serviceName: string;
}

export type BundleComponentSummary =
  | AvailableBundleComponentSummary
  | UnavailableBundleComponentSummary;

/**
 * The link target for a component card, or `null` for an unavailable component — never a broken
 * link. Only an `available: true` row (which is the only shape carrying an `id`) resolves to one.
 */
export function bundleComponentHref(component: BundleComponentSummary): string | null {
  return component.available ? `/services/${component.id}` : null;
}

/** Same "in_person" → "in person" formatting the top-level delivery-method chip already uses. */
export function formatDeliveryMethodLabel(method: string | null | undefined): string | null {
  const trimmed = (method ?? "").trim();
  return trimmed.length > 0 ? trimmed.replace(/_/g, " ") : null;
}

/** The method chip text for one component card — null renders no chip at all, never a blank one. */
export function bundleComponentMethodLabel(component: BundleComponentSummary): string | null {
  return component.available ? formatDeliveryMethodLabel(component.deliveryMethod) : null;
}
