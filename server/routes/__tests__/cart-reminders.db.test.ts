import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql, eq } from "drizzle-orm";
import { db, pool } from "../../db";
import { users, trips, providerServices, itineraryItems, cartItems, emailOutbox } from "../../../shared/schema";
import {
  READABLE_COMMERCE_RAILS, PAYMENT_COVERAGE_DEFECTS, readTravelerCommerceActivity,
  cartReminderVerification, assessCartReminder, deliverCartReminder, eligibleCartHasPriority,
  recordedRailState,
} from "../../services/cart-reminder.service";
import { CART_REMINDERS, dueCartReminder, isCartReminder, isCartReminderFamily } from "../../services/cart-reminder-email";
import { migrateCartRowsWithActivity } from "../../services/cart-email-state.service";
import { runCommerceEmailSweep, commerceSweepDependencies } from "../../services/commerce-email-sweep.service";
import { deliverItineraryFollowup } from "../../services/itinerary-followup.service";
import { deliverQueuedEmail, enqueueEmail, _outboxTestHooks } from "../../services/email-outbox.service";
import { marketingDayReserved, lockMarketingTraveler, marketingWindow } from "../../services/marketing-delivery-policy.service";

const now = new Date("2030-05-05T12:00:00.000Z");
const before = new Date("2020-01-01T00:00:00.000Z");
const prefs = { itineraryMarketing: { enabled: true, timeZone: "UTC", quietStart: "00:00", quietEnd: "00:00" } };
const q = (name: string) => `"${name.replaceAll('"', '""')}"`;

