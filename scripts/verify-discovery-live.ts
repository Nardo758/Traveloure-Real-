/**
 * Scoped live discovery verification. Never starts application workers.
 * Uses an empty development-only schema and the actual HTTP routers.
 * Authentication is a loopback-only fixture identity; production auth is untouched.
 */
import pg from "pg";
import express from "express";
import fs from "node:fs/promises";
import crypto from "node:crypto";

const schema = "discovery_live_20261002";
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl || process.env.JOURNEY_DB_WRITES_OK !== "1" || process.env.NODE_ENV === "production")
  throw new Error("Explicit development fixture opt-in required");
const mode = process.argv[2];
const client = new pg.Client({ connectionString: originalUrl });
await client.connect();

if (mode === "init") {
  const exists = await client.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [schema]);
  if (exists.rowCount) throw new Error("Fixture schema already exists; do not overwrite");
  await client.query(`CREATE SCHEMA ${quote(schema)}`);
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  for (const { tablename } of tables.rows)
    await client.query(`CREATE TABLE ${quote(schema)}.${quote(tablename)} (LIKE public.${quote(tablename)} INCLUDING ALL)`);
  // Serial defaults must not advance shared development sequences.
  const defaults = await client.query(
    "SELECT table_name,column_name,column_default FROM information_schema.columns WHERE table_schema=$1 AND column_default LIKE 'nextval(%'", [schema]);
  for (const r of defaults.rows) {
    const sequence = `${r.table_name}_${r.column_name}_fixture_seq`;
    await client.query(`CREATE SEQUENCE ${quote(schema)}.${quote(sequence)}`);
    await client.query(`ALTER TABLE ${quote(schema)}.${quote(r.table_name)} ALTER COLUMN ${quote(r.column_name)} SET DEFAULT nextval('${quote(schema)}.${quote(sequence)}'::regclass)`);
  }
  await client.query(`SET search_path TO ${quote(schema)}, pg_catalog`);
  const keys = await client.query(
    "SELECT c.relname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND k.contype='f'");
  let key = 0;
  for (const r of keys.rows) {
    const definition = r.definition.replaceAll("public.", `${quote(schema)}.`);
    await client.query(`ALTER TABLE ${quote(schema)}.${quote(r.relname)} ADD CONSTRAINT ${quote(`fixture_fk_${key++}`)} ${definition}`);
  }
  await client.query(`INSERT INTO ${quote(schema)}.booking_fee_configs SELECT * FROM public.booking_fee_configs`);
  await client.query(`INSERT INTO ${quote(schema)}.fee_bands SELECT * FROM public.fee_bands`);
  // Payment regressions reference these platform-owned catalog keys.
  await client.query(`INSERT INTO ${quote(schema)}.expert_offering_types SELECT * FROM public.expert_offering_types`);
  const ids = {
    user: crypto.randomUUID(), provider: crypto.randomUUID(), trip: crypto.randomUUID(),
    service: crypto.randomUUID(), cart: crypto.randomUUID(), vendor: crypto.randomUUID(),
    email: process.env.VERIFICATION_EMAIL,
  };
  if (!ids.email) throw new Error("Receiving inbox required");
  await client.query("INSERT INTO users(id,email,first_name,last_name) VALUES($1,$2,'Live Checkout','Verification')", [ids.user, ids.email]);
  await client.query("INSERT INTO users(id,first_name,last_name,role) VALUES($1,'Isolated','Provider','service_provider')", [ids.provider]);
  await client.query("INSERT INTO trips(id,user_id,title,destination,start_date,end_date) VALUES($1,$2,'Live email verification','Kyoto',CURRENT_DATE+30,CURRENT_DATE+31)", [ids.trip, ids.user]);
  await client.query("INSERT INTO vendor_contracts(id,trip_id,vendor_name,vendor_category,vendor_email,total_amount) VALUES($1,$2,'Verification vendor','other',$3,20)", [ids.vendor, ids.trip, ids.email]);
  await fs.mkdir(".local/discovery-live", { recursive: true });
  await fs.writeFile(".local/discovery-live/fixture.json", JSON.stringify(ids));
  console.log(JSON.stringify({ initialized: true, schema, tables: tables.rowCount, foreignKeys: key, fixtureUser: ids.user, email: ids.email }));
  await client.end();
  process.exit(0);
}
if (mode === "cleanup") {
  if (schema !== "discovery_live_20261002") throw new Error("Invalid cleanup scope");
  await client.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
  await client.end();
  console.log("Isolated fixture schema removed");
  process.exit(0);
}
await client.end();
const url = new URL(originalUrl);
url.searchParams.set("options", `-c search_path=${schema},pg_catalog`);
const permitted = new Set([
  "PATH", "HOME", "LANG", "LD_LIBRARY_PATH", "NODE_EXTRA_CA_CERTS",
  "RESEND_API_KEY", "EMAIL_FROM", "EMAIL_FROM_NOREPLY", "EMAIL_REPLY_TO",
  "STRIPE_SECRET_KEY_TEST", "STRIPE_PUBLISHABLE_KEY_TEST", "VITE_STRIPE_PUBLISHABLE_KEY_TEST",
]);
for (const name of Object.keys(process.env)) if (!permitted.has(name)) delete process.env[name];
process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = "test";
process.env.ENVIRONMENT = "TEST";
process.env.JOURNEY_DB_WRITES_OK = "1";
process.env.SESSION_SECRET = crypto.randomUUID();
process.env.STRIPE_WEBHOOK_SECRET_TEST = "whsec_discovery_fixture_signed_replay";
if (!/^sk_test_|^rk_test_/.test(process.env.STRIPE_SECRET_KEY_TEST ?? "")) throw new Error("Real TEST Stripe credential required");
const { db, pool } = await import("../server/db");
const { sql } = await import("drizzle-orm");
const ids = JSON.parse(await fs.readFile(".local/discovery-live/fixture.json", "utf8"));
if (mode === "exercise") {
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST!);
  const post = async (path: string, body: unknown, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:4318${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-fixture-user-id": ids.user, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    const result = { httpStatus: response.status, body: await response.json() };
    if (!response.ok) throw new Error(JSON.stringify(result));
    return result;
  };
  // These are non-personal platform configuration, never user overrides.
  await db.execute(sql`INSERT INTO fee_bands SELECT * FROM public.fee_bands ON CONFLICT DO NOTHING`);
  const previous = await db.execute(sql`SELECT id FROM service_bookings WHERE traveler_id=${ids.user}`);
  const checkout = previous.rows.length
    ? JSON.parse(await fs.readFile(".local/discovery-live/checkout.json", "utf8"))
    : await post("/api/checkout", { idempotencyKey: "discovery-live-20261002-real-checkout" });
  const safeCheckout = JSON.parse(JSON.stringify(checkout, (key, value) => /client.?secret/i.test(key) ? undefined : value));
  await fs.writeFile(".local/discovery-live/checkout.json", JSON.stringify(safeCheckout, null, 2));
  console.log("CANONICAL CHECKOUT", JSON.stringify(safeCheckout));
  const rows = await db.execute(sql`SELECT id,stripe_payment_intent_id FROM service_bookings WHERE traveler_id=${ids.user}`);
  if (rows.rows.length !== 1) throw new Error("Expected exactly one canonical booking");
  const booking = rows.rows[0] as any;
  const beforePayment = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
  if (beforePayment.livemode) throw new Error("REFUSED live PaymentIntent");
  const paid = beforePayment.status === "succeeded" ? beforePayment : await stripe.paymentIntents.confirm(beforePayment.id, {
    payment_method: "pm_card_visa", return_url: "https://traveloure.com/bookings",
  });
  if (paid.livemode || paid.status !== "succeeded") throw new Error("TEST payment did not succeed");
  const confirm = await post("/api/bookings/confirm-payment", { bookingId: booking.id, paymentIntentId: paid.id });
  const { drainOutbox } = await import("../server/services/email-outbox.service");
  const firstDrain = await drainOutbox();
  const event = JSON.stringify({
    id: `evt_discovery_${crypto.randomUUID().replaceAll("-", "")}`, object: "event",
    type: "payment_intent.succeeded", livemode: false, created: Math.floor(Date.now()/1000),
    data: { object: paid },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: event, secret: process.env.STRIPE_WEBHOOK_SECRET_TEST!,
  });
  const replay = await post("/api/bookings/webhooks/stripe", event, { "stripe-signature": signature });
  const secondReplay = await post("/api/bookings/webhooks/stripe", event, { "stripe-signature": signature });
  const clientReplay = await post("/api/bookings/confirm-payment", { bookingId: booking.id, paymentIntentId: paid.id });
  const finalDrain = await drainOutbox();
  const confirmations = await db.execute(sql`SELECT id,status,attempt_count,subject,metadata FROM email_outbox WHERE metadata->>'bookingId'=${booking.id}`);
  if (confirmations.rows.length !== 1 || (confirmations.rows[0] as any).status !== "sent")
    throw new Error("Expected exactly one sent confirmation outbox row");
  const evidence = {
    bookingId: booking.id, paymentIntentId: paid.id, livemode: paid.livemode,
    paymentStatus: paid.status, amount: paid.amount, currency: paid.currency,
    confirm, firstDrain, replay, secondReplay, clientReplay, finalDrain,
    confirmations: confirmations.rows,
  };
  await fs.writeFile(".local/discovery-live/payment-evidence.json", JSON.stringify(evidence, null, 2));
  console.log("LIVE PAYMENT / REPLAY EVIDENCE", JSON.stringify(evidence));
  await pool.end();
  process.exit(0);
}
const app = express();
app.use(express.json({ verify(req: any, _res, buffer) { req.rawBody = buffer; } }));
app.use(async (req: any, _res, next) => {
  req.id = crypto.randomUUID();
  req.isAuthenticated = () => req.headers["x-fixture-user-id"] === ids.user;
  req.user = req.isAuthenticated() ? { id: ids.user, claims: { sub: ids.user } } : undefined;
  req.session = {};
  next();
});
app.use((await import("../server/routes/trips.routes")).default);
app.use((await import("../server/routes/payments.routes")).default);
app.use("/api/bookings", (await import("../server/routes/bookings")).default);
app.use((await import("../server/routes/webhooks.routes")).default);
const server = app.listen(4318, "127.0.0.1", () => console.log("DISCOVERY FIXTURE READY port=4318; isolated schema; real TEST Stripe and real email enabled"));
process.on("SIGTERM", async () => { server.close(); await pool.end(); process.exit(0); });
if (mode === "seed-cart") {
  const { providerServices, cartItems } = await import("../shared/schema");
  await db.insert(providerServices).values({
    id: ids.service, userId: ids.provider, serviceName: "Live canonical email verification",
    price: "20.00", deliveryMethod: "in_person", approvalStatus: "approved", status: "active", bookingMode: "instant",
  });
  await db.insert(cartItems).values({
    id: ids.cart, userId: ids.user, serviceId: ids.service, quantity: 1, tripId: ids.trip,
  });
}