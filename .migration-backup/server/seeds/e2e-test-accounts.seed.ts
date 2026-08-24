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
import { storage } from "../storage";
import { users } from "@shared/models/auth";
import { trips, tripCollaborators } from "@shared/schema";
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

/**
 * FIXTURE-OWNER LOGIN BACKFILL (added Aug 15 2026 with the provider-console gate).
 *
 * Some specs must authenticate as an account that a DIFFERENT seed creates, because they assert
 * against that seed's specific listings. `kyoto-interpreter@traveloure.test` is created by
 * server/seeds/phase-d-kyoto-vendors.seed.ts, which sets NO password — so the four committed
 * provider-console specs that log in as it (catalog-map-located, catalog-preview-toggle,
 * distribute-channels, service-logistics-step) could not authenticate in ANY environment. They
 * were in no workflow, so nothing surfaced it; they were presumably written against a hand-set
 * password in a local session.
 *
 * Repointing those specs at `kyoto-photography` (which does get a password above) was the other
 * option and was rejected: the interpreter's three seeded listings are exactly what make the
 * D-3/D-4 both-branch proof possible (one `async_messaging` "happens nowhere" row + two
 * `in_person` place-anchored rows). The fixture is the point, so the fixture gets a login.
 *
 * The same accounts also need a STOREFRONT HANDLE. `ProviderStorefrontHeader` renders its live
 * badge, share caption and share tools only when the account has one, so distribute-shell's
 * "storefront live + neutral caption" assertions were unreachable for a handle-less fixture —
 * the second half of why that spec never passed. The handle mirrors the vendor seed's own
 * business identity (Kansai Business Language / kansai-bizlang.traveloure.test).
 *
 * IDEMPOTENT AND NON-DESTRUCTIVE: only ever fills a NULL password / NULL handle. An account that
 * already has either — a real user in any environment that shares this address — is left
 * untouched. The production refusal at the top of seedE2EAccounts() gates this block too.
 */
const FIXTURE_LOGIN_BACKFILL: Array<{ email: string; handle: string }> = [
  { email: "kyoto-interpreter@traveloure.test", handle: "kansai-bizlang" },
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

  // ── Fixture-owner login backfill (see FIXTURE_LOGIN_BACKFILL above) ──────────────────────────
  for (const fixture of FIXTURE_LOGIN_BACKFILL) {
    const row = await db
      .select()
      .from(users)
      .where(eq(users.email, fixture.email.toLowerCase()))
      .then((r) => r[0]);

    if (!row) {
      // Its owning seed has not run (or was renamed). Say so — a silent skip here reappears
      // later as an opaque 401 inside a browser spec.
      console.log(
        `  ! ${fixture.email} not found — its owning seed has not run; console specs that log in as it will 401`,
      );
      continue;
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (!row.password) patch.password = hash;
    if (!row.termsAcceptedAt) patch.termsAcceptedAt = new Date();
    if (!row.privacyAcceptedAt) patch.privacyAcceptedAt = new Date();
    // Only claim the handle if it is genuinely free — never take one from another account.
    if (!row.handle) {
      const taken = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.handle, fixture.handle))
        .then((r) => r[0]);
      if (taken) {
        console.log(`  ! handle @${fixture.handle} already belongs to another account — left as-is`);
      } else {
        patch.handle = fixture.handle;
      }
    }

    if (Object.keys(patch).length === 1) {
      console.log(`  ✓ ${fixture.email} already has a login + handle`);
      continue;
    }
    await db.update(users).set(patch).where(eq(users.id, row.id));
    console.log(`  + Backfilled fixture owner ${fixture.email} (${Object.keys(patch).filter((k) => k !== "updatedAt").join(", ")})`);
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

      const tripId = crypto.randomUUID();
      // Lane S ruling 17: every trip mints its identity at birth — seeds included.
      const trackingNumber = await storage.generateTrackingNumber("TRV");
      await db.insert(trips).values({
        id: tripId,
        userId: traveler.id,
        trackingNumber,
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
      // L10: getTripRole resolves access by assignment only — without this row the seeded
      // traveler 403s on assignment-gated surfaces of their own trip until the boot backfill runs.
      await db
        .insert(tripCollaborators)
        .values({ tripId, userId: traveler.id, role: "owner" })
        .onConflictDoNothing();
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
