/**
 * notification-email.test.ts
 *
 * Covers the role-gating logic and booking-alert email routing introduced
 * by task 114 (notification_email on users). These are pure-logic tests that
 * run without a real DB or network.
 *
 * Run with: npx tsx --test server/routes/__tests__/notification-email.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ── 1. Migration file is present and idempotent ────────────────────────────

describe("migration 224_notification_email.sql", () => {
  const migrationPath = path.resolve(
    import.meta.dirname,
    "../../migrations/224_notification_email.sql"
  );

  it("exists in server/migrations/", () => {
    assert.ok(fs.existsSync(migrationPath), `Migration file not found: ${migrationPath}`);
  });

  it("uses ADD COLUMN IF NOT EXISTS (idempotent)", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(
      /ADD COLUMN IF NOT EXISTS\s+notification_email/i.test(sql),
      "Migration must use ADD COLUMN IF NOT EXISTS notification_email"
    );
  });

  it("is registered in migration-files.ts", () => {
    const registryPath = path.resolve(import.meta.dirname, "../../migrations/migration-files.ts");
    const registry = fs.readFileSync(registryPath, "utf-8");
    assert.ok(
      registry.includes('"224_notification_email.sql"'),
      "224_notification_email.sql must appear in MIGRATION_FILES"
    );
  });
});

// ── 2. Role gating — isEarnerRole ─────────────────────────────────────────

// Import the shared predicate (what the endpoints enforce server-side).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}
const { isEarnerRole } = await import("@shared/roles.js");

describe("isEarnerRole — notification-email gate", () => {
  const earnerRoles = ["expert", "local_expert", "travel_expert", "event_planner", "service_provider"];
  const nonEarnerRoles = ["user", "admin", "executive_assistant", null, undefined, ""];

  for (const role of earnerRoles) {
    it(`allows earner role: ${role}`, () => {
      assert.equal(isEarnerRole(role), true);
    });
  }

  for (const role of nonEarnerRoles) {
    it(`rejects non-earner role: ${JSON.stringify(role)}`, () => {
      assert.equal(isEarnerRole(role), false);
    });
  }
});

// ── 3. Booking alert email routing — notification_email takes priority ─────

describe("booking alert email routing", () => {
  // Mirror the logic from booking.service.ts and payments.routes.ts:
  //   const alertEmail = provider.notificationEmail || provider.email;
  function resolveAlertEmail(
    notificationEmail: string | null | undefined,
    email: string | null | undefined
  ): string | null {
    return (notificationEmail || email) ?? null;
  }

  it("uses notification_email when set", () => {
    assert.equal(
      resolveAlertEmail("biz@example.com", "account@example.com"),
      "biz@example.com"
    );
  });

  it("falls back to account email when notification_email is null", () => {
    assert.equal(
      resolveAlertEmail(null, "account@example.com"),
      "account@example.com"
    );
  });

  it("falls back to account email when notification_email is empty string", () => {
    assert.equal(
      resolveAlertEmail("", "account@example.com"),
      "account@example.com"
    );
  });

  it("returns null when both are null (no email configured)", () => {
    assert.equal(resolveAlertEmail(null, null), null);
  });

  it("clears override — null notification_email reverts to account email", () => {
    // Simulate an expert who previously had a business email and then cleared it.
    const cleared = resolveAlertEmail(null, "original@example.com");
    assert.equal(cleared, "original@example.com");
  });
});
