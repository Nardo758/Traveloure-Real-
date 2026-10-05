import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { afterAll, expect, test, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../db";
import {
  users, emailOutbox, itineraryComparisons, itineraryVariants, itineraryVariantItems,
  providerServices, localExpertForms, serviceBookings, affiliateBookingRequests,
  coordinationStates, coordinationBookings,
} from "@shared/schema";
import { persistGenerationOutcome } from "../itinerary-generation-outcome.service";
import { deliverItineraryFollowup, type FollowupMetadata } from "../itinerary-followup.service";
import { deliverQueuedEmail, _outboxTestHooks } from "../email-outbox.service";
import { ITINERARY_FOLLOWUPS, type ItineraryFollowupKind } from "../itinerary-followup-email";
import type { SendEmailParams } from "../email.service";

vi.mock("../email.service", async (original) => ({
  ...await original<typeof import("../email.service")>(), getAppBaseUrl: () => "https://app.example.test",
}));
if (process.env.RUN_ITINERARY_FOLLOWUP_DB_TESTS !== "1" || process.env.NODE_ENV === "production") {
  throw new Error("Requires explicitly authorized development-only follow-up fixtures");
}
afterAll(async () => { delete _outboxTestHooks.sendEmailFn; vi.unstubAllEnvs(); await pool.end(); });

const preferences = { itineraryMarketing: { enabled: true, timeZone: "UTC", quietStart: "00:00", quietEnd: "00:00" } };
type Fixture = { userId: string; providerId: string; expertId: string; email: string; itineraryId: string; destination: string; serviceId: string };

async function withFixture(run: (fixture: Fixture) => Promise<void>, options: {
  bookable: boolean; expert: boolean; ageHours?: number;
} = { bookable: true, expert: true }) {
  const fixture: Fixture = {
    userId: randomUUID(), providerId: randomUUID(), expertId: randomUUID(),
    itineraryId: randomUUID(), email: `${randomUUID()}@example.test`,
    destination: `QA ${randomUUID().slice(0, 16)}`, serviceId: randomUUID(),
  };
  vi.stubEnv("ITINERARY_OUTCOME_TEST_EMAIL", fixture.email);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values([
        { id: fixture.userId, email: fixture.email, firstName: "QA Traveler", preferences },
        { id: fixture.providerId, email: `${fixture.providerId}@example.test`, role: "service_provider", firstName: "QA Provider" },
        { id: fixture.expertId, email: `${fixture.expertId}@example.test`, role: "local_expert", firstName: "QA Expert" },
      ]);
      if (options.expert) await tx.insert(localExpertForms).values({
        id: randomUUID(), userId: fixture.expertId, city: fixture.destination,
        firstName: "QA Expert", displayName: "QA Expert", status: "approved", acceptsNewHandoffs: true,
      });
      await tx.insert(providerServices).values({
        id: fixture.serviceId, userId: fixture.providerId, serviceName: "QA ONLY - follow-up fixture",
        status: "active", approvalStatus: "approved", deliveryMethod: "video", price: "99.00",
      });
      const readyAt = new Date(Date.now() - ((options.ageHours ?? 120) * 3_600_000) - Math.floor(Math.random() * 30_000));
      const startedAt = new Date(readyAt.getTime() - 1000);
      await tx.insert(itineraryComparisons).values({
        id: fixture.itineraryId, userId: fixture.userId, destination: fixture.destination,
        status: "generating", updatedAt: startedAt, createdAt: new Date(startedAt.getTime() - 1000),
      });
      const result = await persistGenerationOutcome(tx, { comparisonId: fixture.itineraryId, startedAt, outcome: "ready", now: readyAt });
      expect(result.transitioned).toBe(true);
      if (options.bookable) {
        const variantId = randomUUID();
        await tx.insert(itineraryVariants).values({ id: variantId, comparisonId: fixture.itineraryId, name: "QA Variant" });
        await tx.insert(itineraryVariantItems).values({
          id: randomUUID(), variantId, dayNumber: 1, name: "QA Item", providerServiceId: fixture.serviceId,
        });
      }
      // Protect all committed fixture rows from the live background drain.
      await tx.execute(sql`UPDATE email_outbox SET retry_after = NOW() + INTERVAL '10 minutes'
        WHERE metadata->>'travelerId' = ${fixture.userId} OR metadata->>'comparisonId' = ${fixture.itineraryId}`);
    });
    await run(fixture);
  } finally {
    delete _outboxTestHooks.sendEmailFn;
    await db.transaction(async (tx) => {
      await tx.delete(affiliateBookingRequests).where(eq(affiliateBookingRequests.userId, fixture.userId));
      await tx.execute(sql`DELETE FROM bookings WHERE user_id = ${fixture.userId}`);
      await tx.execute(sql`DELETE FROM email_outbox WHERE metadata->>'travelerId' = ${fixture.userId}
        OR metadata->>'comparisonId' IN (SELECT id FROM itinerary_comparisons WHERE user_id = ${fixture.userId})`);
      await tx.delete(users).where(sql`${users.id} IN (${fixture.userId}, ${fixture.providerId}, ${fixture.expertId})`);
    });
    vi.unstubAllEnvs();
  }
}
async function notices(userId: string) {
  return db.select().from(emailOutbox).where(sql`${emailOutbox.metadata}->>'travelerId' = ${userId}`);
}
async function claim(fixture: Fixture, kind: ItineraryFollowupKind) {
  const row = (await notices(fixture.userId)).find((entry) => entry.emailType === kind
    && (entry.metadata as FollowupMetadata).itineraryId === fixture.itineraryId)!;
  await db.update(emailOutbox).set({ status: "processing", retryAfter: new Date(Date.now() + 600_000) }).where(eq(emailOutbox.id, row.id));
  return row.id;
}
const sender = () => vi.fn(async (_params: SendEmailParams) => ({ ok: true, id: "intercepted-provider-not-live" }));

