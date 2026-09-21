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
 * accounts the E2E harness signs in as. What none of them produce is a seller
 * who reads as VERIFIED, an EXPERT-OWNED `booking_concierge` listing, or any
 * `service_quotes` row at all. This seeder tops up exactly those:
 *
 *   F1  a VERIFIED seller (`service_provider_forms`, both verification statuses).
 *   F2  an EXPERT-OWNED `booking_concierge` listing.
 *   F3  a `custom_quote` listing whose price authority is the quote, not the row.
 *   F4  three `service_quotes` in the three READER states — expired (derived),
 *       acceptable, and awaiting a quote.
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
 * ═══ WHY IT SEEDS NO CART / PLAN ITEM EITHER, ALSO DELIBERATE ═══
 *
 * The other obvious fixture is a plan item routed to `ready_for_checkout` — the
 * cart. Locked Decision 39 rules the cart is the `ready_for_checkout`
 * PROJECTION of `itinerary_items` and NOT a second store, with ONE copy-down
 * (`syncItemProjection`) and ONE cart→item writer (`buildPlanItemValues`). But
 * `cart_items` is still a live table beside `itinerary_items`, so hand-writing
 * this fixture means hand-writing BOTH sides of that projection — exactly the
 * second copier §18 rule 1 names. An inconsistent pair is worse than no fixture,
 * because it teaches a reader to distrust the ones that ARE right. Doing it
 * properly means driving the real add-to-plan / route-to-checkout rails, which
 * is a lane rather than a seed block.
 *
 * WHY QUOTES ARE SAFE WHERE THOSE TWO ARE NOT: a quote carries an amount and an
 * expiry but NO charge, and even an ACCEPTED quote's booking is born `pending`
 * (the charge rail's own guard is `WHERE status = 'pending'`) — a PROVISIONAL
 * status, so it is outside `PAID_EQUIVALENT_STATUSES` and asserts nothing about
 * payment. Nothing seeded here is visible to a money-integrity detector.
 *
 * Idempotent: every write is keyed and re-running changes nothing.
 * Run: `npx tsx server/seeds/dev-fixtures.seed.ts`
 */

import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { users, providerServices, serviceProviderForms, serviceQuotes } from "@shared/schema";
import { SERVICE_QUOTE_CURRENCY } from "@shared/service-quotes";
import { demoSeedsAllowed, demoSeedSkipMessage } from "./lib/demo-seed-gate";

/** Owned by e2e-test-accounts.seed.ts — resolved here, never created here. */
const VERIFIED_SELLER_EMAIL = "kyoto-photography@traveloure.test";
const CONCIERGE_EXPERT_EMAIL = "kyoto-food@traveloure.test";

/** The offering key migration 065 creates; `shared/expert-offerings.ts` maps it to the
 *  `coordination` tier. Named here so the listing is found by the SAME key the
 *  booking-concierge service reads, never by a title match. */
const CONCIERGE_OFFERING_KEY = "booking_concierge";
const CONCIERGE_SERVICE_NAME = "Kyoto Booking Concierge (dev fixture)";

/** The traveler the E2E harness signs in as — also owned by e2e-test-accounts.seed.ts. */
const QUOTE_TRAVELER_EMAIL = "test-traveler-kyoto@traveloure.test";
/** A `custom_quote` listing: its price authority is the QUOTE, never the listing (LD 49). */
const QUOTE_SERVICE_NAME = "Kyoto Private Photo Session — by quote (dev fixture)";

type FixtureResult = {
  sellerVerified: boolean;
  conciergeListingId: string | null;
  quoteListingId: string | null;
  quotesCreated: number;
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
    return { sellerVerified: false, conciergeListingId: null, quoteListingId: null, quotesCreated: 0, skipped: ["prod-strict"] };
  }

  const skipped: string[] = [];
  let sellerVerified = false;
  let conciergeListingId: string | null = null;
  let quoteListingId: string | null = null;
  let quotesCreated = 0;

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

  // ── F3/F4: a custom_quote listing and three quotes in three READER states ──
  // Locked Decision 49's surfaces (the traveler's Quotes tab on /my-bookings, the seller's
  // issue/withdraw queue on both Catalogs, PR #978) landed with NO fixture behind them. Quotes
  // are the right thing to seed here precisely BECAUSE they assert no payment: a quote carries an
  // amount and an expiry but no charge, and even an ACCEPTED quote's booking is born `pending`
  // (the charge rail's own guard is `WHERE status = 'pending'`), which is provisional and so trips
  // none of the money-integrity detectors this file's header explains.
  const travelerId = await resolveUserId(QUOTE_TRAVELER_EMAIL);
  if (!sellerId) {
    skipped.push("quotes:seller-absent");
  } else if (!travelerId) {
    console.log(
      `  ! ${QUOTE_TRAVELER_EMAIL} not found — run \`tsx server/seeds/e2e-test-accounts.seed.ts\` first.`,
    );
    skipped.push("quotes:traveler-absent");
  } else {
    // The listing. `priceType: "custom_quote"` with a NULL price is the point: the price authority
    // is the quote, never the listing — and until ledger `2026-09-20-quote-listing-goes-live` the
    // publish gate refused exactly this shape, so a fixture of it also exercises that repair.
    const [existingListing] = await db
      .select({ id: providerServices.id })
      .from(providerServices)
      .where(
        and(
          eq(providerServices.userId, sellerId),
          eq(providerServices.serviceName, QUOTE_SERVICE_NAME),
        ),
      )
      .limit(1);

    if (existingListing) {
      quoteListingId = existingListing.id;
      console.log(`  = Quote listing: already present for ${VERIFIED_SELLER_EMAIL}`);
    } else {
      const [row] = await db
        .insert(providerServices)
        .values({
          userId: sellerId,
          createdVia: "seed",
          serviceName: QUOTE_SERVICE_NAME,
          shortDescription: "Priced per session after a short brief.",
          description:
            "Dev fixture for the Locked Decision 49 quote lane: request, issue, expiry and accept.",
          serviceType: "experience",
          price: null, // the quote is the price authority — never the listing (LD 49)
          priceType: "custom_quote",
          deliveryMethod: "in_person",
          city: "Kyoto",
          approvalStatus: "approved",
          status: "active",
        })
        .returning({ id: providerServices.id });
      quoteListingId = row?.id ?? null;
      console.log(`  + Quote listing: created for ${VERIFIED_SELLER_EMAIL} (${quoteListingId})`);
    }

    if (quoteListingId) {
      // THREE READER STATES, and deliberately not a fourth. `position` is 1-based per
      // (service, traveler) and carries a UNIQUE index, so it is also this fixture's idempotency
      // key. NOTE what each row does and does not claim (§13):
      //   1 `quoted` + a PAST expiry  → reads as the DERIVED `expired`. `expired` is NEVER stored
      //                                 (a stored one would be a second authority that disagrees
      //                                  with the column), so the only way to fixture it is a real
      //                                  past deadline — which is why this row exists.
      //   2 `quoted` + a FUTURE expiry→ acceptable. Clicking Accept on it runs the REAL atomic
      //                                 accept claim and mints a real `pending` booking, which is
      //                                 a better fixture than anything hand-written here.
      //   3 `requested`               → amount AND expiry NULL, because no offer exists yet. NULL
      //                                 here is "not yet quoted", never $0.00 and never "no
      //                                 deadline" — the two §13 readings LD 49 names by hand.
      // `accepted`, `declined`, `withdrawn` and `superseded` are NOT seeded: each is reachable by
      // a click from row 2 or 3, and seeding a terminal state by hand would duplicate a transition
      // the real rails own (§18 rule 1).
      const now = Date.now();
      const quoteRows = [
        {
          position: 1,
          status: "quoted",
          amountCents: 45_000,
          expiresAt: new Date(now - 3 * 24 * 60 * 60 * 1000), // lapsed 3 days ago
          quotedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
        },
        {
          position: 2,
          status: "quoted",
          amountCents: 52_000,
          expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000), // acceptable for 7 more days
          quotedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
        },
        {
          position: 3,
          status: "requested",
          amountCents: null,
          expiresAt: null,
          quotedAt: null,
        },
      ] as const;

      for (const q of quoteRows) {
        const [present] = await db
          .select({ id: serviceQuotes.id })
          .from(serviceQuotes)
          .where(
            and(
              eq(serviceQuotes.serviceId, quoteListingId),
              eq(serviceQuotes.travelerId, travelerId),
              eq(serviceQuotes.position, q.position),
            ),
          )
          .limit(1);
        if (present) continue;

        await db.insert(serviceQuotes).values({
          serviceId: quoteListingId,
          travelerId,
          position: q.position,
          status: q.status,
          amountCents: q.amountCents,
          // Currency rides ONLY where an amount does — a currency beside a NULL amount would be a
          // claim about a price nobody has named yet.
          currency: q.amountCents === null ? null : SERVICE_QUOTE_CURRENCY,
          quotedBy: q.amountCents === null ? null : sellerId,
          quotedAt: q.quotedAt,
          expiresAt: q.expiresAt,
        });
        quotesCreated++;
      }
      console.log(
        quotesCreated > 0
          ? `  + Quotes: created ${quotesCreated} (expired · acceptable · awaiting-quote)`
          : "  = Quotes: all three already present",
      );
    }
  }

  console.log(
    "  · No service_bookings seeded — see this file's header: every way to represent a seeded " +
      "booking's payment today is either a fabricated Stripe identity (§19a) or a critical " +
      "`booking_confirmed_no_pi` drift exception.",
  );

  return { sellerVerified, conciergeListingId, quoteListingId, quotesCreated, skipped };
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
