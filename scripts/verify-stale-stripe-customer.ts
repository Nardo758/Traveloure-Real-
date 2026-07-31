// #973 — stale Stripe customer id recovery, verified at the NETWORK BOUNDARY.
//
// `https.request` (the exact seam Stripe SDK's own NodeHttpClient.js comments name as the
// "nock" test seam: "users in their test suites might be using a library like 'nock' which
// relies on the ability to monkey-patch and intercept calls to http.request") is monkey-patched
// to return an in-process fake `http.ClientRequest`/`IncomingMessage` pair instead of opening a
// real socket — so the REAL Stripe SDK, the REAL stripe-payment.service.ts module, and the REAL
// Stripe error-class construction (StripeInvalidRequestError, `.code`, `.message`, …) all run
// completely unmodified against REALISTIC Stripe wire responses. (An earlier draft tried
// redirecting to a real local plain-HTTP server; that hangs forever — NodeHttpClient decides
// `isInsecureConnection` from the STATIC 'https' protocol before the request is ever made, so it
// waits on the TLS-only `secureConnect` socket event, which a plain-HTTP redirect can never
// fire. Faking the request/response objects directly sidesteps that entirely.)
//
// `db.execute` is faked in-memory (the established repo pattern — see
// server/__tests__/booking-ai-price-guard.test.ts) since no live Postgres is reachable here.
//
// Run: `npx tsx scripts/verify-stale-stripe-customer.ts`

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://fake:fake@127.0.0.1:1/fake";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_fake_for_verification";

import https from "https";
import { EventEmitter } from "events";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
}

// ── In-memory `users` table + db.execute fake (repo-established pattern) ────────────────────
type UserRow = { id: string; stripe_customer_id: string | null; email: string; first_name: string; last_name: string };
const users = new Map<string, UserRow>();

function sqlText(q: any): string {
  return (q.queryChunks || []).map((c: any) => (c && Array.isArray(c.value) ? c.value.join("") : "?")).join("");
}
function sqlParams(q: any): any[] {
  return (q.queryChunks || []).filter((c: any) => !(c && Array.isArray(c.value)));
}

async function fakeExecute(q: any) {
  // Multi-line `sql\`...\`` template literals in the source carry leading newline/indentation
  // in their first chunk — match on `.includes`, not `.startsWith`, and always `.trim()` first.
  const text = sqlText(q).trim();
  const params = sqlParams(q);

  if (text.includes("SELECT stripe_customer_id")) {
    const row = users.get(params[0]);
    return { rows: row ? [row] : [] };
  }
  // createPaymentIntent's separate user-details lookup (email/name for the PI's receipt_email).
  if (text.includes("SELECT email, first_name, last_name FROM users")) {
    const row = users.get(params[0]);
    return { rows: row ? [row] : [] };
  }
  if (text.includes("SET stripe_customer_id = NULL WHERE id =")) {
    const [userId, staleId] = params;
    const row = users.get(userId);
    if (row && row.stripe_customer_id === staleId) row.stripe_customer_id = null;
    return { rows: [] };
  }
  if (text.includes("SET stripe_customer_id = ") && text.includes("stripe_customer_id IS NULL")) {
    const [customerId, userId] = params;
    const row = users.get(userId);
    if (row && row.stripe_customer_id === null) row.stripe_customer_id = customerId;
    return { rows: [] };
  }
  // Anything else (e.g. the payment_intents INSERT) — accept as a no-op success.
  return { rows: [] };
}

// ── Mock Stripe API — routes the SAME shapes the real API returns ───────────────────────────
const mockCustomers = new Map<string, { id: string; email: string }>();
let nextCustomerSeq = 1;
const requestLog: Array<{ method: string; path: string; body: Record<string, string>; headers: Record<string, string> }> = [];

function stripeError(status: number, type: string, code: string | undefined, message: string, param?: string) {
  return { status, body: { error: { type, code, message, ...(param ? { param } : {}) } } };
}