test("Part 4: two native randomized loops over recorded rails; unknown coverage remains closed", async () => {
  assert.match(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "", /^automation_msg_[a-f0-9]{16}$/);
  assert.equal((await db.execute(sql`SELECT current_schema() AS name`)).rows[0].name,
    process.env.MESSAGING_VERIFICATION_SCHEMA);
  const indexes = await db.execute(sql`SELECT indexdef FROM pg_indexes
    WHERE schemaname=current_schema() AND tablename='email_outbox'`);
  if (!indexes.rows.some(row => String(row.indexdef).includes("commerceKey"))) {
    // Existing commerce index, fixture schema only. No new index/migration in public.
    await db.execute(sql`CREATE UNIQUE INDEX email_outbox_commerce_key
      ON email_outbox ((metadata->>'commerceKey')) WHERE metadata ? 'commerceKey'`);
  }
  let syntheticCalls = 0;
  const originalInbox = process.env.ITINERARY_OUTCOME_TEST_EMAIL;
  _outboxTestHooks.sendEmailFn = async () => { syntheticCalls++; return { ok: true, id: `synthetic-${randomUUID()}` }; };
  cartReminderVerification.now = now;
  const fixture = async (idle = 3_600_000) => {
    const id = randomUUID(), sequence = randomUUID(), scope = randomUUID().slice(0, 12);
    const [user] = await db.insert(users).values({ id, email: `${id}@traveloure-qa.test`, preferences: prefs }).returning();
    const [trip] = await db.insert(trips).values({ userId: id, destination: "Kyoto",
      startDate: "2030-05-05", endDate: "2030-05-07" }).returning();
    const [service] = await db.insert(providerServices).values({ userId: id, serviceName: "Native verification" }).returning();
    const [item] = await db.insert(itineraryItems).values({ tripId: trip.id,
      providerServiceId: service.id, title: "Native verification", dayNumber: 1 }).returning();
    const start = now.getTime() - idle;
    const [cart] = await db.insert(cartItems).values({ userId: id, experienceSlug: scope,
      tripId: trip.id, itineraryItemId: item.id, serviceId: service.id,
      contentMeta: { _cart_automation: { activity: { at_ms: start, sequence_id: sequence } } } }).returning();
    return { user, trip, service, item, cart, sequence, scope, start };
  };
  const assess = async (f: Awaited<ReturnType<typeof fixture>>) =>
    db.transaction(tx => assessCartReminder(tx, f.user.id, f.scope, now));
  const cartRows = async (id: string) => (await db.execute(sql`SELECT * FROM email_outbox
    WHERE metadata->>'travelerId'=${id} ORDER BY id`)).rows as any[];

  // Constraint-preserving minimal fixture generation. FKs are seeded, not disabled.
  // No provider credentials, network calls, timers, or ordinary/public schema writes.
  const columns = new Map<string, any[]>(), foreign = new Map<string, any[]>();
  const seed = async (table: string, owner: string, overrides: Record<string, unknown> = {}, depth = 0): Promise<string> => {
    if (depth > 10) throw new Error("Fixture FK recursion exceeded");
    if (table === "users") return owner;
    if (!columns.has(table)) {
      columns.set(table, (await db.execute(sql`SELECT column_name, data_type, is_nullable, column_default,
        character_maximum_length FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name=${table} ORDER BY ordinal_position`)).rows);
      foreign.set(table, (await db.execute(sql`SELECT a.attname AS col, dest.relname AS target
        FROM pg_constraint c JOIN pg_class src ON src.oid=c.conrelid
        JOIN pg_namespace n ON n.oid=src.relnamespace JOIN pg_class dest ON dest.oid=c.confrelid
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
        WHERE c.contype='f' AND n.nspname=current_schema() AND src.relname=${table}`)).rows);
    }
    const values: Record<string, unknown> = { ...overrides };
    for (const column of columns.get(table)!) {
      const name = column.column_name;
      if (name in values) continue;
      if (column.data_type.includes("timestamp")) { values[name] = before; continue; }
      if (column.is_nullable !== "NO" || column.column_default !== null) continue;
      const fk = foreign.get(table)!.find(row => row.col === name);
      if (fk) { values[name] = await seed(fk.target, owner, {}, depth + 1); continue; }
      values[name] = column.data_type === "boolean" ? false
        : /integer|numeric|double|real/.test(column.data_type) ? 1
        : column.data_type === "date" ? "2030-05-05"
        : /json/.test(column.data_type) ? "{}"
        : column.data_type === "ARRAY" ? "{}"
        : name === "currency" ? "usd"
        : name === "market" ? "Kyoto"
        : randomUUID().slice(0, column.character_maximum_length ?? 36);
    }
    const entries = Object.entries(values);
    const statement = sql`INSERT INTO ${sql.raw(q(table))}
      (${sql.join(entries.map(([key]) => sql.raw(q(key))), sql`, `)})
      VALUES (${sql.join(entries.map(([, value]) => sql`${value}`), sql`, `)}) RETURNING id`;
    return String((await db.execute(statement)).rows[0].id);
  };
  const addRail = async (rail: typeof READABLE_COMMERCE_RAILS[number], owner: string, time: Date | null) => {
    const table = rail.from.split(" ")[0], values: Record<string, unknown> = {};
    for (const stamp of rail.times) values[stamp] = time;
    if (rail.name === "credits") values.wallet_id = await seed("wallets", owner, { user_id: owner });
    else if (rail.name === "coordination_booking") values.coordination_id = await seed("coordination_states", owner, { user_id: owner });
    else if (rail.name === "provider_request" || rail.name === "group_transaction") {
      values.trip_id = await seed("trips", owner, { user_id: owner });
    } else values[rail.owner.split(".")[1]] = owner;
    return seed(table, owner, values);
  };
  const evidence: object[] = [];
  try {
    for (let loop = 1; loop <= 2; loop++) {
      const scenario = randomUUID(), railProof: object[] = [];
      // Production/default policy never drops unknown coverage.
      cartReminderVerification.recordedRailsOnly = false;
      const held = await fixture();
      const unknown = await readTravelerCommerceActivity(db, held.user.id, held.start, held.start);
      assert.equal(unknown.allowed, false); assert.equal(unknown.recordedClear, true);
      assert.deepEqual(unknown.unknownRails, [...PAYMENT_COVERAGE_DEFECTS]);
      assert.equal((await assess(held)).reason, "payment_rail_unknown");

      // Explicit, provider-free READABLE-SUBSET proof. Not all-rail certification.
      cartReminderVerification.recordedRailsOnly = true;
      for (const rail of READABLE_COMMERCE_RAILS) {
        const f = await fixture();
        const rowId = await addRail(rail, f.user.id, new Date(f.start - 1));
        let result = await readTravelerCommerceActivity(db, f.user.id, f.start, f.start);
        assert.equal(result.recordedClear, true, `${rail.name} before start`);
        assert.equal(result.allowed, false, "Unknown external rails still prohibit real delivery");
        const table = rail.from.split(" ")[0];
        for (const offset of [0, 1]) {
          await db.execute(sql`UPDATE ${sql.raw(q(table))} SET
            ${sql.join(rail.times.map(time => sql`${sql.raw(q(time))}=${new Date(f.start + offset)}`), sql`, `)}
            WHERE id::text=${rowId}`);
          result = await readTravelerCommerceActivity(db, f.user.id, f.start, f.start);
          assert.ok(result.activityRails.includes(rail.name), `${rail.name} inclusive boundary`);
          assert.equal(result.recordedClear, false);
          assert.equal((await assess(f)).eligible, false);
        }
        // Missing timestamps on a nullable existing column fail closed.
        const nullable = columns.get(table)!.find(col => col.column_name === rail.times[0] && col.is_nullable === "YES");
        if (nullable) {
          await db.execute(sql`UPDATE ${sql.raw(q(table))} SET ${sql.raw(q(rail.times[0]))}=NULL WHERE id::text=${rowId}`);
          result = await readTravelerCommerceActivity(db, f.user.id, f.start, f.start);
          assert.ok(result.unknownRails.includes(rail.name)); assert.equal(result.recordedClear, false);
        }
        railProof.push({ rail: rail.name, before: true, at: true, after: true, nullColumnTested: !!nullable });
      }

      const good = await fixture();
      assert.equal((await assess(good)).eligible, true);
      // Item-change sent suppression is local-day only; pending never consumes a step.
      const suppress = await fixture(3 * 24 * 3_600_000);
      for (const [kind, days] of [["cart_reminder_1h", 2], ["cart_reminder_1d", 1]] as const) {
        await db.execute(sql`INSERT INTO email_outbox
          (email_type,to_email,subject,html,status,sent_at,metadata)
          VALUES (${kind},${suppress.user.email},'synthetic','synthetic','sent',
            ${new Date(now.getTime() - days * 24 * 3_600_000)},
            ${JSON.stringify({ cartReminderVersion: 1, travelerId: suppress.user.id,
              sequenceId: suppress.sequence, cartScopeRaw: suppress.scope, marketing: true })}::jsonb)`);
      }
      const [notice] = (await db.execute(sql`INSERT INTO email_outbox
        (email_type,to_email,subject,html,status,metadata)
        VALUES ('cart_item_changed',${suppress.user.email},'synthetic','synthetic','pending',
          ${JSON.stringify({ travelerId: suppress.user.id, marketing: false })}::jsonb)
        RETURNING id`)).rows;
      assert.equal((await assess(suppress)).eligible, true);
      await db.execute(sql`UPDATE email_outbox SET status='sent',sent_at=${now} WHERE id=${notice.id}`);
      assert.equal((await assess(suppress)).reason, "item_change_sent_today");
      const tomorrow = await db.transaction(tx => assessCartReminder(tx, suppress.user.id, suppress.scope,
        new Date(now.getTime() + 24 * 3_600_000)));
      assert.equal(tomorrow.eligible, true); assert.equal(tomorrow.kind, "cart_reminder_3d");
      await db.execute(sql`DELETE FROM email_outbox WHERE id=${notice.id}`);
      assert.equal(await db.transaction(tx => eligibleCartHasPriority(tx, good.user.id, now)), true);
      for (const [patch, reason] of [
        [{ preferences: { itineraryMarketing: { ...prefs.itineraryMarketing, enabled: false } } }, "marketing_unsubscribed"],
        [{ isSuspended: true }, "account_suspended"], [{ isDeleted: true }, "account_deleted"],
        [{ email: null }, "no_account_recipient"],
        [{ preferences: { itineraryMarketing: { ...prefs.itineraryMarketing, timeZone: "not-a-zone" } } }, "unknown_timezone_or_preferences"],
        [{ preferences: { itineraryMarketing: { ...prefs.itineraryMarketing, timeZone: "Pacific/Honolulu" } } }, "outside_marketing_window"],
      ] as const) {
        const condition = await fixture();
        assert.equal((await assess(condition)).eligible, true);
        await db.update(users).set(patch).where(eq(users.id, condition.user.id));
        assert.equal((await assess(condition)).reason, reason);
      }
      await db.update(cartItems).set({ tripId: null }).where(eq(cartItems.id, good.cart.id));
      assert.equal((await assess(good)).reason, "payment_correlation_ambiguous");
      await db.update(cartItems).set({ tripId: good.trip.id, itineraryItemId: null }).where(eq(cartItems.id, good.cart.id));
      assert.equal((await assess(good)).reason, "payment_correlation_ambiguous");
      await db.update(cartItems).set({ itineraryItemId: good.item.id, serviceId: null }).where(eq(cartItems.id, good.cart.id));
      assert.equal((await assess(good)).reason, "payment_correlation_ambiguous");
      await db.update(cartItems).set({ serviceId: good.service.id }).where(eq(cartItems.id, good.cart.id));

      // Simulated paid provider removed, leaving ONLY a partner row. Both local
      // payment records predate the current sequence: ambiguity must still win.
      const residual = await fixture();
      await seed("service_bookings", residual.user.id, { traveler_id: residual.user.id,
        service_id: residual.service.id, status: "completed" });
      await seed("payment_intents", residual.user.id, { user_id: residual.user.id, status: "succeeded" });
      assert.equal((await readTravelerCommerceActivity(db, residual.user.id,
        residual.start, residual.start)).recordedClear, true);
      const { id: removedProviderId, ...partnerRow } = residual.cart;
      await db.insert(cartItems).values({ ...partnerRow, serviceId: null });
      await db.delete(cartItems).where(eq(cartItems.id, removedProviderId));
      assert.equal((await assess(residual)).reason, "payment_correlation_ambiguous");

      const first = await runCommerceEmailSweep();
      assert.ok(first.enqueued >= 1);
      const second = await runCommerceEmailSweep();
      assert.equal(second.enqueued, 0); assert.ok(second.duplicates >= 1);
      const [queued] = await cartRows(good.user.id);
      assert.equal(queued.email_type, "cart_reminder_1h");
      await deliverQueuedEmail(queued.id);
      assert.equal((await cartRows(good.user.id))[0].status, "sent");
      const day = marketingWindow(now, prefs.itineraryMarketing).day;
      assert.equal(await db.transaction(async tx => {
        await lockMarketingTraveler(tx, good.user.id);
        return marketingDayReserved(tx, good.user.id, day);
      }), true);
      // Resume creates a NEW sequence; sent history does not block it, but the day cap does.
      const resumed = randomUUID();
      await db.update(cartItems).set({ contentMeta: {
        _cart_automation: { activity: { at_ms: now.getTime(), sequence_id: resumed } },
      } }).where(eq(cartItems.id, good.cart.id));
      assert.equal((await assess(good)).reason, "not_idle");
      const afterResumeIdle = new Date(now.getTime() + 3_600_000);
      assert.equal((await db.transaction(tx => assessCartReminder(tx, good.user.id, good.scope, afterResumeIdle))).eligible, true);
      cartReminderVerification.now = afterResumeIdle;
      const capped = await runCommerceEmailSweep();
      assert.ok((capped.skipReasons.daily_marketing_cap ?? 0) >= 1);
      cartReminderVerification.now = now;

      // Guest ownership is insufficient until the existing atomic claim writer runs.
      const guest = await fixture(), guestId = randomUUID();
      await db.update(cartItems).set({ userId: null, guestSessionId: guestId }).where(eq(cartItems.id, guest.cart.id));
      assert.equal((await assess(guest)).reason, "empty_cart");
      assert.equal((await cartRows(guest.user.id)).length, 0);
      await migrateCartRowsWithActivity(guestId, guest.user.id, [guest.cart.id], [], [], db,
        { at_ms: now.getTime(), sequence_id: randomUUID() });
      assert.equal((await assess(guest)).reason, "not_idle");
      assert.equal((await db.transaction(tx => assessCartReminder(tx, guest.user.id, guest.scope,
        new Date(now.getTime() + 3_600_000)))).eligible, true);

      // Payment wins while a sweep is already running: force commit before eligibility.
      const payFirst = await fixture(), originalSelect = commerceSweepDependencies.selectCandidates;
      let reached!: () => void, release!: () => void;
      const reachedPromise = new Promise<void>(resolve => { reached = resolve; });
      const releasePromise = new Promise<void>(resolve => { release = resolve; });
      commerceSweepDependencies.selectCandidates = async () => {
        const candidates = await originalSelect(); reached(); await releasePromise; return candidates;
      };
      try {
        const sweeping = runCommerceEmailSweep();
        await reachedPromise;
        await addRail(READABLE_COMMERCE_RAILS[0], payFirst.user.id, new Date(payFirst.start + 1));
        release(); await sweeping;
        assert.equal((await cartRows(payFirst.user.id)).length, 0);
      } finally { release(); commerceSweepDependencies.selectCandidates = originalSelect; }

      // Sweep wins first, payment overlaps and waits for enqueue commit. Send-time
      // reads cancel the queued row BEFORE even a synthetic provider attempt.
      const sweepFirst = await fixture();
      let sweepCommitted!: () => void;
      const sweepDone = new Promise<void>(resolve => { sweepCommitted = resolve; });
      const overlappingPayment = (async () => {
        await sweepDone;
        await addRail(READABLE_COMMERCE_RAILS[0], sweepFirst.user.id, new Date(sweepFirst.start + 1));
      })();
      await runCommerceEmailSweep(); sweepCommitted(); await overlappingPayment;
      const [stale] = await cartRows(sweepFirst.user.id);
      assert.ok(stale);
      const callsBeforePaymentGuard = syntheticCalls;
      await deliverQueuedEmail(stale.id);
      assert.equal((await cartRows(sweepFirst.user.id))[0].status, "cancelled");
      assert.equal(syntheticCalls, callsBeforePaymentGuard);

      // Itinerary acquires the recipient lock first. Eligibility is checked from
      // the cart itself, not queue order; the cart wins even before it is enqueued.
      const priority = await fixture();
      // Synthetic, keyless test transport only. This is NOT the monitored inbox
      // and never changes workspace/deployment settings or sends an email.
      process.env.ITINERARY_OUTCOME_TEST_EMAIL = priority.user.email!;
      const comparison = await seed("itinerary_comparisons", priority.user.id,
        { user_id: priority.user.id, status: "generated" });
      const [itineraryMail] = await db.insert(emailOutbox).values({
        emailType: "itinerary_nudge_2h", toEmail: priority.user.email!, subject: "Synthetic", html: "",
        status: "processing", metadata: { travelerFollowupVersion: 1, marketing: true,
          travelerId: priority.user.id, itineraryId: comparison, readyAt: before.toISOString(), unsubscribeToken: randomUUID() },
      }).returning();
      const callsBeforePriority = syntheticCalls;
      assert.equal(await deliverItineraryFollowup(itineraryMail.id, _outboxTestHooks.sendEmailFn!), "deferred");
      assert.equal(syntheticCalls, callsBeforePriority);
      assert.match((await db.select().from(emailOutbox).where(eq(emailOutbox.id, itineraryMail.id)))[0].lastError!, /cart priority/);
      await runCommerceEmailSweep();
      const cartMail = (await cartRows(priority.user.id)).find(row => row.email_type === "cart_reminder_1h");
      assert.ok(cartMail); await deliverQueuedEmail(cartMail.id);
      await db.update(emailOutbox).set({ status: "processing" }).where(eq(emailOutbox.id, itineraryMail.id));
      assert.equal(await deliverItineraryFollowup(itineraryMail.id, _outboxTestHooks.sendEmailFn!), "deferred");
      assert.match((await db.select().from(emailOutbox).where(eq(emailOutbox.id, itineraryMail.id)))[0].lastError!, /daily marketing cap/);
      if (originalInbox === undefined) delete process.env.ITINERARY_OUTCOME_TEST_EMAIL;
      else process.env.ITINERARY_OUTCOME_TEST_EMAIL = originalInbox;

      // Unsupported fourth rows and generic enqueues cannot use the generic transport.
      const [fourth] = await db.insert(emailOutbox).values({ emailType: "cart_reminder_4d", toEmail: good.user.email!,
        subject: "Synthetic", html: "", status: "processing",
        metadata: { cartReminderVersion: 1, travelerId: good.user.id, sequenceId: resumed, cartScopeRaw: good.scope } }).returning();
      const calls = syntheticCalls;
      assert.equal(await deliverCartReminder(fourth.id, _outboxTestHooks.sendEmailFn), "cancelled");
      assert.equal(syntheticCalls, calls);
      assert.equal(await enqueueEmail({ emailType: "cart_reminder_4d", to: good.user.email!, subject: "Synthetic", html: "" }), null);

      // A real payment SELECT failure propagates; it never returns an empty success.
      await assert.rejects(readTravelerCommerceActivity({
        execute: async () => { throw new Error("Injected read fault"); },
      } as any, good.user.id, good.start, good.start), /Injected read fault/);
      evidence.push({ loop, scenario, clean: true, scope: "recorded-readable-subset-only", rails: railProof,
        eligibilityCases: 11, duplicates: second.duplicates, resumedDayCap: true, fourthRejected: true,
        paidProviderRemovedPartnerOnly: true,
        defaultUnknownBlocked: true, paymentSweepOrderings: 2, guestClaim: true,
        itineraryFirstAndCartFirst: true, realEmails: 0 });
      // Isolated fixture cleanup between loops; never public data.
      await db.execute(sql`DELETE FROM email_outbox`);
      const tableRows = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname=current_schema()`);
      await db.execute(sql.raw("TRUNCATE " + tableRows.rows.map(row => q(String(row.tablename))).join(",") + " CASCADE"));
    }
    assert.match(readFileSync("scripts/ci/post-internal-jobs.sh", "utf8"),
      /commerce-email-sweep email-outbox/);
    console.log("PART4_DB_EVIDENCE=" + JSON.stringify(evidence));
  } finally {
    cartReminderVerification.recordedRailsOnly = false; cartReminderVerification.now = null;
    if (originalInbox === undefined) delete process.env.ITINERARY_OUTCOME_TEST_EMAIL;
    else process.env.ITINERARY_OUTCOME_TEST_EMAIL = originalInbox;
    _outboxTestHooks.sendEmailFn = undefined;
    await pool.end();
  }
});

test("Part 4 pure policy: two fresh loops, all thresholds and local-window boundaries", () => {
  const evidence: object[] = [];
  for (let loop = 1; loop <= 2; loop++) {
    const scenario = randomUUID(), prior: string[] = [];
    for (const step of CART_REMINDERS) {
      assert.equal(dueCartReminder(step.milliseconds - 1, prior), null);
      assert.equal(dueCartReminder(step.milliseconds, prior), step.kind);
      assert.equal(dueCartReminder(step.milliseconds + 1, prior), step.kind);
      prior.push(step.kind);
    }
    assert.equal(dueCartReminder(10 * 86_400_000, prior), null);
    assert.equal(isCartReminder("cart_reminder_4d"), false);
    assert.equal(isCartReminderFamily("cart_reminder_4d"), true);
    const preferences = { enabled: true, timeZone: "UTC", quietStart: "00:00", quietEnd: "00:00" };
    for (const [time, quiet] of [["08:59:59.999", true], ["09:00:00.000", false],
      ["19:59:59.999", false], ["20:00:00.000", true]] as const) {
      assert.equal(marketingWindow(new Date(`2030-05-05T${time}Z`), preferences).quiet, quiet);
    }
    assert.equal(marketingWindow(new Date("2030-05-05T03:30:00Z"),
      { ...preferences, timeZone: "Asia/Calcutta" }).quiet, false);
    assert.equal(marketingWindow(new Date("2030-05-05T14:30:00Z"),
      { ...preferences, timeZone: "Asia/Calcutta" }).quiet, true);
    const start = Date.parse("2030-05-05T11:00:00Z");
    assert.equal(recordedRailState(scenario, [new Date(start - 1)], start), "clear");
    assert.equal(recordedRailState(scenario, [new Date(start)], start), "activity");
    assert.equal(recordedRailState(scenario, [new Date(start + 1)], start), "activity");
    assert.equal(recordedRailState(scenario, ["2030-05-05T11:00:00.000"], start), "activity");
    for (const value of [null, undefined, "", "bad-date", {}, [], 1e100, new Date(NaN)]) {
      assert.equal(recordedRailState(scenario, [value], start), "unknown");
    }
    assert.equal(recordedRailState(null, [new Date(start)], start), "unknown");
    evidence.push({ loop, scenario, clean: true, thresholds: 9, localBoundaries: 6, malformedTimestamps: 8 });
  }
  console.log("PART4_PURE_EVIDENCE=" + JSON.stringify(evidence));
});
