/**
 * DMO EXTRACTION WARMUP SWEEP — part 2 of 3 of the pre-extraction design (decision-maker
 * ratified, Aug 9 2026; see server/services/dmo-place-extraction.service.ts for the shared
 * pipeline and part 1, the admin-approve hook in server/routes/admin.routes.ts).
 *
 * WHY: part 1 (the admin-approve hook) fires extraction the moment a guide-shaped row enters the
 * expert library, but it is fire-and-forget and best-effort — a process restart mid-extraction, a
 * transient AI failure, or simply every row approved BEFORE this landed would otherwise sit
 * unextracted until an expert happens to open it (the original 5-15s on-open delay this whole
 * design exists to avoid). This job is the backstop: once per server boot, it scans for
 * expert-visible, guide-shaped rows with nothing extracted yet and runs the SAME pipeline
 * (`runPlaceExtraction`, source="warmup_sweep") that the hook and the on-demand route use — one
 * implementation, three callers (§15c pattern).
 *
 * SELECTION: expert_workspace_visible = true, not rejected, no dmo_extracted_places child rows
 * yet (a cheap NOT EXISTS — no join fan-out), guide-shaped (classifyDmoShape, applied in JS after
 * the DB narrows the candidate set — the shape rule needs several columns and a regex, not
 * something worth expressing as SQL), and no "concluded empty via live_fetch" marker already on
 * extracted_data (checked in JS too — isConcludedEmptyMarker reads the JSON blob).
 *
 * PACING: sequential, one item at a time, with a delay between items — geocode + AI rate
 * kindness, and it keeps a slow backlog from ever looking like a burst of traffic. Capped per
 * boot; hitting the cap is LOGGED, never silently truncated (CLAUDE.md §18d — a cap must say so).
 *
 * NO KEY, NO CRASH: `runPlaceExtraction` itself no-ops with `{status:"no_api_key"}` when
 * ANTHROPIC_API_KEY is unset (checked per item, after the skip-if-done/shape guards, so a
 * genuinely-cached or non-guide candidate never needed the key in the first place). Every
 * candidate in a truly key-less environment would hit that same result, so rather than log the
 * identical "no key" outcome once per candidate, this job logs it ONCE on the first occurrence and
 * stops the pass there — "exit the sweep cleanly" without spamming or crashing. A future boot with
 * the key present resumes exactly where this one left off (the selection query is stateless).
 *
 * DETECT/EXTRACT, DON'T FABRICATE (§13): a failed or thin-text item is logged and skipped, never
 * given a placeholder result. The one state this job DOES persist is the same "ran via live
 * fetch, concluded empty" marker the on-demand path persists — that emptiness is itself the
 * honest answer, not a failure.
 */

import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { dmoRawContent } from "@workspace/db";
import { logger } from "../infrastructure";
import { classifyDmoShape, runPlaceExtraction } from "../services/dmo-place-extraction.service";
import { isConcludedEmptyMarker } from "../services/dmo-extracted-places.service";
import { recordDmoExtractionRun } from "../services/dmo-extraction-runs.service";

/** Cap on rows processed in a single boot pass. Hitting it is logged, never silent (§18d). */
const PER_BOOT_CAP = 25;

/** Delay between items, in ms — "geocode + AI rate kindness" per the design ruling. */
const INTER_ITEM_DELAY_MS = 3_000;

/** How many candidate rows to pull from the DB before the cap/shape/marker filters are applied.
 *  Generous relative to PER_BOOT_CAP since the shape filter runs in JS and rejects some rows. */
const CANDIDATE_FETCH_LIMIT = 300;

export interface WarmupSweepSummary {
  scanned: number;
  extracted: number;
  emptied: number;
  failed: number;
  skippedCap: number;
  stoppedNoApiKey: boolean;
  durationMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Writes ONE dmo_extraction_runs row (kind "warmup_sweep") per boot pass, success or not — the
// admin Content Ops page's §17-lesson-by-analogy: silence must be distinguishable from "never
// ran". Called from BOTH exit points below (the early selection-query-failed abort and the normal
// completion) so every pass is recorded, not just the ones that finish the loop. A ledger-write
// failure is caught and logged; it must never make an otherwise-successful sweep look like it
// threw.
async function finishWithRunRecord(summary: WarmupSweepSummary): Promise<WarmupSweepSummary> {
  try {
    await recordDmoExtractionRun("warmup_sweep", summary as unknown as Record<string, unknown>);
  } catch (err) {
    logger.error({ err }, "[dmo-extraction-warmup] failed to record run ledger row");
  }
  return summary;
}

type WarmupCandidateRow = {
  id: string;
  name: string | null;
  latitude: string | null;
  longitude: string | null;
  address: string | null;
  description: string | null;
  extractedData: unknown;
};

/**
 * The selection query, exported separately from the run loop so it can be proven in isolation
 * (and reused if a future admin surface wants to preview the backlog without running it).
 * Narrows in SQL what SQL can cheaply narrow (visibility, rejection status, "has any child rows
 * at all"); the shape classification and the concluded-empty-marker check run in JS on the
 * resulting small candidate set because both need multiple columns + a regex / JSON shape check
 * that isn't worth expressing as SQL for a backlog-sized table.
 */
export async function selectWarmupCandidates(limit = CANDIDATE_FETCH_LIMIT): Promise<WarmupCandidateRow[]> {
  const rows = await db
    .select({
      id: dmoRawContent.id,
      name: dmoRawContent.name,
      latitude: dmoRawContent.latitude,
      longitude: dmoRawContent.longitude,
      address: dmoRawContent.address,
      description: dmoRawContent.description,
      extractedData: dmoRawContent.extractedData,
    })
    .from(dmoRawContent)
    .where(
      and(
        eq(dmoRawContent.expertWorkspaceVisible, true),
        ne(dmoRawContent.status, "rejected"),
        // No dmo_extracted_places child rows at all yet — cheap NOT EXISTS, no join fan-out.
        sql`NOT EXISTS (
          SELECT 1 FROM dmo_extracted_places dep WHERE dep.dmo_content_id = ${dmoRawContent.id}
        )`,
      ),
    )
    .limit(limit);

  return rows.filter(
    (row) => classifyDmoShape(row) === "guide" && !isConcludedEmptyMarker(row.extractedData),
  );
}

/**
 * Run one backlog-sweep pass. Never throws — every failure mode (missing API key, a single row's
 * AI/geocode error, a DB error on the selection query itself) is caught and logged; the function
 * always resolves with a summary. Safe to call directly (as the boot scheduler does) or from a
 * script/test.
 */
export async function runDmoExtractionWarmupSweep(): Promise<WarmupSweepSummary> {
  const startedAt = Date.now();
  const summary: WarmupSweepSummary = {
    scanned: 0,
    extracted: 0,
    emptied: 0,
    failed: 0,
    skippedCap: 0,
    stoppedNoApiKey: false,
    durationMs: 0,
  };

  let candidates: WarmupCandidateRow[];
  try {
    candidates = await selectWarmupCandidates();
  } catch (err) {
    logger.error({ err }, "[dmo-extraction-warmup] selection query failed — sweep aborted, nothing processed");
    summary.durationMs = Date.now() - startedAt;
    return finishWithRunRecord(summary);
  }

  if (candidates.length > PER_BOOT_CAP) {
    summary.skippedCap = candidates.length - PER_BOOT_CAP;
    logger.warn(
      { candidateCount: candidates.length, cap: PER_BOOT_CAP, skipped: summary.skippedCap },
      "[dmo-extraction-warmup] backlog exceeds per-boot cap — processing the cap, rest deferred to next boot",
    );
  }
  const toProcess = candidates.slice(0, PER_BOOT_CAP);

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    summary.scanned++;

    try {
      const outcome = await runPlaceExtraction(row.id, { source: "warmup_sweep", actorId: null });

      switch (outcome.status) {
        case "not_found":
          // Row changed under us between selection and processing (e.g. an admin rejected it a
          // moment later) — honest no-op, not a crash.
          summary.failed++;
          logger.info({ contentId: row.id }, "[dmo-extraction-warmup] row no longer eligible, skipped");
          break;
        case "no_api_key":
          // Every remaining candidate would hit the identical result — log ONCE and stop the
          // pass rather than spamming N identical lines. Cleanly exits, does not crash.
          summary.stoppedNoApiKey = true;
          logger.warn(
            "[dmo-extraction-warmup] ANTHROPIC_API_KEY not set — stopping sweep after first attempt " +
              "(honest failure, logged-and-continued; nothing was persisted for this row)",
          );
          break;
        case "thin_text":
          summary.failed++;
          logger.info({ contentId: row.id }, "[dmo-extraction-warmup] thin stored text + unreachable source, skipped");
          break;
        case "ai_error":
          summary.failed++;
          // The service already logged the underlying error; this line just adds it to the tally.
          break;
        case "cached":
        case "extracted":
          if (outcome.places.length > 0) summary.extracted++;
          else summary.emptied++;
          break;
      }

      if (outcome.status === "no_api_key") break;
    } catch (err) {
      // Defense in depth: runPlaceExtraction is designed not to throw for expected failure modes,
      // but a boot job must survive an unexpected one (e.g. the DB connection dropping mid-pass)
      // without taking the server down.
      summary.failed++;
      logger.error({ err, contentId: row.id }, "[dmo-extraction-warmup] unexpected error processing row — logged, sweep continues");
    }

    if (i < toProcess.length - 1) {
      await sleep(INTER_ITEM_DELAY_MS);
    }
  }

  summary.durationMs = Date.now() - startedAt;
  logger.info(
    {
      scanned: summary.scanned,
      extracted: summary.extracted,
      emptied: summary.emptied,
      failed: summary.failed,
      skippedCap: summary.skippedCap,
      stoppedNoApiKey: summary.stoppedNoApiKey,
      durationMs: summary.durationMs,
    },
    "[dmo-extraction-warmup] sweep complete",
  );

  return finishWithRunRecord(summary);
}