/** Swappable per-scenario — Scenario 4 temporarily points this at a different handler. */
let mockRouter = defaultRouter;

function defaultRouter(method: string, pathname: string, body: Record<string, string>) {
  // POST /v1/customers — create
  if (method === "POST" && pathname === "/v1/customers") {
    const id = `cus_fresh_${nextCustomerSeq++}`;
    mockCustomers.set(id, { id, email: body.email || "" });
    return { status: 200, body: { id, object: "customer", email: body.email || "", invoice_settings: { default_payment_method: null } } };
  }
  // GET /v1/customers?email=...&limit=1 — search (always empty here; getOrCreateCustomer falls through to create)
  if (method === "GET" && pathname === "/v1/customers") {
    return { status: 200, body: { object: "list", data: [] } };
  }
  const custIdMatch = pathname.match(/^\/v1\/customers\/([^/?]+)/);
  if (method === "GET" && custIdMatch) {
    const id = custIdMatch[1];
    if (!mockCustomers.has(id)) return stripeError(404, "invalid_request_error", "resource_missing", `No such customer: '${id}'`);
    return { status: 200, body: { id, object: "customer", invoice_settings: { default_payment_method: null } } };
  }
  if (method === "POST" && custIdMatch) {
    const id = custIdMatch[1];
    if (!mockCustomers.has(id)) return stripeError(404, "invalid_request_error", "resource_missing", `No such customer: '${id}'`);
    return { status: 200, body: { id, object: "customer" } };
  }
  if (method === "POST" && pathname === "/v1/setup_intents") {
    const customerId = body.customer;
    if (customerId && !mockCustomers.has(customerId)) {
      return stripeError(400, "invalid_request_error", "resource_missing", `No such customer: '${customerId}'`, "customer");
    }
    return { status: 200, body: { id: "seti_test_1", object: "setup_intent", client_secret: "seti_test_1_secret_x" } };
  }
  if (method === "POST" && pathname === "/v1/payment_intents") {
    const customerId = body.customer;
    if (customerId && !mockCustomers.has(customerId)) {
      return stripeError(400, "invalid_request_error", "resource_missing", `No such customer: '${customerId}'`, "customer");
    }
    return {
      status: 200,
      body: {
        id: `pi_test_${requestLog.length}`,
        object: "payment_intent",
        client_secret: `pi_test_${requestLog.length}_secret_x`,
        status: "requires_payment_method",
        amount: Number(body.amount || 0),
        currency: body.currency || "usd",
        metadata: {},
      },
    };
  }
  if (method === "GET" && pathname === "/v1/payment_methods") {
    return { status: 200, body: { object: "list", data: [] } };
  }
  return { status: 404, body: { error: { type: "invalid_request_error", message: `mock: no route for ${method} ${pathname}` } } };
}

function declineRouter(_method: string, _pathname: string, _body: Record<string, string>) {
  // A REAL, unrelated Stripe error — never a resource_missing for the customer.
  return { status: 402, body: { error: { type: "card_error", code: "card_declined", message: "Your card was declined." } } };
}

function handleMockRequest(method: string, pathname: string, body: Record<string, string>, headers: Record<string, string>) {
  requestLog.push({ method, path: pathname, body, headers });
  return mockRouter(method, pathname, body);
}

// ── Fake http.ClientRequest / IncomingMessage pair — no real socket, no TLS ──────────────────
class FakeSocket extends EventEmitter {
  connecting = false;
}

class FakeIncomingMessage extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
  constructor(statusCode: number, headers: Record<string, string>, bodyText: string) {
    super();
    this.statusCode = statusCode;
    this.headers = headers;
    // setImmediate (NOT process.nextTick): the consumer (RequestSender's toJSON()) attaches its
    // 'data'/'end' listeners inside a Promise .then() — a MICROTASK — which Node drains AFTER
    // the nextTick queue but BEFORE the next event-loop phase. Emitting via nextTick here (even
    // from within a nextTick-scheduled 'response' emission) fires 'data'/'end' with NO listener
    // attached yet — EventEmitter drops events with zero listeners — hanging the JSON parse
    // forever. setImmediate runs in the next loop iteration, safely after that microtask.
    setImmediate(() => {
      this.emit("data", Buffer.from(bodyText, "utf8"));
      this.emit("end");
    });
  }
  setEncoding(_enc: string) { /* no-op — we already emit Buffers/strings as-is */ }
}

