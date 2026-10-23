/**
 * Ops gap 7 (ledger `2026-10-22-support-intake-queue`; fix queue row 107): the support inbox over
 * `contact_submissions`. The admin list, the one PATCH write and the digest counts. Rules live in
 * `@shared/support-intake`; the digest shape in `admin-digest-shape.ts`.
 */
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { contactSubmissions, users } from "@shared/schema";
import {
  SUPPORT_FIRST_RESPONSE_HOURS_SETTING,
  SUPPORT_OPEN_STATUSES,
  parseSupportFirstResponseHours,
  patchCountsAsFirstResponse,
  supportSubmissionOverdue,
  type SupportPatchBody,
  type SupportStatus,
} from "@shared/support-intake";
import { supportDigestCounts, type SupportDigestCounts } from "./admin-digest-shape";
import { getPlatformSettingValue } from "./admin-query.service";

export const SUPPORT_LIST_MAX = 200;

export async function loadSupportFirstResponseHours(): Promise<number | null> {
  return parseSupportFirstResponseHours(await getPlatformSettingValue(SUPPORT_FIRST_RESPONSE_HOURS_SETTING));
}

/** Newest first. `status` null = every status. Each row carries `overdue` (null while the target is unset). */
export async function listSupportSubmissions(status: SupportStatus | null, limit: number, now = new Date()) {
  const capped = Math.min(Math.max(1, limit), SUPPORT_LIST_MAX);
  const base = db.select().from(contactSubmissions);
  const rows = await (status
    ? base.where(status === "new" ? or(eq(contactSubmissions.status, "new"), isNull(contactSubmissions.status)) : eq(contactSubmissions.status, status))
    : base
  )
    .orderBy(desc(contactSubmissions.createdAt))
    .limit(capped);
  const firstResponseHours = await loadSupportFirstResponseHours();
  return {
    firstResponseHours,
    submissions: rows.map((r) => ({ ...r, overdue: supportSubmissionOverdue(r, firstResponseHours, now) })),
  };
}

/** Who a submission can be assigned to: admin accounts only, until the support role's screen lands. */
export async function listSupportAssignees(): Promise<Array<{ id: string; name: string }>> {
  const rows = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(eq(users.role, "admin"));
  return rows.map((r) => ({ id: r.id, name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || r.id }));
}

export async function isSupportAssignee(userId: string): Promise<boolean> {
  const r = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.role, "admin"))).limit(1);
  return r.length === 1;
}

export interface SupportPatchFacts {
  status: string | null;
  assignedAdminId: string | null;
  responseNotes: string | null;
  firstResponseAt: Date | null;
}
export type SupportPatchResult =
  | { ok: false; reason: "not_found" }
  | { ok: true; before: SupportPatchFacts; after: SupportPatchFacts; row: typeof contactSubmissions.$inferSelect };

/**
 * One transaction: lock the row, read its before values, write the patch. `first_response_at` is stamped once
 * (COALESCE in the SET), on the first move out of `new` or the first note. `resolved_at` is stamped on a move to
 * `resolved`, as the route did before.
 */
export async function applySupportPatch(id: string, body: SupportPatchBody): Promise<SupportPatchResult> {
  return db.transaction(async (tx) => {
    const locked = await tx.select().from(contactSubmissions).where(eq(contactSubmissions.id, id)).for("update");
    const prior = locked[0];
    if (!prior) return { ok: false as const, reason: "not_found" as const };
    const set: Record<string, unknown> = {};
    if (body.status !== undefined) set.status = body.status;
    if (body.status === "resolved") set.resolvedAt = new Date();
    if (body.assignedAdminId !== undefined) set.assignedAdminId = body.assignedAdminId;
    if (body.responseNotes !== undefined) set.responseNotes = body.responseNotes && body.responseNotes.trim() ? body.responseNotes : null;
    if (patchCountsAsFirstResponse(body)) set.firstResponseAt = sql`COALESCE(${contactSubmissions.firstResponseAt}, NOW())`;
    const [row] = await tx.update(contactSubmissions).set(set).where(eq(contactSubmissions.id, id)).returning();
    const facts = (r: typeof prior): SupportPatchFacts => ({
      status: r.status ?? null,
      assignedAdminId: r.assignedAdminId ?? null,
      responseNotes: r.responseNotes ?? null,
      firstResponseAt: r.firstResponseAt ?? null,
    });
    return { ok: true as const, before: facts(prior), after: facts(row), row };
  });
}

/** The digest's support counts, over open rows only (the only rows any of the three can count). */
export async function loadSupportDigestCounts(now = new Date()): Promise<SupportDigestCounts> {
  const rows = await db
    .select({
      status: contactSubmissions.status,
      assignedAdminId: contactSubmissions.assignedAdminId,
      firstResponseAt: contactSubmissions.firstResponseAt,
      createdAt: contactSubmissions.createdAt,
    })
    .from(contactSubmissions)
    .where(or(inArray(contactSubmissions.status, [...SUPPORT_OPEN_STATUSES]), isNull(contactSubmissions.status)));
  return supportDigestCounts(rows, await loadSupportFirstResponseHours(), now);
}
