/**
 * THE TRAVELOURE EDITORIAL HOUSE ACCOUNT — ONE helper, read everywhere (ED-1b; ledger
 * `2026-10-16-ed1b-editorial-house-account`; migration 385).
 *
 * The account that stands behind "Traveloure Editorial" guides. It is a house account, separate from
 * the platform concierge (platform-concierge.service.ts), and it earns nothing, advises no plan and
 * is never ranked: the earnings mint and the advisor-row author refuse it, and the routable-expert
 * filter leaves it out of the expert directory and lead scoring.
 *
 * The id lives in `platform_settings.editorial_user_id`, never hardcoded (§18 rule 1). NULL means
 * migration 385 has not run here: callers treat it as "no editorial account", never as an error and
 * never by guessing an id. Same cached-read shape as getPlatformConciergeUserId.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

export const EDITORIAL_USER_ID_SETTING_KEY = "editorial_user_id";

const TTL_MS = 60_000;

let cachedId: string | null | undefined; // undefined = not yet read this TTL window
let cachedAt = 0;

/** Test/ops seam — never called in production request handling. */
export function invalidateEditorialAccountCache(): void {
  cachedId = undefined;
  cachedAt = 0;
}

export async function getEditorialUserId(): Promise<string | null> {
  const now = Date.now();
  if (cachedId !== undefined && now - cachedAt < TTL_MS) return cachedId;
  try {
    const result = await db.execute(sql`
      SELECT setting_value FROM platform_settings
      WHERE setting_key = ${EDITORIAL_USER_ID_SETTING_KEY}
      LIMIT 1
    `);
    const row = result.rows?.[0] as { setting_value: string | null } | undefined;
    const value = row?.setting_value ?? null;
    cachedId = value && value.trim().length > 0 ? value.trim() : null;
    cachedAt = now;
    return cachedId;
  } catch (err) {
    console.warn("[editorial-account] Failed to load editorial user id — treating as unseeded:", err);
    cachedId = null;
    cachedAt = now;
    return null;
  }
}

export async function isEditorialUserId(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const editorialId = await getEditorialUserId();
  return editorialId !== null && editorialId === userId;
}
