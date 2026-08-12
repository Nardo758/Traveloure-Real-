/**
 * Per-listing card display options — behavioural proof of Catalog+Distribute lane C3
 * (docs/DECISIONS.md ruling 74/75; CLAUDE.md §13/§14/§18/§19).
 *
 * RATIFIED DESIGN (ruling 74): each listing carries two DISPLAY prefs a provider sets on the Catalog
 * "Card shows" control — show_price (on/off) and booking_mode (instant|request|hidden) — rendered on
 * the SHARED traveler OfferingCard in Catalog Preview AND on the public storefront. They are NOT
 * §14/§18/§19 money/identity/rate fields, so they are legitimately client-settable and NOT stripped.
 *
 *   NEG1  an out-of-vocabulary booking_mode is REJECTED at the schema (400) — the app-enforced enum
 *         is the guard (no DB CHECK, migration-202 publish-trap posture).
 *   NEG2  a NON-OWNER cannot PATCH another provider's display options (404 — ownership, §14).
 *   P1    the two columns ROUND-TRIP through POST — show_price=false, booking_mode='request' persist
 *         and read back on the owner read.
 *   P2    they ROUND-TRIP through PATCH — a single-field PATCH sets exactly its one pref, untouched
 *         siblings preserved.
 *   P3    on the STOREFRONT read, show_price=false makes the payload carry showPrice=false so the
 *         card omits the price (honest "Enquire for pricing" — never a $0); show_price=true carries
 *         the price as today.
 *   P4    booking_mode values arrive CONCRETE on the storefront read and equal the explicit choice
 *         (the CTA the card renders follows them — instant/request/hidden).
 *   P5    an UNSET (null) booking_mode is RESOLVED from the account service_provider_forms
 *         .instant_booking — 'instant' when the account offers instant booking, 'request' otherwise;
 *         flip the account flag, the unset listing moves, while an EXPLICIT listing does not (explicit
 *         wins). This is the ONE derivation site (resolveBookingMode), server-side on the read.
 *   P6    §18/§19 UNCHANGED — a client-supplied revenueShareRate in the SAME create body is STRIPPED
 *         (never 1.00), while the display prefs on the same body persist. The two classes are distinct.
 *   P7    the money-endpoints guard stays green with the new fields present (spawned; exit 0).
 *
 * Transport: real HTTP against the ALREADY-RUNNING dev server on http://127.0.0.1:5000 (same posture
 * as service-content-translation.http.test.ts) — user fixtures via the app's own auth API (FK-safe
 * ids + session cookies); provider_services / service_provider_forms via direct disposable-DB-guarded
 * SQL. DISPOSABLE DB ONLY — every row this file writes it deletes in after().
 *
 * Run solo: DATABASE_URL=... npx tsx --test server/__tests__/service-display-options.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (mirrors service-content-translation.http.test.ts; never defaults open) ──
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function connStringHost(): string | null {
  const cs = process.env.DATABASE_URL;
  if (!cs) return null;
  try {
    return new URL(cs).hostname.toLowerCase();
  } catch {
    return null;
  }
}
async function assertDisposableDb(): Promise<void> {
  const optIn = process.env.JOURNEY_DB_WRITES_OK === "1";
  const csHost = connStringHost();
  let serverAddr: string | null = null;
  try {
    const r = await pool.query("SELECT host(inet_server_addr()) AS addr");
    serverAddr = r.rows[0]?.addr ?? null;
  } catch {
    /* NULL inet_server_addr() (local socket) is itself a disposable-local signal. */
  }
  const serverIsLocal = serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr);
  const csIsLocal = csHost !== null && DISPOSABLE_HOSTS.has(csHost);
  const disposable = csIsLocal || (csHost === null && serverIsLocal);
  if (!disposable && !optIn) {
    throw new Error(
      `[service-display-options] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const HANDLE = `sdo${RUN}`; // lowercase alnum — matches storefront HANDLE_RE

const emailTag = (label: string) => `sdo-${RUN}-${label}@t.test`;
const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function registerActor(label: string): Promise<Actor> {
  const email = emailTag(label);
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "Disp", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  await pool.query(`UPDATE users SET role = 'service_provider' WHERE id = $1`, [body.user.id]);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}

function api(path: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Read a Response body EXACTLY ONCE (fetch bodies are single-use), returning both status and the
 *  parsed JSON (plus the raw text for failure messages). Avoids the "Body already read" trap of
 *  consuming .text() in an assert message and then calling .json(). */
async function readOnce(res: Response): Promise<{ status: number; body: any; text: string }> {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body, text };
}

/** Direct SQL insert of an APPROVED + ACTIVE listing (so it surfaces on the public storefront read),
 *  with explicit display-option values. POST is exercised separately for the round-trip proof. */
async function seedStorefrontService(
  ownerId: string,
  label: string,
  opts: { showPrice: boolean | null; bookingMode: string | null },
): Promise<string> {
  const id = `sdo-${RUN}-${label}-${crypto.randomUUID().slice(0, 6)}`;
  await pool.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, price, status, approval_status, delivery_method, show_price, booking_mode)
     VALUES ($1, $2, $3, '120.00', 'active', 'approved', 'pdf', $4, $5)`,
    [id, ownerId, `Disp ${label}`, opts.showPrice, opts.bookingMode],
  );
  createdServiceIds.push(id);
  return id;
}

