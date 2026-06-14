#!/usr/bin/env tsx
/**
 * E2E Test Account Seed
 * Creates the 5 test accounts that the E2E harness expects.
 * Run after `npm run seed:beta` or on a fresh DB before E2E.
 *
 * Usage: tsx server/seeds/e2e-test-accounts.seed.ts
 */

import { db } from "../db";
import { users } from "@shared/models/auth";
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

  console.log("\nE2E accounts ready.");
  console.log("Set E2E_BASE_URL to your HTTPS deploy URL and E2E_TEST_PASSWORD to the same password used here.");
}

seedE2EAccounts().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
