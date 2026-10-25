/**
 * Geocode daily-cap alert: one admin-digest row and one staff notification per admin,
 * once per UTC day. Injected writers — no database, no email.
 *
 * Run: npx tsx --test --test-force-exit server/services/__tests__/geocode-cap-alert.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  GEOCODE_CAP_DIGEST_TYPE,
  GEOCODE_CAP_ENV,
  GEOCODE_CAP_REASON,
  GEOCODE_CAP_STAFF_TYPE,
  recordGeocodeCapAlert,
  type GeocodeCapDigestRow,
  type GeocodeCapStaffRow,
} from "../geocode-cap-alert.service";

const alertSrc = fs.readFileSync(path.resolve(process.cwd(), "server/services/geocode-cap-alert.service.ts"), "utf8");
const spendSrc = fs.readFileSync(path.resolve(process.cwd(), "server/services/spend-guard.service.ts"), "utf8");

describe("recordGeocodeCapAlert", () => {
  it("writes one digest row and one staff row per admin, then nothing else that day", async () => {
    const digests: GeocodeCapDigestRow[] = [];
    const staff: GeocodeCapStaffRow[] = [];
    let already = false;
    const deps = {
      alreadyRecordedToday: async () => already,
      writeDigest: async (row: GeocodeCapDigestRow) => {
        digests.push(row);
        already = true;
      },
      adminUserIds: async () => ["admin-a", "admin-b"],
      writeStaff: async (row: GeocodeCapStaffRow) => {
        staff.push(row);
      },
    };
    const now = new Date("2026-10-25T15:00:00.000Z");
    await recordGeocodeCapAlert({ used: 12, cap: 12, now }, deps);
    await recordGeocodeCapAlert({ used: 12, cap: 12, now }, deps);

    assert.equal(digests.length, 1);
    assert.equal(digests[0].type, GEOCODE_CAP_DIGEST_TYPE);
    assert.equal(digests[0].reason, GEOCODE_CAP_REASON);
    assert.equal(digests[0].metadata.used, 12);
    assert.equal(digests[0].metadata.cap, 12);
    assert.equal(digests[0].metadata.capEnv, GEOCODE_CAP_ENV);
    assert.equal(digests[0].metadata.day, "2026-10-25");
    assert.match(digests[0].message, /12 of 12/);
    assert.equal(staff.length, 2);
    assert.deepEqual(
      staff.map((row) => row.userId),
      ["admin-a", "admin-b"],
    );
    assert.equal(staff[0].type, GEOCODE_CAP_STAFF_TYPE);
    assert.equal(staff[0].dedupeKey, "maps-geocode-cap:2026-10-25:admin-a");
    assert.equal(staff[1].dedupeKey, "maps-geocode-cap:2026-10-25:admin-b");
    assert.equal(staff[0].data.reason, GEOCODE_CAP_REASON);
  });

  it("writes nothing when today's digest row is already there", async () => {
    let digestWrites = 0;
    let staffWrites = 0;
    await recordGeocodeCapAlert(
      { used: 1, cap: 1 },
      {
        alreadyRecordedToday: async () => true,
        writeDigest: async () => {
          digestWrites += 1;
        },
        adminUserIds: async () => ["admin-a"],
        writeStaff: async () => {
          staffWrites += 1;
        },
      },
    );
    assert.equal(digestWrites, 0);
    assert.equal(staffWrites, 0);
  });

  it("does not throw when a writer throws", async () => {
    await assert.doesNotReject(
      recordGeocodeCapAlert(
        { used: 3, cap: 3 },
        {
          alreadyRecordedToday: async () => false,
          writeDigest: async () => {
            throw new Error("db down");
          },
          adminUserIds: async () => ["admin-a"],
          writeStaff: async () => {
            throw new Error("should not be reached");
          },
        },
      ),
    );
  });

  it("does not send mail, and spend-guard has no warning fraction to mirror", () => {
    assert.doesNotMatch(alertSrc, /email\.service|resend|sendEmail|ADMIN_EMAIL/i);
    assert.doesNotMatch(alertSrc, /trend_source_config|cost-enforcement/);
    assert.doesNotMatch(alertSrc, /\b1000\b/);
    assert.doesNotMatch(spendSrc, /warningFraction|warnAt|0\.8/);
    assert.match(alertSrc, /GEOCODE_CAP_DIGEST_TYPE = "maps_geocode_daily_cap"/);
    assert.match(alertSrc, /raiseOpsAlert/);
  });
});
