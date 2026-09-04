/**
 * OCCASION ROLES ON AN EVENT ROW — the ONE server-side resolution of
 * `user_experiences.experience_type_id` → `experience_types.roles_needed`.
 * Ledger `2026-09-04-which-event-hint`; cites `2026-09-04-roles-needed` (migration 280) and
 * `2026-09-04-which-event-picker`; CLAUDE.md Locked Decisions 29 and 31.
 *
 * WHY A MODULE AND NOT TWO INLINE JOINS. An event inside a plan is ONE `user_experiences` row
 * (Locked Decision 29) and TWO reads ship those rows to the client: the user-scoped
 * `GET /api/user-experiences` list (what the "Which event?" picker reads out of its query cache)
 * and the plancard payload's `events` array (behind that route's owner/advisor/author gate). The
 * roles an occasion needs live one table over, on `experience_types`. Two handlers writing that
 * join two ways is the derivation-drift class §18 rule 1 names — and a divergence would show up as
 * a hint that appears on one surface and not the other for the same event.
 *
 * READ EXPOSURE ONLY. Nothing here writes. `roles_needed` has exactly ONE author — the seeder
 * (`server/seeds/experience-template-tabs.seed.ts`), by UPDATE keyed on `slug` — and Locked
 * Decision 31 keeps it that way; this is a reader and must never become a second author.
 *
 * §13 — THE THREE ABSENCES ARE ALL THE SAME ANSWER, AND ALL OF THEM ARE `null`:
 *   · the event names no occasion (`experience_type_id` is NULL — possible on the row shape),
 *   · the occasion row is gone,
 *   · the occasion's `roles_needed` is NULL (NOT SET — no DEFAULT, no CHECK, publish-trap posture).
 * Every one of them means WE WERE NEVER TOLD, so the field goes out as `null` and every reader
 * omits its hint. It is never `[]`: an empty array would read as "this occasion needs nobody",
 * which is a claim only a planner can make, and Locked Decision 31 refuses that second empty state
 * explicitly. The array is passed through EXACTLY as stored — never filtered against
 * `OCCASION_ROLE_KEYS` here, because silently dropping a value would hide a seeding fault from the
 * one place that could notice it; a reader that cannot name a key simply says nothing about it.
 */
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { experienceTypes } from "@shared/schema";

/** The narrow shape this reader needs of an event row: the occasion it names, or nothing. */
export interface HasExperienceTypeId {
  experienceTypeId?: string | null;
}

/** What the wire gains: the occasion's `roles_needed`, or `null` for "we were never told". */
export type WithRolesNeeded<T> = T & { rolesNeeded: string[] | null };

/**
 * `experience_type_id` → `roles_needed`, for the occasions these rows actually name.
 *
 * ONE query for the whole page of rows (an `inArray` over the distinct ids), not one per row.
 * An id with no row in `experience_types` is simply absent from the map, which the caller reads as
 * the same "never told" as a NULL column.
 */
export async function rolesNeededByExperienceType(
  experienceTypeIds: readonly (string | null | undefined)[],
): Promise<Map<string, string[] | null>> {
  const ids = Array.from(new Set(experienceTypeIds.filter((id): id is string => !!id)));
  const out = new Map<string, string[] | null>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ id: experienceTypes.id, rolesNeeded: experienceTypes.rolesNeeded })
    .from(experienceTypes)
    .where(inArray(experienceTypes.id, ids));
  for (const row of rows) {
    out.set(row.id, row.rolesNeeded ?? null);
  }
  return out;
}

/**
 * Attach `rolesNeeded` to a list of event rows, preserving the caller's order exactly (the two
 * callers each have their own ordering rule and neither is this module's business to change).
 */
export async function attachRolesNeeded<T extends HasExperienceTypeId>(
  rows: readonly T[],
): Promise<WithRolesNeeded<T>[]> {
  const byType = await rolesNeededByExperienceType(rows.map((r) => r.experienceTypeId));
  return rows.map((row) => ({
    ...row,
    rolesNeeded: (row.experienceTypeId && byType.get(row.experienceTypeId)) || null,
  }));
}
