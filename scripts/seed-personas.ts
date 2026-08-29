/**
 * Kyoto persona account/state seed for the persona-marketplace dispatch.
 *
 * Scope is deliberately narrow:
 *   - upsert fixed development-only email/password persona accounts;
 *   - upsert supported user-level plan_memberships rows;
 *   - never insert marketplace content, trips, bookings, services, templates,
 *     expert applications, or approvals.
 *
 * Trip Pass is reported as unsupported because the current schema stores it in
 * the plans catalog and does not have a per-trip entitlement table. Occasions
 * are also reported, not inserted: they are authored through the Plus flow,
 * outside this account/entitlement-only seed.
 *
 * Usage:
 *   npx tsx scripts/seed-personas.ts          # report only
 *   npx tsx scripts/seed-personas.ts --apply  # write development state
 */

import crypto from "node:crypto";
import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const PASSWORD = "TestPass123!";
const FIXED_SALT = "kyoto-persona-seed-fixed-salt";

type Persona = {
  key: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  bio: string;
  homeCity?: string;
};

type Membership = {
  key: string;
  personaKey: string;
  planKey: "plus_annual" | "pro_monthly";
  periodDays: number;
};

const PERSONAS: Persona[] = [
  {
    key: "gion-local-expert",
    email: "persona-gion-expert@traveloure.test",
    role: "local_expert",
    firstName: "Mika",
    lastName: "Fujita",
    bio: "Kyoto resident focused on Gion, Higashiyama, and thoughtful neighborhood walks.",
  },
  {
    key: "kyoto-trip-planner",
    email: "persona-kyoto-planner@traveloure.test",
    role: "travel_expert",
    firstName: "Noah",
    lastName: "Reed",
    bio: "Travel planner who turns Kyoto interests into calm, practical itineraries.",
  },
  {
    key: "kyoto-event-planner",
    email: "persona-kyoto-event-planner@traveloure.test",
    role: "event_planner",
    firstName: "Avery",
    lastName: "Morgan",
    bio: "Event planner for intimate Kyoto proposals, celebrations, and destination gatherings.",
  },
  {
    key: "kyoto-provider",
    email: "persona-kyoto-provider@traveloure.test",
    role: "service_provider",
    firstName: "Takeshi",
    lastName: "Ito",
    bio: "Kyoto-based transportation and arrival coordination provider.",
  },
  {
    key: "kyoto-free-traveler",
    email: "persona-kyoto-free-traveler@traveloure.test",
    role: "user",
    firstName: "Free",
    lastName: "Traveler",
    bio: "Development persona for the free traveler path.",
  },
  {
    key: "kyoto-trip-pass-traveler",
    email: "persona-kyoto-trip-pass@traveloure.test",
    role: "user",
    firstName: "Trip Pass",
    lastName: "Traveler",
    bio: "Development persona for the per-trip Trip Pass path.",
  },
  {
    key: "kyoto-plus-member",
    email: "persona-kyoto-plus@traveloure.test",
    role: "user",
    firstName: "Plus",
    lastName: "Member",
    bio: "Development persona for Plus membership and occasion delivery.",
    homeCity: "Kyoto",
  },
];

const MEMBERSHIPS: Membership[] = [
  {
    key: "kyoto-provider-pro",
    personaKey: "kyoto-provider",
    planKey: "pro_monthly",
    periodDays: 365,
  },
  {
    key: "kyoto-plus-membership",
    personaKey: "kyoto-plus-member",
    planKey: "plus_annual",
    periodDays: 365,
  },
];

function looksLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function hashPassword(password: string): string {
  const derivedKey = crypto.scryptSync(password, FIXED_SALT, 64);
  return `${FIXED_SALT}:${derivedKey.toString("hex")}`;
}

function periodEnd(days: number): string {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + days);
  return end.toISOString();
}

