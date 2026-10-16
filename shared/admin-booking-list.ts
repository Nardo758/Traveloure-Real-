/**
 * PAY-1c — the admin bookings list's filters (`/admin/bookings`, `GET /api/admin/bookings?kind=…`).
 *
 * ONE parse of the query string, shared by the route (which refuses a bad filter with 400) and the
 * page (which builds the same query). Pure: no db, no I/O.
 */

export const ADMIN_BOOKING_LIST_KINDS = ["service", "legacy", "liteapi"] as const;
export type AdminBookingListKind = (typeof ADMIN_BOOKING_LIST_KINDS)[number];

/** The statuses the page offers. `needs_review` first: it is the queue the list exists for. */
export const ADMIN_BOOKING_LIST_STATUSES = [
  "needs_review",
  "pending",
  "payment_pending",
  "confirmed",
  "completed",
  "cancelled",
  "refunded",
  "disputed",
] as const;

export interface AdminBookingListFilters {
  kind: AdminBookingListKind;
  status: string | null;
  /** Inclusive first day (UTC), YYYY-MM-DD. */
  from: string | null;
  /** Inclusive last day (UTC), YYYY-MM-DD. */
  to: string | null;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function realDay(value: string): boolean {
  const m = DAY.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function one(value: unknown): string | null {
  if (Array.isArray(value)) return null;
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v === "" ? null : v;
}

export type ParsedAdminBookingListQuery =
  | { ok: true; filters: AdminBookingListFilters }
  | { ok: false; message: string };

export function parseAdminBookingListQuery(query: Record<string, unknown>): ParsedAdminBookingListQuery {
  for (const name of ["kind", "status", "from", "to"]) {
    if (Array.isArray(query[name])) return { ok: false, message: `${name} may be given once` };
  }
  const kind = one(query.kind) ?? "service";
  if (!(ADMIN_BOOKING_LIST_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, message: `kind must be one of: ${ADMIN_BOOKING_LIST_KINDS.join(", ")}` };
  }
  const status = one(query.status);
  if (status !== null && !/^[a-z_]{1,40}$/.test(status)) {
    return { ok: false, message: "status must be lower-case letters and underscores" };
  }
  const from = one(query.from);
  const to = one(query.to);
  for (const [name, value] of [["from", from], ["to", to]] as const) {
    if (value !== null && !realDay(value)) return { ok: false, message: `${name} must be a date as YYYY-MM-DD` };
  }
  if (from && to && from > to) return { ok: false, message: "from must not be after to" };
  return { ok: true, filters: { kind: kind as AdminBookingListKind, status, from, to } };
}

/** The query string the page sends for a set of filters (empty values left out). */
export function adminBookingListQueryString(filters: AdminBookingListFilters): string {
  const params = new URLSearchParams({ kind: filters.kind });
  if (filters.status) params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params.toString();
}

/** Where a row links: the PAY-1 detail page for its table. */
export function adminBookingDetailPath(kind: AdminBookingListKind, id: string): string {
  return `/admin/bookings/${kind}/${encodeURIComponent(id)}`;
}