for (let loop = 1; loop <= 2; loop++) {
  for (const entry of ITINERARY_FOLLOWUPS) {
    test(`${entry.kind} SQL loop ${loop}: registry fires, persisted send, stable retry identity`, async () => {
      await withFixture(async (fixture) => {
        const id = await claim(fixture, entry.kind);
        const send = sender();
        expect(await deliverItineraryFollowup(id, send)).toBe("sent");
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].idempotencyKey).toBe(`itinerary-followup-${id}`);
        const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id));
        expect(row.status).toBe("sent");
        expect(row.html.includes("Prices may change")).toBe(entry.hours === 120);
        if (entry.hours === 24) expect(row.textBody).toContain(loop === 1 ? "QA Expert" : "top-rated activity");
        expect(await deliverItineraryFollowup(id, send)).toBe("skipped");
        expect(send).toHaveBeenCalledTimes(1);
      }, { bookable: true, expert: loop === 1 });
    });
  }
  test(`cancellation loop ${loop}: a booking within one hour cancels all three at the first send`, async () => {
    await withFixture(async (fixture) => {
      await db.insert(serviceBookings).values({
        id: randomUUID(), travelerId: fixture.userId, totalAmount: "99.00", status: loop === 1 ? "confirmed" : "payment_pending",
      });
      // No trigger (migration 351 rejected): the booking write cancels nothing by itself.
      expect((await notices(fixture.userId)).map((row) => row.status)).toEqual(["pending", "pending", "pending"]);
      const send = sender();
      expect(await deliverItineraryFollowup(await claim(fixture, "itinerary_nudge_2h"), send)).toBe("cancelled");
      expect((await notices(fixture.userId)).map((row) => row.status)).toEqual(["cancelled", "cancelled", "cancelled"]);
      for (const row of await notices(fixture.userId)) expect(await deliverItineraryFollowup(row.id, send)).toBe("skipped");
      expect(send).not.toHaveBeenCalled();
    }, { bookable: true, expert: true, ageHours: 0.25 });
  });
  test(`supersession loop ${loop}: newer ready itinerary cancels old sequence, not ready notices`, async () => {
    await withFixture(async (fixture) => {
      const second = randomUUID(), readyAt = new Date(Date.now() - 2.5 * 3_600_000), start = new Date(readyAt.getTime() - 1000);
      await db.transaction(async (tx) => {
        await tx.insert(itineraryComparisons).values({ id: second, userId: fixture.userId, status: "generating", updatedAt: start });
        await persistGenerationOutcome(tx, { comparisonId: second, startedAt: start, outcome: "ready", now: readyAt });
        await tx.execute(sql`UPDATE email_outbox SET retry_after = NOW() + INTERVAL '10 minutes'
          WHERE metadata->>'travelerId' = ${fixture.userId} OR metadata->>'comparisonId' = ${second}`);
      });
      const rows = await notices(fixture.userId);
      expect(rows.filter((row) => (row.metadata as any).itineraryId === fixture.itineraryId).every((row) => row.status === "cancelled")).toBe(true);
      expect(rows.filter((row) => (row.metadata as any).itineraryId === second && row.status === "pending")).toHaveLength(3);
      const ready = await db.select().from(emailOutbox).where(sql`${emailOutbox.emailType} = 'itinerary_ready'
        AND ${emailOutbox.metadata}->>'comparisonId' IN (${fixture.itineraryId}, ${second})`);
      expect(ready).toHaveLength(2);
      expect((ready[0].metadata as any).generationCompletedAt.slice(0, 10)).toBe((ready[1].metadata as any).generationCompletedAt.slice(0, 10));
      expect(ready.every((row) => row.status !== "cancelled")).toBe(true);
      const id = rows.find((row) => (row.metadata as any).itineraryId === second && row.emailType === "itinerary_nudge_2h")!.id;
      await db.update(emailOutbox).set({ status: "processing" }).where(eq(emailOutbox.id, id));
      expect(await deliverItineraryFollowup(id, sender())).toBe("sent");
    }, { bookable: true, expert: true, ageHours: 3 });
  });
  test(`bookability loop ${loop}: absent or newly paused items cancel five-day mail without urgency`, async () => {
    for (const bookable of [false, true]) await withFixture(async (fixture) => {
      if (bookable) await db.update(providerServices).set({ status: "paused" }).where(eq(providerServices.id, fixture.serviceId));
      const id = await claim(fixture, "itinerary_reengagement_5d"), send = sender();
      expect(await deliverItineraryFollowup(id, send)).toBe("cancelled");
      expect(send).not.toHaveBeenCalled();
      const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id));
      expect(row.html).not.toContain("Prices may change");
    }, { bookable, expert: false });
  });
}

