/**
 * The disposable resource fixture for the NON-`/api/bookings/*` payment rails
 * (`payments-other-rails-mutation-auth.test.ts`).
 *
 * It is a SIBLING of `booking-resource-fixture.ts`, not a copy of it: the
 * login builder (`createLoginFixture`) and the live-audit safety predicate
 * (`liveAuditRefusalReason`, re-exported by the suite from there) are IMPORTED,
 * never restated (CLAUDE.md §18 rule 1 — a second login builder or a second
 * safety guard is the drift class that reads green on an authorization audit).
 * What this module adds is ROWS the booking fixture does not have: a trip with
 * a vendor contract and a participant, a coordination engagement, an
 * optimization comparison + variant, a ready-made listing + purchase, and a
 * provider listing for the surcharge-tier rail.
 *
 * SIX PRINCIPALS, because on these rails the "wrong party" differs per rail
 * and a stranger alone proves only half of each gate:
 *  - `traveler` — owns the trip, the contract, the participant row, the
 *    coordination engagement, the comparison, and is the ready-made BUYER.
 *  - `member`   — a real `trip_participants` row on the traveler's trip (the
 *    participant row the payment rail addresses IS theirs), and nothing else.
 *    The party-to-the-plan-but-not-its-owner arm.
 *  - `expert`   — the coordination engagement's ASSIGNED coordinator, the
 *    ready-made listing's AUTHOR (the seller), and an EARNER who owns no
 *    provider listing — so the earner-role backstop on `/api/provider/services`
 *    lets them through and only the handler's OWNERSHIP check can refuse them.
 *  - `provider` — owns the provider listing the surcharge-tier rail addresses.
 *  - `stranger` — party to nothing.
 *  - `admin`    — the ONE principal the coordination refund authorizes.
 *
 * STATED NEGATIVE SPACE, and it is the load-bearing half: this builds ROWS,
 * not history, and it is shaped so that no authorized arm reaches Stripe. The
 * coordination fee is born `paid` with NO PaymentIntent id, so the owner's
 * `/pay` answers `alreadyPaid`, the owner's `/pay/confirm` answers
 * `no_payment` and the admin's `/refund` answers `no_payment_intent` — each
 * PAST its gate, none making a network call. The ready-made purchase is born
 * `cloned` with its revision ALREADY requested, so the buyer's
 * request-revision answers 409 (past the ownership gate) without granting
 * advisor access or sending mail; its concern rail is left claimable, so the
 * buyer's concern is a real write. The ready-made purchase carries a
 * non-Stripe `pi_mutation_auth_*` id only because the column is NOT NULL; no
 * reader of it runs during the audit, and the row is deleted afterwards.
 */
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { users } from "@shared/models/auth";
import { trips } from "@shared/schema";
import { createLoginFixture } from "./booking-resource-fixture";

type Db = typeof import("../../db").db;

export type PrincipalName = "traveler" | "member" | "expert" | "provider" | "stranger" | "admin";

export type PaymentsOtherRailsFixture = {
  db: Db;
  userIds: Record<PrincipalName, string>;
  cookies: Record<PrincipalName, string>;
  tripId: string;
  sourceTripId: string;
  contractId: string;
  participantId: string;
  coordinationId: string;
  comparisonId: string;
  variantId: string;
  readyMadeTripId: string;
  purchaseId: string;
  providerServiceId: string;
};

export type ResourceKind = "contract" | "participant" | "coordination" | "variant" | "purchase" | "providerService";

/** The id a rail addresses for each resource kind. */
export function resourceId(fixture: PaymentsOtherRailsFixture, kind: ResourceKind): string {
  switch (kind) {
    case "contract": return fixture.contractId;
    case "participant": return fixture.participantId;
    case "coordination": return fixture.coordinationId;
    case "variant": return fixture.variantId;
    case "purchase": return fixture.purchaseId;
    case "providerService": return fixture.providerServiceId;
  }
}

/**
 * A snapshot of every column a rail on this resource could write — the proof
 * that a refused principal changed nothing. Returned as one JSON string so a
 * refusal arm compares it whole.
 */
