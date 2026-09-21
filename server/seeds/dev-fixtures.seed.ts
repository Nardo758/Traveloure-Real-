#!/usr/bin/env tsx

/**
 * Dev fixtures — the two things a dev/QA database is missing once the boot
 * seeders have run (ledger `2026-09-20-dev-fixtures`).
 *
 * WHAT THIS IS FOR. A non-prod boot already gives a browsable, Kyoto-stocked
 * site: `server/index.ts` runs twenty seeders (the real catalogs plus the gated
 * demo ones — `seedPhaseDKyotoVendors` alone contributes nine Kyoto businesses
 * and twenty-seven `provider_services` rows, each with a resolved `category_id`),
 * and `e2e-test-accounts.seed.ts` contributes the five `*.traveloure.test`
 * accounts the E2E harness signs in as. Two things none of them produce are a
 * seller who reads as VERIFIED and an EXPERT-OWNED `booking_concierge` listing.
 * This seeder tops up exactly those two, and nothing else.
 *
 * IT CREATES NO ACCOUNTS. `e2e-test-accounts.seed.ts` is the ONE author of the
 * `*.traveloure.test` accounts (§18 rule 1 — a second author of the same rows is
 * the derivation-drift class). This seeder RESOLVES them and REFUSES with a
 * named message when they are absent, rather than minting a second copy under
 * the same address.
 *
 * ═══ WHY IT SEEDS NO PAID BOOKINGS, AND WHY THAT IS A RULING AND NOT A GAP ═══
 *
 * The obvious next fixture is "a few `service_bookings` in the lifecycle states
 * worth clicking". There is no honest way to write one today, and the dishonest
 * ways are both already named in this codebase:
 *
 *   (a) FABRICATE A PaymentIntent id. This is what `beta-reviews-bookings.ts`
 *       does (`pi_${crypto.randomUUID()}`), and `shared/reconciliation-kinds.ts`
 *       names that file BY NAME as one of three INDISTINGUISHABLE sources of
 *       `payment_provenance_unverified`. It is also the §19a violation on the
 *       birth side: `stripe_payment_intent_id` is written ONLY by the shared
 *       promotion path (`stampAuthorization`/`resolveAndStamp`).
 *
 *   (b) LEAVE THE PaymentIntent NULL on a paid-equivalent row. That is a
 *       CRITICAL `booking_confirmed_no_pi` drift exception — "the booking says
 *       the traveler paid and there is no payment to point at".
 *       `PAID_EQUIVALENT_STATUSES` (`server/jobs/stripeReconciliation.ts`) is
 *       `confirmed, in_progress, completed, delivered, disputed,
 *       partially_completed`, so every status a bookings surface actually wants
 *       to show is in it.
 *
 * Seeding only the statuses that happen to fall OUTSIDE that list
 * (`awaiting_acceptance`, `completion_declared`) would be gaming the detector
 * rather than being honest with it, and it would silently start producing
 * critical exceptions the day someone adds those statuses to the list — which,
 * since an awaiting-acceptance booking HAS been paid for, they arguably should.
 *
 * So: no booking is seeded, the reason is stated here rather than left as an
 * absence somebody re-discovers, and HOW a seeded paid booking should represent
 * its payment is a question for the decision-maker (the honest candidates are a
 * Stripe TEST-mode PaymentIntent minted by the seeder, or a fixture-scope
 * exclusion in the drift job — both of which are new rails, not seed data).
 * `inScope()` in that job is a test affordance (`onlyBookingIds`), NOT a
 * fixture-exclusion hook — it cannot be used for this.
 *
 * Idempotent: every write is keyed and re-running changes nothing.
 * Run: `npx tsx server/seeds/dev-fixtures.seed.ts`
 */

import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { users, providerServices, serviceProviderForms } from "@shared/schema";
import { demoSeedsAllowed, demoSeedSkipMessage } from "./lib/demo-seed-gate";

/** Owned by e2e-test-accounts.seed.ts — resolved here, never created here. */
const VERIFIED_SELLER_EMAIL = "kyoto-photography@traveloure.test";
const CONCIERGE_EXPERT_EMAIL = "kyoto-food@traveloure.test";

/** The offering key migration 065 creates; `shared/expert-offerings.ts` maps it to the
 *  `coordination` tier. Named here so the listing is found by the SAME key the
 *  booking-concierge service reads, never by a title match. */
const CONCIERGE_OFFERING_KEY = "booking_concierge";
const CONCIERGE_SERVICE_NAME = "Kyoto Booking Concierge (dev fixture)";

type FixtureResult = {
  sellerVerified: boolean;
  conciergeListingId: string | null;
  skipped: string[];
};

async function resolveUserId(email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row?.id ?? null;
}

