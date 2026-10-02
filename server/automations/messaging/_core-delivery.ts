import { sql } from "drizzle-orm";
import { db } from "../../db";
import { MARKETING_KINDS, marketingPreferences, isDaytime } from "./_core-policy";

/** Recheck immediately before a provider attempt, including retries. */
export async function journeyDeliveryGate(userId: string, kind: string) {
  const row = (await db.execute(sql`SELECT u.*,s.account_state
    FROM users u LEFT JOIN signup_journey_state s ON s.user_id=u.id WHERE u.id=${userId}`)).rows[0] as any;
  if (!row) return { action: "skip", reason: "account_missing" } as const;
  // The completion row intentionally retains the original recipient while the
  // account is anonymized atomically. Its retries remain permitted.
  if (kind === "deletion_complete") return { action: "send" } as const;
  if (row.is_deleted) return { action: "skip", reason: "account_deleted" } as const;
  if (kind === "verify_email" || kind.startsWith("verify_reminder_")) {
    if (row.email_verified) return { action: "skip", reason: "already_verified" } as const;
  }
  if (!MARKETING_KINDS.has(kind)) return { action: "send" } as const;
  const prefs = marketingPreferences(row.preferences);
  if (!prefs.consent || row.is_suspended || !row.email_verified || row.account_state !== "active") {
    return { action: "skip", reason: "marketing_ineligible" } as const;
  }
  if (kind === "profile_nudge" && row.first_name && row.last_name && row.bio && row.profile_image_url) {
    return { action: "skip", reason: "profile_complete" } as const;
  }
  if (kind === "planner_nudge" && (await db.execute(sql`SELECT 1 FROM trips WHERE user_id=${userId} LIMIT 1`)).rows.length) {
    return { action: "skip", reason: "itinerary_exists" } as const;
  }
  if (!isDaytime(new Date(), prefs.timezone)) return { action: "defer" } as const;
  return { action: "send" } as const;
}