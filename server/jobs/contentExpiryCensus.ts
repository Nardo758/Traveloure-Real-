/**
 * `content-expiry-census` — FD-2 ruling 8 (decision-maker, Oct 9, 2026; ledger
 * `2026-10-09-fd2-content-tier-tags`). Expired LOCAL items are hidden at build time by the draft readers
 * (`isLiveLocal` / `getDraftEligibleGems`); this nightly job only COUNTS them, per table, and logs one line.
 * It deletes nothing, writes no status column and changes no row. A table it cannot read is reported as
 * `null` with the reason — never as 0, which would claim nothing has expired (§13).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../infrastructure/logger";

export interface ContentExpiryCensus {
  at: string;
  expiredLocal: Record<string, number | null>;
  untaggedGems: number | null;
  errors: Record<string, string>;
}

const TABLES = ["travel_pulse_hidden_gems", "local_knowledge_nuggets", "place_facts"] as const;

async function countOrNull(query: ReturnType<typeof sql>, key: string, errors: Record<string, string>): Promise<number | null> {
  try {
    const r = await db.execute(query);
    return Number((r.rows[0] as any)?.n ?? 0);
  } catch (err: any) {
    errors[key] = String(err?.message ?? err).slice(0, 200);
    return null;
  }
}

export async function runContentExpiryCensus(): Promise<ContentExpiryCensus> {
  const errors: Record<string, string> = {};
  const expiredLocal: Record<string, number | null> = {};
  for (const t of TABLES) {
    expiredLocal[t] = await countOrNull(
      sql`SELECT count(*)::int AS n FROM ${sql.identifier(t)} WHERE source_class = 'local' AND expires_at IS NOT NULL AND expires_at <= NOW()`,
      t,
      errors,
    );
  }
  const untaggedGems = await countOrNull(
    sql`SELECT count(*)::int AS n FROM travel_pulse_hidden_gems WHERE source_class IS NULL`,
    "untagged_gems",
    errors,
  );
  const out: ContentExpiryCensus = { at: new Date().toISOString(), expiredLocal, untaggedGems, errors };
  logger.info({ job: "content-expiry-census", ...out }, "[content-expiry-census] counts");
  return out;
}