async function resolvePersonaIds(): Promise<Map<string, string>> {
  const result = await db.execute(sql`
    SELECT id, email
    FROM users
    WHERE email IN (${sql.join(PERSONAS.map((persona) => sql`${persona.email}`), sql`, `)})
  `);
  const byEmail = new Map(result.rows.map((row) => [String(row.email), String(row.id)]));
  return new Map(
    PERSONAS.flatMap((persona) => {
      const id = byEmail.get(persona.email);
      return id ? [[persona.key, id] as const] : [];
    }),
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const productionUrl = process.env.PROD_DATABASE_URL;
  const isKnownProductionDatabase = Boolean(
    databaseUrl && productionUrl && databaseUrl === productionUrl,
  );
  const isProductionRuntime =
    process.env.NODE_ENV === "production" || process.env.ENVIRONMENT === "PROD";

  if (APPLY && (isProductionRuntime || isKnownProductionDatabase)) {
    console.error(
      "[seed-personas] REFUSED: --apply cannot target a production runtime or the configured production database.\n" +
        "  Run without --apply first and review the report.",
    );
    process.exitCode = 2;
    return;
  }

  console.log("=== Kyoto persona seed report ===");
  console.log(`mode=${APPLY ? "apply" : "report-only"}`);
  console.log(`database_target=${looksLocal(databaseUrl) ? "local-development" : "managed-development"}`);
  console.log(`persona_count=${PERSONAS.length}`);
  console.log(`supported_membership_count=${MEMBERSHIPS.length}`);
  console.log("password=TestPass123! (development test credential)");

  if (!APPLY) {
    for (const persona of PERSONAS) {
      console.log(`WOULD UPSERT account ${persona.key}: ${persona.email} role=${persona.role}`);
    }
    for (const membership of MEMBERSHIPS) {
      console.log(
        `WOULD UPSERT membership ${membership.key}: ${membership.planKey} -> ${membership.personaKey}`,
      );
    }
    console.log("UNSUPPORTED/OMITTED: Trip Pass per-trip entitlement (no table/row shape exists).");
    console.log("UNSUPPORTED/OMITTED: Plus occasion row (created through the authenticated Plus flow).");
    console.log("NOT IN SCOPE: marketplace content, expert/provider forms, services, templates, trips, bookings, approvals.");
    return;
  }

  const password = hashPassword(PASSWORD);
  const acceptedAt = new Date().toISOString();

  await db.transaction(async (tx) => {
    const personaIds = new Map<string, string>();

    for (const persona of PERSONAS) {
      const result = await tx.execute(sql`
        INSERT INTO users (
          id, email, password, role, first_name, last_name, bio,
          auth_provider, terms_accepted_at, privacy_accepted_at,
          home_city, is_deleted, is_suspended, updated_at
        )
        VALUES (
          ${`persona-kyoto-${persona.key}`},
          ${persona.email},
          ${password},
          ${persona.role},
          ${persona.firstName},
          ${persona.lastName},
          ${persona.bio},
          'email',
          ${acceptedAt},
          ${acceptedAt},
          ${persona.homeCity ?? null},
          false,
          false,
          now()
        )
        ON CONFLICT (email) DO UPDATE SET
          password = EXCLUDED.password,
          role = EXCLUDED.role,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          bio = EXCLUDED.bio,
          auth_provider = EXCLUDED.auth_provider,
          terms_accepted_at = COALESCE(users.terms_accepted_at, EXCLUDED.terms_accepted_at),
          privacy_accepted_at = COALESCE(users.privacy_accepted_at, EXCLUDED.privacy_accepted_at),
          home_city = EXCLUDED.home_city,
          is_deleted = false,
          is_suspended = false,
          updated_at = now()
        RETURNING id
      `);
      const userId = result.rows[0]?.id;
      if (!userId) throw new Error(`Unable to resolve ${persona.key} after account upsert.`);
      personaIds.set(persona.key, String(userId));
    }

    for (const membership of MEMBERSHIPS) {
      const userId = personaIds.get(membership.personaKey);
      if (!userId) throw new Error(`Unable to resolve ${membership.personaKey} after account upsert.`);

      await tx.execute(sql`
        INSERT INTO plan_memberships (
          id, user_id, plan_key, status, current_period_start,
          current_period_end, source, updated_at
        )
        VALUES (
          ${`persona-kyoto-${membership.key}`},
          ${userId},
          ${membership.planKey},
          'active',
          now(),
          ${periodEnd(membership.periodDays)},
          'manual',
          now()
        )
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          plan_key = EXCLUDED.plan_key,
          status = 'active',
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          source = 'manual',
          updated_at = now()
      `);
    }
  });

  const personaIds = await resolvePersonaIds();
  const memberships = await db.execute(sql`
    SELECT pm.plan_key, pm.status, pm.source, u.email
    FROM plan_memberships pm
    JOIN users u ON u.id = pm.user_id
    WHERE u.email IN (${sql.join(PERSONAS.map((persona) => sql`${persona.email}`), sql`, `)})
      AND pm.id LIKE 'persona-kyoto-%'
    ORDER BY u.email, pm.plan_key
  `);

  for (const persona of PERSONAS) {
    console.log(`SEEDED account ${persona.key}: ${persona.email} role=${persona.role} id=${personaIds.get(persona.key)}`);
  }
  for (const row of memberships.rows) {
    console.log(
      `SEEDED membership ${row.email}: plan=${row.plan_key} status=${row.status} source=${row.source}`,
    );
  }
  console.log("UNSUPPORTED/OMITTED: Trip Pass per-trip entitlement (no table/row shape exists).");
  console.log("UNSUPPORTED/OMITTED: Plus occasion row (created through the authenticated Plus flow).");
  console.log("NOT IN SCOPE: marketplace content, expert/provider forms, services, templates, trips, bookings, approvals.");
}

main()
  .catch((error) => {
    console.error("[seed-personas] Error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });