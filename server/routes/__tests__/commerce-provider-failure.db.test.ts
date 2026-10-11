/**
 * Durable-intent fault proof, NOT release certification. Original failure
 * characterization is archived; acceptance uncertainty must never auto-resend.
 * Run only through run-messaging-gate.mjs --isolated-db.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { users, trips, providerServices, itineraryItems, cartItems } from "../../../shared/schema";
import { addedCartState } from "../../services/cart-email-state.service";
import { cartReminderVerification } from "../../services/cart-reminder.service";
import { lockMarketingTraveler } from "../../services/marketing-delivery-policy.service";
import {
  enqueuePendingCommerceReminder, deliverQueuedEmail, drainOutbox,
  drainOutboxForAdminRetry, _outboxTestHooks,
} from "../../services/email-outbox.service";
import { deliverVerifiedCommerce, commerceSendVerification } from "../../services/commerce-send-verification.service";
import type { SendEmailParams } from "../../services/email.service";

const anchor = new Date("2030-05-05T12:00:00Z");
const preferences = { itineraryMarketing: { enabled: true, timeZone: "UTC", quietStart: "00:00", quietEnd: "00:00" } };
const queryText = (query: string | { text?: string }) => typeof query === "string" ? query : query.text ?? "";
const sentWrite = (query: string | { text?: string; values?: unknown[] }, values?: unknown[]) =>
  /^update "email_outbox" set "status"/i.test(queryText(query)) &&
  (values ?? (typeof query === "string" ? [] : query.values))?.[0] === "sent";
const fallbackWrite = (query: string | { text?: string }) =>
  /UPDATE email_outbox SET status='dead'/i.test(queryText(query));
function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function bounded(promise: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Failure-proof barrier was not reached")), 5_000);
    })]);
  } finally { clearTimeout(timer); }
}

test("provider acceptance / DB failure: isolated evidence, including known duplicate-submission blockers", async t => {
  assert.equal(process.env.NODE_ENV, "test");
  assert.match(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "", /^automation_msg_[a-f0-9]{16}$/);
  const schema = process.env.MESSAGING_VERIFICATION_SCHEMA;
  const observer = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  assert.equal((await observer.query("SELECT current_schema() AS name")).rows[0].name, schema);
  assert.equal((await db.execute(sql`SELECT current_schema() AS name`)).rows[0].name, schema);
  // Fixture-only deferred trigger: the UPDATE succeeds, PostgreSQL COMMIT fails.
  // No migrations, persistent tables, public sequences or payment writers touched.
  await observer.query(`
    CREATE FUNCTION proof_reject_sent_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic acceptance commit failure'; END $$;
    CREATE CONSTRAINT TRIGGER proof_acceptance_commit_failure
      AFTER UPDATE ON email_outbox DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW WHEN (NEW.status = 'sent' AND NEW.metadata->>'proofCommitFailure' = 'true')
      EXECUTE FUNCTION proof_reject_sent_commit()
  `);
  const previousClock = cartReminderVerification.now;
  const previousRails = cartReminderVerification.recordedRailsOnly;
  const previousSender = _outboxTestHooks.sendEmailFn;
  let networkCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    networkCalls++;
    throw new Error("Network is forbidden in provider proof");
  });
  cartReminderVerification.now = anchor;
  cartReminderVerification.recordedRailsOnly = true;
  const fixture = async () => {
    const id = randomUUID(), scope = randomUUID(), sequence = randomUUID();
    const start = anchor.getTime() - 3_600_000;
    const [user] = await db.insert(users).values({
      id, email: `${id}@traveloure-qa.test`, preferences,
    }).returning();
    const [trip] = await db.insert(trips).values({
      userId: id, destination: "Kyoto", startDate: "2030-05-05", endDate: "2030-05-07",
    }).returning();
    const [service] = await db.insert(providerServices).values({
      userId: id, serviceName: "Provider-failure proof", price: "10.00",
      priceType: "fixed", status: "active", availability: [],
    }).returning();
    const [item] = await db.insert(itineraryItems).values({
      tripId: trip.id, providerServiceId: service.id, title: "Isolated", dayNumber: 1,
    }).returning();
    const [cart] = await db.insert(cartItems).values({
      userId: id, experienceSlug: scope, tripId: trip.id, itineraryItemId: item.id,
      serviceId: service.id, quantity: 1,
      contentMeta: addedCartState({}, service.id, null, { at_ms: start, sequence_id: sequence }),
    }).returning();
    await db.transaction(async tx => {
      await lockMarketingTraveler(tx, id);
      assert.equal(await enqueuePendingCommerceReminder(user.email!,
        `cart-reminder-1h:${cart.id}:${sequence}`, sequence, scope,
        { travelerId: id, scope, kind: "cart_reminder_1h", sequenceStartMs: start }, tx), true);
    });
    const queued = await observer.query(
      "SELECT id FROM email_outbox WHERE metadata->>'travelerId'=$1", [id],
    );
    assert.equal(queued.rowCount, 1);
    return Number(queued.rows[0].id);
  };
  const read = async (id: number) => (await observer.query(
    "SELECT *, retry_after::text AS lease FROM email_outbox WHERE id=$1", [id],
  )).rows[0];
  const expire = async (id: number) => {
    await observer.query("UPDATE email_outbox SET retry_after=NOW()-INTERVAL '12 minutes' WHERE id=$1", [id]);
  };
  const competitors = () => Promise.all([drainOutbox(), drainOutboxForAdminRetry(-1)]);
  const mockProvider = (id: number) => {
    const submissions: SendEmailParams[] = [];
    const acceptances = new Map<string, { id: string; payload: SendEmailParams }>();
    const send = async (params: SendEmailParams) => {
      assert.equal(params.idempotencyKey, `cart-reminder-${id}`);
      const payload = structuredClone(params);
      submissions.push(payload);
      const prior = acceptances.get(params.idempotencyKey!);
      if (prior) assert.deepEqual(payload, prior.payload, "same key must retain the same payload");
      const accepted = prior ?? { id: `synthetic_${randomUUID()}`, payload };
      acceptances.set(params.idempotencyKey!, accepted);
      return { ok: true, id: accepted.id };
    };
    _outboxTestHooks.sendEmailFn = send;
    return { send, submissions, acceptances };
  };
  const assertCancellation = async (id: number) => {
    const row = await read(id);
    assert.equal(row.status, "dead");
    assert.equal(row.last_error, "provider_acceptance_unknown");
    assert.equal(row.metadata.cancelReason, undefined);
    assert.equal(row.metadata.commerceDeliveryAttempt.phase, "uncertain");
    assert.equal(row.sent_at, null);
    assert.equal(row.resend_id, null);
    assert.equal(row.retry_after, null);
    assert.equal(row.attempt_count, 1, "committed attempt survives failed acceptance persistence");
    return row;
  };
  const originalQuery = pg.Client.prototype.query;
  const evidence: object[] = [];
  try {
    for (let loop = 1; loop <= 2; loop++) {
      await t.test(`loop ${loop}: healthy locked send excludes competing claims`, async () => {
        const id = await fixture(), provider = mockProvider(id);
        const entered = signal(), release = signal();
        _outboxTestHooks.sendEmailFn = async params => {
          const accepted = await provider.send(params);
          entered.resolve();
          await bounded(release.promise);
          return accepted;
        };
        const sending = deliverQueuedEmail(id);
        try {
          await bounded(entered.promise);
          assert.equal((await read(id)).status, "processing", "observer cannot see the uncommitted sent write");
          const claims = await competitors();
          claims.forEach(result => assert.equal(result.error, undefined));
          assert.equal(claims.reduce((sum, result) => sum + result.drained, 0), 0);
        } finally { release.resolve(); await sending; }
        await deliverQueuedEmail(id);
        await competitors();
        const durable = await read(id);
        assert.equal(durable.status, "sent");
        assert.equal(durable.resend_id, [...provider.acceptances.values()][0].id);
        assert.equal(provider.submissions.length, 1);
        assert.equal(provider.acceptances.size, 1);
        evidence.push({ loop, case: "healthy_claims", submissions: 1, syntheticAcceptances: 1, durable: "sent" });
      });

      for (const fault of ["statement_abort", "deferred_commit_failure"] as const) {
        await t.test(`loop ${loop}: ${fault} preserves intent and holds uncertain acceptance`, async st => {
          const id = await fixture(), provider = mockProvider(id);
          let fired = false;
          if (fault === "deferred_commit_failure") {
            await observer.query(`UPDATE email_outbox SET metadata=metadata ||
              '{"proofCommitFailure":true}'::jsonb WHERE id=$1`, [id]);
            st.mock.method(pg.Client.prototype, "query", async function(this: pg.Client, ...args: any[]) {
              if (queryText(args[0]).toLowerCase() === "commit" && provider.acceptances.size === 1) {
                assert.equal(provider.acceptances.size, 1);
                try { return await (originalQuery as any).apply(this, args); }
                catch (error) {
                  assert.equal((error as { code: string }).code, "P0001");
                  assert.match((error as Error).message, /synthetic acceptance commit failure/);
                  fired = true;
                  throw error;
                }
              }
              return (originalQuery as any).apply(this, args);
            });
          } else {
            st.mock.method(pg.Client.prototype, "query", function(this: pg.Client, ...args: any[]) {
              if (!fired && sentWrite(args[0], args[1])) {
                fired = true;
                assert.equal(provider.acceptances.size, 1, "provider accepted before actual SQL abort");
                return originalQuery.call(this, "SELECT nonexistent_provider_proof_column FROM email_outbox");
              }
              return (originalQuery as any).apply(this, args);
            });
          }
          await deliverQueuedEmail(id);
          assert.equal(fired, true, "actual post-acceptance database fault was exercised");
          const durable = await assertCancellation(id);
          assert.ok(durable.metadata.commerceDeliveryAttempt.intentAt);
          await competitors();
          await deliverQueuedEmail(id);
          assert.equal(provider.submissions.length, 1);
          assert.equal(provider.acceptances.size, 1);
          evidence.push({ loop, case: fault, submissions: 1, syntheticAcceptances: 1,
            durable: "dead/provider_acceptance_unknown", duplicatePrevented: true, receiptUncertain: true });
        });
      }

      await t.test(`loop ${loop}: lost COMMIT acknowledgement returns durable sent outcome`, async st => {
        const id = await fixture(), provider = mockProvider(id);
        await observer.query(`UPDATE email_outbox SET status='processing',
          retry_after=NOW()+INTERVAL '10 minutes' WHERE id=$1`, [id]);
        let transactionClient: pg.Client | undefined, fired = false;
        st.mock.method(pg.Client.prototype, "query", async function(this: pg.Client, ...args: any[]) {
          if (sentWrite(args[0], args[1])) transactionClient = this;
          if (!fired && this === transactionClient && queryText(args[0]).toLowerCase() === "commit") {
            fired = true;
            // Real COMMIT reaches PostgreSQL. Only its client acknowledgement is lost.
            await (originalQuery as any).apply(this, args);
            throw new Error("Synthetic lost COMMIT acknowledgement");
          }
          return (originalQuery as any).apply(this, args);
        });
        const outcome = await deliverVerifiedCommerce(id, provider.send);
        assert.equal(fired, true);
        assert.equal(outcome, "sent");
        const durable = await read(id);
        assert.equal(durable.status, "sent");
        assert.equal(durable.resend_id, [...provider.acceptances.values()][0].id);
        assert.equal(durable.attempt_count, 1);
        assert.ok(durable.sent_at);
        assert.equal(durable.metadata.cancelReason, undefined);
        await competitors();
        assert.equal(provider.submissions.length, 1);
        evidence.push({ loop, case: "lost_commit_ack", submissions: 1, syntheticAcceptances: 1,
          durable: "sent", truthfulOutcome: true });
      });

      for (const recovery of ["fallback_write_failure", "new_claim_before_fallback", "new_lease_before_fallback"] as const) {
        await t.test(`loop ${loop}: ${recovery} cannot cause a second submission`, async st => {
          const id = await fixture(), provider = mockProvider(id);
          const fallbackEntered = signal(), releaseFallback = signal();
          let aborted = false, fallbackIntercepted = false;
          st.mock.method(pg.Client.prototype, "query", async function(this: pg.Client, ...args: any[]) {
            if (!aborted && sentWrite(args[0], args[1])) {
              aborted = true;
              return originalQuery.call(this, "SELECT nonexistent_provider_proof_column FROM email_outbox");
            }
            if (!fallbackIntercepted && fallbackWrite(args[0])) {
              fallbackIntercepted = true;
              fallbackEntered.resolve();
              if (recovery === "fallback_write_failure") {
                const error = new Error("Synthetic cancellation write outage");
                // Pool.query delegates to Client.query using a callback; throwing
                // from an async replacement would create an unhandled rejection,
                // not simulate a database error delivered to the application.
                const callback = args.at(-1);
                if (typeof callback === "function") { callback(error); return; }
                throw error;
              }
              await bounded(releaseFallback.promise);
            }
            return (originalQuery as any).apply(this, args);
          });
          // A failed fallback cannot erase the separately committed intent.
          const sending = deliverQueuedEmail(id);
          let competing: ReturnType<typeof competitors> | undefined;
          try {
            await bounded(fallbackEntered.promise);
            if (recovery === "fallback_write_failure") await sending;
            const before = await read(id);
            assert.equal(before.status, "processing");
            assert.equal(before.resend_id, null);
            assert.equal(before.attempt_count, 1);
            assert.equal(before.metadata.commerceDeliveryAttempt.phase, "intent");
            assert.equal(provider.submissions.length, 1);
            await expire(id); // isolated fixture lease expiry, not wall-clock waiting
            competing = competitors();
            if (recovery === "new_lease_before_fallback") {
              // Fixture-only forced newer intent: impossible through normal
              // claims, but tests the independent owner-token fence.
              await observer.query(`UPDATE email_outbox SET metadata=jsonb_set(metadata,
                '{commerceDeliveryAttempt,ownerToken}',to_jsonb($2::text)),
                retry_after=NOW()+INTERVAL '10 minutes' WHERE id=$1`, [id, randomUUID()]);
            } else if (recovery === "new_claim_before_fallback") {
              await observer.query(`UPDATE email_outbox SET status='sent',
                resend_id=$2, sent_at=NOW() WHERE id=$1`, [id, [...provider.acceptances.values()][0].id]);
            }
            const claims = await competing;
            claims.forEach(result => assert.equal(result.error, undefined));
            assert.equal(claims.reduce((sum, result) => sum + result.drained, 0), 0);
          } finally {
            releaseFallback.resolve();
            await sending;
            if (competing) await competing;
          }
          const durable = await read(id);
          assert.equal(durable.status, recovery === "new_claim_before_fallback" ? "sent" : "processing");
          assert.equal(durable.metadata.cancelReason, undefined);
          assert.equal(durable.attempt_count, 1);
          assert.equal(provider.submissions.length, 1);
          assert.equal(provider.acceptances.size, 1, "mock dedup is NOT evidence of real provider guarantees");
          await competitors();
          assert.equal(provider.submissions.length, 1);
          evidence.push({ loop, case: recovery, submissions: 1, syntheticAcceptances: 1,
            durable: durable.status, duplicatePrevented: true });
        });
      }
      await t.test(`loop ${loop}: intent SQL failure invokes no provider`, async st => {
        const id = await fixture(), provider = mockProvider(id);
        let fired = false;
        st.mock.method(pg.Client.prototype, "query", function(this: pg.Client, ...args: any[]) {
          if (!fired && /update "email_outbox"/i.test(queryText(args[0])) &&
              (args[1] ?? []).some((value: unknown) => typeof value === "string" && value.includes('"phase":"intent"'))) {
            fired = true;
            return originalQuery.call(this, "SELECT nonexistent_intent_proof_column FROM email_outbox");
          }
          return (originalQuery as any).apply(this, args);
        });
        _outboxTestHooks.sendEmailFn = provider.send;
        await deliverQueuedEmail(id);
        assert.equal(fired, true);
        assert.equal(provider.submissions.length, 0);
        assert.equal((await read(id)).metadata.commerceDeliveryAttempt, undefined);
      });
      await t.test(`loop ${loop}: crash/expired intent and malformed intent never retry after 24h`, async () => {
        for (const attempt of [null, { version: 1, phase: "intent", intentAt: "2020-01-01T00:00:00Z" }]) {
          const id = await fixture(), provider = mockProvider(id);
          _outboxTestHooks.sendEmailFn = provider.send;
          await observer.query(`UPDATE email_outbox SET metadata=metadata ||
            jsonb_build_object('commerceDeliveryAttempt',$2::jsonb), status='processing',
            retry_after=NOW()-INTERVAL '25 hours' WHERE id=$1`, [id, JSON.stringify(attempt)]);
          await competitors(); await deliverQueuedEmail(id);
          assert.equal(provider.submissions.length, 0);
        }
      });
      await t.test(`loop ${loop}: unknown intent COMMIT acknowledgement never hands off`, async st => {
        const id = await fixture(), provider = mockProvider(id);
        _outboxTestHooks.sendEmailFn = provider.send;
        let fired = false;
        st.mock.method(pg.Client.prototype, "query", async function(this: pg.Client, ...args: any[]) {
          if (!fired && queryText(args[0]).toLowerCase() === "commit") {
            fired = true;
            await (originalQuery as any).apply(this, args);
            throw new Error("Synthetic lost intent COMMIT acknowledgement");
          }
          return (originalQuery as any).apply(this, args);
        });
        await deliverQueuedEmail(id);
        assert.equal(fired, true);
        assert.equal(provider.submissions.length, 0);
        const durable = await read(id);
        assert.ok(durable.metadata.commerceDeliveryAttempt);
        assert.equal(durable.status, "dead");
        await competitors();
        assert.equal(provider.submissions.length, 0);
      });
      await t.test(`loop ${loop}: proven pre-handoff quiet deferral releases unused cap and resumes safely`, async () => {
        const id = await fixture(), provider = mockProvider(id);
        _outboxTestHooks.sendEmailFn = provider.send;
        commerceSendVerification.beforeFinalRead = async () => {
          cartReminderVerification.now = new Date("2030-05-05T20:00:00Z");
        };
        try { await deliverQueuedEmail(id); }
        finally { commerceSendVerification.beforeFinalRead = null; }
        const held = await read(id);
        assert.equal(held.status, "pending");
        assert.equal(held.metadata.commerceDeliveryAttempt.phase, "not_invoked");
        assert.equal(held.metadata.deliveryCalendarDay, undefined);
        assert.equal(held.metadata.deliveryCalendarDays, undefined);
        assert.equal(provider.submissions.length, 0);
        cartReminderVerification.now = new Date("2030-05-06T10:00:00Z");
        await observer.query("UPDATE email_outbox SET retry_after=NULL WHERE id=$1", [id]);
        await deliverQueuedEmail(id);
        assert.equal((await read(id)).status, "sent");
        assert.equal(provider.submissions.length, 1);
      });
    }
    console.log("COMMERCE_PROVIDER_FAILURE_EVIDENCE=" + JSON.stringify(evidence));
    assert.equal(networkCalls, 0);
    console.log("RELEASE_CERTIFIED=false REAL_PROVIDER_ONCE_ONLY_PROVEN=false");
  } finally {
    t.mock.restoreAll();
    _outboxTestHooks.sendEmailFn = previousSender;
    cartReminderVerification.now = previousClock;
    cartReminderVerification.recordedRailsOnly = previousRails;
    await observer.query(`DROP TRIGGER proof_acceptance_commit_failure ON email_outbox;
      DROP FUNCTION proof_reject_sent_commit()`);
    await observer.end();
  }
});
