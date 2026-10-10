/** Provider-free fixtures. This module is never imported by application code. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import {
  users, trips, providerServices, itineraryItems, cartItems, vendorAvailabilitySlots,
} from "../../../../shared/schema";
import { addedCartState } from "../../../services/cart-email-state.service";
import { READABLE_COMMERCE_RAILS, cartReminderVerification } from "../../../services/cart-reminder.service";
import { assessCartItemChanges } from "../../../services/cart-item-change.service";
import { lockMarketingTraveler } from "../../../services/marketing-delivery-policy.service";
import {
  enqueuePendingCommerceReminder, enqueuePendingCartItemChange, _outboxTestHooks,
} from "../../../services/email-outbox.service";
import { commerceSendVerification } from "../../../services/commerce-send-verification.service";
import { commerceSweepDependencies, selectCommerceCandidates } from "../../../services/commerce-email-sweep.service";

export const CONTROL_FILE = "/tmp/commerce-part8-scenario-control.json";
export const anchor = new Date("2030-05-05T12:00:00Z");
export const preferences = {
  itineraryMarketing: { enabled: true, timeZone: "UTC", quietStart: "00:00", quietEnd: "00:00" },
};
export type Rail = typeof READABLE_COMMERCE_RAILS[number];
const quote = (name: string) => {
  assert.match(name, /^[a-z_][a-z0-9_]*$/);
  return sql.raw(`"${name}"`);
};

export async function createScenarioRig() {
  assert.equal(process.env.NODE_ENV, "test");
  assert.match(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "", /^automation_msg_[a-f0-9]{16}$/);
  assert.equal((await db.execute(sql`SELECT current_schema() AS name`)).rows[0].name,
    process.env.MESSAGING_VERIFICATION_SCHEMA);
  // Existing fixture DDL, ONLY inside the owner's disposable schema.
  await db.execute(sql.raw(readFileSync("server/migrations/360_job_heartbeats_nullable_success.sql", "utf8")));
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_commerce_key
    ON email_outbox ((metadata->>'commerceKey')) WHERE metadata ? 'commerceKey'`);
  const previous = {
    now: cartReminderVerification.now, subset: cartReminderVerification.recordedRailsOnly,
    sender: _outboxTestHooks.sendEmailFn, selector: commerceSweepDependencies.selectCandidates,
  };
  const calls = new Map<string, number>();
  _outboxTestHooks.sendEmailFn = async params => {
    const key = params.idempotencyKey!;
    calls.set(key, (calls.get(key) ?? 0) + 1);
    return { ok: true, id: `synthetic_${randomUUID()}` };
  };
  const reset = () => {
    cartReminderVerification.now = anchor;
    cartReminderVerification.recordedRailsOnly = true;
    commerceSendVerification.beforeCheck = null;
    commerceSendVerification.beforeFinalRead = null;
    commerceSendVerification.afterFinalRead = null;
    commerceSendVerification.checkTimeoutMs = 5_000;
    commerceSweepDependencies.selectCandidates = previous.selector;
  };
  reset();
  const fixture = async (options: { idle?: number; slot?: boolean; quantity?: number } = {}) => {
    const id = randomUUID(), sequence = randomUUID(), scope = randomUUID();
    const [user] = await db.insert(users).values({
      id, email: `${id}@traveloure-qa.test`, preferences,
    }).returning();
    const [trip] = await db.insert(trips).values({ userId: id, destination: "Kyoto",
      startDate: "2030-05-05", endDate: "2030-05-07" }).returning();
    const [service] = await db.insert(providerServices).values({ userId: id,
      serviceName: `Scenario ${randomUUID()}`, price: "10.00", priceType: "fixed",
      status: "active", availability: [] }).returning();
    const [item] = await db.insert(itineraryItems).values({ tripId: trip.id,
      providerServiceId: service.id, title: "Randomized scenario", dayNumber: 1 }).returning();
    const slot = options.slot ? (await db.insert(vendorAvailabilitySlots).values({
      serviceId: service.id, providerId: id, date: "2030-05-05", startTime: "09:00",
      endTime: "10:00", capacity: 4, bookedCount: 0, status: "available",
    }).returning())[0] : null;
    const start = anchor.getTime() - (options.idle ?? 3_600_000);
    const [cart] = await db.insert(cartItems).values({
      userId: id, experienceSlug: scope, tripId: trip.id, serviceId: service.id,
      itineraryItemId: item.id, slotId: slot?.id, quantity: options.quantity ?? 1,
      contentMeta: addedCartState({}, service.id, slot?.id ?? null,
        { at_ms: start, sequence_id: sequence }),
    }).returning();
    return { user, trip, service, item, slot, cart, scope, sequence, start };
  };
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const queue = async (f: Fixture, changed = false) => {
    const added = await db.transaction(async tx => {
      await lockMarketingTraveler(tx, f.user.id);
      if (changed) {
        const assessment = await assessCartItemChanges(tx, f.user.id, f.scope, anchor);
        assert.equal(assessment.changes.length, 1);
        return enqueuePendingCartItemChange(assessment.changes[0], tx);
      }
      return enqueuePendingCommerceReminder(f.user.email!,
        `cart-reminder-1h:${f.cart.id}:${f.sequence}`, f.sequence, f.scope, {
          kind: "cart_reminder_1h", travelerId: f.user.id, scope: f.scope, sequenceStartMs: f.start,
        }, tx);
    });
    assert.equal(added, true);
    return Number((await db.execute(sql`SELECT id FROM email_outbox
      WHERE metadata->>'travelerId'=${f.user.id} ORDER BY id DESC LIMIT 1`)).rows[0].id);
  };
  const row = async (id: number) => (await db.execute(sql`SELECT * FROM email_outbox WHERE id=${id}`)).rows[0] as any;
  const count = async (owner: string) => Number((await db.execute(sql`SELECT count(*) AS count
    FROM email_outbox WHERE metadata->>'travelerId'=${owner}`)).rows[0].count);
  const callsFor = (id: number) => calls.get(`cart-reminder-${id}`) ?? 0;
  const narrowSweep = (ids: string[]) => {
    const owned = new Set(ids);
    commerceSweepDependencies.selectCandidates = async () =>
      (await selectCommerceCandidates()).filter(row => row.user_id && owned.has(row.user_id));
  };
  const price = (f: Fixture, value: string) =>
    db.update(providerServices).set({ price: value }).where(eq(providerServices.id, f.service.id));

  // Minimal birth-record fixtures, NOT authoritative payment-writer execution.
  // Keep FKs/checks enabled; do not default queries into public.
  const columns = new Map<string, any[]>(), foreign = new Map<string, any[]>();
  const seed = async (table: string, owner: string, before: Date,
    overrides: Record<string, unknown> = {}, depth = 0): Promise<string> => {
    assert.ok(depth <= 10, "Fixture FK recursion exceeded");
    if (table === "users") return owner;
    if (!columns.has(table)) {
      columns.set(table, (await db.execute(sql`SELECT column_name,data_type,is_nullable,
        column_default,character_maximum_length FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name=${table} ORDER BY ordinal_position`)).rows);
      foreign.set(table, (await db.execute(sql`SELECT a.attname AS col,dest.relname AS target
        FROM pg_constraint c JOIN pg_class src ON src.oid=c.conrelid
        JOIN pg_namespace n ON n.oid=src.relnamespace JOIN pg_class dest ON dest.oid=c.confrelid
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
        WHERE c.contype='f' AND n.nspname=current_schema() AND src.relname=${table}`)).rows);
    }
    assert.ok(columns.get(table)!.length, `Missing isolated fixture table ${table}`);
    const values = { ...overrides };
    for (const column of columns.get(table)!) {
      const name = column.column_name;
      if (name in values) continue;
      if (column.data_type.includes("timestamp")) { values[name] = before; continue; }
      if (column.is_nullable !== "NO" || column.column_default !== null) continue;
      const fk = foreign.get(table)!.find(row => row.col === name);
      if (fk) { values[name] = await seed(fk.target, owner, before, {}, depth + 1); continue; }
      values[name] = column.data_type === "boolean" ? false
        : /integer|numeric|double|real/.test(column.data_type) ? 1
        : column.data_type === "date" ? "2030-05-05"
        : /json/.test(column.data_type) || column.data_type === "ARRAY" ? "{}"
        : name === "currency" ? "usd" : name === "market" ? "Kyoto"
        : randomUUID().slice(0, column.character_maximum_length ?? 36);
    }
    const entries = Object.entries(values);
    return String((await db.execute(sql`INSERT INTO ${quote(table)}
      (${sql.join(entries.map(([key]) => quote(key)), sql`, `)})
      VALUES (${sql.join(entries.map(([, value]) => sql`${value}`), sql`, `)}) RETURNING id`)).rows[0].id);
  };
  const addRail = async (rail: Rail, f: Fixture) => {
    const before = new Date(f.start - 1);
    const values: Record<string, unknown> = {};
    for (const stamp of rail.times) values[stamp] = new Date(f.start);
    if (rail.name === "credits") values.wallet_id = await seed("wallets", f.user.id, before, { user_id: f.user.id });
    else if (rail.name === "coordination_booking") values.coordination_id =
      await seed("coordination_states", f.user.id, before, { user_id: f.user.id });
    else if (["provider_request", "group_transaction"].includes(rail.name)) values.trip_id = f.trip.id;
    else if (["booking_component", "partial_settlement", "typed_fee_ledger"].includes(rail.name)) {
      const booking = await seed("service_bookings", f.user.id, before, {
        traveler_id: f.user.id, service_id: f.service.id, total_amount: "10.00",
      });
      values.booking_id = booking;
      if (rail.name === "booking_component") { values.component_service_id = f.service.id; values.status = "pending"; }
      if (rail.name === "partial_settlement") values.component_outcomes = "[]";
      if (rail.name === "typed_fee_ledger") {
        values.source_type = "service_booking"; values.source_id = booking;
        values.fee_type = "traveler_service_fee"; values.amount = "1.00";
        values.borne_by = "traveler"; values.rate_source = "code_fallback";
        values.idempotency_key = randomUUID();
      }
    } else if (rail.name === "content_invoice") {
      const tracking = randomUUID().slice(0, 20);
      await seed("content_registry", f.user.id, before, {
        tracking_number: tracking, content_type: "other", content_id: f.service.id, owner_id: f.user.id,
      });
      values.tracking_number = tracking; values.customer_id = f.user.id; values.invoice_type = "booking";
    } else values[rail.owner.split(".")[1]] = f.user.id;
    return seed(rail.from.split(" ")[0], f.user.id, before, values);
  };
  return { fixture, queue, row, count, callsFor, narrowSweep, price, addRail, seed, reset,
    restore() {
      reset();
      cartReminderVerification.now = previous.now;
      cartReminderVerification.recordedRailsOnly = previous.subset;
      _outboxTestHooks.sendEmailFn = previous.sender;
      commerceSweepDependencies.selectCandidates = previous.selector;
    },
  };
}

export type ScenarioRig = Awaited<ReturnType<typeof createScenarioRig>>;
export type ScenarioFixture = Awaited<ReturnType<ScenarioRig["fixture"]>>;
