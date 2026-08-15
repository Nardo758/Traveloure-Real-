/**
 * notification-email.test.ts
 *
 * Covers the role-gating logic and booking-alert email routing introduced
 * by task 114 (notification_email on users). These are pure-logic tests that
 * run without a real DB or network.
 *
 * Also includes static source-code inspection tests that verify the route
 * handler and booking service are wired correctly end-to-end.
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

// ── 4. Static source-code inspection — PATCH /api/me/notification-email ───
//
// Confirms the route handler is correctly wired to persist the value to the
// `notificationEmail` column and return it. This does NOT require a live DB —
// it inspects the source text of the route file.

describe("PATCH /api/me/notification-email — source-code wiring", () => {
  const storefrontSrc = fs.readFileSync(
    path.resolve(import.meta.dirname, "../storefront.routes.ts"),
    "utf-8"
  );

  it("registers GET /api/me/notification-email", () => {
    assert.ok(
      storefrontSrc.includes('router.get("/api/me/notification-email"'),
      "GET /api/me/notification-email route must be registered in storefront.routes.ts"
    );
  });

  it("registers PATCH /api/me/notification-email", () => {
    assert.ok(
      storefrontSrc.includes('router.patch("/api/me/notification-email"'),
      "PATCH /api/me/notification-email route must be registered in storefront.routes.ts"
    );
  });

  it("PATCH handler writes notificationEmail to the DB", () => {
    assert.ok(
      storefrontSrc.includes("notificationEmail: notificationEmail ?? null"),
      "PATCH handler must pass notificationEmail to db.update()"
    );
  });

  it("GET handler selects notificationEmail column", () => {
    assert.ok(
      storefrontSrc.includes("notificationEmail: users.notificationEmail"),
      "GET handler must select users.notificationEmail"
    );
  });

  it("GET handler returns notificationEmail in JSON response", () => {
    assert.ok(
      storefrontSrc.includes("notificationEmail: row?.notificationEmail ?? null"),
      "GET handler must return { notificationEmail } from DB row"
    );
  });

  it("both routes gate on isEarnerRole", () => {
    // Count isEarnerRole calls in the notification-email section
    const notifSection = storefrontSrc.slice(
      storefrontSrc.indexOf("api/me/notification-email"),
      storefrontSrc.indexOf("export default router")
    );
    const count = (notifSection.match(/isEarnerRole\(/g) ?? []).length;
    assert.ok(
      count >= 2,
      `Both GET and PATCH must call isEarnerRole(); found ${count} call(s)`
    );
  });

  it("schema validates email format before writing", () => {
    assert.ok(
      storefrontSrc.includes("notificationEmailSchema"),
      "A notificationEmailSchema must be defined and applied in the PATCH handler"
    );
    assert.ok(
      storefrontSrc.includes('.email("Must be a valid email address")'),
      "The schema must enforce a valid email format"
    );
  });
});

// ── 5. Static source-code inspection — booking.service.ts alert path ──────
//
// Confirms that the booking request path (submitBookingRequests) AND the
// post-confirmation path both query p.notification_email and use the fallback
// expression `notification_email || email` when calling sendBookingAlertEmail.

describe("booking.service.ts — notification_email wiring", () => {
  const bookingSrc = fs.readFileSync(
    path.resolve(import.meta.dirname, "../../services/booking.service.ts"),
    "utf-8"
  );

  it("SQL query selects p.notification_email", () => {
    assert.ok(
      bookingSrc.includes("p.notification_email AS p_notification_email"),
      "booking.service.ts must SELECT p.notification_email AS p_notification_email from users"
    );
  });

  it("providerEmail is resolved as notification_email || primary email", () => {
    assert.ok(
      bookingSrc.includes("p_notification_email || row?.p_email") ||
      bookingSrc.includes("p_notification_email || p_email") ||
      bookingSrc.includes("row?.p_notification_email || row?.p_email"),
      "booking.service.ts must resolve providerEmail as p_notification_email || p_email"
    );
  });

  it("sendBookingAlertEmail is called with resolved providerEmail", () => {
    assert.ok(
      bookingSrc.includes("sendBookingAlertEmail({"),
      "booking.service.ts must call sendBookingAlertEmail"
    );
    // The call must use providerEmail (which holds the resolved value)
    const alertIdx = bookingSrc.indexOf("sendBookingAlertEmail({");
    const alertBlock = bookingSrc.slice(alertIdx, alertIdx + 300);
    assert.ok(
      alertBlock.includes("providerEmail"),
      "sendBookingAlertEmail call must pass providerEmail argument"
    );
  });

  it("alert is skipped when emailBookingAlerts is false (opt-out gate)", () => {
    assert.ok(
      bookingSrc.includes("p_email_booking_alerts"),
      "booking.service.ts must read p.email_booking_alerts for the opt-out gate"
    );
    assert.ok(
      bookingSrc.includes("providerEmailBookingAlerts"),
      "booking.service.ts must enforce the emailBookingAlerts opt-out before sending"
    );
  });
});

// ── 6. Static source-code inspection — payments.routes.ts checkout path ───
//
// Confirms the checkout / authorizeAndPromote path (the other booking creation
// surface) also uses notificationEmail || email as providerEmail.

describe("payments.routes.ts — notification_email wiring at checkout", () => {
  const paymentsSrc = fs.readFileSync(
    path.resolve(import.meta.dirname, "../payments.routes.ts"),
    "utf-8"
  );

  it("sendBookingAlertEmail call uses notificationEmail || email fallback", () => {
    // The expression used in payments.routes.ts is:
    //   providerEmail: (provider as any).notificationEmail || provider.email
    assert.ok(
      paymentsSrc.includes("notificationEmail || provider.email") ||
      paymentsSrc.includes(".notificationEmail || "),
      "payments.routes.ts must route alert to notificationEmail || email"
    );
  });

  it("checkout path also gates on emailBookingAlerts opt-out", () => {
    assert.ok(
      paymentsSrc.includes("emailBookingAlerts"),
      "payments.routes.ts checkout path must honour the emailBookingAlerts opt-out flag"
    );
  });
});
