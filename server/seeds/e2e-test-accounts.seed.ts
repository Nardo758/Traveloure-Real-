#!/usr/bin/env tsx
/**
 * E2E Test Account Seed
 * Creates the 5 test accounts that the E2E harness expects.
 * Also seeds one upcoming Kyoto trip for the traveler account so
 * tests that navigate /my-trips → trip-details can find a card.
 * Run after `npm run seed:beta` or on a fresh DB before E2E.
 *
 * Usage: tsx server/seeds/e2e-test-accounts.seed.ts
 */

import { db } from "../db";
import { users } from "@shared/models/auth";
import { trips } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const PASSWORD = process.env.E2E_TEST_PASSWORD || "TestPass123!";

async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(salt + ":" + derivedKey.toString("hex"));
    });
  });
}

const E2E_ACCOUNTS = [
  { email: "test-traveler-kyoto@traveloure.test", firstName: "Kyoto", lastName: "Traveler", role: "user" as const },
  { email: "kyoto-food@traveloure.test", firstName: "Aiko", lastName: "Yamamoto", role: "travel_expert" as const },
  { email: "kyoto-photography@traveloure.test", firstName: "Kenji", lastName: "Nakamura", role: "service_provider" as const },
  { email: "test-ea@traveloure.test", firstName: "Executive", lastName: "Assistant", role: "executive_assistant" as const },
  { email: "test-admin@traveloure.test", firstName: "Admin", lastName: "User", role: "admin" as const },
];

async function seedE2EAccounts() {
  // FAIL-SAFE refusal (dispatch P0, Jul 28 2026): the function refuses on its
  // own, independent of the caller's gate. A production runtime may seed ONLY
  // with the explicit ALLOW_TEST_ACCOUNTS=1 opt-in (the CI gates' throwaway
  // DBs); ENVIRONMENT=PROD always refuses.
  if (
    process.env.ENVIRONMENT === "PROD" ||
    (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_ACCOUNTS !== "1")
  ) {
    throw new Error(
      "[e2e-seed] Refusing to seed E2E test accounts into a production environment " +
      "(NODE_ENV=production without ALLOW_TEST_ACCOUNTS=1, or ENVIRONMENT=PROD)."
    );
  }

  console.log("Seeding E2E test accounts...");
  const hash = await hashPassword(PASSWORD);

  for (const account of E2E_ACCOUNTS) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, account.email.toLowerCase()))
      .then((r) => r[0]);

    // Test accounts must start PAST the accept-terms gate: ProtectedRoute
    // bounces any account with NULL terms_accepted_at/privacy_accepted_at to
    // /accept-terms before every authed destination, which silently blocks
    // every authed E2E journey. Stamp on create, and backfill accounts seeded
    // before this existed (idempotent — only touches NULL rows).
    const termsStamp = new Date();

    if (existing) {
      if (!existing.termsAcceptedAt || !existing.privacyAcceptedAt) {
        await db
          .update(users)
          .set({
            termsAcceptedAt: existing.termsAcceptedAt ?? termsStamp,
            privacyAcceptedAt: existing.privacyAcceptedAt ?? termsStamp,
            updatedAt: termsStamp,
          })
          .where(eq(users.id, existing.id));
        console.log(`  ✓ ${account.email} already exists (backfilled terms acceptance)`);
      } else {
        console.log(`  ✓ ${account.email} already exists`);
      }
      continue;
    }

    await db.insert(users).values({
      email: account.email.toLowerCase(),
      password: hash,
      firstName: account.firstName,
      lastName: account.lastName,
      role: account.role,
      authProvider: "email",
      termsAcceptedAt: termsStamp,
      privacyAcceptedAt: termsStamp,
    });
    console.log(`  + Created ${account.email} (${account.role})`);
  }

  // Seed one upcoming Kyoto trip for the traveler so /my-trips shows a card
  const traveler = await db
    .select()
    .from(users)
    .where(eq(users.email, "test-traveler-kyoto@traveloure.test"))
    .then((r) => r[0]);

  if (traveler) {
    const existingTrips = await db
      .select()
      .from(trips)
      .where(eq(trips.userId, traveler.id))
      .then((r) => r);

    if (existingTrips.length === 0) {
      // Create a trip ~60 days from now
      const start = new Date();
      start.setDate(start.getDate() + 60);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      const pad = (n: number) => String(n).padStart(2, "0");
      const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      await db.insert(trips).values({
        id: crypto.randomUUID(),
        userId: traveler.id,
        title: "Kyoto Discovery Trip",
        destination: "Kyoto, Japan",
        startDate: fmt(start),
        endDate: fmt(end),
        status: "planning",
        eventType: "vacation",
        numberOfTravelers: 2,
        adults: 2,
        kids: 0,
      });
      console.log(`  + Seeded Kyoto trip for ${traveler.email}`);
    } else {
      console.log(`  ✓ Traveler already has ${existingTrips.length} trip(s)`);
    }
  }

  console.log("\nE2E accounts ready.");
  console.log("Set E2E_BASE_URL to your HTTPS deploy URL and E2E_TEST_PASSWORD to the same password used here.");
}