export async function resourceSnapshot(fixture: PaymentsOtherRailsFixture, kind: ResourceKind): Promise<string> {
  const { db } = fixture;
  const id = resourceId(fixture, kind);
  const rows = async (query: ReturnType<typeof sql>) => JSON.stringify((await db.execute(query)).rows);
  switch (kind) {
    case "contract":
      return rows(sql`SELECT paid_amount, remaining_balance, payment_schedule, contract_status, updated_at
                      FROM vendor_contracts WHERE id = ${id}`);
    case "participant":
      return rows(sql`SELECT amount_paid, payment_status, payment_method, payment_notes, updated_at
                      FROM trip_participants WHERE id = ${id}`);
    case "coordination":
      return rows(sql`SELECT status, fee_payment_status, fee_payment_intent_id, fee_amount_cents,
                             fee_credit_cents, fee_paid_at, state_history, updated_at
                      FROM coordination_states WHERE id = ${id}`);
    case "variant":
      return rows(sql`SELECT c.status, c.optimization_payment_id, c.updated_at, v.status AS variant_status, v.total_cost
                      FROM itinerary_variants v JOIN itinerary_comparisons c ON c.id = v.comparison_id
                      WHERE v.id = ${id}`);
    case "purchase":
      return rows(sql`SELECT p.status, p.dispute_status, p.dispute_reason, p.disputed_at, p.revision_status,
                             p.revision_request_note, p.revision_requested_at,
                             (SELECT count(*) FROM admin_notifications n WHERE n.metadata->>'purchaseId' = p.id) AS admin_notices,
                             (SELECT count(*) FROM trip_expert_advisors a WHERE a.trip_id = p.clone_trip_id) AS advisor_rows
                      FROM ready_made_purchases p WHERE p.id = ${id}`);
    case "providerService":
      // The listing row itself anchors the snapshot, so an absent listing reads as `[]` and
      // never as "a listing with no tiers".
      return rows(sql`SELECT s.id, s.updated_at,
                             (SELECT coalesce(json_agg(json_build_object('position', t.position, 'radiusKm', t.radius_km, 'fee', t.fee)
                                                       ORDER BY t.position), '[]'::json)
                              FROM service_surcharge_tiers t WHERE t.service_id = s.id) AS tiers
                      FROM provider_services s WHERE s.id = ${id}`);
  }
}

const PRINCIPAL_ROLES: Record<PrincipalName, string> = {
  traveler: "user",
  member: "user",
  expert: "expert",
  provider: "service_provider",
  stranger: "user",
  admin: "admin",
};

