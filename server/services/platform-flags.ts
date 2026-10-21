// Platform flags — cached reads of cross-cutting boolean settings from the
// platform_settings key/value table (admin-editable via /api/admin/platform-settings).
//
// Keys used by the /admin/system Platform Settings card:
//   maintenance_mode                — "true" blocks non-admin API access (503)
//   new_user_registration_enabled   — "false" blocks first-time account creation on every
//                                     sign-up path: POST /api/auth/register, a first-time
//                                     Replit OIDC sign-in and a first-time Facebook sign-in.
//                                     Existing accounts still sign in.
//   email_notifications_enabled     — "false" makes sendEmail() a logged no-op
//                                     (auth-critical emails — password reset,
//                                     verification — bypass sendEmail and are
//                                     never gated)
//
// Reads are cached for a short TTL so hot request paths (the maintenance
// middleware runs on every /api request) don't hit the DB each time. The admin
// PATCH endpoint calls invalidatePlatformFlagCache() so toggles apply
// immediately in-process.

import { seasonWindows, seasonWindowsSettingKey, type SeasonWindow } from "@shared/busy-bus";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  LAUNCH_MARKET_SLUG_SETTING,
  TRAVELER_SIGNUP_MODE_SETTING,
  parseTravelerSignupMode,
  type TravelerSignupMode,
} from "@shared/launch-signup";
import { WELCOME_VERIFICATION_WINDOW_SETTING, parseWelcomeVerificationWindowDays } from "@shared/welcome-verification";
import { BETA_MARKET_SLUGS_SETTING, betaMarketSlugs } from "@shared/ticker";
import { EXPERT_HOOK_CITIES_SETTING, expertHookCities } from "@shared/expert-hook";
import { BLOG_FOOTER_MIN_PUBLISHED_SETTING, parseBlogFooterMinPublished } from "@shared/blog-footer";

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
 * A raw platform setting, or null when the row is missing or the read fails.
 * Callers that must not proceed without the value fail closed on null.
 */
export async function readPlatformSetting(key: string): Promise<string | null> {
  try {
    return await getSettingValue(key);
  } catch (err) {
    console.error(`[platform-flags] read failed for ${key}:`, err);
    return null;
  }
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
/** LW-1g: "true" shows the /earn Ready-Made calculator's worked example line (seeded "false" by migration 381). */
export const FLAG_EARN_READY_MADE_EXAMPLE = "earn_ready_made_example_enabled";

/**
 * LW-1b: the traveler sign-up mode, read FAIL CLOSED — a missing row, a read error or any value other than
 * "open" is "waitlist" (shared/launch-signup.ts). Cached like the flags; the admin PATCH invalidates it.
 */
export async function getTravelerSignupMode(): Promise<TravelerSignupMode> {
  try {
    return parseTravelerSignupMode(await getSettingValue(TRAVELER_SIGNUP_MODE_SETTING));
  } catch (err) {
    console.error(`[platform-flags] read failed for ${TRAVELER_SIGNUP_MODE_SETTING}, failing closed to waitlist:`, err);
    return "waitlist";
  }
}

/** LW-1b: the launch market's slug, or null when unset/unreadable (never a guessed market). */
export async function getLaunchMarketSlug(): Promise<string | null> {
  try {
    const value = await getSettingValue(LAUNCH_MARKET_SLUG_SETTING);
    const slug = value?.trim().toLowerCase() ?? "";
    return /^[a-z0-9-]{1,64}$/.test(slug) ? slug : null;
  } catch (err) {
    console.error(`[platform-flags] read failed for ${LAUNCH_MARKET_SLUG_SETTING}:`, err);
    return null;
  }
}

/**
 * LW-1f-b (ledger `2026-10-16-lw1f-b-beta-cities`): the market keys that may be called "in beta". The stored list when
 * valid and non-empty, else the launch market alone (`betaMarketSlugs`, shared/ticker.ts). A read error is the
 * launch market alone, never a guessed wider list.
 */
export async function getBetaMarketSlugs(): Promise<string[]> {
  const launch = await getLaunchMarketSlug();
  try {
    return betaMarketSlugs(await getSettingValue(BETA_MARKET_SLUGS_SETTING), launch);
  } catch (err) {
    console.error(`[platform-flags] read failed for ${BETA_MARKET_SLUGS_SETTING}, using the launch market:`, err);
    return betaMarketSlugs(null, launch);
  }
}

/**
 * AUTH-1 Finding A (ii): days a signup welcome waits for verification before it is cancelled. An absent
 * row, an invalid value or a read error is the ruled default (shared/welcome-verification.ts).
 */
export async function getWelcomeVerificationWindowDays(): Promise<number> {
  try {
    return parseWelcomeVerificationWindowDays(await getSettingValue(WELCOME_VERIFICATION_WINDOW_SETTING));
  } catch (err) {
    console.error(`[platform-flags] read failed for ${WELCOME_VERIFICATION_WINDOW_SETTING}, using the default:`, err);
    return parseWelcomeVerificationWindowDays(null);
  }
}

/**
 * ED-1 footer count: how many published posts the footer's Blog link waits for. An absent row, an
 * invalid value or a read error is the ruled default (shared/blog-footer.ts).
 */
export async function getBlogFooterMinPublished(): Promise<number> {
  try {
    return parseBlogFooterMinPublished(await getSettingValue(BLOG_FOOTER_MIN_PUBLISHED_SETTING));
  } catch (err) {
    console.error(`[platform-flags] read failed for ${BLOG_FOOTER_MIN_PUBLISHED_SETTING}, using the default:`, err);
    return parseBlogFooterMinPublished(null);
  }
}

/**
 * FB-1 expert hook (ledger `2026-10-18-fb1-expert-hook`): the cities whose hook names a local and may offer the chooser.
 * A missing row, a read error or an invalid value ⇒ none (the switch defaults off). Cached like the flags.
 */
/** FB-1 step 5d: a market's peak windows (`season_windows_<market>`). No row, unreadable or invalid ⇒ none — no code default. */
export async function getSeasonWindows(market: string): Promise<SeasonWindow[]> {
  try {
    return seasonWindows(await getSettingValue(seasonWindowsSettingKey(market)));
  } catch (err) {
    console.error(`[platform-flags] read failed for ${seasonWindowsSettingKey(market)}, treating as none:`, err);
    return [];
  }
}

export async function getExpertHookCities(): Promise<string[]> {
  try {
    return expertHookCities(await getSettingValue(EXPERT_HOOK_CITIES_SETTING));
  } catch (err) {
    console.error(`[platform-flags] read failed for ${EXPERT_HOOK_CITIES_SETTING}, treating as none:`, err);
    return [];
  }
}
