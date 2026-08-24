/**
 * dmo_extraction_runs — append-only ledger of every content-ops sweep/ingest pass (CLAUDE.md §17
 * lesson applied by analogy to the admin "Content Ops" page, decision-maker ratified Aug 10 2026;
 * migration 191). Two callers today:
 *   - server/services/youtube-ingestion.service.ts's `ingestYoutubeGuides` (kind
 *     "youtube_ingest") — one row per admin-triggered ingestion call.
 *   - server/jobs/dmoExtractionWarmup.ts's `runDmoExtractionWarmupSweep` (kind "warmup_sweep") —
 *     one row per boot pass.
 *
 * ONE row per invocation, success or not, so the admin page's "last run" line can tell "ran and
 * found nothing" from "never ran" (§17 rule 2, by analogy: silence must be distinguishable from
 * the job not having run). `counts` carries each caller's full stats object verbatim — the two
 * kinds have different shapes (see the callers' own types) and forcing a shared column set would
 * either drop fields or invent placeholders neither caller has (§13).
 *
 * A write failure here must never fail the caller's actual sweep/ingest work — both call sites
 * wrap this in try/catch and log-and-continue rather than letting a ledger write take down real
 * ingestion/extraction output.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { dmoExtractionRuns } from "@workspace/db";

export type DmoExtractionRunKind = "youtube_ingest" | "warmup_sweep";
export type DmoExtractionRunRow = typeof dmoExtractionRuns.$inferSelect;

/** Appends one run row. Never call this in a way that lets a failure here mask real work done. */
export async function recordDmoExtractionRun(
  kind: DmoExtractionRunKind,
  counts: Record<string, unknown>,
): Promise<void> {
  await db.insert(dmoExtractionRuns).values({ kind, counts });
}

/** Most recent run of a given kind, or null if none exist yet (§13 — honest absence, never guessed). */
export async function getLatestDmoExtractionRun(kind: DmoExtractionRunKind): Promise<DmoExtractionRunRow | null> {
  const rows = await db
    .select()
    .from(dmoExtractionRuns)
    .where(eq(dmoExtractionRuns.kind, kind))
    .orderBy(desc(dmoExtractionRuns.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
