/**
 * Storefront role unification — HTTP proof for the guarded public read path.
 *
 * Run against a disposable dev database only:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/storefront-role-agnostic.http.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const handles = {
  expert: `sru${RUN}expert`,
  provider: `sru${RUN}provider`,
  empty: `sru${RUN}empty`,
  cards: `sru${RUN}cards`,
  suspended: `sru${RUN}suspended`,
};
const ownerIds: Record<string, string> = {};

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];
const createdBookingIds: string[] = [];
const createdReviewIds: string[] = [];

function api(path: string, init?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, init);
}

async function createOwner(label: string, role: "local_expert" | "service_provider", handle: string | null) {
  const email = `storefront-role-${RUN}-${label}@traveloure.test`;
  const response = await api("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      firstName: "Storefront",
      lastName: label,
    }),
  });
  const responseText = await response.text();
  assert.equal(response.status, 201, responseText);
  const body = JSON.parse(responseText) as { user: { id: string } };
  createdEmails.push(email);
  await pool.query(`UPDATE users SET role = $1, handle = $2 WHERE id = $3`, [role, handle, body.user.id]);
  ownerIds[label] = body.user.id;
  return body.user.id;
}

async function createExpertForm(
  ownerId: string,
  label: string,
  status: "approved" | "pending" | "rejected",
  bio?: string,
) {
  await pool.query(
    `INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, status, bio)
     VALUES ($1, $2, 'Storefront', $3, $4, $5, $6)`,
    [
      crypto.randomUUID(),
      ownerId,
      label,
      `storefront-role-${RUN}-${label}@traveloure.test`,
      status,
      bio ?? null,
    ],
  );
}

async function createApprovedService(ownerId: string, label: string) {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO provider_services
      (id, user_id, service_name, price, status, approval_status, delivery_method)
     VALUES ($1, $2, $3, '120.00', 'active', 'approved', 'pdf')`,
    [id, ownerId, `${label} service`],
  );
  createdServiceIds.push(id);
  return id;
}

async function createListing(ownerId: string, name: string, price: string, showPrice = true) {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO provider_services
      (id, user_id, service_name, price, show_price, status, approval_status, delivery_method)
     VALUES ($1, $2, $3, $4, $5, 'active', 'approved', 'pdf')`,
    [id, ownerId, name, price, showPrice],
  );
  createdServiceIds.push(id);
  return id;
}

async function createBookings(ownerId: string, serviceId: string, status: string, n: number) {
  for (let i = 0; i < n; i++) {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount)
       VALUES ($1, $2, $3, $3, $4, 50.00)`,
      [id, serviceId, ownerId, status],
    );
    createdBookingIds.push(id);
  }
}

async function createApprovedReview(ownerId: string, serviceId: string, rating: number) {
  const bookingId = crypto.randomUUID();
  const reviewId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount)
     VALUES ($1, $2, $3, $3, 'completed', 100.00)`,
    [bookingId, serviceId, ownerId],
  );
  await pool.query(
    `INSERT INTO service_reviews
       (id, booking_id, service_id, provider_id, traveler_id, rating, review_text, status)
     VALUES ($1, $2, $3, $4, $4, $5, 'row-backed storefront review', 'approved')`,
    [reviewId, bookingId, serviceId, ownerId, rating],
  );
  createdBookingIds.push(bookingId);
  createdReviewIds.push(reviewId);
}

before(async () => {
  const health = await api("/api/health").catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(
    process.env.JOURNEY_DB_WRITES_OK,
    "1",
    "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1",
  );

  const expertId = await createOwner("expert", "local_expert", handles.expert);
  const providerId = await createOwner("provider", "service_provider", handles.provider);
  await createOwner("empty", "service_provider", handles.empty);
  const cardsId = await createOwner("cards", "service_provider", handles.cards);
  await pool.query(
    `INSERT INTO service_provider_forms
       (id, user_id, business_name, name, email, mobile, country, address, business_type,
        instant_booking, business_verification_status, status)
     VALUES ($1, $2, 'Cards Test Business', 'Storefront cards', $3, '+1 555 0100', 'Japan',
        'Kyoto', 'Food & Drink', true, 'verified', 'approved')`,
    [crypto.randomUUID(), cardsId, `storefront-role-${RUN}-cards@traveloure.test`],
  );
  const twiceConfirmed = await createListing(cardsId, "Twice confirmed", "70.00");
  const oftenCancelled = await createListing(cardsId, "Often cancelled", "55.00");
  const unpaidClaims = await createListing(cardsId, "Unpaid claims then one done", "45.00");
  await createListing(cardsId, "Hidden price", "20.00", false);
  await createBookings(cardsId, twiceConfirmed, "confirmed", 2);
  await createBookings(cardsId, oftenCancelled, "cancelled", 5);
  await createBookings(cardsId, oftenCancelled, "refunded", 2);
  await createBookings(cardsId, unpaidClaims, "payment_pending", 4);
  await createBookings(cardsId, unpaidClaims, "completed", 1);
  const suspendedId = await createOwner("suspended", "service_provider", handles.suspended);
  const approvedLegacyId = await createOwner("approved-legacy", "local_expert", null);
  const pendingLegacyId = await createOwner("pending-legacy", "local_expert", null);
  const rejectedLegacyId = await createOwner("rejected-legacy", "local_expert", null);
  await createOwner("no-form-legacy", "local_expert", null);

  const expertServiceId = await createApprovedService(expertId, "expert");
  const providerServiceId = await createApprovedService(providerId, "provider");
  await createApprovedService(suspendedId, "suspended");
  await pool.query(
    `UPDATE provider_services SET average_rating = '4.70', review_count = 12
     WHERE id = ANY($1)`,
    [[expertServiceId, providerServiceId]],
  );
  await createApprovedReview(expertId, expertServiceId, 5);
  const inactiveExpertServiceId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO provider_services
      (id, user_id, service_name, price, status, approval_status, delivery_method, average_rating, review_count)
     VALUES ($1, $2, 'inactive historical service', '90.00', 'inactive', 'approved', 'pdf', '4.70', 12)`,
    [inactiveExpertServiceId, expertId],
  );
  createdServiceIds.push(inactiveExpertServiceId);
  await createApprovedReview(expertId, inactiveExpertServiceId, 4);
  await createExpertForm(
    approvedLegacyId,
    "approved-legacy",
    "approved",
    "Approved form biography used by the unified storefront.",
  );
  await createExpertForm(pendingLegacyId, "pending-legacy", "pending");
  await createExpertForm(rejectedLegacyId, "rejected-legacy", "rejected");
  await pool.query(
    `UPDATE users SET is_suspended = true, suspended_at = NOW() WHERE id = $1`,
    [suspendedId],
  );
});

after(async () => {
  try {
    await pool.query(`DELETE FROM service_reviews WHERE id = ANY($1)`, [createdReviewIds]);
    await pool.query(`DELETE FROM service_bookings WHERE id = ANY($1)`, [createdBookingIds]);
    await pool.query(`DELETE FROM provider_services WHERE id = ANY($1)`, [createdServiceIds]);
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [createdEmails]);
  } finally {
    await pool.end();
  }
});

test("canonical API serves approved expert inventory", async () => {
  const response = await api(`/api/storefront/${handles.expert}`);
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText) as {
    earner: {
      role: string;
      averageRating: number | null;
      reviewCount: number;
      expertReviewCount: number;
      serviceReviewCount: number;
    };
    services: Array<{ averageRating: string | null; reviewCount: number }>;
    reviews: unknown[];
  };
  assert.equal(body.earner.role, "local_expert");
  assert.equal(body.services.length, 1);
  assert.equal(body.earner.averageRating, 4.5);
  assert.equal(body.earner.reviewCount, 2);
  assert.equal(body.earner.expertReviewCount, 2);
  assert.equal(body.earner.serviceReviewCount, 1);
  assert.equal(body.services[0].averageRating, "5.00");
  assert.equal(body.services[0].reviewCount, 1);
  assert.equal(body.reviews.length, 1);
});

test("canonical API serves provider services with empty expert-only lanes", async () => {
  const response = await api(`/api/storefront/${handles.provider}`);
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText) as {
    earner: { role: string };
    services: unknown[];
    readyMade: unknown[];
  };
  assert.equal(body.earner.role, "service_provider");
  assert.equal(body.services.length, 1);
  // T-8 (ledger `2026-09-15-orphans-t8-t9-server-tests-class`): this used to deep-equal
  // `body.templates` against `[]`. The `expert_templates` CONSUMER lane was RETIRED by ledger
  // `2026-09-03-expert-templates-consumer-sunset` — "response key included" — so the storefront
  // payload carries no `templates` key at all. §13 decides which of the two is correct: an EMPTY
  // ARRAY would claim "this earner has zero itinerary templates", a statement about a product that
  // no longer exists; an ABSENT key is the honest answer. Re-pinned to absence, and the proof is
  // STRONGER than the one it replaces — it now fails if the retired key is ever re-introduced.
  assert.equal(
    Object.prototype.hasOwnProperty.call(body, "templates"),
    false,
    "the retired expert_templates lane must leave NO response key (2026-09-03-expert-templates-consumer-sunset)",
  );
  assert.deepEqual(body.readyMade, []);
});

test("provider directory ignores denormalized listing review claims", async () => {
  const response = await api("/api/provider-storefronts");
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText) as Array<{
    handle: string;
    serviceCount: number;
    averageRating: number | null;
    reviewCount: number;
  }>;
  const provider = body.find((row) => row.handle === handles.provider);
  assert.ok(provider, "seeded provider must be present in directory");
  assert.equal(provider.serviceCount, 1);
  assert.equal(provider.averageRating, null);
  assert.equal(provider.reviewCount, 0);
});

test("provider directory card: real bookings order the listings, and no count leaves the server", async () => {
  const response = await api("/api/provider-storefronts");
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText) as Array<Record<string, unknown>>;
  const card = body.find((row) => row.handle === handles.cards) as
    | {
        businessName: string | null;
        category: string | null;
        instantBooking: boolean;
        businessVerified: boolean;
        fromPrice: number | null;
        serviceCount: number;
        listings: Array<Record<string, unknown>>;
      }
    | undefined;
  assert.ok(card, "the seeded business must be in the directory");
  assert.equal(card.businessName, "Cards Test Business");
  assert.equal(card.category, "Food & Drink");
  assert.equal(card.instantBooking, true, "every listing inherits the account's instant booking");
  assert.equal(card.businessVerified, true);
  assert.equal(card.serviceCount, 4);
  // The hidden $20 is never the From price; $45 is the lowest SHOWN price.
  assert.equal(card.fromPrice, 45);
  // 2 confirmed beat 1 completed; 4 unpaid claims, 5 cancellations and 2 refunds count for
  // nothing, so "Often cancelled" ties the unbooked "Hidden price" at zero and the NEWER one wins.
  assert.deepEqual(
    card.listings.map((l) => l.name),
    ["Twice confirmed", "Unpaid claims then one done", "Hidden price"],
  );
  assert.equal(card.listings[2].price, null, "a hidden price is never published");
  assert.deepEqual(card.listings.map((l) => l.mostBooked), [true, false, false]);
  for (const listing of card.listings) {
    assert.deepEqual(Object.keys(listing).sort(), ["id", "mostBooked", "name", "price", "priceType", "pricingUnit"], "no count or rating rides a listing");
  }
  assert.equal("id" in card, false, "no users.id on a directory row (LD 40)");
});

test("provider storefront names its business, and business verification is a separate claim", async () => {
  const fetchEarner = async (handle: string) => {
    const response = await api(`/api/storefront/${handle}`);
    const text = await response.text();
    assert.equal(response.status, 200, text);
    return (JSON.parse(text) as { earner: Record<string, unknown> }).earner;
  };
  const business = await fetchEarner(handles.cards);
  assert.equal(business.businessName, "Cards Test Business");
  assert.equal(business.businessType, "Food & Drink");
  assert.equal(business.businessVerified, true, "Stripe-derived business verification, not the owner's ID check");

  // A provider with no form states nothing: no invented name, type or verification (§13).
  const bare = await fetchEarner(handles.provider);
  assert.equal(bare.businessName, null);
  assert.equal(bare.businessType, null);
  assert.equal(bare.businessVerified, false);

  // An expert storefront carries no business identity at all.
  const expert = await fetchEarner(handles.expert);
  assert.equal(expert.businessName, null);
  assert.equal(expert.businessVerified, false);
});

test("canonical API preserves no-inventory and suspended 404 gates", async () => {
  for (const handle of [handles.empty, handles.suspended]) {
    const response = await api(`/api/storefront/${handle}`);
    assert.equal(response.status, 404, `${handle} must not have a public storefront`);
  }
});

test("deprecated provider API returns the compatible filtered shape", async () => {
  const response = await api(`/api/provider-storefront/${handles.provider}`);
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["away", "earner", "services"]);
});

test("provider and both legacy /p branches permanently redirect to /s", async () => {
  for (const path of [
    `/providers/${handles.provider}`,
    `/p/${handles.provider}`,
    `/p/${handles.expert}`,
  ]) {
    const response = await api(path, { redirect: "manual" });
    assert.equal(response.status, 301, `${path} must be permanent`);
    const handle = path.endsWith(handles.expert) ? handles.expert : handles.provider;
    assert.equal(response.headers.get("location"), `/s/${handle}`);
  }
});

test("handle-bearing legacy expert routes redirect permanently to the canonical storefront", async () => {
  for (const path of [
    `/experts/${ownerIds.expert}`,
    `/local-experts/${ownerIds.expert}`,
  ]) {
    const response = await api(path, { redirect: "manual" });
    assert.equal(response.status, 308, `${path} must permanently redirect`);
    assert.equal(response.headers.get("location"), `/s/${handles.expert}`);
  }
});

test("legacy expert redirects preserve the trip handoff query", async () => {
  const response = await api(`/experts/${ownerIds.expert}?tripId=trip-handoff-proof`, {
    redirect: "manual",
  });
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("location"),
    `/s/${handles.expert}?tripId=trip-handoff-proof`,
  );
});

test("approved no-handle experts keep the unified legacy profile and form bio", async () => {
  const response = await api(`/api/storefront/by-id/${ownerIds["approved-legacy"]}`);
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText) as {
    earner: Record<string, unknown> & { bio: string | null; handle: string | null };
    services: unknown[];
  };
  assert.equal(body.earner.handle, null);
  assert.equal(body.earner.bio, "Approved form biography used by the unified storefront.");
  assert.equal(body.services.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(body.earner, "id"), false);
});

test("pending, rejected, and missing-form no-handle experts remain private", async () => {
  for (const label of ["pending-legacy", "rejected-legacy", "no-form-legacy"]) {
    const response = await api(`/api/storefront/by-id/${ownerIds[label]}`);
    assert.equal(response.status, 404, `${label} must not have a public legacy profile`);
  }
});