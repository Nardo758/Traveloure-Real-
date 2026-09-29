import { sql } from "drizzle-orm";
import { db } from "../db";
import { PEN_OCCASION_KEYS } from "@shared/trip-context-occasion";

/**
 * THE ONE WRITER OF A PLAN'S OCCASION INTO ITS PEN (ledger `2026-09-26-occasion-read-only`).
 *
 * A trip-scoped `trip_contexts` row's occasion keys are changed HERE and nowhere else. The bulk pen
 * push (`PUT /api/trip-context?tripId=`) never contributes them — whatever a client sends — so a
 * read surface (opening a slip, reading a template page) cannot rewrite a plan's occasion by
 * accident. The only caller is `PATCH /api/trips/:tripId/occasion`, the plan modal's owner-gated,
 * pick-based occasion rail, which writes `trips.event_type` in the same request.
 *
 * `occasion === null` clears the three keys (an explicit "no occasion"). Keys the caller does not
 * name are left as they are. The user is the session owner the route already verified.
 */
export async function writePlanPenOccasion(
  userId: string,
  tripId: string,
  occasion: Partial<Record<(typeof PEN_OCCASION_KEYS)[number], string>> | null,
): Promise<void> {
  const next: Record<string, string> = {};
  if (occasion) {
    for (const key of PEN_OCCASION_KEYS) {
      const value = occasion[key];
      if (typeof value === "string" && value.length > 0) next[key] = value;
    }
  }
  // Which stored keys this write replaces: all three on a clear, else only the ones it names.
  const replaced = occasion === null ? [...PEN_OCCASION_KEYS] : Object.keys(next);
  if (replaced.length === 0) return;
  const json = JSON.stringify(next);
  const removeList = sql.raw(`ARRAY[${replaced.map((k) => `'${k}'`).join(", ")}]::text[]`);
  await db.execute(sql`
    INSERT INTO trip_contexts (user_id, trip_id, context, updated_at)
    VALUES (${userId}, ${tripId}, ${json}::jsonb, NOW())
    ON CONFLICT (user_id, trip_id) WHERE trip_id IS NOT NULL
    DO UPDATE SET context = (trip_contexts.context - ${removeList}) || ${json}::jsonb,
                  updated_at = NOW()
  `);
}

/**
 * THE PLAN'S RECORDED FINE OCCASION — read beside its ONE writer (ledger `2026-09-29-a1-trips-frame`).
 *
 * The occasion slug the plan modal recorded into the OWNER's plan-scoped pen row. Keyed on the trip
 * owner, never the viewer: an advisor or delegate reading the plan sees the same occasion the owner
 * chose. Returns `null` when nothing was recorded — never a nearest guess (§13) — and never throws
 * (a failed read is `null`; the caller's other attempts still run).
 */
export async function readPlanPenOccasionSlug(ownerId: string | null | undefined, tripId: string): Promise<string | null> {
  if (!ownerId || !tripId) return null;
  try {
    const result = await db.execute(sql`
      SELECT context->>'experienceSlug' AS slug FROM trip_contexts
      WHERE user_id = ${ownerId} AND trip_id = ${tripId}
      LIMIT 1
    `);
    const slug = (result.rows?.[0] as { slug?: unknown } | undefined)?.slug;
    return typeof slug === "string" && slug.trim().length > 0 ? slug.trim() : null;
  } catch {
    return null;
  }
}