class FakeClientRequest extends EventEmitter {
  private chunks: Buffer[] = [];
  private options: any;
  constructor(options: any) {
    super();
    this.options = options;
    // Simulate an ALREADY-CONNECTED socket. Stripe's NodeHttpClient hardcodes waiting on the
    // TLS-only `secureConnect` event whenever the STATIC protocol was 'https' (which it always
    // is here) — regardless of what actually handles the request — so the only way to reach its
    // `req.write()/req.end()` call is for `socket.connecting` to already be `false` when the
    // `'socket'` event fires.
    process.nextTick(() => this.emit("socket", new FakeSocket()));
  }
  setTimeout(_ms: number, _cb: () => void) { return this; }
  write(chunk: any) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? "")));
    return true;
  }
  end(chunk?: any) {
    if (chunk) this.write(chunk);
    const bodyStr = Buffer.concat(this.chunks).toString("utf8");
    const method = this.options.method || "GET";
    const rawPath: string = this.options.path || "/";
    const url = new URL(rawPath, "http://localhost");
    const bodyParams: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(bodyStr)) bodyParams[k] = v;
    const normalizedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.options.headers || {})) normalizedHeaders[k.toLowerCase()] = String(v);
    const result = handleMockRequest(method, url.pathname, bodyParams, normalizedHeaders);
    const bodyText = JSON.stringify(result.body);
    process.nextTick(() => {
      this.emit("response", new FakeIncomingMessage(result.status, { "content-type": "application/json" }, bodyText));
    });
  }
  destroy() { /* no-op */ }
}

const originalHttpsRequest = https.request;
(https as any).request = (options: any) => new FakeClientRequest(options);

async function main() {
  const { db } = await import("../server/db");
  (db as any).execute = fakeExecute;
  const { stripePaymentService } = await import("../server/services/stripe-payment.service");
  check("sanity: Stripe SDK reports ready (STRIPE_SECRET_KEY set)", stripePaymentService.isReady());

  // ── Scenario 1: createSetupIntent — stored id is stale, recovers, persists fresh id ───────
  users.set("user-1", { id: "user-1", stripe_customer_id: "cus_STALE_1", email: "user1@example.com", first_name: "A", last_name: "B" });
  requestLog.length = 0;
  const setupResult = await stripePaymentService.createSetupIntent("user-1");
  check("Scenario 1: createSetupIntent succeeds despite a stale stored customer id",
    !!setupResult?.clientSecret, JSON.stringify(setupResult));
  check("Scenario 1: the stale id was cleared and a FRESH id persisted",
    !!users.get("user-1")?.stripe_customer_id && users.get("user-1")!.stripe_customer_id !== "cus_STALE_1",
    JSON.stringify(users.get("user-1")));
  const setupIntentCalls = requestLog.filter((r) => r.path === "/v1/setup_intents");
  check("Scenario 1: exactly ONE retry happened (2 setup_intent attempts: stale, then fresh)",
    setupIntentCalls.length === 2 &&
    setupIntentCalls[0].body.customer === "cus_STALE_1" &&
    setupIntentCalls[1].body.customer === users.get("user-1")!.stripe_customer_id,
    JSON.stringify(setupIntentCalls.map((c) => c.body.customer)));

  // ── Scenario 2: listSavedPaymentMethods (customers.retrieve, no idempotencyKey) recovers ──
  users.set("user-2", { id: "user-2", stripe_customer_id: "cus_STALE_2", email: "user2@example.com", first_name: "C", last_name: "D" });
  requestLog.length = 0;
  const saved = await stripePaymentService.listSavedPaymentMethods("user-2");
  check("Scenario 2: listSavedPaymentMethods recovers instead of throwing",
    Array.isArray(saved.methods), JSON.stringify(saved));
  check("Scenario 2: a fresh id was persisted for user-2",
    users.get("user-2")?.stripe_customer_id !== "cus_STALE_2", JSON.stringify(users.get("user-2")));

  // ── Scenario 3: createPaymentIntent (optional customer + REAL idempotencyKey) recovers,
  //    and the retry uses a DIFFERENT idempotency key (Stripe rejects key-reuse with different
  //    params) ──────────────────────────────────────────────────────────────────────────────
  users.set("user-3", { id: "user-3", stripe_customer_id: "cus_STALE_3", email: "user3@example.com", first_name: "E", last_name: "F" });
  requestLog.length = 0;
  const piResult = await stripePaymentService.createPaymentIntent(
    "user-3",
    [{ id: "booking-1" }],
    150,
    false,
    "usd",
    "idem-key-abc",
  );
  check("Scenario 3: createPaymentIntent (cart checkout) succeeds despite a stale stored id",
    !!piResult?.clientSecret, JSON.stringify(piResult));
  const piCalls = requestLog.filter((r) => r.path === "/v1/payment_intents");
  check("Scenario 3: exactly 2 attempts (stale, then fresh)", piCalls.length === 2, JSON.stringify(piCalls.map((c) => c.body.customer)));
  check("Scenario 3: the retry used a DIFFERENT Idempotency-Key header (no Stripe key-reuse conflict)",
    piCalls.length === 2 &&
    piCalls[0].headers["idempotency-key"] === "pi-idem-key-abc" &&
    piCalls[1].headers["idempotency-key"] === "pi-idem-key-abc-recover",
    JSON.stringify(piCalls.map((c) => c.headers["idempotency-key"])));

  // ── Scenario 4: an UNRELATED error code must propagate, never be swallowed as a recovery ──
  users.set("user-4", { id: "user-4", stripe_customer_id: "cus_UNRELATED_4", email: "user4@example.com", first_name: "G", last_name: "H" });
  mockCustomers.set("cus_UNRELATED_4", { id: "cus_UNRELATED_4", email: "user4@example.com" }); // exists — not resource_missing
  let unrelatedThrew = false;
  mockRouter = declineRouter;
  try {
    await stripePaymentService.createPaymentIntent("user-4", [{ id: "b" }], 100, false, "usd");
  } catch (e: any) {
    unrelatedThrew = typeof e?.message === "string" && (e.message.includes("Payment intent creation failed") || e.message.includes("declined"));
  }
  check("Scenario 4: a card_declined error (unrelated to customer resource_missing) propagates/throws, is NOT swallowed as recovery",
    unrelatedThrew);
  mockRouter = defaultRouter;

  // ── Scenario 5: user with NO stored customer id — unchanged (one create, no recovery path) ─
  users.set("user-5", { id: "user-5", stripe_customer_id: null, email: "user5@example.com", first_name: "I", last_name: "J" });
  requestLog.length = 0;
  const noStoredResult = await stripePaymentService.createSetupIntent("user-5");
  check("Scenario 5: user with no stored customer id still works", !!noStoredResult?.clientSecret);
  const custCreateCalls = requestLog.filter((r) => r.method === "POST" && r.path === "/v1/customers");
  check("Scenario 5: exactly ONE customer created (no spurious #973 recovery triggered)",
    custCreateCalls.length === 1, JSON.stringify(custCreateCalls.map((c) => c.path)));
  const setupCallsForUser5 = requestLog.filter((r) => r.path === "/v1/setup_intents");
  check("Scenario 5: exactly ONE setup_intent attempt (no retry — nothing was stale)",
    setupCallsForUser5.length === 1);

  (https as any).request = originalHttpsRequest;
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
