/**
 * Adapter-boundary proof, not delivery certification. Requires an independently
 * verified development fingerprint, clones empty tables into a disposable schema,
 * and mocks the actual Resend Emails.send prototype (not the adapter or registry).
 */
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { eq, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { Resend } from "resend";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { users, trips, providerServices, itineraryItems, cartItems, emailOutbox } from "../../../shared/schema";
import type { SendEmailParams } from "../../services/email.service";

const schema = `automation_msg_${randomBytes(8).toString("hex")}`;
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const anchor = new Date("2030-05-05T12:00:00Z");
const preferences = { itineraryMarketing: { enabled: true, timeZone: "UTC",
  quietStart: "00:00", quietEnd: "00:00" } };
let control: pg.Pool | undefined;
let created = false;
let database: typeof import("../../db") | undefined;
let email: typeof import("../../services/email.service");
let verification: typeof import("../../services/commerce-send-verification.service");
let reminder: typeof import("../../services/cart-reminder.service");
let outbox: typeof import("../../services/email-outbox.service");
let changes: typeof import("../../services/cart-item-change.service");
let cartState: typeof import("../../services/cart-email-state.service");
let marketing: typeof import("../../services/marketing-delivery-policy.service");
const sdkSend = vi.spyOn(Object.getPrototypeOf(new Resend("re_sdk_boundary_fixture").emails), "send");
const sdkPost = vi.spyOn(Resend.prototype, "post").mockImplementation(async () => {
  throw new Error("Real Resend network submission is forbidden in this suite");
});
const network = vi.fn(() => { throw new Error("Network fetch is forbidden in this suite"); });

beforeAll(async () => {
  // No DDL without an independently supplied development-target fingerprint.
  if (!/^[a-f0-9]{32}$/.test(process.env.MESSAGING_DEV_FINGERPRINT ?? "") || !process.env.DATABASE_URL) {
    throw new Error("Supply an independently verified MESSAGING_DEV_FINGERPRINT for the development database");
  }
  control = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const target = await control.query(
    "SELECT md5(current_database() || ':' || coalesce(inet_server_addr()::text, 'local')) AS fingerprint",
  );
  expect(target.rows[0].fingerprint).toBe(process.env.MESSAGING_DEV_FINGERPRINT);
  const tables = await control.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const serials = await control.query(`SELECT c.relname AS table_name, a.attname AS column_name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid
    JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND a.attidentity='' AND pg_get_expr(d.adbin,d.adrelid) LIKE 'nextval(%'`);
  const foreignKeys = await control.query(`SELECT src.relname AS table_name, con.conname AS name,
    dst.relname AS target_name, dstn.nspname AS target_schema, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con JOIN pg_class src ON src.oid=con.conrelid
    JOIN pg_namespace srcn ON srcn.oid=src.relnamespace
    JOIN pg_class dst ON dst.oid=con.confrelid JOIN pg_namespace dstn ON dstn.oid=dst.relnamespace
    WHERE con.contype='f' AND srcn.nspname='public'`);
  expect(tables.rows.length).toBeGreaterThan(0);
  expect(foreignKeys.rows.every(fk => fk.target_schema === "public")).toBe(true);
  const ddl = [`CREATE SCHEMA ${quote(schema)}`];
  for (const { tablename } of tables.rows) {
    ddl.push(`CREATE TABLE ${quote(schema)}.${quote(tablename)} (LIKE public.${quote(tablename)} INCLUDING ALL)`);
  }
  // LIKE references public serial defaults unless they are explicitly replaced.
  serials.rows.forEach(({ table_name, column_name }, index) => {
    const sequence = `sdk_seq_${index}`;
    ddl.push(`CREATE SEQUENCE ${quote(schema)}.${quote(sequence)}`,
      `ALTER TABLE ${quote(schema)}.${quote(table_name)} ALTER COLUMN ${quote(column_name)}
        SET DEFAULT nextval('${schema}.${sequence}'::regclass)`,
      `ALTER SEQUENCE ${quote(schema)}.${quote(sequence)} OWNED BY ${quote(schema)}.${quote(table_name)}.${quote(column_name)}`);
  });
  for (const fk of foreignKeys.rows) {
    const definition = fk.definition.replace(
      /REFERENCES\s+(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_$]*)(?:\.(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_$]*))?/,
      `REFERENCES ${quote(schema)}.${quote(fk.target_name)}`,
    );
    if (definition === fk.definition) throw new Error("Unsupported fixture foreign key");
    ddl.push(`ALTER TABLE ${quote(schema)}.${quote(fk.table_name)} ADD CONSTRAINT ${quote(fk.name)} ${definition}`);
  }
  const client = await control.connect();
  try {
    await client.query("BEGIN");
    await client.query(ddl.join(";\n"));
    await client.query("COMMIT");
    created = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }

  const isolated = new URL(process.env.DATABASE_URL);
  isolated.searchParams.set("options", `-c search_path=${schema}`);
  vi.stubEnv("DATABASE_URL", isolated.href);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ENVIRONMENT", "TEST");
  vi.stubEnv("MESSAGING_VERIFICATION_SCHEMA", schema);
  vi.stubEnv("RESEND_API_KEY", "re_sdk_boundary_fixture");
  vi.stubEnv("EMAIL_FROM_NOREPLY", "sender@traveloure-qa.test");
  vi.stubEnv("EMAIL_REPLY_TO", "reply@traveloure-qa.test");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_sdk_boundary_fixture");
  vi.stubGlobal("fetch", network);
  sdkSend.mockResolvedValue({ data: { id: "mock_sdk_receipt_not_delivery" }, error: null });
  // Prevent public-qualified queries/search-path resets after provisioning.
  const originalQuery = pg.Client.prototype.query;
  vi.spyOn(pg.Client.prototype, "query").mockImplementation(function (this: pg.Client, ...args: any[]) {
    const text = typeof args[0] === "string" ? args[0] : args[0]?.text ?? "";
    if (/\b"?public"?\s*\./i.test(text) || /\bset\s+(?:local\s+)?search_path\b/i.test(text)) {
      throw new Error("Fixture query attempted to escape its isolated schema");
    }
    return (originalQuery as any).apply(this, args);
  });
  database = await import("../../db");
  expect((await database.db.execute(sql`SELECT current_schema() AS name`)).rows[0].name).toBe(schema);
  await database.db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_commerce_key
    ON email_outbox ((metadata->>'commerceKey')) WHERE metadata ? 'commerceKey'`);
  [email, verification, reminder, outbox, changes, cartState, marketing] = await Promise.all([
    import("../../services/email.service"), import("../../services/commerce-send-verification.service"),
    import("../../services/cart-reminder.service"), import("../../services/email-outbox.service"),
    import("../../services/cart-item-change.service"),
    import("../../services/cart-email-state.service"),
    import("../../services/marketing-delivery-policy.service"),
  ]);
});

beforeEach(async () => {
  // Admin retry drains the entire queue, not just its nominal outboxId.
  // Each case therefore owns an empty outbox in the disposable schema.
  await database!.db.delete(emailOutbox);
  vi.clearAllMocks();
  sdkSend.mockResolvedValue({ data: { id: "mock_sdk_receipt_not_delivery" }, error: null });
  reminder.cartReminderVerification.now = anchor;
  reminder.cartReminderVerification.recordedRailsOnly = true;
  verification.commerceSendVerification.checkTimeoutMs = 5_000;
  verification.commerceSendVerification.beforeCheck = null;
  outbox._outboxTestHooks.sendEmailFn = undefined;
});
afterEach(() => {
  expect(sdkPost).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
  verification.commerceSendVerification.beforeCheck = null;
  verification.commerceSendVerification.checkTimeoutMs = 5_000;
  reminder.cartReminderVerification.now = null;
  reminder.cartReminderVerification.recordedRailsOnly = false;
  outbox._outboxTestHooks.sendEmailFn = undefined;
});
afterAll(async () => {
  try {
    if (database) await database.pool.end();
    if (created) await control!.query(`DROP SCHEMA ${quote(schema)} CASCADE`);
  } finally {
    await control?.end();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

async function fixture() {
  const db = database!.db;
  const id = randomUUID(), scope = randomUUID(), sequence = randomUUID(), start = anchor.getTime() - 3_600_000;
  const [user] = await db.insert(users).values({ id, email: `${id}@traveloure-qa.test`, preferences }).returning();
  const [trip] = await db.insert(trips).values({ userId: id, destination: "Kyoto",
    startDate: "2030-05-05", endDate: "2030-05-07" }).returning();
  const [service] = await db.insert(providerServices).values({ userId: id, serviceName: "SDK boundary fixture",
    price: "10.00", priceType: "fixed", status: "active", availability: [] }).returning();
  const [item] = await db.insert(itineraryItems).values({ tripId: trip.id, providerServiceId: service.id,
    title: "SDK fixture", dayNumber: 1 }).returning();
  const [cart] = await db.insert(cartItems).values({ userId: id, experienceSlug: scope,
    tripId: trip.id, itineraryItemId: item.id, serviceId: service.id, quantity: 1,
    contentMeta: cartState.addedCartState({}, service.id, null, { at_ms: start, sequence_id: sequence }) }).returning();
  const identity = { travelerId: id, scope, sequenceId: sequence, recipient: user.email!, marketing: true };
  const decision = await verification.verifyCommerceSend(db, identity);
  expect(decision.eligible).toBe(true);
  if (!decision.eligible) throw new Error(decision.reason);
  expect(await outbox.enqueuePendingCommerceReminder(user.email!,
    `cart-reminder-1h:${cart.id}:${sequence}`, sequence, scope,
    { travelerId: id, scope, kind: "cart_reminder_1h", sequenceStartMs: start })).toBe(true);
  const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.toEmail, user.email!));
  const guard = vi.fn(() => verification.verifyCommerceSend(db, identity, decision.facts));
  const payload: SendEmailParams = { to: row.toEmail, subject: row.subject, html: row.html,
    text: row.textBody ?? undefined, idempotencyKey: `cart-reminder-${row.id}`, beforeProviderSend: guard };
  return { user, cart, service, scope, identity, row, guard, payload };
}

describe.each([1, 2])("fresh randomized SDK boundary loop %i", () => {
  it("failed commerce check reaches the adapter but never SDK send", async () => {
    const f = await fixture();
    verification.commerceSendVerification.beforeCheck = async () => { throw new Error("fixture check failure"); };
    expect(await email.sendEmail(f.payload)).toEqual({ ok: false, cancelReason: "check_failed" });
    expect(f.guard).toHaveBeenCalledOnce();
    expect(sdkSend).not.toHaveBeenCalled();
  });

  it("real SQL check failure never reaches SDK send", async () => {
    const f = await fixture();
    verification.commerceSendVerification.beforeCheck = async reader => {
      await reader.execute(sql`SELECT * FROM sdk_boundary_missing_table`);
    };
    expect(await email.sendEmail(f.payload)).toEqual({ ok: false, cancelReason: "check_failed" });
    expect(f.guard).toHaveBeenCalledOnce();
    expect(sdkSend).not.toHaveBeenCalled();
  });

  it("timed-out commerce check cannot resume SDK send when its read later completes", async () => {
    const f = await fixture();
    let release!: () => void;
    let completed!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const finalReadCompleted = new Promise<void>(resolve => { completed = resolve; });
    const dialect = new PgDialect();
    const reader = {
      execute: <T extends Record<string, unknown>>(query: Parameters<NonNullable<typeof database>["db"]["execute"]>[0]) => {
        const raw = database!.db.execute<T>(query);
        const originalExecute = raw.execute.bind(raw);
        raw.execute = async () => {
          const result = await originalExecute();
          if (typeof query !== "string" && dialect.sqlToQuery(query.getSQL()).sql.includes("eligibility_instant")) completed();
          return result;
        };
        return raw;
      },
    };
    verification.commerceSendVerification.checkTimeoutMs = 10;
    verification.commerceSendVerification.beforeCheck = () => blocked;
    f.guard.mockImplementation(() => verification.verifyCommerceSend(reader, f.identity));
    try {
      expect(await email.sendEmail(f.payload)).toEqual({ ok: false, cancelReason: "check_failed" });
      expect(f.guard).toHaveBeenCalledOnce();
      expect(await f.guard.mock.results[0].value).toMatchObject({
        eligible: false, reason: "check_failed", detail: "check_timeout",
      });
      expect(sdkSend).not.toHaveBeenCalled();
    } finally { release(); }
    // Wait for the original delayed action's last DB read and promise continuations.
    await finalReadCompleted;
    await new Promise(resolve => setImmediate(resolve));
    expect(sdkSend).not.toHaveBeenCalled();
  });

  it("unsubscribed cancellation blocks the adapter; persisted cancellation cannot replay", async () => {
    const f = await fixture();
    await database!.db.update(users).set({ preferences: { itineraryMarketing: { ...preferences.itineraryMarketing,
      enabled: false } } }).where(eq(users.id, f.user.id));
    expect(await email.sendEmail(f.payload)).toEqual({ ok: false, cancelReason: "unsubscribed" });
    expect(f.guard).toHaveBeenCalledOnce();
    outbox._outboxTestHooks.sendEmailFn = email.sendEmail;
    await outbox.deliverQueuedEmail(f.row.id);
    const [cancelled] = await database!.db.select().from(emailOutbox).where(eq(emailOutbox.id, f.row.id));
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.metadata).toMatchObject({ cancelReason: "unsubscribed" });
    await outbox.deliverQueuedEmail(f.row.id);
    await outbox.drainOutboxForAdminRetry(f.row.id);
    expect(sdkSend).not.toHaveBeenCalled();
  });

  it("superseded cart sequence blocks the real adapter", async () => {
    const f = await fixture();
    await database!.db.update(cartItems).set({ contentMeta: cartState.addedCartState({}, f.service.id, null,
      { at_ms: anchor.getTime(), sequence_id: randomUUID() }) }).where(eq(cartItems.id, f.cart.id));
    expect(await email.sendEmail(f.payload)).toEqual({ ok: false, cancelReason: "superseded" });
    expect(f.guard).toHaveBeenCalledOnce();
    expect(sdkSend).not.toHaveBeenCalled();
  });

  it("eligible readable-subset queued marketing row invokes SDK once, preserving payload and idempotency", async () => {
    const f = await fixture();
    // Existing test-only dispatch seam now calls the real adapter, not a fake sender.
    outbox._outboxTestHooks.sendEmailFn = params => email.sendEmail({ ...params, beforeProviderSend: f.guard });
    await outbox.deliverQueuedEmail(f.row.id);
    expect(f.guard).toHaveBeenCalledOnce();
    expect(sdkSend).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      to: f.user.email, from: "sender@traveloure-qa.test", replyTo: "reply@traveloure-qa.test",
      subject: f.payload.subject, html: f.payload.html, text: f.payload.text,
    }), { idempotencyKey: `cart-reminder-${f.row.id}` });
    expect(sdkSend.mock.calls[0][0]).not.toHaveProperty("beforeProviderSend");
    const [sent] = await database!.db.select().from(emailOutbox).where(eq(emailOutbox.id, f.row.id));
    expect(sent.status).toBe("sent");
    expect(sent.resendId).toBe("mock_sdk_receipt_not_delivery");
    await outbox.deliverQueuedEmail(f.row.id);
    await outbox.drainOutboxForAdminRetry(f.row.id);
    expect(sdkSend).toHaveBeenCalledOnce();
  });

  it("UNKNOWN coverage still blocks SDK send without the isolated readable-subset override", async () => {
    const f = await fixture();
    reminder.cartReminderVerification.recordedRailsOnly = false;
    expect(await email.sendEmail(f.payload)).toEqual({ ok: false, cancelReason: "payment_rail_unknown" });
    expect(f.guard).toHaveBeenCalledOnce();
    expect(sdkSend).not.toHaveBeenCalled();
  });

  it("must-have item-change ordering hold remains pending with zero SDK calls", async () => {
    const f = await fixture();
    await database!.db.update(providerServices).set({ price: "12.00" }).where(eq(providerServices.id, f.service.id));
    await database!.db.transaction(async tx => {
      await marketing.lockMarketingTraveler(tx, f.user.id);
      const assessment = await changes.assessCartItemChanges(tx, f.user.id, f.scope, anchor);
      expect(assessment.changes).toHaveLength(1);
      expect(await outbox.enqueuePendingCartItemChange(assessment.changes[0], tx)).toBe(true);
    });
    const [row] = await database!.db.select().from(emailOutbox).where(eq(emailOutbox.emailType, "cart_item_changed"))
      .orderBy(sql`${emailOutbox.id} DESC`).limit(1);
    outbox._outboxTestHooks.sendEmailFn = email.sendEmail;
    await outbox.deliverQueuedEmail(row.id);
    const [held] = await database!.db.select().from(emailOutbox).where(eq(emailOutbox.id, row.id));
    expect(held.status).toBe("pending");
    expect(held.lastError).toBe("must_have_payment_ordering_unknown");
    expect(sdkSend).not.toHaveBeenCalled();
  });
});