test("mid-sequence cancellation preserves already-sent 2h mail and stops both remaining emails", async () => {
  await withFixture(async (fixture) => {
    const id = await claim(fixture, "itinerary_nudge_2h");
    expect(await deliverItineraryFollowup(id, sender())).toBe("sent");
    await db.insert(serviceBookings).values({ id: randomUUID(), travelerId: fixture.userId, totalAmount: "99", status: "pending" });
    const send = sender();
    expect(await deliverItineraryFollowup(await claim(fixture, "itinerary_followup_24h"), send)).toBe("cancelled");
    expect(send).not.toHaveBeenCalled();
    const rows = await notices(fixture.userId);
    expect(rows.find((row) => row.id === id)?.status).toBe("sent");
    expect(rows.filter((row) => row.id !== id).every((row) => row.status === "cancelled")).toBe(true);
  }, { bookable: true, expert: true, ageHours: 3 });
});

test("late older completion cannot cancel a newer plan: exact case plus two creation-age variations", async () => {
  for (const olderByHours of [1, 24, 720]) await withFixture(async (fixture) => {
    const older = randomUUID(), readyAt = new Date(), start = new Date(readyAt.getTime() - 1000);
    const [current] = await db.select().from(itineraryComparisons).where(eq(itineraryComparisons.id, fixture.itineraryId));
    await db.transaction(async (tx) => {
      await tx.insert(itineraryComparisons).values({
        id: older, userId: fixture.userId, status: "generating", updatedAt: start,
        createdAt: new Date(current.createdAt!.getTime() - olderByHours * 3_600_000),
      });
      await persistGenerationOutcome(tx, { comparisonId: older, startedAt: start, outcome: "ready", now: readyAt });
      await tx.execute(sql`UPDATE email_outbox SET retry_after = NOW() + INTERVAL '10 minutes'
        WHERE status = 'pending' AND (metadata->>'travelerId' = ${fixture.userId}
          OR metadata->>'comparisonId' IN (SELECT id FROM itinerary_comparisons WHERE user_id = ${fixture.userId}))`);
    });
    const rows = await notices(fixture.userId);
    expect(rows.filter((row) => (row.metadata as any).itineraryId === older && row.status === "cancelled")).toHaveLength(3);
    expect(rows.filter((row) => (row.metadata as any).itineraryId === fixture.itineraryId && row.status === "pending")).toHaveLength(3);
    const id = await claim(fixture, "itinerary_nudge_2h");
    expect(await deliverItineraryFollowup(id, sender())).toBe("sent");
  });
});
test("daily marketing cap defers, consent/deletion cancel, retries retain provider identity", async () => {
  await withFixture(async (fixture) => {
    const first = await claim(fixture, "itinerary_nudge_2h");
    const keys: string[] = [];
    const retrySender = vi.fn(async (params: SendEmailParams) => {
      keys.push(params.idempotencyKey!);
      return keys.length === 1 ? { ok: false, error: "controlled transient failure" } : { ok: true, id: "intercepted-retry" };
    });
    expect(await deliverItineraryFollowup(first, retrySender)).toBe("failed");
    await db.update(emailOutbox).set({ status: "processing" }).where(eq(emailOutbox.id, first));
    expect(await deliverItineraryFollowup(first, retrySender)).toBe("sent");
    expect(keys[0]).toBe(keys[1]);
    const second = await claim(fixture, "itinerary_followup_24h");
    expect(await deliverItineraryFollowup(second, sender())).toBe("deferred");
    const [deferred] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, second));
    expect(deferred.status).toBe("pending");
    expect(deferred.retryAfter!.getTime()).toBeGreaterThan(Date.now());
    await db.update(users).set({ preferences: { itineraryMarketing: { enabled: false } } }).where(eq(users.id, fixture.userId));
    const third = await claim(fixture, "itinerary_reengagement_5d");
    expect(await deliverItineraryFollowup(third, sender())).toBe("cancelled");
    await db.delete(itineraryComparisons).where(eq(itineraryComparisons.id, fixture.itineraryId));
    // No delete trigger (migration 351 rejected): a removed itinerary is caught at each send.
    const removedSend = sender();
    for (const row of (await notices(fixture.userId)).filter((entry) => entry.status === "pending")) {
      await db.update(emailOutbox).set({ status: "processing" }).where(eq(emailOutbox.id, row.id));
      expect(await deliverItineraryFollowup(row.id, removedSend)).toBe("cancelled");
    }
    expect(removedSend).not.toHaveBeenCalled();
    expect((await notices(fixture.userId)).filter((row) => row.status === "pending")).toHaveLength(0);
  });
});
test("a booking on the legacy, affiliate or coordination rail cancels the follow-ups at send time", async () => {
  // Migration 351's database triggers were rejected (decision-maker, Oct 4, 2026): no booking writer
  // touches email_outbox. The guard is bookingExists, read under the traveler's row lock at send time.
  for (const rail of ["legacy", "affiliate", "coordination"]) await withFixture(async (fixture) => {
    if (rail === "legacy") await db.execute(sql`INSERT INTO bookings(id, user_id, status) VALUES (${randomUUID()}, ${fixture.userId}, 'confirmed')`);
    else if (rail === "affiliate") await db.insert(affiliateBookingRequests).values({
      id: randomUUID(), userId: fixture.userId, affiliateUrl: "https://example.test/qa-only",
      itemName: "QA ONLY", partnerName: "QA Partner", partnerCategory: "activities", status: "pending",
    });
    else {
      const coordinationId = randomUUID();
      await db.insert(coordinationStates).values({ id: coordinationId, userId: fixture.userId, experienceType: "vacation" });
      await db.insert(coordinationBookings).values({
        id: randomUUID(), coordinationId, itemType: "activity", itemId: randomUUID(), itemName: "QA ONLY", status: "pending",
      });
    }
    // Nothing is cancelled by the write itself.
    expect((await notices(fixture.userId)).some((row) => row.status === "pending")).toBe(true);
    const id = await claim(fixture, "itinerary_nudge_2h");
    const send = sender();
    expect(await deliverItineraryFollowup(id, send)).toBe("cancelled");
    expect(send).not.toHaveBeenCalled();
    expect((await notices(fixture.userId)).every((row) => row.status === "cancelled")).toBe(true);
    // The historical tables have different FK delete policies; remove only our fixture's rows.
    if (rail === "legacy") await db.execute(sql`DELETE FROM bookings WHERE user_id = ${fixture.userId}`);
    else if (rail === "affiliate") await db.delete(affiliateBookingRequests).where(eq(affiliateBookingRequests.userId, fixture.userId));
  });
});

