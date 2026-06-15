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

const PASSWORD = process.env.E2E_TEST_PASSWORD ?? "TestPass123!";

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
  console.log("Seeding E2E test accounts...");
  const hash = await hashPassword(PASSWORD);

  for (const account of E2E_ACCOUNTS) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, account.email.toLowerCase()))
      .then((r) => r[0]);

    if (existing) {
      console.log(`  ✓ ${account.email} already exists`);
      continue;
    }

    await db.insert(users).values({
      email: account.email.toLowerCase(),
      password: hash,
      firstName: account.firstName,
      lastName: account.lastName,
      role: account.role,
      authProvider: "email",
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

seedE2EAccounts().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
