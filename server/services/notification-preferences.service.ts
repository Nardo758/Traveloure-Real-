/**
 * Server reader for per-event notification preferences (board task #1230, ledger
 * `2026-09-23-phase2-messages`). The rule itself — keys, born defaults, how a saved value reads —
 * lives in `shared/notification-preferences.ts`; this only fetches the user's saved preferences.
 * A read, never a write (the ONE writer of `users.preferences` is `updateUserPreferences`).
 *
 * A user that cannot be found, or a read that fails, answers with the born default: a notice the
 * platform would send by default is never silently dropped because a preference lookup broke.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../../shared/schema";
import {
  notificationChannelEnabled,
  NOTIFICATION_PREFERENCE_DEFAULTS,
  type NotificationChannel,
  type NotificationPreferenceKey,
} from "../../shared/notification-preferences";

export async function isNotificationChannelEnabled(
  userId: string,
  key: NotificationPreferenceKey,
  channel: NotificationChannel,
): Promise<boolean> {
  try {
    const [row] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId));
    return notificationChannelEnabled(row?.preferences, key, channel);
  } catch (err) {
    console.error(`[notification-preferences] read failed for ${userId}; using the default:`, err);
    return NOTIFICATION_PREFERENCE_DEFAULTS[key][channel];
  }
}
