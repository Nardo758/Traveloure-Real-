/**
 * Which listing owners may appear on a public surface.
 *
 * A pending applicant keeps `users.role = user` until approval. An approved+active
 * listing they own is still not public. An earner or admin stays public (legacy rows
 * have a role and no form). An approved application stays public even if the role
 * update has not landed yet. A rejected row beside a later approved row does not hide
 * the account: approval is EXISTS, not "every row is approved".
 * An account with no application row is not a pending applicant. Public reads keep
 * that owner's already-approved listing (the fixture shape the deliverable gate uses).
 *
 * Storage imports this file. This file does not import storage.
 */
import { sql, type SQL } from "drizzle-orm";
import { EARNER_ROLES } from "@shared/roles";

const PUBLIC_OWNER_ROLES = [...EARNER_ROLES, "admin"] as const;

/** TRUE when this owner column may be shown on a public listing read. */
export function publicListingOwnerSql(ownerUserIdColumn: SQL | { getSQL(): SQL }): SQL {
  const roles = sql.join(PUBLIC_OWNER_ROLES.map((role) => sql`${role}`), sql`, `);
  return sql`(
    EXISTS (SELECT 1 FROM users ou WHERE ou.id = ${ownerUserIdColumn} AND ou.role IN (${roles}))
    OR EXISTS (SELECT 1 FROM local_expert_forms lef WHERE lef.user_id = ${ownerUserIdColumn} AND lef.status = 'approved')
    OR EXISTS (SELECT 1 FROM service_provider_forms spf WHERE spf.user_id = ${ownerUserIdColumn} AND spf.status = 'approved')
    OR (
      NOT EXISTS (SELECT 1 FROM local_expert_forms lef0 WHERE lef0.user_id = ${ownerUserIdColumn})
      AND NOT EXISTS (SELECT 1 FROM service_provider_forms spf0 WHERE spf0.user_id = ${ownerUserIdColumn})
    )
  )`;
}

export async function listingOwnerIsPublic(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const { db } = await import("../db");
  const result = await db.execute(sql`SELECT ${publicListingOwnerSql(sql`${userId}`)} AS ok`);
  const row = (result.rows ?? [])[0] as { ok?: boolean } | undefined;
  return row?.ok === true;
}

/** Drops rows whose owner is not a public listing owner. */
export async function withoutUnapprovedOwnerListings<T>(
  rows: readonly T[],
  ownerOf: (row: T) => string | null | undefined,
): Promise<T[]> {
  const ids = Array.from(new Set(rows.map((row) => ownerOf(row) ?? "").filter(Boolean)));
  if (ids.length === 0) return [...rows];
  const { db } = await import("../db");
  const result = await db.execute(sql`
    SELECT u.id FROM users u
    WHERE u.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      AND ${publicListingOwnerSql(sql`u.id`)}
  `);
  const ok = new Set((result.rows ?? []).map((row: { id?: string }) => String(row.id)));
  return rows.filter((row) => ok.has(ownerOf(row) ?? ""));
}
