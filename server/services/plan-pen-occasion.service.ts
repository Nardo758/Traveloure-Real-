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
