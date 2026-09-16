/**
 * BUNDLE COMPONENT STATES — the server side of `booking_component_states` (migration 306).
 *
 * Decision-maker ruling 2026-09-15 (punchlist D-32 / D-33 / D-34 / D-35, all option A; ledger
 * `2026-09-16-d32-d35-bundle-components`). Content of record:
 * `docs/design/BUNDLE_PARTIAL_COMPLETION_BRIEF.md`. The PURE half — the parent derivation and the
 * reduced figures — is `shared/bundle-component-states.ts`; this module is the three things that
 * touch the database: BIRTH (the checkout composer), READ (rows first, legacy jsonb second, the
 * source NAMED), and the two atomic component TRANSITIONS.
 *
 * IMPORTS NO `storage`. `storage.createServiceBooking` calls `bornBundleComponentRows` inside its
 * birth transaction and `storage.mintCompletionEarningsForBooking` calls `readBundleComponentRows`
 * inside the flip's transaction, so this module must sit BELOW storage in the import graph.
 *
 * §15 SHAPE. Every component transition is ONE statement whose WHERE clause is the guard —
 * `status = 'pending'` on the component AND `status IN (<from-states>)` on the parent — so a double
 * call, a retry and two concurrent owners produce exactly one flip; the loser matches zero rows and
 * is told so. Nothing here is a check-then-update.
 *
 * §13 SHAPE. A booking with no rows is a LEGACY booking, read from `booking_details` and reported as
 * `componentStateSource: "legacy_jsonb"`; nothing manufactures rows for it (no backfill), and a
 * failure declaration on it is REFUSED with the reason rather than filed into a jsonb key that no
 * atomic conditional could later claim. A component with no snapshotted price is `null`, never 0.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { bookingComponentStates, bundleComponents } from "@shared/schema";
import {
  BUNDLE_COMPONENT_STATUS,
  snapshotPriceCentsOf,
  type BundleComponentView,
} from "@shared/bundle-component-states";

/** The executor shape both `db` and a drizzle `tx` satisfy. */
type Executor = Pick<typeof db, "insert" | "select" | "update" | "execute">;

/** One purchase-time snapshot entry as `payments.routes.ts` writes it (D-33 added `priceCents`). */
export interface BundleSnapshotEntry {
  id: string;
  serviceName?: string | null;
  /** Integer cents, SERVER-DERIVED from the catalog at checkout. Absent on a pre-D-33 snapshot. */
  priceCents?: number;
}

/**
 * BIRTH — one `pending` row per snapshot entry, in the caller's transaction. Called by the checkout
 * claim's composer (`storage.createServiceBooking`) and by nothing else: the §19d "server composer
 * keeps a named exemption" posture, the client-facing birth rail having stripped the snapshot key.
 *
 * Idempotent under the UNIQUE (booking_id, component_service_id): a duplicate id inside one snapshot
 * (a bundle listing the same component twice) lands ONE row — `ON CONFLICT DO NOTHING` — rather than
 * failing the booking's birth. Position is the snapshot's own order. Returns the rows written.
 */
export async function bornBundleComponentRows(
  exec: Executor,
  bookingId: string,
  snapshot: readonly unknown[],
): Promise<number> {
  const values = snapshot
    .map((entry, position) => {
      const e = entry as BundleSnapshotEntry | null;
      const componentServiceId = typeof e?.id === "string" ? e.id.trim() : "";
      if (!componentServiceId) return null;
      return {
        bookingId,
        componentServiceId,
        position,
        serviceName: typeof e?.serviceName === "string" ? e.serviceName : null,
        status: BUNDLE_COMPONENT_STATUS.pending,
        snapshotPriceCents: snapshotPriceCentsOf(e), // null = not captured, never 0 (§13)
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  if (values.length === 0) return 0;
  const inserted = await exec
    .insert(bookingComponentStates)
    .values(values)
    .onConflictDoNothing({ target: [bookingComponentStates.bookingId, bookingComponentStates.componentServiceId] })
    .returning({ id: bookingComponentStates.id });
  return inserted.length;
}

export type ComponentStateSource = "rows" | "legacy_jsonb";

export interface BundleComponentStates {
  /** WHICH record answered — a reader that cannot say this cannot be trusted about the rest (§13). */
  source: ComponentStateSource;
  components: Array<BundleComponentView & { serviceName: string | null; position: number | null }>;
}

/** The child rows for one booking, in snapshot order. Empty for a legacy booking. */
export async function readBundleComponentRows(exec: Executor, bookingId: string) {
  return exec
    .select()
    .from(bookingComponentStates)
    .where(eq(bookingComponentStates.bookingId, bookingId))
    .orderBy(asc(bookingComponentStates.position), asc(bookingComponentStates.createdAt));
}

/**
 * READ — the component states for one booking, ROWS FIRST and the legacy jsonb SECOND, with the
 * source NAMED. The legacy shape is exactly what `resolveCompletionEligibility`'s bundle arm read
 * before migration 306: the purchase-time `bundleComponents` snapshot (or, failing that, the live
 * `bundle_components` join) for WHICH components, and `componentCompletions` for which are done.
 * A legacy component is `completed` or `pending` and nothing else — the jsonb never held FAILED —
 * and carries no price, which is why a legacy booking can never be partially completed.
 */
export async function readBundleComponentStates(input: {
  bookingId: string;
  bookingDetails: Record<string, unknown> | null | undefined;
  bundleServiceId: string | null;
  exec?: Executor;
}): Promise<BundleComponentStates> {
  const exec = input.exec ?? db;
  const rows = await readBundleComponentRows(exec, input.bookingId);
  if (rows.length > 0) {
    return {
      source: "rows",
      components: rows.map((r) => ({
        componentServiceId: r.componentServiceId,
        status: r.status,
        snapshotPriceCents: r.snapshotPriceCents ?? null,
        serviceName: r.serviceName ?? null,
        position: r.position ?? null,
      })),
    };
  }

  const details = (input.bookingDetails ?? {}) as Record<string, any>;
  const snapshot = Array.isArray(details.bundleComponents) ? (details.bundleComponents as unknown[]) : null;
  const ids: Array<{ id: string; serviceName: string | null }> = snapshot
    ? snapshot
        .map((c: any) => ({ id: String(c?.id ?? ""), serviceName: typeof c?.serviceName === "string" ? c.serviceName : null }))
        .filter((c) => c.id.length > 0)
    : input.bundleServiceId
      ? await exec
          .select({ id: bundleComponents.componentServiceId })
          .from(bundleComponents)
          .where(eq(bundleComponents.bundleServiceId, input.bundleServiceId))
          .orderBy(asc(bundleComponents.position))
          .then((r) => r.map((x) => ({ id: x.id, serviceName: null })))
      : [];
  const done = (details.componentCompletions ?? {}) as Record<string, unknown>;
  return {
    source: "legacy_jsonb",
    components: ids.map((c, position) => ({
      componentServiceId: c.id,
      status: done[c.id] ? BUNDLE_COMPONENT_STATUS.completed : BUNDLE_COMPONENT_STATUS.pending,
      snapshotPriceCents: null, // the legacy snapshot carried no price (§13: not captured)
      serviceName: c.serviceName,
      position,
    })),
  };
}

export type ComponentClaimResult =
  /** This call moved the row. */
  | { claimed: true }
  /** The row was already out of `pending` (a retry, a double click, a concurrent owner) or the parent
   *  is no longer in a from-state the transition may consume. `currentStatus` says which. */
  | { claimed: false; currentStatus: string | null };

async function readComponentStatus(exec: Executor, bookingId: string, componentServiceId: string): Promise<string | null> {
  const [row] = await exec
    .select({ status: bookingComponentStates.status })
    .from(bookingComponentStates)
    .where(and(eq(bookingComponentStates.bookingId, bookingId), eq(bookingComponentStates.componentServiceId, componentServiceId)));
  return row?.status ?? null;
}

/**
 * TRANSITION — `pending → completed` for ONE component. The statement is the guard: the component
 * must still be `pending` and the parent must still be in `parentFromStatuses`. Stamps `completed_at`
 * in the same UPDATE, so a completed row can never lack its instant.
 */
export async function claimComponentCompleted(input: {
  bookingId: string;
  componentServiceId: string;
  parentFromStatuses: readonly string[];
  now: Date;
  exec?: Executor;
}): Promise<ComponentClaimResult> {
  const exec = input.exec ?? db;
  const updated = await exec
    .update(bookingComponentStates)
    .set({ status: BUNDLE_COMPONENT_STATUS.completed, completedAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(bookingComponentStates.bookingId, input.bookingId),
        eq(bookingComponentStates.componentServiceId, input.componentServiceId),
        eq(bookingComponentStates.status, BUNDLE_COMPONENT_STATUS.pending),
        parentInStatuses(input.bookingId, input.parentFromStatuses),
      ),
    )
    .returning({ id: bookingComponentStates.id });
  if (updated.length > 0) return { claimed: true };
  return { claimed: false, currentStatus: await readComponentStatus(exec, input.bookingId, input.componentServiceId) };
}

/**
 * TRANSITION — `pending → failed` for ONE component, the seller's statement that this component will
 * NOT be delivered. Same guard shape as the completion claim. `failure_reason` is the seller's words
 * (already bounded by the route's `.strict()` allowlist), stored verbatim; NULL = no reason given,
 * never "no reason".
 */
export async function claimComponentFailed(input: {
  bookingId: string;
  componentServiceId: string;
  parentFromStatuses: readonly string[];
  reason: string | null;
  now: Date;
  exec?: Executor;
}): Promise<ComponentClaimResult> {
  const exec = input.exec ?? db;
  const updated = await exec
    .update(bookingComponentStates)
    .set({
      status: BUNDLE_COMPONENT_STATUS.failed,
      failedAt: input.now,
      failureReason: input.reason,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(bookingComponentStates.bookingId, input.bookingId),
        eq(bookingComponentStates.componentServiceId, input.componentServiceId),
        eq(bookingComponentStates.status, BUNDLE_COMPONENT_STATUS.pending),
        parentInStatuses(input.bookingId, input.parentFromStatuses),
      ),
    )
    .returning({ id: bookingComponentStates.id });
  if (updated.length > 0) return { claimed: true };
  return { claimed: false, currentStatus: await readComponentStatus(exec, input.bookingId, input.componentServiceId) };
}

/** The parent-status half of both guards, as a SQL predicate inside the one UPDATE. */
function parentInStatuses(bookingId: string, statuses: readonly string[]) {
  const list = statuses.length > 0 ? statuses : ["__none__"];
  return sql`EXISTS (
    SELECT 1 FROM service_bookings sb
    WHERE sb.id = ${bookingId} AND sb.status IN (${sql.join(list.map((s) => sql`${s}`), sql`, `)})
  )`;
}
