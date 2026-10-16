// LW-1d (ledger `2026-10-16-lw1d-source-and-referral`; hand-off Part B "Source tags on supply sign-up too"): the ONE
// writer of `users.signup_source` (migration 381). A supply sign-up's `?source=` tag is read through the ONE
// `normalizeSignupSource` against the launch market and stored ONCE: the UPDATE only touches a row whose tag is still
// NULL, so a later sign-in through another door never rewrites where the account came from. No tag ⇒ nothing is
// written (NULL = not recorded, never `other`). Never throws — a failed write must not fail the sign-up (§15b).
import { sql } from "drizzle-orm";
import { db } from "../db";
import { normalizeSignupSource } from "@shared/signup-source";
import { getLaunchMarketSlug } from "./platform-flags";
import { logger } from "../infrastructure/logger";

export async function recordSignupSource(userId: string, rawTag: unknown): Promise<string | null> {
  try {
    if (!userId) return null;
    const value = normalizeSignupSource(rawTag, await getLaunchMarketSlug());
    if (!value) return null;
    await db.execute(sql`
      UPDATE users SET signup_source = ${value}
      WHERE id = ${userId} AND signup_source IS NULL
    `);
    return value;
  } catch (err: any) {
    logger.warn(`[signup-source] not recorded: ${err?.code ?? err?.message ?? "unknown"}`);
    return null;
  }
}
