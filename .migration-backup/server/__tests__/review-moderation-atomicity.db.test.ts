/**
 * Real-DB regression coverage for serialized review mutation + aggregates.
 *
 * Run:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/review-moderation-atomicity.db.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  providerServices,
  reviewModerationLogs,
  serviceBookings,
  serviceReviews,
  users,
} from "@shared/schema";
import {
  createServiceReviewWithAggregate,
  moderateReviewWithAggregate,
} from "../services/review-mutation.service";
import { flagReview } from "../services/content-query.service";
import { getServiceReviewsList } from "../services/admin-query.service";

if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
  throw new Error("Set JOURNEY_DB_WRITES_OK=1 to run DB-writing tests");
}

const run = randomUUID().slice(0, 8);
const providerId = `review-provider-${run}`;
const travelerIds = [1, 2, 3, 4, 5, 6].map((n) => `review-traveler-${run}-${n}`);
const adminIds = [1, 2].map((n) => `review-admin-${run}-${n}`);
const reporterId = `review-reporter-${run}`;
const auditTriggerFunction = `review_audit_fail_${run.replaceAll("-", "_")}`;
const auditTriggerName = `review_audit_fail_trigger_${run.replaceAll("-", "_")}`;
const serviceIds: string[] = [];
const bookingIds: string[] = [];
let trackingSequence = 0;

async function createFixtureService(label: string, bookingCount: number) {
  const serviceId = `review-service-${run}-${label}`;
  serviceIds.push(serviceId);
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, average_rating, review_count)
    VALUES
      (${serviceId}, ${providerId}, ${`Review service ${label}`}, '0', 0)
  `);
  const bookings = Array.from({ length: bookingCount }, (_, index) =>
    `review-booking-${run}-${label}-${index + 1}`);
  bookingIds.push(...bookings);
  for (let index = 0; index < bookings.length; index += 1) {
    await db.execute(sql`
      INSERT INTO service_bookings
        (id, service_id, traveler_id, provider_id, total_amount, status)
      VALUES
        (${bookings[index]}, ${serviceId}, ${travelerIds[index]}, ${providerId}, '100.00', 'completed')
    `);
  }
  return { serviceId, bookings };
}

async function createReview(input: {
  serviceId: string;
  bookingId: string;
  travelerId: string;
  rating: number;
  status?: "pending" | "approved";
}) {
  trackingSequence += 1;
  return createServiceReviewWithAggregate({
    bookingId: input.bookingId,
    serviceId: input.serviceId,
    providerId,
    travelerId: input.travelerId,
    rating: input.rating,
    reviewText: `Atomic review ${trackingSequence}`,
    status: input.status ?? "pending",
  }, `RVA${run}${trackingSequence}`);
}

async function serviceAggregate(serviceId: string) {
  const [service] = await db.select({
    averageRating: providerServices.averageRating,
    reviewCount: providerServices.reviewCount,
  }).from(providerServices).where(eq(providerServices.id, serviceId));
  const approved = await db.select({ rating: serviceReviews.rating })
    .from(serviceReviews)
    .where(and(
      eq(serviceReviews.serviceId, serviceId),
      eq(serviceReviews.status, "approved"),
    ));
  const expectedAverage = approved.length === 0
    ? 0
    : approved.reduce((sum, row) => sum + row.rating, 0) / approved.length;
  return { service, approved, expectedAverage };
}

async function installAuditFailureTrigger(reviewId: string) {
  await db.execute(sql.raw(`
    CREATE OR REPLACE FUNCTION ${auditTriggerFunction}()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.review_id = '${reviewId}' THEN
        RAISE EXCEPTION 'forced review moderation audit failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `));
  await db.execute(sql.raw(`
    CREATE TRIGGER ${auditTriggerName}
    BEFORE INSERT ON review_moderation_logs
    FOR EACH ROW EXECUTE FUNCTION ${auditTriggerFunction}()
  `));
}

async function removeAuditFailureTrigger() {
  await db.execute(sql.raw(
    `DROP TRIGGER IF EXISTS ${auditTriggerName} ON review_moderation_logs`,
  ));
  await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${auditTriggerFunction}()`));
}

before(async () => {
  await db.insert(users).values([
    { id: providerId, email: `${providerId}@traveloure.test`, role: "service_provider" },
    ...travelerIds.map((id) => ({ id, email: `${id}@traveloure.test`, role: "user" })),
    ...adminIds.map((id) => ({ id, email: `${id}@traveloure.test`, role: "admin" })),
    { id: reporterId, email: `${reporterId}@traveloure.test`, role: "user" },
  ] as any);
});

after(async () => {
  await removeAuditFailureTrigger().catch(() => {});
  if (serviceIds.length > 0) {
    await db.delete(providerServices).where(inArray(providerServices.id, serviceIds)).catch(() => {});
  }
  await db.delete(users).where(inArray(users.id, [
    providerId,
    reporterId,
    ...travelerIds,
    ...adminIds,
  ])).catch(() => {});
  await pool.end().catch(() => {});
});

test("concurrent approvals commit statuses and the matching aggregate together", async () => {
  const { serviceId, bookings } = await createFixtureService("approvals", 2);
  const first = await createReview({
    serviceId, bookingId: bookings[0], travelerId: travelerIds[0], rating: 3,
  });
  const second = await createReview({
    serviceId, bookingId: bookings[1], travelerId: travelerIds[1], rating: 5,
  });

  await Promise.all([
    moderateReviewWithAggregate({ reviewId: first.id, status: "approved", actorId: adminIds[0] }),
    moderateReviewWithAggregate({ reviewId: second.id, status: "approved", actorId: adminIds[1] }),
  ]);

  const result = await serviceAggregate(serviceId);
  assert.equal(result.approved.length, 2);
  assert.equal(result.service.reviewCount, 2);
  assert.equal(Number(result.service.averageRating), 4);
});

test("concurrent creation and removal cannot publish a stale snapshot", async () => {
  const { serviceId, bookings } = await createFixtureService("create-remove", 2);
  const existing = await createReview({
    serviceId, bookingId: bookings[0], travelerId: travelerIds[0], rating: 1, status: "approved",
  });

  await Promise.all([
    moderateReviewWithAggregate({
      reviewId: existing.id,
      status: "removed",
      actorId: adminIds[0],
      reason: "fixture removal",
    }),
    createReview({
      serviceId,
      bookingId: bookings[1],
      travelerId: travelerIds[1],
      rating: 5,
      status: "approved",
    }),
  ]);

  const result = await serviceAggregate(serviceId);
  assert.equal(result.approved.length, 1);
  assert.equal(result.service.reviewCount, 1);
  assert.equal(Number(result.service.averageRating), 5);
});

test("colliding repeated moderation always leaves the aggregate matching final status", async () => {
  const { serviceId, bookings } = await createFixtureService("repeat", 1);
  const review = await createReview({
    serviceId, bookingId: bookings[0], travelerId: travelerIds[0], rating: 4,
  });

  await Promise.all([
    moderateReviewWithAggregate({
      reviewId: review.id,
      status: "flagged",
      actorId: adminIds[0],
      reason: "needs review",
    }),
    moderateReviewWithAggregate({
      reviewId: review.id,
      status: "approved",
      actorId: adminIds[1],
    }),
  ]);

  const [finalReview] = await db.select().from(serviceReviews)
    .where(eq(serviceReviews.id, review.id));
  const result = await serviceAggregate(serviceId);
  const expectedCount = finalReview.status === "approved" ? 1 : 0;
  assert.equal(result.service.reviewCount, expectedCount);
  assert.equal(result.approved.length, expectedCount);
  const logs = await db.select({ id: reviewModerationLogs.id })
    .from(reviewModerationLogs)
    .where(eq(reviewModerationLogs.reviewId, review.id));
  assert.equal(logs.length, 2);
});

test("audit-log failure rolls back both moderation and aggregate", async () => {
  const { serviceId, bookings } = await createFixtureService("rollback", 1);
  const review = await createReview({
    serviceId, bookingId: bookings[0], travelerId: travelerIds[0], rating: 5,
  });

  await installAuditFailureTrigger(review.id);
  try {
    await assert.rejects(moderateReviewWithAggregate({
      reviewId: review.id,
      status: "approved",
      actorId: adminIds[0],
    }));
  } finally {
    await removeAuditFailureTrigger();
  }

  const [persisted] = await db.select({ status: serviceReviews.status })
    .from(serviceReviews)
    .where(eq(serviceReviews.id, review.id));
  const result = await serviceAggregate(serviceId);
  assert.equal(persisted.status, "pending");
  assert.equal(result.service.reviewCount, 0);
  assert.equal(Number(result.service.averageRating), 0);
});

test("user reports stay visible to moderators without hiding or rerating the review", async () => {
  const { serviceId, bookings } = await createFixtureService("report", 1);
  const review = await createReview({
    serviceId, bookingId: bookings[0], travelerId: travelerIds[0], rating: 5, status: "approved",
  });

  assert.equal(await flagReview(review.id, "check this", reporterId), true);
  assert.equal(await flagReview(review.id, "duplicate", reporterId), false);

  const [persisted] = await db.select().from(serviceReviews)
    .where(eq(serviceReviews.id, review.id));
  const result = await serviceAggregate(serviceId);
  assert.equal(persisted.status, "approved");
  assert.equal(result.service.reviewCount, 1);
  assert.equal(Number(result.service.averageRating), 5);
  const moderationQueue = await getServiceReviewsList();
  assert.ok(moderationQueue.some((row) => row.id === review.id));
});

test("report and approval ordering preserves only unresolved reports", async () => {
  const { serviceId, bookings } = await createFixtureService("report-order", 2);
  const resolved = await createReview({
    serviceId, bookingId: bookings[0], travelerId: travelerIds[0], rating: 4, status: "approved",
  });
  const laterReport = await createReview({
    serviceId, bookingId: bookings[1], travelerId: travelerIds[1], rating: 2, status: "approved",
  });

  assert.equal(await flagReview(resolved.id, "resolved first", reporterId), true);
  await moderateReviewWithAggregate({
    reviewId: resolved.id,
    status: "approved",
    actorId: adminIds[0],
    reason: "review remains acceptable",
  });

  await moderateReviewWithAggregate({
    reviewId: laterReport.id,
    status: "approved",
    actorId: adminIds[0],
  });
  assert.equal(await flagReview(laterReport.id, "arrived later", reporterId), true);

  const rows = await db.select({
    id: serviceReviews.id,
    status: serviceReviews.status,
    flagReason: serviceReviews.flagReason,
  }).from(serviceReviews).where(inArray(serviceReviews.id, [resolved.id, laterReport.id]));
  const byId = new Map(rows.map((row) => [row.id, row]));
  assert.equal(byId.get(resolved.id)?.status, "approved");
  assert.equal(byId.get(resolved.id)?.flagReason, null);
  assert.equal(byId.get(laterReport.id)?.status, "approved");
  assert.equal(byId.get(laterReport.id)?.flagReason, "arrived later");

  const result = await serviceAggregate(serviceId);
  assert.equal(result.service.reviewCount, 2);
  assert.equal(Number(result.service.averageRating), 3);
  const moderationQueue = await getServiceReviewsList();
  assert.equal(moderationQueue.some((row) => row.id === resolved.id), false);
  assert.equal(moderationQueue.some((row) => row.id === laterReport.id), true);
});