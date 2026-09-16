/**
 * D-39 — THE DECLARED WINDOW'S CLOSE ON A COORDINATION ENGAGEMENT (ledger
 * `2026-09-15-d36-d39-completion-declared`; brief Part II §9, §13 D-39, §17 lane 5).
 *
 * `coordination_states` is a DIFFERENT machine from a booking, and this module exists to say so
 * where the close is written. The coordination fee was captured UP FRONT as `platform_revenue`;
 * **NO COORDINATOR EARNING IS EVER MINTED** — not at declaration, not here, not anywhere — and
 * `completed` on an engagement moves NO money. So this pass has exactly ONE effect: once the
 * traveler's window (`coordinationDeclaredAt` + `declaredCompletionWindowDays()`) has passed
 * UNDISPUTED, it says "completed" — the word the coordinator is refused (`window_closes_engagement`)
 * because the window, not the coordinator, is what closes an engagement. What the window GATES is
 * the admin REFUND of the fee (`coordinationRefundWindowGate`), read at the refund route.
 *
 * §15/§18b: the flip is `storage.updateCoordinationStatus(id, 'completed', entry,
 * COORDINATION_WINDOW_CLOSE_FROM_STATUSES)` — `UPDATE … WHERE id = ? AND status IN
 * ('completion_declared')`, so a traveler's `disputed` stops it by construction and a double run is
 * ONE transition and ONE `state_history` entry. `completed_at` is stamped by that writer, once.
 *
 * §13: an engagement whose declaration instant the history does not carry is SKIPPED with the
 * reason, never guessed onto a clock; a window still open is counted as such. One structured line
 * per pass rides the caller's (`bookingAutoCompletion`) — silence stays distinguishable from a dead
 * scheduler.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { coordinationStates } from "@shared/schema";
import {
  COMPLETION_DECLARED_STATUS,
  coordinationDeclaredAt,
  declaredWindowElapsed,
} from "@shared/declared-completion-window";
import { declaredCompletionWindowDays } from "../config/completion-windows.config";
import { COORDINATION_WINDOW_CLOSE_FROM_STATUSES } from "../utils/coordination-from-states";
import { storage } from "../storage";

/** The `state_history` entry the close appends — who said "completed", and on what. */
export const COORDINATION_WINDOW_ELAPSED_ACTOR = "window_elapsed";

export interface CoordinationWindowPassResult {
  scanned: number;
  completed: number;
  completedIds: string[];
  /** reason → count. Every scanned engagement the pass did NOT complete is accounted for here. */
  skipped: Record<string, number>;
}

export async function runCoordinationWindowPass(
  now: Date = new Date(),
  limit = 2000,
): Promise<CoordinationWindowPassResult> {
  const result: CoordinationWindowPassResult = { scanned: 0, completed: 0, completedIds: [], skipped: {} };
  const bump = (reason: string) => {
    result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
  };

  const rows = await db
    .select({ id: coordinationStates.id, status: coordinationStates.status, stateHistory: coordinationStates.stateHistory })
    .from(coordinationStates)
    .where(eq(coordinationStates.status, COMPLETION_DECLARED_STATUS))
    .limit(limit);
  result.scanned = rows.length;

  const windowDays = declaredCompletionWindowDays();
  for (const row of rows) {
    const declaredAt = coordinationDeclaredAt(row.stateHistory);
    if (!declaredAt) {
      bump("no_declaration_timestamp");
      continue;
    }
    if (!declaredWindowElapsed(declaredAt, windowDays, now)) {
      bump("window_open");
      continue;
    }
    const updated = await storage.updateCoordinationStatus(
      row.id,
      "completed",
      {
        actor: COORDINATION_WINDOW_ELAPSED_ACTOR,
        note: "Declared window elapsed undisputed",
        declaredAt: declaredAt.toISOString(),
        windowDays,
      },
      COORDINATION_WINDOW_CLOSE_FROM_STATUSES,
    );
    if (!updated) {
      // Lost the atomic race — the traveler disputed, or another pass won. Nothing was written.
      bump("lost_race");
      continue;
    }
    result.completed += 1;
    result.completedIds.push(row.id);
  }
  return result;
}