/** Minimal FK-safe service_provider_forms row so instant_booking can be read/flipped. */
async function seedProviderForm(ownerId: string, instantBooking: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO service_provider_forms
       (id, user_id, business_name, name, email, mobile, country, address, business_type, instant_booking, status)
     VALUES ($1, $2, 'Disp Biz', 'Disp Owner', $3, '000', 'Japan', 'Kyoto', 'tour', $4, 'approved')`,
    [crypto.randomUUID(), ownerId, `form-${ownerId}@t.test`, instantBooking],
  );
}

let owner: Actor;
let stranger: Actor;
let svcHidePrice: string;
let svcInherit: string;
let svcInstant: string;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();

  owner = await registerActor("owner");
  stranger = await registerActor("stranger");
  // Owner gets a storefront handle + an instant-booking-ON account (so an unset listing inherits 'instant').
  await pool.query(`UPDATE users SET handle = $1 WHERE id = $2`, [HANDLE, owner.id]);
  await seedProviderForm(owner.id, true);

  svcHidePrice = await seedStorefrontService(owner.id, "hideprice", { showPrice: false, bookingMode: "request" });
  svcInherit = await seedStorefrontService(owner.id, "inherit", { showPrice: true, bookingMode: null });
  svcInstant = await seedStorefrontService(owner.id, "instant", { showPrice: true, bookingMode: "instant" });
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdServiceIds) {
      await pool.query(`DELETE FROM provider_services WHERE id = $1`, [id]).catch(() => {});
    }
    await pool.query(`DELETE FROM service_provider_forms WHERE user_id = ANY($1)`, [[owner?.id, stranger?.id].filter(Boolean)]).catch(() => {});
    for (const email of createdEmails) {
      await pool.query(`DELETE FROM users WHERE email = $1`, [email]).catch(() => {});
    }
  } finally {
    await pool.end().catch(() => {});
  }
});

// ── NEGATIVES FIRST ─────────────────────────────────────────────────────────────────────────
test("NEG1: an out-of-vocabulary booking_mode is rejected (400) — app-enforced enum, no DB CHECK", async () => {
  const res = await api("/api/provider/services", owner.cookie, "POST", {
    serviceName: "Disp bad-mode",
    price: "50.00",
    deliveryMethod: "pdf",
    status: "draft",
    bookingMode: "sometimes",
  });
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${await res.text()}`);
});

test("NEG2: a non-owner cannot PATCH another provider's display options (404 — ownership)", async () => {
  const res = await api(`/api/provider/services/${svcInstant}`, stranger.cookie, "PATCH", { showPrice: false });
  assert.equal(res.status, 404, `expected 404, got ${res.status}: ${await res.text()}`);
  // And the row is untouched.
  const { rows } = await pool.query(`SELECT show_price FROM provider_services WHERE id = $1`, [svcInstant]);
  assert.equal(rows[0].show_price, true, "non-owner PATCH must not mutate the row");
});

// ── ROUND-TRIP ──────────────────────────────────────────────────────────────────────────────
test("P1: the two columns round-trip through POST (show_price=false, booking_mode='request')", async () => {
  const res = await readOnce(await api("/api/provider/services", owner.cookie, "POST", {
    serviceName: "Disp roundtrip-post",
    price: "90.00",
    deliveryMethod: "pdf",
    status: "draft",
    showPrice: false,
    bookingMode: "request",
  }));
  assert.equal(res.status, 201, `expected 201, got ${res.status}: ${res.text}`);
  const created = res.body;
  createdServiceIds.push(created.id);
  assert.equal(created.showPrice, false, "showPrice persisted false");
  assert.equal(created.bookingMode, "request", "bookingMode persisted 'request'");

  // Read back through the owner read.
  const listRes = await readOnce(await api("/api/provider/services", owner.cookie));
  const list = listRes.body as any[];
  const row = list.find((s) => s.id === created.id);
  assert.ok(row, "created listing appears on the owner read");
  assert.equal(row.showPrice, false);
  assert.equal(row.bookingMode, "request");
});

