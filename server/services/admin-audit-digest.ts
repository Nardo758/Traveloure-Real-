/**
 * Counts for the scheduled admin digest (`admin_digest_24h` only).
 *
 * The window is the trailing 24 hours, computed in SQL. `access_audit_logs.created_at`
 * is `timestamp without time zone`, so a JavaScript Date cutoff can shift with the
 * session time zone. The scheduler runs every 24 hours from boot, not at midnight,
 * so this is not a UTC calendar day.
 *
 * Every row in the window counts. The email prints counts, action names, actor
 * labels and the role stored on the row. It does not print a jsonb payload, an
 * ip address, a user agent, a resource id, or a target user.
 *
 * Read only. A failure here must not be caught in this module: the scheduler
 * loads it in its own try/catch so the other sections still send.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

export const ADMIN_AUDIT_DIGEST_WINDOW_HOURS = 24;
export const ADMIN_AUDIT_DIGEST_ACTION_CAP = 15;
export const ADMIN_AUDIT_DIGEST_ACTOR_CAP = 10;

export interface AdminAuditDigest {
  total: number;
  actorCount: number;
  byAction: { action: string; count: number }[];
  otherActions: { kinds: number; count: number };
  byActor: { actorId: string; label: string; role: string; count: number }[];
  otherActors: { people: number; count: number };
}

interface ActionGroup {
  action: string;
  count: number;
}

interface ActorGroup {
  actorId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string;
  count: number;
}

function asCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

/** "First Last" when both exist, else the email, else the actor id. */
function actorLabel(row: ActorGroup): string {
  if (row.firstName && row.lastName) return `${row.firstName} ${row.lastName}`;
  if (row.email) return row.email;
  return row.actorId;
}

/**
 * Ordering, caps and labels. Caps are applied here, after every group has been
 * fetched, so the remainder counts are the groups that did not fit and the
 * actions those groups hold. `people` is the number of actor-role rows past
 * the cap (one row per actor-role pair). Role orders two rows only when the
 * same person has two roles with the same count.
 */
export function shapeAdminAuditDigest(input: {
  total: number;
  actorCount: number;
  actions: ActionGroup[];
  actors: ActorGroup[];
}): AdminAuditDigest {
  const actions = input.actions
    .map((row) => ({ action: String(row.action), count: asCount(row.count) }))
    .sort((a, b) => (a.count !== b.count ? b.count - a.count : a.action < b.action ? -1 : a.action > b.action ? 1 : 0));
  const keptActions = actions.slice(0, ADMIN_AUDIT_DIGEST_ACTION_CAP);
  const restActions = actions.slice(ADMIN_AUDIT_DIGEST_ACTION_CAP);

  const actors = input.actors
    .map((row) => ({
      actorId: String(row.actorId),
      firstName: text(row.firstName),
      lastName: text(row.lastName),
      email: text(row.email),
      role: String(row.role ?? ""),
      count: asCount(row.count),
    }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      if (a.actorId !== b.actorId) return a.actorId < b.actorId ? -1 : 1;
      if (a.role !== b.role) return a.role < b.role ? -1 : 1;
      return 0;
    });
  const keptActors = actors.slice(0, ADMIN_AUDIT_DIGEST_ACTOR_CAP);
  const restActors = actors.slice(ADMIN_AUDIT_DIGEST_ACTOR_CAP);

  return {
    total: asCount(input.total),
    actorCount: asCount(input.actorCount),
    byAction: keptActions,
    otherActions: {
      kinds: restActions.length,
      count: restActions.reduce((sum, row) => sum + row.count, 0),
    },
    byActor: keptActors.map((row) => ({
      actorId: row.actorId,
      label: actorLabel(row),
      role: row.role,
      count: row.count,
    })),
    otherActors: {
      people: restActors.length,
      count: restActors.reduce((sum, row) => sum + row.count, 0),
    },
  };
}

type SqlRow = Record<string, unknown>;

function rowsOf(result: { rows?: unknown }): SqlRow[] {
  return Array.isArray(result.rows) ? (result.rows as SqlRow[]) : [];
}

/**
 * Three read-only queries. The join matches the admin screen's actor join.
 * Empty table: total 0, no throw.
 */
/** A new fragment per query. The cutoff stays in SQL (`timestamp without time zone`). */
function auditLogWindowFrom() {
  return sql`FROM access_audit_logs aal
    LEFT JOIN users actor ON actor.id = aal.actor_id
    WHERE aal.created_at >= NOW() - make_interval(hours => ${ADMIN_AUDIT_DIGEST_WINDOW_HOURS})`;
}

export async function loadAdminAuditDigest(): Promise<AdminAuditDigest> {
  const totals = await db.execute(sql`
    SELECT count(*)::int AS total,
           count(DISTINCT aal.actor_id)::int AS actor_count
    ${auditLogWindowFrom()}
  `);
  const actions = await db.execute(sql`
    SELECT aal.action AS action,
           count(*)::int AS count
    ${auditLogWindowFrom()}
    GROUP BY aal.action
  `);
  const actors = await db.execute(sql`
    SELECT aal.actor_id AS actor_id,
           aal.actor_role AS role,
           actor.first_name AS first_name,
           actor.last_name AS last_name,
           actor.email AS email,
           count(*)::int AS count
    ${auditLogWindowFrom()}
    GROUP BY aal.actor_id, aal.actor_role, actor.first_name, actor.last_name, actor.email
  `);

  const totalRow = rowsOf(totals)[0] ?? {};
  return shapeAdminAuditDigest({
    total: asCount(totalRow.total),
    actorCount: asCount(totalRow.actor_count),
    actions: rowsOf(actions).map((row) => ({
      action: String(row.action ?? ""),
      count: asCount(row.count),
    })),
    actors: rowsOf(actors).map((row) => ({
      actorId: String(row.actor_id ?? ""),
      firstName: row.first_name == null ? null : String(row.first_name),
      lastName: row.last_name == null ? null : String(row.last_name),
      email: row.email == null ? null : String(row.email),
      role: String(row.role ?? ""),
      count: asCount(row.count),
    })),
  });
}
