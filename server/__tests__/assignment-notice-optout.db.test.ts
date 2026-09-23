/**
 * THE "BOOKING REQUEST" IN-APP TOGGLE IS HONOURED — board task #1230, ledger
 * `2026-09-23-phase2-messages`.
 *
 * Experts could switch notices off in Settings, the choice was saved, and no server code read it —
 * an assignment still produced a notice. The rule now lives in `shared/notification-preferences.ts`
 * and the trip-assignment notifier asks it first.
 *
 *   N1  The reader: a saved value wins; a key or channel never saved reads as its born default,
 *       never as off (§13); garbage reads as the default.
 *   N2  An expert who never touched Settings still gets the assignment notice.
 *   N3  An expert who switched "Booking Request → Push" off gets none — and switching it back on
 *       restores it.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/assignment-notice-optout.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  NOTIFICATION_PREFERENCE_KEYS,
  notificationChannelEnabled,
} from "../../shared/notification-preferences";
import { createExpertAssignmentNotification } from "../services/booking-actions.service";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const RUN = crypto.randomUUID().slice(0, 8);
const DEFAULT_EXPERT = `nopt-${RUN}-default`;
const OPTED_OUT_EXPERT = `nopt-${RUN}-off`;
const TRIP_ID = `nopt-${RUN}-trip`;

async function noticeCount(userId: string): Promise<number> {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND data->>'tripId' = $2`,
    [userId, TRIP_ID],
  );
  return r.rows[0].n;
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, role, preferences) VALUES
       ($1, $2, 'Default', 'Expert', 'expert', NULL),
       ($3, $4, 'OptedOut', 'Expert', 'expert', '{"settings":{"notifications":{"bookingRequest":{"email":true,"push":false}}}}'::jsonb)`,
    [DEFAULT_EXPERT, `${DEFAULT_EXPERT}@traveloure.test`, OPTED_OUT_EXPERT, `${OPTED_OUT_EXPERT}@traveloure.test`],
  );
});

after(async () => {
  try {
    await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [[DEFAULT_EXPERT, OPTED_OUT_EXPERT]]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [[DEFAULT_EXPERT, OPTED_OUT_EXPERT]]);
  } finally {
    await pool.end();
  }
});

test("N1: saved value wins; unsaved reads as the born default, never as off", () => {
  const saved = { settings: { notifications: { bookingRequest: { push: false } } } };
  assert.equal(notificationChannelEnabled(saved, "bookingRequest", "push"), false);
  assert.equal(notificationChannelEnabled(saved, "bookingRequest", "email"), true, "the other channel keeps its default");
  for (const key of NOTIFICATION_PREFERENCE_KEYS) {
    for (const channel of ["email", "push"] as const) {
      assert.equal(notificationChannelEnabled(null, key, channel), NOTIFICATION_PREFERENCE_DEFAULTS[key][channel]);
    }
  }
  assert.equal(notificationChannelEnabled({ settings: { notifications: { bookingRequest: { push: "no" } } } }, "bookingRequest", "push"), true);
});

test("N2: an expert who never saved a preference still gets the notice", async () => {
  await createExpertAssignmentNotification(DEFAULT_EXPERT, TRIP_ID, "Kyoto in spring");
  assert.equal(await noticeCount(DEFAULT_EXPERT), 1);
});

test("N3: switching the toggle off stops the notice; switching it on restores it", async () => {
  await createExpertAssignmentNotification(OPTED_OUT_EXPERT, TRIP_ID, "Kyoto in spring");
  assert.equal(await noticeCount(OPTED_OUT_EXPERT), 0, "opted out ⇒ no notice");

  await pool.query(
    `UPDATE users SET preferences = jsonb_set(preferences, '{settings,notifications,bookingRequest,push}', 'true') WHERE id = $1`,
    [OPTED_OUT_EXPERT],
  );
  await createExpertAssignmentNotification(OPTED_OUT_EXPERT, TRIP_ID, "Kyoto in spring");
  assert.equal(await noticeCount(OPTED_OUT_EXPERT), 1, "opted back in ⇒ the notice comes back");
});
