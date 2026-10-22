/**
 * Ops gap 12 (fix queue row 112; ledger `2026-10-22-audit-log-all-actions`): THE AUDIT LOG, ALL ACTIONS.
 * `/admin/audit-log` read only role changes although every admin action writes `access_audit_logs`. This is the paged
 * read over every row, filtered by action, actor, resource and date. Read only; nothing here writes an audit row (that
 * is gap 13). The query parse is pure so the filters and the page-size cap are proven without a database.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";

/** Server-side cap on one page; a larger `limit` is clamped, never refused. */
export const AUDIT_LOG_PAGE_MAX = 100;
export const AUDIT_LOG_PAGE_DEFAULT = 50;

export interface AuditLogFilters {
  action?: string;
  /** An actor's user id, or (with an "@") their email, matched case-insensitively. */
  actor?: string;
  resourceType?: string;
  resourceId?: string;
  /** Local calendar days, YYYY-MM-DD, inclusive (UTC day boundaries). */
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : Array.isArray(v) && typeof v[0] === "string" ? v[0].trim() : "";
  return s ? s.slice(0, 255) : undefined;
};

/** Pure. The filters from a query string, or the reason it is refused (a malformed date or page). */
export function parseAuditLogQuery(q: Record<string, unknown>): { ok: true; filters: AuditLogFilters } | { ok: false; reason: string } {
  const dateFrom = one(q.dateFrom);
  const dateTo = one(q.dateTo);
  if (dateFrom && (!DAY.test(dateFrom) || Number.isNaN(Date.parse(`${dateFrom}T00:00:00Z`)))) return { ok: false, reason: "bad_date_from" };
  if (dateTo && (!DAY.test(dateTo) || Number.isNaN(Date.parse(`${dateTo}T00:00:00Z`)))) return { ok: false, reason: "bad_date_to" };
  const rawLimit = one(q.limit);
  const rawOffset = one(q.offset);
  const limitN = rawLimit === undefined ? AUDIT_LOG_PAGE_DEFAULT : Number(rawLimit);
  const offsetN = rawOffset === undefined ? 0 : Number(rawOffset);
  if (!Number.isInteger(limitN) || limitN < 1) return { ok: false, reason: "bad_limit" };
  if (!Number.isInteger(offsetN) || offsetN < 0) return { ok: false, reason: "bad_offset" };
  const filters: AuditLogFilters = { limit: Math.min(limitN, AUDIT_LOG_PAGE_MAX), offset: offsetN };
  for (const k of ["action", "actor", "resourceType", "resourceId"] as const) {
    const v = one(q[k]);
    if (v) filters[k] = v;
  }
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;
  return { ok: true, filters };
}

function where(f: AuditLogFilters): SQL {
  const parts: SQL[] = [sql`TRUE`];
  if (f.action) parts.push(sql`aal.action = ${f.action}`);
  if (f.actor) {
    parts.push(f.actor.includes("@") ? sql`lower(actor.email) = lower(${f.actor})` : sql`aal.actor_id = ${f.actor}`);
  }
  if (f.resourceType) parts.push(sql`aal.resource_type = ${f.resourceType}`);
  if (f.resourceId) parts.push(sql`aal.resource_id = ${f.resourceId}`);
  if (f.dateFrom) parts.push(sql`aal.created_at >= ${`${f.dateFrom}T00:00:00Z`}::timestamptz`);
  if (f.dateTo) parts.push(sql`aal.created_at < (${`${f.dateTo}T00:00:00Z`}::timestamptz + interval '1 day')`);
  return sql.join(parts, sql` AND `);
}

/** Every audited action matching the filters, newest first, with the total and the filter choices. */
export async function listAuditLogs(f: AuditLogFilters) {
  const w = where(f);
  const rows = await db.execute(sql`
    SELECT aal.id, aal.created_at, aal.action, aal.actor_id, aal.actor_role, aal.resource_type, aal.resource_id,
           aal.target_user_id, aal.metadata,
           actor.first_name AS actor_first_name, actor.last_name AS actor_last_name, actor.email AS actor_email,
           target.email AS target_email
    FROM access_audit_logs aal
    LEFT JOIN users actor ON actor.id = aal.actor_id
    LEFT JOIN users target ON target.id = aal.target_user_id
    WHERE ${w}
    ORDER BY aal.created_at DESC, aal.id DESC
    LIMIT ${f.limit} OFFSET ${f.offset}
  `);
  const count = await db.execute(sql`
    SELECT count(*)::int AS total
    FROM access_audit_logs aal
    LEFT JOIN users actor ON actor.id = aal.actor_id
    WHERE ${w}
  `);
  const actions = await db.execute(sql`SELECT DISTINCT action FROM access_audit_logs ORDER BY action`);
  const resourceTypes = await db.execute(sql`SELECT DISTINCT resource_type FROM access_audit_logs ORDER BY resource_type`);
  return {
    logs: rows.rows as any[],
    total: Number((count.rows[0] as any)?.total ?? 0),
    actions: (actions.rows as any[]).map((r) => String(r.action)),
    resourceTypes: (resourceTypes.rows as any[]).map((r) => String(r.resource_type)),
  };
}