test("P2: a single-field PATCH sets exactly its one pref (round-trip through PATCH)", async () => {
  // booking_mode: request → hidden, show_price left alone.
  const r1 = await api(`/api/provider/services/${svcHidePrice}`, owner.cookie, "PATCH", { bookingMode: "hidden" });
  assert.equal(r1.status, 200, await r1.text());
  let { rows } = await pool.query(`SELECT show_price, booking_mode FROM provider_services WHERE id = $1`, [svcHidePrice]);
  assert.equal(rows[0].booking_mode, "hidden", "bookingMode updated to hidden");
  assert.equal(rows[0].show_price, false, "showPrice untouched by a bookingMode-only PATCH");

  // Restore for later storefront proofs; then show_price flip alone.
  await api(`/api/provider/services/${svcHidePrice}`, owner.cookie, "PATCH", { bookingMode: "request" });
  const r2 = await api(`/api/provider/services/${svcInstant}`, owner.cookie, "PATCH", { showPrice: false });
  assert.equal(r2.status, 200, await r2.text());
  ({ rows } = await pool.query(`SELECT show_price, booking_mode FROM provider_services WHERE id = $1`, [svcInstant]));
  assert.equal(rows[0].show_price, false, "showPrice updated to false");
  assert.equal(rows[0].booking_mode, "instant", "bookingMode untouched by a showPrice-only PATCH");
  // restore
  await api(`/api/provider/services/${svcInstant}`, owner.cookie, "PATCH", { showPrice: true });
});

// ── STOREFRONT READS ────────────────────────────────────────────────────────────────────────
async function loadStorefront(): Promise<any> {
  const res = await readOnce(await api(`/api/storefront/${HANDLE}`, undefined));
  assert.equal(res.status, 200, `storefront read failed (${res.status}): ${res.text}`);
  return res.body;
}

test("P3: show_price=false carries showPrice=false on the storefront (card omits price, no $0)", async () => {
  const data = await loadStorefront();
  const hide = data.services.find((s: any) => s.id === svcHidePrice);
  const inherit = data.services.find((s: any) => s.id === svcInherit);
  assert.ok(hide && inherit, "both listings surface on the storefront");
  assert.equal(hide.showPrice, false, "showPrice=false → the card renders 'Enquire for pricing', not the price");
  assert.equal(inherit.showPrice, true, "showPrice=true → the card renders the price as today");
});

test("P4: booking_mode arrives concrete on the storefront and equals the explicit choice", async () => {
  const data = await loadStorefront();
  const hide = data.services.find((s: any) => s.id === svcHidePrice);
  const instant = data.services.find((s: any) => s.id === svcInstant);
  assert.equal(hide.bookingMode, "request", "explicit request → 'Request to book' CTA");
  assert.equal(instant.bookingMode, "instant", "explicit instant → the book CTA");
});

test("P5: an unset booking_mode resolves from the account instant_booking; explicit wins", async () => {
  // Account instant_booking = true (seeded) → the unset listing inherits 'instant'.
  let data = await loadStorefront();
  let inherit = data.services.find((s: any) => s.id === svcInherit);
  assert.equal(inherit.bookingMode, "instant", "unset listing inherits 'instant' from the account flag");

  // Flip the account flag OFF → the unset listing moves to 'request'…
  await pool.query(`UPDATE service_provider_forms SET instant_booking = false WHERE user_id = $1`, [owner.id]);
  data = await loadStorefront();
  inherit = data.services.find((s: any) => s.id === svcInherit);
  const explicit = data.services.find((s: any) => s.id === svcInstant);
  assert.equal(inherit.bookingMode, "request", "unset listing follows the account flag to 'request'");
  // …while an EXPLICIT 'instant' listing does NOT move (explicit wins over the account default).
  assert.equal(explicit.bookingMode, "instant", "an explicit per-listing value is never overridden by the account flag");

  // restore for isolation
  await pool.query(`UPDATE service_provider_forms SET instant_booking = true WHERE user_id = $1`, [owner.id]);
});

// ── §18/§19 UNCHANGED ───────────────────────────────────────────────────────────────────────
test("P6: a client-supplied revenueShareRate on the SAME body is stripped; display prefs persist", async () => {
  const res = await readOnce(await api("/api/provider/services", owner.cookie, "POST", {
    serviceName: "Disp strip-proof",
    price: "70.00",
    deliveryMethod: "pdf",
    status: "draft",
    showPrice: false,
    bookingMode: "hidden",
    revenueShareRate: "1.00", // §18: provider share 100% / platform fee 0 if it ever landed
  }));
  assert.equal(res.status, 201, res.text);
  const created = res.body;
  createdServiceIds.push(created.id);
  // The privileged rate is NEVER the client's value (derived server-side or left to the DB default).
  assert.notEqual(String(created.revenueShareRate), "1.00", "revenueShareRate is stripped (§18/§19)");
  // …and the display prefs on the same body DID persist — the two classes are distinct.
  assert.equal(created.showPrice, false);
  assert.equal(created.bookingMode, "hidden");
});

// ── GUARD ───────────────────────────────────────────────────────────────────────────────────
test("P7: the money-endpoints guard stays green with the new display fields present", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..", "..");
  const r = spawnSync("node", ["scripts/check-money-endpoints.cjs"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(r.status, 0, `check-money-endpoints.cjs must exit 0:\n${r.stdout}\n${r.stderr}`);
});
