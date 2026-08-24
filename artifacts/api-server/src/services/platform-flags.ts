// Platform flags — cached reads of cross-cutting boolean settings from the
// platform_settings key/value table (admin-editable via /api/admin/platform-settings).
//
// Keys used by the /admin/system Platform Settings card:
//   maintenance_mode                — "true" blocks non-admin API access (503)
//   new_user_registration_enabled   — "false" blocks POST /api/auth/register
//   email_notifications_enabled     — "false" makes sendEmail() a logged no-op
//                                     (auth-critical emails — password reset,
//                                     verification — bypass sendEmail and are
//                                     never gated)
//
// Reads are cached for a short TTL so hot request paths (the maintenance
// middleware runs on every /api request) don't hit the DB each time. The admin
// PATCH endpoint calls invalidatePlatformFlagCache() so toggles apply
// immediately in-process.

import { sql } from "drizzle-orm";
import { db } from "../db";

const TTL_MS = 15_000;

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function invalidatePlatformFlagCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

async function getSettingValue(key: string): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const result = await db.execute(sql`
    SELECT setting_value FROM platform_settings WHERE setting_key = ${key} LIMIT 1
  `);
  const value =
    result.rows && result.rows.length > 0
      ? String((result.rows[0] as any).setting_value)
      : null;
  cache.set(key, { value, expiresAt: now + TTL_MS });
  return value;
}

/**
 * Read a boolean platform flag. Missing rows fall back to `defaultValue`.
 * On DB error the default is returned (fail-open for maintenance mode so a
 * DB hiccup can't lock everyone out; callers log the error).
 */
export async function getPlatformFlag(key: string, defaultValue: boolean): Promise<boolean> {
  try {
    const value = await getSettingValue(key);
    if (value === null) return defaultValue;
    return value === "true";
  } catch (err) {
    console.error(`[platform-flags] read failed for ${key}, using default=${defaultValue}:`, err);
    return defaultValue;
  }
}

export const FLAG_MAINTENANCE_MODE = "maintenance_mode";
export const FLAG_REGISTRATION_ENABLED = "new_user_registration_enabled";
export const FLAG_EMAIL_NOTIFICATIONS_ENABLED = "email_notifications_enabled";