export async function createPaymentsOtherRailsFixture(baseUrl: string): Promise<PaymentsOtherRailsFixture> {
  const db = (await import("../../db")).db;
  const userIds = {} as Record<PrincipalName, string>;
  const cookies = {} as Record<PrincipalName, string>;
  const partial: Partial<PaymentsOtherRailsFixture> & { db: Db } = { db, userIds, cookies };
  try {
    for (const principal of Object.keys(PRINCIPAL_ROLES) as PrincipalName[]) {
      userIds[principal] = crypto.randomUUID();
      cookies[principal] = await createLoginFixture(db, baseUrl, {
        id: userIds[principal], role: PRINCIPAL_ROLES[principal], firstName: `PayRails-${principal}`,
      });
    }

    const tag = crypto.randomUUID().slice(0, 8);
    const [trip] = await db.insert(trips).values({
      userId: userIds.traveler, title: `payments-rails-${tag}`, destination: "Kyoto",
      startDate: "2031-03-10", endDate: "2031-03-12", status: "draft",
    } as any).returning({ id: trips.id });
    partial.tripId = trip.id;
    const [sourceTrip] = await db.insert(trips).values({
      userId: userIds.expert, title: `payments-rails-source-${tag}`, destination: "Kyoto",
      startDate: "2031-03-10", endDate: "2031-03-12", status: "draft",
    } as any).returning({ id: trips.id });
    partial.sourceTripId = sourceTrip.id;

    partial.contractId = `mutation-auth-contract-${crypto.randomUUID()}`;
    await db.execute(sql`
      INSERT INTO vendor_contracts (id, trip_id, vendor_name, total_amount, paid_amount, remaining_balance, contract_status)
      VALUES (${partial.contractId}, ${trip.id}, 'Mutation authorization audit vendor', '500.00', '0', '500.00', 'signed')
    `);
    partial.participantId = `mutation-auth-participant-${crypto.randomUUID()}`;
    await db.execute(sql`
      INSERT INTO trip_participants (id, trip_id, user_id, name, amount_owed, amount_paid)
      VALUES (${partial.participantId}, ${trip.id}, ${userIds.member}, 'Mutation audit member', '100.00', '0')
    `);

    partial.coordinationId = `mutation-auth-coordination-${crypto.randomUUID()}`;
    await db.execute(sql`
      INSERT INTO coordination_states (id, user_id, trip_id, experience_type, assigned_expert_id, fee_payment_status)
      VALUES (${partial.coordinationId}, ${userIds.traveler}, ${trip.id}, 'wedding', ${userIds.expert}, 'paid')
    `);

    partial.comparisonId = `mutation-auth-comparison-${crypto.randomUUID()}`;
    partial.variantId = `mutation-auth-variant-${crypto.randomUUID()}`;
    await db.execute(sql`
      INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination)
      VALUES (${partial.comparisonId}, ${userIds.traveler}, ${trip.id}, 'Mutation audit comparison', 'Kyoto')
    `);
    await db.execute(sql`
      INSERT INTO itinerary_variants (id, comparison_id, name, total_cost)
      VALUES (${partial.variantId}, ${partial.comparisonId}, 'Mutation audit variant', '1000.00')
    `);

    partial.readyMadeTripId = `mutation-auth-rm-${crypto.randomUUID()}`;
    partial.purchaseId = `mutation-auth-rm-purchase-${crypto.randomUUID()}`;
    await db.execute(sql`
      INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, price_cents, status)
      VALUES (${partial.readyMadeTripId}, ${userIds.expert}, ${sourceTrip.id}, 'Kyoto',
              'Mutation authorization audit plan', 3, 5000, 'approved')
    `);
    await db.execute(sql`
      INSERT INTO ready_made_purchases (id, buyer_id, ready_made_trip_id, price_paid_cents, stripe_payment_intent_id,
                                        clone_trip_id, status, revision_status, revision_requested_at)
      VALUES (${partial.purchaseId}, ${userIds.traveler}, ${partial.readyMadeTripId}, 5000,
              ${`pi_mutation_auth_not_real_${crypto.randomUUID()}`}, ${trip.id}, 'cloned', 'requested', NOW())
    `);

    partial.providerServiceId = `mutation-auth-surcharge-svc-${crypto.randomUUID()}`;
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name, description, price, price_type, booking_mode,
                                     delivery_method, status, approval_status)
      VALUES (${partial.providerServiceId}, ${userIds.provider}, 'Mutation authorization audit surcharge listing',
              'fixture', '100.00', 'fixed', 'request', 'in_person', 'active', 'approved')
    `);
    return partial as PaymentsOtherRailsFixture;
  } catch (error) {
    await destroyPaymentsOtherRailsFixture(partial).catch(() => undefined);
    throw error;
  }
}

/**
 * Deletes every row the fixture (and an authorized arm) created, child rows
 * first. Every step is attempted even after one throws, and the FIRST error is
 * rethrown — a partial cleanup is loud, never a slow leak of audit rows.
 */
export async function destroyPaymentsOtherRailsFixture(
  fixture: Partial<PaymentsOtherRailsFixture> & { db: Db },
): Promise<void> {
  const { db } = fixture;
  const ids = Object.values(fixture.userIds ?? {}).filter(Boolean);
  const tripIds = [fixture.tripId, fixture.sourceTripId].filter((id): id is string => !!id);
  const each = (values: string[], step: (value: string) => Promise<unknown>) => values.map((value) => () => step(value));
  const steps: Array<() => Promise<unknown>> = [
    () => db.execute(sql`DELETE FROM admin_notifications WHERE metadata->>'purchaseId' = ${fixture.purchaseId ?? ""}`),
    () => db.execute(sql`DELETE FROM ready_made_purchases WHERE id = ${fixture.purchaseId ?? ""}`),
    () => db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${fixture.readyMadeTripId ?? ""}`),
    () => db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${fixture.comparisonId ?? ""}`),
    () => db.execute(sql`DELETE FROM coordination_states WHERE id = ${fixture.coordinationId ?? ""}`),
    () => db.execute(sql`DELETE FROM vendor_contracts WHERE id = ${fixture.contractId ?? ""}`),
    () => db.execute(sql`DELETE FROM trip_participants WHERE id = ${fixture.participantId ?? ""}`),
    () => db.execute(sql`DELETE FROM content_registry WHERE content_id = ${fixture.providerServiceId ?? ""}`),
    () => db.execute(sql`DELETE FROM provider_services WHERE id = ${fixture.providerServiceId ?? ""}`),
    ...each(tripIds, (id) => db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${id}`)),
    ...each(tripIds, (id) => db.execute(sql`DELETE FROM trips WHERE id = ${id}`)),
    ...each(ids, (id) => db.execute(sql`
      DELETE FROM sessions
      WHERE sess->'passport'->'user'->'claims'->>'sub' = ${id}
         OR sess->'passport'->'user'->>'id' = ${id}
    `)),
    ...each(ids, (id) => db.delete(users).where(eq(users.id, id))),
  ];
  let firstError: unknown;
  for (const step of steps) {
    try { await step(); } catch (error) { firstError ??= error; }
  }
  if (firstError) throw firstError;
}