export async function seedDevFixtures(): Promise<FixtureResult> {
  // Refusal FIRST, before any DB write (CLAUDE.md §13). Same ONE predicate every
  // other demo seeder uses (§18 rule 1) — never a second copy of "what counts as
  // production".
  if (!demoSeedsAllowed()) {
    console.log(demoSeedSkipMessage("dev-fixtures"));
    return { sellerVerified: false, conciergeListingId: null, skipped: ["prod-strict"] };
  }

  const skipped: string[] = [];
  let sellerVerified = false;
  let conciergeListingId: string | null = null;

  // ── F1: the seller reads as VERIFIED ───────────────────────────────────────
  // `loadPublicVerification` (server/routes.ts) derives the badge from the
  // service_provider_forms row's two verification statuses, so that row — not a
  // column on `users` — is what a fixture has to provide.
  const sellerId = await resolveUserId(VERIFIED_SELLER_EMAIL);
  if (!sellerId) {
    console.log(
      `  ! ${VERIFIED_SELLER_EMAIL} not found — run \`tsx server/seeds/e2e-test-accounts.seed.ts\` first. ` +
        `This seeder does not create accounts (e2e-test-accounts.seed.ts is their one author).`,
    );
    skipped.push("verified-seller:account-absent");
  } else {
    const [form] = await db
      .select({
        id: serviceProviderForms.id,
        identityVerificationStatus: serviceProviderForms.identityVerificationStatus,
        businessVerificationStatus: serviceProviderForms.businessVerificationStatus,
      })
      .from(serviceProviderForms)
      .where(eq(serviceProviderForms.userId, sellerId))
      .limit(1);

    if (!form) {
      await db.insert(serviceProviderForms).values({
        userId: sellerId,
        businessName: "Nakamura Photography (dev fixture)",
        name: "Kenji Nakamura",
        email: VERIFIED_SELLER_EMAIL,
        mobile: "+81-75-000-0000",
        country: "Japan",
        address: "Higashiyama, Kyoto",
        businessType: "sole_trader",
        identityVerificationStatus: "verified",
        businessVerificationStatus: "verified",
      });
      sellerVerified = true;
      console.log(`  + Verified seller: created service_provider_forms for ${VERIFIED_SELLER_EMAIL}`);
    } else if (
      form.identityVerificationStatus === "verified" &&
      form.businessVerificationStatus === "verified"
    ) {
      sellerVerified = true;
      console.log(`  = Verified seller: ${VERIFIED_SELLER_EMAIL} already verified`);
    } else {
      // Only the two verification statuses are touched. Everything else an
      // operator or an earlier seed put on this row is left exactly as it is.
      await db
        .update(serviceProviderForms)
        .set({ identityVerificationStatus: "verified", businessVerificationStatus: "verified" })
        .where(eq(serviceProviderForms.id, form.id));
      sellerVerified = true;
      console.log(`  + Verified seller: flipped both verification statuses for ${VERIFIED_SELLER_EMAIL}`);
    }
  }

  // ── F2: an EXPERT-OWNED booking_concierge listing ──────────────────────────
  // Migration 313's platform-owned concierge listing exists, but the platform
  // account is deliberately excluded from the Locked Decision 51 expert-share
  // re-split and ranks LAST in the lead-routing scorer — so it cannot exercise
  // the split, the hand-off's stamped `expert_id`, or the §51 plan-read grant.
  // An expert-owned one can.
  const expertId = await resolveUserId(CONCIERGE_EXPERT_EMAIL);
  if (!expertId) {
    console.log(
      `  ! ${CONCIERGE_EXPERT_EMAIL} not found — run \`tsx server/seeds/e2e-test-accounts.seed.ts\` first.`,
    );
    skipped.push("concierge-listing:account-absent");
  } else {
    const [existing] = await db
      .select({ id: providerServices.id })
      .from(providerServices)
      .where(
        and(
          eq(providerServices.userId, expertId),
          eq(providerServices.expertOfferingTypeKey, CONCIERGE_OFFERING_KEY),
        ),
      )
      .limit(1);

    if (existing) {
      conciergeListingId = existing.id;
      console.log(`  = Concierge listing: ${CONCIERGE_EXPERT_EMAIL} already sells ${CONCIERGE_OFFERING_KEY}`);
    } else {
      // NOTE the absences, each deliberate:
      //  • no `revenueShareRate` — §8/§18 forbid a rate literal outside fee_bands;
      //    leaving it unset makes the split derive at checkout like any wizard row.
      //  • born `approved`/`active` — the documented seeder exception to migration
      //    111's born-submitted default (ledger 2026-08-23-provenance-move2-seeders):
      //    demo data must be publicly visible to be worth seeding.
      const [row] = await db
        .insert(providerServices)
        .values({
          userId: expertId,
          createdVia: "seed",
          serviceName: CONCIERGE_SERVICE_NAME,
          shortDescription: "We book your Kyoto plan's partner items for you.",
          description:
            "Dev fixture for the expert-owned Booking Concierge path: hand-off request creation, " +
            "the Locked Decision 51 fee cap and expert share, and the pending plan-read grant.",
          serviceType: "concierge",
          expertOfferingTypeKey: CONCIERGE_OFFERING_KEY,
          price: "120.00",
          priceType: "fixed",
          deliveryMethod: "async_messaging",
          city: "Kyoto",
          approvalStatus: "approved",
          status: "active",
        })
        .returning({ id: providerServices.id });
      conciergeListingId = row?.id ?? null;
      console.log(`  + Concierge listing: created for ${CONCIERGE_EXPERT_EMAIL} (${conciergeListingId})`);
    }
  }

  console.log(
    "  · No service_bookings seeded — see this file's header: every way to represent a seeded " +
      "booking's payment today is either a fabricated Stripe identity (§19a) or a critical " +
      "`booking_confirmed_no_pi` drift exception.",
  );

  return { sellerVerified, conciergeListingId, skipped };
}

// CLI entry — ESM. `require.main` does NOT exist in this repo (package.json is
// `"type": "module"`); using it is what left `npm run seed:beta` crashing on import.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  console.log("[dev-fixtures] Seeding…");
  seedDevFixtures()
    .then((r) => {
      console.log(
        `[dev-fixtures] Done. verifiedSeller=${r.sellerVerified} conciergeListing=${r.conciergeListingId ?? "none"}` +
          (r.skipped.length ? ` skipped=${r.skipped.join(",")}` : ""),
      );
      process.exit(r.skipped.length > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error("[dev-fixtures] Failed:", error);
      process.exit(1);
    });
}

export default seedDevFixtures;
