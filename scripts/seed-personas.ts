/**
 * Kyoto persona account/state seed for the persona-marketplace dispatch.
 *
 * Scope:
 *   - upsert fixed development-only email/password persona accounts;
 *   - upsert supported user-level plan_memberships rows;
 *   - upsert PRE-VERIFIED identity/business rows on local_expert_forms /
 *     service_provider_forms for the three earner personas (see "Verification
 *     pre-seed" below) — added for Persona Lane B (trip_entitlements landed,
 *     migration 262);
 *   - never insert marketplace content, trips, bookings, services, templates,
 *     or approvals — Lane B's Playwright suites create those through the
 *     product's own UI/API flows, never as direct SQL fixtures.
 *
 * Trip Pass (`trip_entitlements`, migration 262, PR #621): the table now
 * EXISTS, but this seed still does not grant a pass, and that is not a gap —
 * it is §19a. The table's sole writer is `grantTripPass()`
 * (server/services/trip-entitlement.service.ts), whose `sourcePaymentId`
 * parameter is a required string, never optional: the schema comment on
 * `tripEntitlements` (shared/schema.ts) states plainly that the column "is
 * PAYMENT IDENTITY (§19a): written ONLY by the server-side grant path from a
 * Stripe-verified PaymentIntent" and that there is "deliberately NO
 * createInsertSchema for this table". Unlike `plan_memberships` — which has
 * an explicit `source` column (`'stripe' | 'manual' | 'beta'`) built exactly
 * so a seed can grant a membership without a payment — `trip_entitlements`
 * carries no such vocabulary. A direct INSERT here (even leaving
 * source_payment_id NULL, which the DB column alone would permit) would make
 * this seed a second, unaudited writer of a §19a-protected column, which is
 * the exact class of defect §18's "two authors resolving [a privileged value]
 * two ways" rule exists to prevent. So this seed does not touch
 * trip_entitlements — the real purchase is a fully shipped, Stripe-gated flow
 * (`POST /api/trips/:tripId/trip-pass/purchase` +
 * `.../purchase/confirm`, server/routes/trip-pass.routes.ts) and
 * journey-traveler.spec.ts exercises it directly, under the SAME
 * Stripe-test-mode gate (hasStripeTestKey / STRIPE_UNAVAILABLE) the checkout
 * journeys already use: a real sk_test_ key runs the full purchase → confirm
 * → grantTripPass path and asserts the resulting `trip_entitlements` row; a
 * stub key asserts the honest negative (no entitlement row, per the same
 * ruling-38-style contract). Occasions are also reported, not inserted: they
 * are authored through the Plus flow, outside this account/entitlement-only
 * seed.
 *
 * Verification pre-seed (Persona Lane B): real Stripe Identity/KYB cannot run
 * in a CI container, and `resolvePublishVerification`
 * (server/services/publish-verification.service.ts) — the ONE gate every
 * publish path resolves through — holds a listing at `status='draft'` for an
 * earner whose form is not `identityVerificationStatus === 'verified'`
 * (providers additionally need `businessVerificationStatus === 'verified'`).
 * For a PROVIDER the wizard's Submit button is flatly DISABLED while
 * unverified (`verificationGateBlocked`, client/src/components/ServiceForm.tsx)
 * — there is no way to even create a service through the UI without it. This
 * seed is the sanctioned dev-only stand-in for that external dependency: it
 * upserts a form row with identity (+ business, for the provider) already
 * `'verified'`, exactly as the Lane-A supply-pass findings called for
 * ("the dev-only provider verification override... extending it to the
 * expert path... is the prerequisite for publishing the expert offering
 * without real KYB" — docs/testing/PERSONA_LANE_B_HANDOFF.md). It does NOT
 * fabricate an admin-reviewed application (`status` is left at its schema
 * default, 'pending') and it does NOT touch any rate/fee/payout column (the
 * MI-1-swept family already `.omit()`'d from insertLocalExpertFormSchema) —
 * only the identity/business verification fields, which is the one external
 * dependency a CI container cannot itself clear.
 *
 * Because `POST /api/expert-forms` allows a fresh submission only when NO
 * form exists yet (or the existing one is `status='rejected'`), and
 * `POST /api/provider-application` allows it only when none exists at all,
 * pre-seeding these rows changes what a suite's "complete the form" step can
 * literally do: supply-expert.spec.ts / supply-provider.spec.ts read the
 * existing (seed-verified) application first and, finding one, assert its
 * saved state and exercise a REAL edit endpoint on top
 * (`PATCH /api/expert/profile` / `PATCH /api/provider-application`) rather
 * than re-POST a form that would already exist. See those specs for the
 * detail; this file only establishes the verified base row.
 *
 * A SECOND, SEPARATE gate exists for providers only, found by the persona-nightly proof
 * run: ServiceForm.tsx's `publishBlocked` (`isCategoryGated && !isProviderVerified`) reads
 * `GET /api/provider/verification-status`, which is `users.provider_verification_status` /
 * `users.background_check_confirmed` (shared/models/auth.ts) — NOT anything on
 * `service_provider_forms`. A background-check-gated category (`service_categories
 * .requires_background_check`, or `insurance_band >= 2`) stays disabled ("Verification
 * Required") for a provider whose ONLY pre-seeded state is the form's identity/business
 * fields above. The server-side publish gate at `POST /api/provider/services` checks the
 * SAME two `users` columns, so both are seeded together (see the PROVIDER_FORMS loop
 * below) — a provider persona is a fully-vetted provider for every category, not just the
 * gate the form row alone clears.
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

// ── Verification pre-seed (see module header "Verification pre-seed") ─────────
// Pre-verified identity(+business) rows on local_expert_forms / service_provider_forms.
// Deliberately minimal: only the fields resolvePublishVerification and the wizard's
// category/derived fields need. `status` is left at its schema default ('pending') —
// this seed stands in for Stripe Identity/KYB only, never for a human admin review.
type ExpertFormSeed = {
  key: string;
  personaKey: string;
  expertType: "local_expert" | "travel_expert" | "event_planner";
  city: string;
  neighborhoods: string[];
  localSpecialties: string[];
};

type ProviderFormSeed = {
  key: string;
  personaKey: string;
  businessName: string;
  businessType: string;
};

const EXPERT_FORMS: ExpertFormSeed[] = [
  {
    key: "gion-local-expert-form",
    personaKey: "gion-local-expert",
    expertType: "local_expert",
    city: "Kyoto",
    neighborhoods: ["Gion"],
    localSpecialties: ["Gion walks", "Higashiyama history", "neighborhood etiquette"],
  },
  {
    key: "kyoto-trip-planner-form",
    personaKey: "kyoto-trip-planner",
    expertType: "travel_expert",
    city: "Kyoto",
    neighborhoods: [],
    localSpecialties: [],
  },
  {
    key: "kyoto-event-planner-form",
    personaKey: "kyoto-event-planner",
    expertType: "event_planner",
    city: "Kyoto",
    neighborhoods: [],
    localSpecialties: [],
  },
];

const PROVIDER_FORMS: ProviderFormSeed[] = [
  {
    key: "kyoto-provider-form",
    personaKey: "kyoto-provider",
    businessName: "Ito Kyoto Arrivals",
    businessType: "Transportation",
  },
];

type ExpertFormReconciliation = {
  personaKey: string;
  survivorId: string;
  removedIds: string[];
};

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
  console.log(`verification_preseed_count=${EXPERT_FORMS.length + PROVIDER_FORMS.length}`);
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
    for (const form of EXPERT_FORMS) {
      console.log(
        `WOULD UPSERT local_expert_forms ${form.key}: expertType=${form.expertType} city=${form.city} identityVerificationStatus=verified`,
      );
    }
    for (const form of PROVIDER_FORMS) {
      console.log(
        `WOULD UPSERT service_provider_forms ${form.key}: businessType=${form.businessType} identityVerificationStatus=verified businessVerificationStatus=verified`,
      );
      console.log(
        `WOULD UPDATE users ${form.personaKey}: provider_verification_status=verified background_check_confirmed=true ` +
          `(the SEPARATE category-level publishBlocked gate — ServiceForm.tsx isCategoryGated/isProviderVerified, ` +
          `GET /api/provider/verification-status — not the form's own identity/business fields above)`,
      );
    }
    console.log(
      "UNSUPPORTED/OMITTED (by design, §19a): Trip Pass per-trip entitlement grant. " +
        "trip_entitlements EXISTS (migration 262) but its sole writer grantTripPass() " +
        "(server/services/trip-entitlement.service.ts) requires a real Stripe-verified " +
        "PaymentIntent id and carries no manual/beta source vocabulary (unlike " +
        "plan_memberships.source) — this seed does not become a second writer of that " +
        "§19a-protected column. journey-traveler.spec.ts exercises the real purchase+confirm " +
        "flow under Stripe test mode instead.",
    );
    console.log("UNSUPPORTED/OMITTED: Plus occasion row (created through the authenticated Plus flow).");
    console.log("NOT IN SCOPE: marketplace content, services, templates, trips, bookings, approvals.");
    return;
  }

  const password = hashPassword(PASSWORD);
  const acceptedAt = new Date().toISOString();
  const expertFormReconciliations: ExpertFormReconciliation[] = [];

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

    // ── Verification pre-seed (see module header "Verification pre-seed") ─────
    const verifiedAt = new Date().toISOString();
    for (const form of EXPERT_FORMS) {
      const userId = personaIds.get(form.personaKey);
      const persona = PERSONAS.find((p) => p.key === form.personaKey);
      if (!userId || !persona) throw new Error(`Unable to resolve ${form.personaKey} after account upsert.`);

      // A persona can already have a real application created by the product flow (and that
      // application can be the one an approval, offering, or storefront journey references).
      // local_expert_forms has no row-level foreign keys from those user-owned records, so the
      // lifecycle status is the only row-local signal we can safely use: preserve exactly one
      // approved row, refuse to guess when multiple approved rows exist, and otherwise prefer
      // the stable seed id. This makes the seed self-healing without deleting user-owned
      // offerings or a claimed handle.
      const existingForms = await tx.execute(sql`
        SELECT id, status, created_at
        FROM local_expert_forms
        WHERE user_id = ${userId}
        ORDER BY created_at ASC NULLS LAST, id ASC
        FOR UPDATE
      `);
      const rows = existingForms.rows.map((row) => ({
        id: String(row.id),
        status: row.status == null ? null : String(row.status),
        createdAt: row.created_at == null ? null : String(row.created_at),
      }));
      const approvedRows = rows.filter((row) => row.status === "approved");
      if (approvedRows.length > 1) {
        throw new Error(
          `[seed-personas] REFUSED to reconcile ${form.personaKey}: multiple approved ` +
            `local_expert_forms rows (${approvedRows.map((row) => row.id).join(", ")}). ` +
            "Both may have dependent product state; review manually rather than guessing.",
        );
      }

      const expectedId = `persona-kyoto-${form.key}`;
      const survivor =
        approvedRows[0] ??
        rows.find((row) => row.id === expectedId) ??
        rows[0] ??
        { id: expectedId, status: null, createdAt: null };
      const removedIds = rows.filter((row) => row.id !== survivor.id).map((row) => row.id);
      if (removedIds.length > 0) {
        await tx.execute(sql`
          DELETE FROM local_expert_forms
          WHERE user_id = ${userId}
            AND id IN (${sql.join(removedIds.map((id) => sql`${id}`), sql`, `)})
        `);
      }
      expertFormReconciliations.push({ personaKey: form.personaKey, survivorId: survivor.id, removedIds });

      await tx.execute(sql`
        INSERT INTO local_expert_forms (
          id, user_id, expert_type, first_name, last_name, email, country, city,
          neighborhoods, local_specialties, bio,
          identity_verification_status, identity_verified_at, created_at
        )
        VALUES (
          ${survivor.id},
          ${userId},
          ${form.expertType},
          ${persona.firstName},
          ${persona.lastName},
          ${persona.email},
          'Japan',
          ${form.city},
          ${JSON.stringify(form.neighborhoods)}::jsonb,
          ${JSON.stringify(form.localSpecialties)}::jsonb,
          ${persona.bio},
          'verified',
          ${verifiedAt},
          now()
        )
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          expert_type = EXCLUDED.expert_type,
          country = EXCLUDED.country,
          city = EXCLUDED.city,
          neighborhoods = EXCLUDED.neighborhoods,
          local_specialties = EXCLUDED.local_specialties,
          identity_verification_status = 'verified',
          identity_verified_at = COALESCE(local_expert_forms.identity_verified_at, EXCLUDED.identity_verified_at)
      `);
    }

    for (const form of PROVIDER_FORMS) {
      const userId = personaIds.get(form.personaKey);
      const persona = PERSONAS.find((p) => p.key === form.personaKey);
      if (!userId || !persona) throw new Error(`Unable to resolve ${form.personaKey} after account upsert.`);

      await tx.execute(sql`
        INSERT INTO service_provider_forms (
          id, user_id, business_name, name, email, mobile, country, city, address,
          business_type, description,
          identity_verification_status, identity_verified_at, business_verification_status,
          created_at
        )
        VALUES (
          ${`persona-kyoto-${form.key}`},
          ${userId},
          ${form.businessName},
          ${`${persona.firstName} ${persona.lastName}`},
          ${persona.email},
          '+81-75-000-0000',
          'Japan',
          'Kyoto',
          'Kyoto, Japan',
          ${form.businessType},
          ${persona.bio},
          'verified',
          ${verifiedAt},
          'verified',
          now()
        )
        ON CONFLICT (id) DO UPDATE SET
          business_name = EXCLUDED.business_name,
          business_type = EXCLUDED.business_type,
          city = EXCLUDED.city,
          identity_verification_status = 'verified',
          identity_verified_at = COALESCE(service_provider_forms.identity_verified_at, EXCLUDED.identity_verified_at),
          business_verification_status = 'verified'
      `);

      // Category-level publish gate (SEPARATE from the service_provider_forms identity/business
      // verification above): client/src/components/ServiceForm.tsx's
      //   isCategoryGated = requiresBackgroundCheck || insuranceBand >= 2
      //   isProviderVerified = verificationStatus.providerVerificationStatus === "verified"
      //   publishBlocked = role === "provider" && isCategoryGated && !isProviderVerified
      // reads GET /api/provider/verification-status, which is users.provider_verification_status
      // / users.background_check_confirmed (shared/models/auth.ts) — not anything on
      // service_provider_forms. The server-side publish gate at POST /api/provider/services
      // checks BOTH of those same users columns (providerVerificationStatus==='verified' AND,
      // for a requires_background_check category, backgroundCheckConfirmed) before accepting
      // status:'active', so both are seeded together here — setting only the form's identity/
      // business fields left this category-level gate unaddressed (found by the Aug 29 persona-
      // nightly proof run: a background-check-gated category's Publish button stayed disabled
      // with "Verification Required" for an otherwise seed-verified provider persona).
      await tx.execute(sql`
        UPDATE users
        SET provider_verification_status = 'verified',
            background_check_confirmed = true,
            updated_at = now()
        WHERE id = ${userId}
      `);
    }
  });

  for (const reconciliation of expertFormReconciliations) {
    console.log(
      `RECONCILED expert_form ${reconciliation.personaKey}: survivor=${reconciliation.survivorId} ` +
        `removed=${reconciliation.removedIds.length > 0 ? reconciliation.removedIds.join(",") : "none"}`,
    );
  }

  const personaIds = await resolvePersonaIds();
  const memberships = await db.execute(sql`
    SELECT pm.plan_key, pm.status, pm.source, u.email
    FROM plan_memberships pm
    JOIN users u ON u.id = pm.user_id
    WHERE u.email IN (${sql.join(PERSONAS.map((persona) => sql`${persona.email}`), sql`, `)})
      AND pm.id LIKE 'persona-kyoto-%'
    ORDER BY u.email, pm.plan_key
  `);

  const forms = await db.execute(sql`
    SELECT 'expert' AS kind, u.email, lef.expert_type AS detail, lef.identity_verification_status AS identity
    FROM local_expert_forms lef
    JOIN users u ON u.id = lef.user_id
    WHERE lef.id LIKE 'persona-kyoto-%-form'
    UNION ALL
    SELECT 'provider' AS kind, u.email, spf.business_type AS detail, spf.identity_verification_status AS identity
    FROM service_provider_forms spf
    JOIN users u ON u.id = spf.user_id
    WHERE spf.id LIKE 'persona-kyoto-%-form'
    ORDER BY email
  `);

  for (const persona of PERSONAS) {
    console.log(`SEEDED account ${persona.key}: ${persona.email} role=${persona.role} id=${personaIds.get(persona.key)}`);
  }
  for (const row of memberships.rows) {
    console.log(
      `SEEDED membership ${row.email}: plan=${row.plan_key} status=${row.status} source=${row.source}`,
    );
  }
  for (const row of forms.rows) {
    console.log(
      `SEEDED ${row.kind}_form ${row.email}: detail=${row.detail} identity_verification_status=${row.identity}`,
    );
  }
  const providerClearance = await db.execute(sql`
    SELECT u.email, u.provider_verification_status, u.background_check_confirmed
    FROM users u
    WHERE u.id IN (${sql.join(
      PROVIDER_FORMS.map((form) => sql`${personaIds.get(form.personaKey)}`),
      sql`, `,
    )})
  `);
  for (const row of providerClearance.rows) {
    console.log(
      `SEEDED category-gate clearance ${row.email}: provider_verification_status=${row.provider_verification_status} background_check_confirmed=${row.background_check_confirmed}`,
    );
  }
  console.log(
    "UNSUPPORTED/OMITTED (by design, §19a): Trip Pass per-trip entitlement grant — see the " +
      "module header. journey-traveler.spec.ts exercises the real Stripe-gated purchase flow.",
  );
  console.log("UNSUPPORTED/OMITTED: Plus occasion row (created through the authenticated Plus flow).");
  console.log("NOT IN SCOPE: marketplace content, services, templates, trips, bookings, approvals.");
}

main()
  .catch((error) => {
    console.error("[seed-personas] Error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
