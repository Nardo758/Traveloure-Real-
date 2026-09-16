/**
 * ONE table-aware fake drizzle `db` for the route-level suites that mount the REAL
 * `/api/bookings` router with no database (CLAUDE.md §18 rule 1 — one implementation,
 * callers). Callers today: `server/routes/__tests__/booking-idor-guard.test.ts` (node:test)
 * and `server/__tests__/db-role-authorization.test.ts` (vitest).
 *
 * WHY THIS EXISTS. Ledger `2026-09-15-d24-d26-acceptance-columns` made the OWNER branch of
 * `GET /api/bookings/:id` call `describeAcceptance(booking.id)`: a `service_bookings` ⟕
 * `provider_services` select with NO `.limit()` (awaited directly) and — only when the listing
 * takes acceptance — a raw `db.execute` COUNT over `booking_revision_requests`. The IDOR suite's
 * hand-rolled chain grew a `leftJoin` link and a `db.execute` patch to answer that, and the
 * role-authorization suite's separate hand-rolled chain did not — so the same owner read that was
 * green in one suite was a 500 in the other (`TypeError: leftJoin is not a function`, surfaced
 * as `expected 500 to be 200`), and both suites were asserting the same handler. Two copies of
 * one fake diverge the day the handler grows a link; this is the one copy (ledger
 * `2026-09-16-ci-manifest-pin-role-auth-mock`).
 *
 * SHAPES THE CHAIN MUST RESOLVE — and it is thenable at EVERY link, not only at `.limit()`:
 *   - the handler:     db.select().from(serviceBookings).where(...).limit(1)
 *   - the auth layer:  const [u] = await db.select().from(users).where(...)
 *   - describeAcceptance's loadContext:
 *                      const [row] = await db.select({...}).from(serviceBookings)
 *                          .leftJoin(providerServices, ...).where(...)
 *
 * TABLE-AWARE, on purpose: answering a `users` read with a booking row would hand the auth
 * layer a row with no role, and the admin tier would silently fall to `user`. A JOIN adds
 * columns, never rows — the driving table's rows stand. `provider_services` answers NO row, so
 * the fake booking's listing is unknown, `acceptanceModeFor` resolves null and the acceptance
 * read-out is honestly OMITTED (§13) rather than invented; any other table answers nothing
 * rather than a booking row in disguise.
 *
 * `db.execute` answers exactly the revision COUNT and THROWS on anything else, so a new raw
 * read added to the handler surfaces here as a NAMED error instead of a connection attempt
 * against the suite's dummy DATABASE_URL — a 500 in these suites must be an authorization
 * decision, never a mock gap.
 */
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

export type FakeDbUser = { id: string; role: string | null };

/** Answers a table NAME (drizzle's `getTableName`) with the rows the fake holds for it. */
export type RowsForTable = (tableName: string) => object[];

/**
 * The rows the bookings route family reads, resolved LAZILY so a suite may swap the session
 * user or the booking row between tests without rebuilding the chain.
 */
export function bookingRouteRows(source: {
  user: () => FakeDbUser | null;
  bookings: () => object[];
}): RowsForTable {
  return (tableName) => {
    switch (tableName) {
      case "users": {
        const user = source.user();
        return user ? [{ ...user, isDeleted: false, isSuspended: false }] : [];
      }
      case "service_bookings":
        return source.bookings();
      case "provider_services":
        return [];
      default:
        return [];
    }
  };
}

/** A `db.select` replacement: one thenable, join-aware chain per call. */
export function makeTableAwareSelect(rowsFor: RowsForTable): () => any {
  return () => {
    let rows: object[] = [];
    const chain: any = {
      from: (table: any) => {
        rows = rowsFor(getTableName(table));
        return chain;
      },
      // A JOIN adds columns, never rows: the driving table's rows stand.
      leftJoin: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(rows),
      // `await chain` — what the auth reads and describeAcceptance do.
      then: (onFulfilled: any, onRejected: any) =>
        Promise.resolve(rows).then(onFulfilled, onRejected),
    };
    return chain;
  };
}

const dialect = new PgDialect();

/**
 * A `db.execute` replacement: answers the ONE raw read the owner branch can make (the
 * `booking_revision_requests` COUNT, as "no revision rows") and fails loudly on any other.
 */
export function makeRevisionCountOnlyExecute(label: string): (query: unknown) => Promise<any> {
  return async (query: unknown) => {
    const text = typeof query === "string" ? query : dialect.sqlToQuery(query as any).sql;
    if (/\bbooking_revision_requests\b/.test(text)) return { rows: [{ n: 0 }], rowCount: 1 };
    throw new Error(`${label} fake db: unexpected db.execute — ${text}`);
  };
}
