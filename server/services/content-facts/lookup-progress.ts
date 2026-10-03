/**
 * The draft's place-facts lookup progress (smoke 5 item 8, ledger `2026-10-03-smoke5-fixes`;
 * migration 340, `ai_generated_itineraries.facts_lookup`).
 *
 * The lookups run AFTER the draft responds, so the slip renders before they finish. This records,
 * on the draft's own row, which item ids are still being checked; the plancard read reports them and
 * the slip says "checking hours…" on those rows and re-reads until the list is empty. It is on the
 * row — not in process memory — so whichever server instance answers the read sees the same answer.
 *
 * Every write is best-effort and NEVER throws (§15b: it may not fail the lookups, which may not fail
 * the draft). A run that dies mid-way leaves `status: 'running'`, so the reader stops trusting it
 * after `LOOKUP_PROGRESS_STALE_MS` and the rows go quiet rather than "checking" forever (§13).
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";

export class LookupProgress {
  constructor(private readonly draftId: string) {}

  async start(itemIds: string[]): Promise<void> {
    await this.write(
      sql`UPDATE ai_generated_itineraries
            SET facts_lookup = ${JSON.stringify({ status: "running", startedAt: new Date().toISOString(), pending: itemIds })}::jsonb
          WHERE id = ${this.draftId}`,
    );
  }

  /** One item is no longer being checked (looked up, skipped or failed). */
  async done(itemId: string): Promise<void> {
    await this.write(
      sql`UPDATE ai_generated_itineraries
            SET facts_lookup = jsonb_set(facts_lookup, '{pending}', COALESCE(facts_lookup->'pending', '[]'::jsonb) - ${itemId}::text)
          WHERE id = ${this.draftId} AND facts_lookup IS NOT NULL`,
    );
  }

  async finish(): Promise<void> {
    await this.write(
      sql`UPDATE ai_generated_itineraries
            SET facts_lookup = COALESCE(facts_lookup, '{}'::jsonb)
              || jsonb_build_object('status', 'done', 'finishedAt', ${new Date().toISOString()}::text, 'pending', '[]'::jsonb)
          WHERE id = ${this.draftId}`,
    );
  }

  private async write(q: ReturnType<typeof sql>): Promise<void> {
    try {
      await db.execute(q);
    } catch (err) {
      console.error(`[place-facts] progress write failed draft_id=${this.draftId}:`, (err as Error)?.message ?? err);
    }
  }
}

export { LOOKUP_PROGRESS_STALE_MS, pendingLookupItemIds } from "./lookup-progress.pure";
