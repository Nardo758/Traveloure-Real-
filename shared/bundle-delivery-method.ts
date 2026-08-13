/**
 * S10 (bundle composition, execution-map Gate G4) — the ONE bundle delivery-method derivation,
 * both sides of the wire.
 *
 * Migration 208 (FP-1 / B2) repaired the delivery_method column on rows already on disk by
 * deriving it from the bundle's components at that moment: the method every component agrees on,
 * or `hybrid` when they disagree. `server/routes/provider.routes.ts` runs the identical logic at
 * WRITE time (create/patch), server-clamped, so a newly created or edited bundle is born honest.
 *
 * Both of those are point-in-time snapshots stamped onto the row. A component can be
 * paused/un-approved *after* a bundle is built without anyone touching the bundle itself, which
 * drifts the stored column back to a stale value — the exact defect class B2 fixed once. G4's
 * read-time fix keeps it honest going forward by deriving the DISPLAYED chip fresh on every read
 * (server/routes/content.routes.ts) from the SAME predicate, rather than trusting the stored
 * column. Per CLAUDE.md §18 rule 1 ("derivation delegates — never re-implements"), this module is
 * the single source both call sites import — never re-implemented a second way.
 *
 * IMPORTANT: this module computes a value to DISPLAY. It is never written back to
 * `provider_services.delivery_method` from the read path — the write path (provider.routes.ts)
 * remains the only writer, and even it only writes on an explicit create/patch, never as a side
 * effect of a read.
 */

/** The canonical word for a bundle whose components don't all agree (CLAUDE.md §3, the 7). */
export const MIXED_BUNDLE_DELIVERY_METHOD = "hybrid";

/**
 * Derive a bundle's delivery method from its components' own methods.
 *
 * - No components carry a method at all → `null` ("not derivable" — §13: never guess; the caller
 *   decides the honest fallback, e.g. keep the last-known value already on the row).
 * - Every component agrees → that method.
 * - Components disagree → `MIXED_BUNDLE_DELIVERY_METHOD` ('hybrid').
 *
 * Pure and side-effect free — takes plain method strings (or null/undefined), not rows, so
 * neither call site needs to share a Drizzle row type to use it.
 */
export function deriveBundleDeliveryMethod(
  componentMethods: ReadonlyArray<string | null | undefined>,
): string | null {
  const methods = new Set(
    componentMethods.map((m) => (m ?? "").trim()).filter((m) => m.length > 0),
  );
  if (methods.size === 0) return null;
  if (methods.size === 1) return Array.from(methods)[0]!;
  return MIXED_BUNDLE_DELIVERY_METHOD;
}