/**
 * Purges ALL @traveloure.test accounts from the production database.
 * Uses a LIKE pattern rather than a hardcoded list — the .test TLD is
 * reserved (RFC 2606) and can never belong to a real user, so this is safe
 * and catches every test account present or future.
 * Call at startup when ENVIRONMENT === 'PROD'. Idempotent.
 */
async function purgeE2EAccountsFromProd() {
  const { sql } = await import("drizzle-orm");

  // NEUTRALIZE FIRST, delete second (dispatch P0 hardening): a plain DELETE can
  // fail on FK references (the traveler account owns a seeded trip), and a purge
  // that throws leaves a live admin credential behind. Step 1 always succeeds:
  // demote every test account to role 'user' and scramble its password to a
  // value that can never verify (no salt:hash shape), so even if deletion is
  // blocked the account is harmless.
  const scrambled = "!purged!" + crypto.randomBytes(24).toString("hex");
  const neutralized = await db
    .update(users)
    .set({ role: "user", password: scrambled, updatedAt: new Date() })
    .where(sql`${users.email} LIKE '%@traveloure.test'`)
    .returning({ email: users.email });
  if (neutralized.length > 0) {
    console.warn(`[security] Neutralized ${neutralized.length} @traveloure.test account(s) (demoted + password scrambled).`);
  }

  // Step 2: best-effort delete (LIKE pattern — the .test TLD is RFC-2606
  // reserved and can never belong to a real user). PER-ROW, not one bulk
  // statement: a single DELETE fails ENTIRELY if ANY row is FK-referenced,
  // which left all 60 prod residue rows behind (dispatch P1-1, Jul 28 2026)
  // when only some carried trips/bookings. Row-by-row removes every
  // unreferenced account; FK-blocked ones stay neutralized and are logged.
  try {
    const targets = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(sql`${users.email} LIKE '%@traveloure.test'`);
    let deleted = 0;
    const blocked: string[] = [];
    for (const t of targets) {
      try {
        await db.delete(users).where(eq(users.id, t.id));
        deleted++;
      } catch {
        blocked.push(t.email ?? t.id);
      }
    }
    if (deleted > 0) {
      console.warn(`[security] Purged ${deleted}/${targets.length} @traveloure.test account(s) from PROD DB.`);
    }
    if (blocked.length > 0) {
      console.warn(
        `[security] ${blocked.length} test account(s) FK-blocked from deletion — remain NEUTRALIZED (role user, unverifiable password):`,
      );
      blocked.forEach((e) => console.warn(`  - ${e}`));
    }
  } catch (err) {
    console.warn(`[security] Test-account purge enumeration failed — accounts remain NEUTRALIZED:`, err);
  }
}

export { seedE2EAccounts, purgeE2EAccountsFromProd };

// Run directly (tsx server/seeds/e2e-test-accounts.seed.ts)
if (process.argv[1] && process.argv[1].endsWith("e2e-test-accounts.seed.ts")) {
  seedE2EAccounts().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