test("real HTTP unsubscribe: scanner GET is read-only; explicit POST cancels all pending rows", async () => {
  if (!process.env.REPLIT_DEV_DOMAIN) throw new Error("Requires the running development workflow");
  await withFixture(async (fixture) => {
    const token = (await notices(fixture.userId))[0].metadata as { unsubscribeToken: string };
    const url = `https://${process.env.REPLIT_DEV_DOMAIN}/email-preferences/unsubscribe/${token.unsubscribeToken}`;
    const preview = await fetch(url);
    expect(preview.status).toBe(200);
    expect(await preview.text()).toContain('method="post"');
    expect((await notices(fixture.userId)).every((row) => row.status === "pending")).toBe(true);
    const unsubscribe = await fetch(url, { method: "POST" });
    expect(unsubscribe.status).toBe(200);
    expect((await notices(fixture.userId)).every((row) => row.status === "cancelled")).toBe(true);
    const [user] = await db.select().from(users).where(eq(users.id, fixture.userId));
    expect((user.preferences as any).itineraryMarketing.enabled).toBe(false);
  });
});

test("authenticated preferences save actual consent, reject bad input and CSRF, preserve other preferences", async () => {
  if (!process.env.REPLIT_DEV_DOMAIN) throw new Error("Requires the running development workflow");
  await withFixture(async (fixture) => {
    const password = randomUUID(), salt = randomBytes(16).toString("hex");
    await db.update(users).set({
      password: `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
      preferences: { ...preferences, followupQaUnrelated: "preserve-me" },
    }).where(eq(users.id, fixture.userId));
    const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    expect((await fetch(`${base}/api/me/itinerary-email-preferences`)).status).toBe(401);
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fixture.email, password }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const headers = { Cookie: cookie, "Content-Type": "application/json" };
    const api = await fetch(`${base}/api/me/itinerary-email-preferences`, { headers });
    expect(api.status).toBe(200); expect((await api.json()).enabled).toBe(true);
    const invalid = await fetch(`${base}/api/me/itinerary-email-preferences`, {
      method: "PATCH", headers, body: JSON.stringify({ enabled: true, timeZone: "fake-zone", quietStart: "22:00", quietEnd: "08:00" }),
    });
    expect(invalid.status).toBe(400);
    const page = await fetch(`${base}/email-preferences`, { headers });
    expect(page.status).toBe(200);
    const html = await page.text(), csrf = html.match(/name="csrf" value="([^"]+)"/)![1];
    const formHeaders = { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" };
    const refused = await fetch(`${base}/email-preferences`, { method: "POST", headers: formHeaders, body: "csrf=wrong" });
    expect(refused.status).toBe(403);
    const saved = await fetch(`${base}/email-preferences`, {
      method: "POST", headers: formHeaders, body: new URLSearchParams({
        csrf, timeZone: "Asia/Calcutta", quietStart: "22:00", quietEnd: "08:00",
      }),
    });
    expect(saved.status).toBe(200);
    expect(await saved.text()).toContain("Preferences saved");
    expect((await notices(fixture.userId)).every((row) => row.status === "cancelled")).toBe(true);
    const [user] = await db.select().from(users).where(eq(users.id, fixture.userId));
    expect((user.preferences as any).itineraryMarketing.enabled).toBe(false);
    expect((user.preferences as any).followupQaUnrelated).toBe("preserve-me");
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
test("booking vs send, both orders: a committed booking stops the send; a send in flight blocks the booking", async () => {
  for (const winner of ["booking", "send"]) await withFixture(async (fixture) => {
    const id = await claim(fixture, "itinerary_nudge_2h");
    const events: string[] = [];
    const entered = deferred(), release = deferred();
    const attempt = async () => { events.push("provider"); entered.resolve(); await release.promise; return { ok: true, id: "intercepted-race" }; };
    const booking = async () => {
      await db.insert(serviceBookings).values({ id: randomUUID(), travelerId: fixture.userId, totalAmount: "99", status: "confirmed" });
      events.push("booking-committed");
    };
    if (winner === "booking") {
      await booking(); release.resolve();
      expect(await deliverItineraryFollowup(id, attempt)).toBe("cancelled");
      expect(events).toEqual(["booking-committed"]);
    } else {
      const sending = deliverItineraryFollowup(id, attempt);
      await entered.promise;
      const writing = booking();
      // No trigger (migration 351 rejected): the booking waits because service_bookings.traveler_id
      // references users, and the foreign-key check's KEY SHARE lock waits on the send's FOR UPDATE.
      // PostgreSQL itself proves the competing writer is blocked, not a mock mutex.
      let blocked = false;
      for (let index = 0; index < 50 && !blocked; index++) {
        const result = await db.execute(sql`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0) AS blocked`);
        blocked = Boolean((result.rows[0] as any).blocked);
        if (!blocked) await new Promise((done) => setTimeout(done, 10));
      }
      try { expect(blocked).toBe(true); expect(events).toEqual(["provider"]); }
      finally { release.resolve(); }
      expect(await sending).toBe("sent"); await writing;
      expect(events).toEqual(["provider", "booking-committed"]);
      // The remaining follow-ups for this itinerary are cancelled at their own send time.
      const send = sender();
      expect(await deliverItineraryFollowup(await claim(fixture, "itinerary_followup_24h"), send)).toBe("cancelled");
      expect(send).not.toHaveBeenCalled();
    }
  });
});
test("actual outbox claim routes a due follow-up and will not claim a future one", async () => {
  await withFixture(async (fixture) => {
    const row = (await notices(fixture.userId)).find((entry) => entry.emailType === "itinerary_nudge_2h")!;
    const send = sender(); _outboxTestHooks.sendEmailFn = send;
    await deliverQueuedEmail(row.id); expect(send).not.toHaveBeenCalled();
    await db.update(emailOutbox).set({ retryAfter: new Date(Date.now() - 1000) }).where(eq(emailOutbox.id, row.id));
    await Promise.all([deliverQueuedEmail(row.id), deliverQueuedEmail(row.id)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await db.select().from(emailOutbox).where(eq(emailOutbox.id, row.id)))[0].status).toBe("sent");
  });
});