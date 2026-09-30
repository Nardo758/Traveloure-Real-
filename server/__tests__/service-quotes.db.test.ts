/**
 * SERVICE QUOTES — behavioural proof of D-28 / D-29 / D-30 / D-31 (decision-maker ruling
 * 2026-09-15, all option A; ledger `2026-09-15-d28-d31-service-quotes`; migration 305; content of
 * record `docs/design/CUSTOM_QUOTE_BRIEF.md`).
 *
 *   Q1  a quote REQUEST creates ONE `service_quotes` row in `requested` and NO `service_bookings`
 *       row, no cart line, no PaymentIntent (D-30); a second request hands back the same row.
 *   Q2  D-29 — validity is CONFIG: an unstated window is the config default; a provider choice
 *       ABOVE the ceiling is REFUSED with the ceiling STATED (never silently clamped); the config
 *       accessors read env at call time and a route never writes a number of days.
 *   Q3  ISSUE is owner-gated at the row (a non-owner is the same 404 as a missing quote), moves
 *       `requested → quoted` with the amount and an `expires_at` derived from the window.
 *   Q4  EXPIRY REFUSES ACCEPTANCE — the claim's own WHERE clause: an expired quote is refused
 *       `quote_expired` WITH its expiry stated, stays `quoted` (lifecycle reads `expired`), and
 *       NO booking row exists.
 *   Q5  an expired quote is RE-QUOTED, never edited: a NEW row, `superseded_by` on the old, the
 *       old amount and expiry intact as the record of what died.
 *   Q6  ACCEPT under a DOUBLE CALL mints EXACTLY ONE booking; both calls return the same id; the
 *       booking's `total_amount` IS the quote's amount (§14 — the accept carried no amount), the
 *       row is born unpaid (`pending`, no PaymentIntent — §19a), and the quote carries `booking_id`.
 *   Q7  the listing's deposit config applies UNCHANGED to the quoted amount (brief §3), and the
 *       contract snapshot on the quote-born row says `deposit_balance` — D-31 on a REAL row.
 *   Q8  the `POST /api/expert-booking-requests` $0 hole is closed (punchlist V-22): a source pin
 *       that the handler carries the SAME `hasPublishedPrice` refusal its four siblings carry,
 *       ahead of its `createServiceBooking` call.
 *   Q9  withdraw (owner) and decline (traveler) are terminal and DIFFERENT facts; a declined quote
 *       cannot be accepted and is named `quote_declined`, a withdrawn one `quote_withdrawn`.
 *
 *   D32/D33 (ledger `2026-09-20-quote-listing-goes-live`) — a quote-approve listing can now REACH
 *       `active`+`approved` and take a real request. Before this fix, `server/routes.ts`'s POST/PATCH
 *       `/api/provider/services` publish gate refused `400 PRICE_REQUIRED` for EVERY `custom_quote`
 *       listing (price authority is the quote, never the listing — Locked Decision 49), so the row
 *       this fixture file seeds directly by SQL (`makeQuoteListing`) could never actually be BUILT
 *       by a seller through the app: creation via `storage.createProviderService` (born `submitted`,
 *       F2), admin approval (`storage.approveProviderServiceListing`, goLive for a verified owner)
 *       and `requestQuote` are each real, unmocked calls. `listingPriceGate` — the fix itself — is
 *       pinned directly (D32b/D33b) and its wiring into both `routes.ts` call sites is pinned
 *       statically in `listing-price-gate.test.ts` (no server boot needed for either).
 *
 * NO FEE LITERALS (§8): Q6's expected split is computed from the same `resolveServiceOwnerShareRate`
 * the mint delegates to. NO DAY LITERALS in assertions: every window is read off the config
 * accessors. DISPOSABLE DB ONLY — every row this file writes it deletes in after(). No Stripe key,
 * no network.
 *
 * Run solo: DATABASE_URL=… npx tsx --test server/__tests__/service-quotes.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

import { db } from "../db";
import {
  acceptQuote,
  declineQuote,
  issueQuote,
  listQuotesForOwner,
  listQuotesForTraveler,
  requestQuote,
  withdrawQuote,
} from "../services/service-quotes.service";
import {
  QUOTE_VALIDITY_CEILING_DAYS_ENV,
  QUOTE_VALIDITY_DAYS_ENV,
  quoteValidityCeilingDays,
  quoteValidityDays,
  resolveQuoteValidityDays,
  DAY_MS,
} from "../config/quote-validity.config";
import { resolveServiceOwnerShareRate } from "../services/commission";
import { resolveDepositPlan } from "../services/deposit.service";
import { storage } from "../storage";
import { listingPriceGate } from "../services/listing-price-gate";
import { centsToAmount, quoteLifecycle, SERVICE_QUOTE_STATUSES } from "@shared/service-quotes";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `sq-${RUN}-prov`,
  traveler: `sq-${RUN}-trav`,
  other: `sq-${RUN}-other`,
};
const createdServiceIds: string[] = [];
const createdCategoryIds: string[] = [];
/** The `service_categories.id` every fixture listing carries — resolved once in before(). */
let categoryId: string;

/**
 * Resolve a `service_categories.id` by key, creating a disposable row when the database carries
 * none — the archetype suite's helper, verbatim in posture. A category is a TAXONOMY PRECONDITION
 * for the contract snapshot Q7 reads (`catalog_keys_unrecognised` otherwise), not a gate on any
 * quote rail. `commission_band_key` is a BAND SELECTOR (§18) and is COPIED from a seeded row, never
 * written as a literal (§8).
 */
async function resolveCategoryId(key: string): Promise<string> {
  const found = await db.execute(sql`SELECT id FROM service_categories WHERE category_key = ${key} LIMIT 1`);
  const existing = (found.rows[0] as any)?.id as string | undefined;
  if (existing) return existing;
  const id = `sq-${RUN}-cat-${key}`;
  const inserted = await db.execute(sql`
    INSERT INTO service_categories (id, name, slug, category_key, commission_band_key)
    SELECT ${id}, ${`SQ ${RUN} ${key}`}, ${`sq-${RUN}-${key}`}, ${key}, sc.commission_band_key
      FROM service_categories sc
     WHERE sc.commission_band_key IS NOT NULL
     LIMIT 1
    RETURNING id
  `);
  assert.ok(inserted.rows[0], `cannot create a disposable '${key}' category: taxonomy migrations not applied`);
  createdCategoryIds.push(id);
  return id;
}

// ── Disposable-DB guard (mirrors booking-birth-provenance.db.test.ts; never defaults open) ────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[service-quotes] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────

/** A custom-quote listing: NULL price, request mode, approved + active. Deposits optional. */
async function makeQuoteListing(opts: { depositPercentage?: number } = {}): Promise<string> {
  const id = `sq-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  const depositEnabled = opts.depositPercentage !== undefined;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, price_type, booking_mode,
                                   delivery_method, category_id, status, approval_status,
                                   deposit_enabled, deposit_type, deposit_percentage)
    VALUES (${id}, ${ids.provider}, ${`SQ listing ${RUN}`}, 'fixture', NULL, 'custom_quote', 'request',
            'in_person', ${categoryId}, 'active', 'approved',
            ${depositEnabled}, ${depositEnabled ? "percentage" : null}, ${opts.depositPercentage ?? null})
  `);
  createdServiceIds.push(id);
  return id;
}

async function quoteRow(id: string): Promise<any> {
  const r = await db.execute(sql`SELECT * FROM service_quotes WHERE id = ${id}`);
  return r.rows[0];
}

async function bookingCountFor(serviceId: string): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM service_bookings WHERE service_id = ${serviceId}`);
  return (r.rows[0] as any).n as number;
}

function ok<T extends { ok: boolean }>(r: T, label: string): Extract<T, { ok: true }> {
  assert.equal(r.ok, true, `${label}: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}
function refused<T extends { ok: boolean }>(r: T, label: string): Extract<T, { ok: false }> {
  assert.equal(r.ok, false, `${label}: expected a refusal, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: false }>;
}

before(async () => {
  await assertDisposableDb();
  // `av_tech` is the archetype fixtures' own P5 key — a provider discipline the contract resolves.
  categoryId = await resolveCategoryId("av_tech");
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`sq-${RUN}-prov@t.test`}, 'SQ', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`sq-${RUN}-trav@t.test`}, 'SQ', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.other}, ${`sq-${RUN}-other@t.test`}, 'SQ', 'Bystander')
  `);
});

after(async () => {
  for (const sid of createdServiceIds) {
    const bookings = await db.execute(sql`SELECT id FROM service_bookings WHERE service_id = ${sid}`);
    for (const b of bookings.rows as any[]) {
      await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${b.id}`).catch(() => {});
    }
    await db.execute(sql`DELETE FROM service_quotes WHERE service_id = ${sid}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE service_id = ${sid}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${sid}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${sid}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler}, ${ids.other})`).catch(() => {});
  for (const id of createdCategoryIds) {
    await db.execute(sql`DELETE FROM service_categories WHERE id = ${id}`).catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════

test("Q1 · a quote REQUEST creates one `requested` row and NO booking — and a second request is the same row", async () => {
  const serviceId = await makeQuoteListing();
  const before = await bookingCountFor(serviceId);

  const first = ok(await requestQuote({ serviceId, travelerId: ids.traveler, note: "two of us, late May" }), "request");
  assert.equal(first.created, true);
  assert.equal(first.quote.status, "requested");
  assert.equal(first.quote.lifecycle, "requested");
  assert.equal("amountCents" in first.quote, false, "§13: a requested quote carries NO amount, not $0.00");
  assert.equal("expiresAt" in first.quote, false, "§13: no offer yet ⇒ no deadline, not 'no deadline'");
  assert.equal(first.quote.position, 1);

  assert.equal(await bookingCountFor(serviceId), before, "D-30: a request mints NO service_bookings row");
  const cart = await db.execute(sql`SELECT count(*)::int AS n FROM cart_items WHERE user_id = ${ids.traveler}`);
  assert.equal((cart.rows[0] as any).n, 0, "and no cart line");

  const again = ok(await requestQuote({ serviceId, travelerId: ids.traveler }), "second request");
  assert.equal(again.created, false, "idempotent: the open request is handed back");
  assert.equal(again.quote.id, first.quote.id);

  // The owner cannot quote their own listing to themselves; a bystander's request on an inactive
  // listing is ONE 404 (never a 403 that says "exists but not for you").
  const own = refused(await requestQuote({ serviceId, travelerId: ids.provider }), "own listing");
  assert.equal(own.code, "own_listing");
  const missing = refused(await requestQuote({ serviceId: `sq-${RUN}-nope`, travelerId: ids.traveler }), "missing");
  assert.equal(missing.status, 404);

  const mine = await listQuotesForTraveler(ids.traveler);
  assert.ok(mine.some((q) => q.id === first.quote.id), "the traveler's list carries it");
  const theirs = await listQuotesForOwner(ids.provider);
  assert.ok(theirs.some((q) => q.id === first.quote.id), "the owner's list carries it");
  for (const q of [...mine, ...theirs]) {
    assert.equal("travelerId" in q, false, "LD 40: no users.id in a projection");
  }
});

test("Q2 · D-29: validity is CONFIG — default when unstated; a choice above the ceiling is REFUSED with the number stated", async () => {
  const ceiling = quoteValidityCeilingDays();
  const dflt = quoteValidityDays();
  assert.ok(Number.isInteger(ceiling) && ceiling >= 1);
  assert.ok(dflt >= 1 && dflt <= ceiling, "the default never exceeds the ceiling");

  // The pure resolver, all four arms.
  const unstated = resolveQuoteValidityDays(null);
  assert.deepEqual(unstated, { ok: true, days: dflt, source: "config_default" });
  const chosen = resolveQuoteValidityDays(ceiling);
  assert.deepEqual(chosen, { ok: true, days: ceiling, source: "provider_choice" }, "the ceiling itself is allowed");
  const over = resolveQuoteValidityDays(ceiling + 1);
  assert.equal(over.ok, false);
  if (!over.ok) {
    assert.equal(over.reason, "exceeds_ceiling");
    assert.equal(over.ceilingDays, ceiling, "the NUMBER is stated, never a bare 'too long'");
    assert.equal(over.requestedDays, ceiling + 1);
  }
  const zero = resolveQuoteValidityDays(0);
  assert.equal(zero.ok, false, "a zero-day quote is not a quote");

  // Env is read at CALL time: a moved ceiling moves the answer without a restart.
  const prevCeiling = process.env[QUOTE_VALIDITY_CEILING_DAYS_ENV];
  const prevDefault = process.env[QUOTE_VALIDITY_DAYS_ENV];
  try {
    process.env[QUOTE_VALIDITY_CEILING_DAYS_ENV] = String(ceiling + 5);
    assert.equal(quoteValidityCeilingDays(), ceiling + 5);
    assert.equal(resolveQuoteValidityDays(ceiling + 1).ok, true, "the same choice is now under the ceiling");
    // A default an operator set ABOVE the ceiling resolves toward the ceiling (the ceiling is the rule).
    process.env[QUOTE_VALIDITY_DAYS_ENV] = String(ceiling + 50);
    assert.equal(quoteValidityDays(), ceiling + 5);
  } finally {
    if (prevCeiling === undefined) delete process.env[QUOTE_VALIDITY_CEILING_DAYS_ENV];
    else process.env[QUOTE_VALIDITY_CEILING_DAYS_ENV] = prevCeiling;
    if (prevDefault === undefined) delete process.env[QUOTE_VALIDITY_DAYS_ENV];
    else process.env[QUOTE_VALIDITY_DAYS_ENV] = prevDefault;
  }

  // And through the RAIL: the owner asks for one day past the ceiling and is refused by name, with
  // the number, and the request stays exactly as it was.
  const serviceId = await makeQuoteListing();
  const req = ok(await requestQuote({ serviceId, travelerId: ids.traveler }), "request");
  const tooLong = refused(
    await issueQuote({ quoteId: req.quote.id, actorUserId: ids.provider, amountCents: 12000, validityDays: ceiling + 1 }),
    "over-ceiling issue",
  );
  assert.equal(tooLong.code, "validity_exceeds_ceiling");
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.ceilingDays, ceiling);
  assert.equal(tooLong.requestedDays, ceiling + 1);
  assert.match(tooLong.message, new RegExp(`at most ${ceiling} days`));
  assert.equal((await quoteRow(req.quote.id)).status, "requested", "a refused issue changes nothing");

  // NO DAY LITERAL IN A ROUTE OR THE SERVICE (§8's no-literal half): the only day numbers live in
  // the config module's own defaults.
  const svc = fs.readFileSync(path.join(process.cwd(), "server/services/service-quotes.service.ts"), "utf8");
  const routes = fs.readFileSync(path.join(process.cwd(), "server/routes/service-quotes.routes.ts"), "utf8");
  for (const [name, src] of [["service", svc], ["routes", routes]] as const) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /\b\d+\s*\*\s*DAY_MS\b|\bvalidityDays\s*[:=]\s*\d+|expiresAt\s*=\s*new Date\(/, `${name}: no day literal`);
  }
});

test("Q3 · ISSUE is owner-gated at the row and moves requested → quoted with the amount and a derived expiry", async () => {
  const serviceId = await makeQuoteListing();
  const req = ok(await requestQuote({ serviceId, travelerId: ids.traveler }), "request");

  const stranger = refused(
    await issueQuote({ quoteId: req.quote.id, actorUserId: ids.other, amountCents: 5000 }),
    "non-owner issue",
  );
  assert.equal(stranger.status, 404, "not yours and not found are the same sentence");
  const travelerAsOwner = refused(
    await issueQuote({ quoteId: req.quote.id, actorUserId: ids.traveler, amountCents: 5000 }),
    "traveler issue",
  );
  assert.equal(travelerAsOwner.status, 404);

  const t0 = Date.now();
  const issued = ok(
    await issueQuote({ quoteId: req.quote.id, actorUserId: ids.provider, amountCents: 48250, note: "includes transfers" }),
    "issue",
  );
  assert.equal(issued.quote.status, "quoted");
  assert.equal(issued.quote.lifecycle, "quoted");
  assert.equal(issued.quote.amountCents, 48250);
  assert.equal(issued.quote.amount, "482.50", "cents → the decimal(10,2) string, exact");
  assert.equal(issued.quote.currency, "USD");
  assert.ok(issued.quote.expiresAt, "a quote with no expiry is not a quote");
  const expiresMs = new Date(issued.quote.expiresAt!).getTime();
  const expectedMs = t0 + quoteValidityDays() * DAY_MS;
  assert.ok(Math.abs(expiresMs - expectedMs) < 60_000, `expires_at ≈ now + the CONFIG default (${quoteValidityDays()}d)`);
  assert.equal(issued.supersededQuoteId, undefined, "filling the first offer is issuing, not re-quoting");

  const row = await quoteRow(req.quote.id);
  assert.equal(row.quoted_by, ids.provider);
  assert.equal(row.note, "includes transfers");
  assert.equal(await bookingCountFor(serviceId), 0, "issuing mints nothing either");

  // A terminal row cannot be issued again.
  const withdrawn = ok(await withdrawQuote({ quoteId: req.quote.id, actorUserId: ids.provider }), "withdraw");
  assert.equal(withdrawn.quote.status, "withdrawn");
  const reissue = refused(
    await issueQuote({ quoteId: req.quote.id, actorUserId: ids.provider, amountCents: 100 }),
    "issue on withdrawn",
  );
  assert.equal(reissue.code, "wrong_status");
});

test("Q4 · EXPIRY REFUSES ACCEPTANCE — the claim's own WHERE clause; the refusal states WHEN; no booking exists", async () => {
  const serviceId = await makeQuoteListing();
  const req = ok(await requestQuote({ serviceId, travelerId: ids.traveler }), "request");
  ok(await issueQuote({ quoteId: req.quote.id, actorUserId: ids.provider, amountCents: 30000 }), "issue");

  // Age the offer past its window. The claim reads NOW() against the ROW, so nothing but the row
  // needs to move — no clock injection, no mocked time.
  await db.execute(sql`UPDATE service_quotes SET expires_at = NOW() - interval '1 hour' WHERE id = ${req.quote.id}`);
  const aged = await quoteRow(req.quote.id);
  assert.equal(quoteLifecycle({ status: aged.status, expiresAt: aged.expires_at }), "expired", "expired is DERIVED, never stored");
  assert.equal(aged.status, "quoted", "the stored status did not move");

  const r = refused(await acceptQuote({ quoteId: req.quote.id, travelerId: ids.traveler }), "accept expired");
  assert.equal(r.code, "quote_expired");
  assert.equal(r.status, 409);
  assert.ok(r.expiresAt, "§13: WHEN it expired is stated");
  assert.equal(new Date(r.expiresAt!).getTime(), new Date(aged.expires_at).getTime());
  assert.match(r.message, /expired on .* Ask the provider for a new one/);

  const after = await quoteRow(req.quote.id);
  assert.equal(after.status, "quoted", "never silently honoured: still quoted, not accepted");
  assert.equal(after.accepted_at, null);
  assert.equal(after.booking_id, null);
  assert.equal(await bookingCountFor(serviceId), 0, "and NO booking row");

  // A bystander accepting anyone's quote is ONE 404; a traveler accepting an unquoted request is
  // told it is not yet quoted.
  const stranger = refused(await acceptQuote({ quoteId: req.quote.id, travelerId: ids.other }), "stranger accept");
  assert.equal(stranger.status, 404);
  const fresh = ok(await requestQuote({ serviceId: await makeQuoteListing(), travelerId: ids.traveler }), "fresh request");
  const early = refused(await acceptQuote({ quoteId: fresh.quote.id, travelerId: ids.traveler }), "accept requested");
  assert.equal(early.code, "not_yet_quoted");
});

test("Q5 · an expired quote is RE-QUOTED, never edited — a NEW row, superseded_by on the old, the old record intact", async () => {
  const serviceId = await makeQuoteListing();
  const req = ok(await requestQuote({ serviceId, travelerId: ids.traveler }), "request");
  ok(await issueQuote({ quoteId: req.quote.id, actorUserId: ids.provider, amountCents: 30000 }), "issue");
  await db.execute(sql`UPDATE service_quotes SET expires_at = NOW() - interval '1 hour' WHERE id = ${req.quote.id}`);
  const oldExpiry = (await quoteRow(req.quote.id)).expires_at;

  const requote = ok(
    await issueQuote({ quoteId: req.quote.id, actorUserId: ids.provider, amountCents: 32000, validityDays: 2 }),
    "re-quote",
  );
  assert.notEqual(requote.quote.id, req.quote.id, "a NEW row");
  assert.equal(requote.quote.position, 2);
  assert.equal(requote.quote.status, "quoted");
  assert.equal(requote.quote.amountCents, 32000);
  assert.equal(requote.supersededQuoteId, req.quote.id);

  const old = await quoteRow(req.quote.id);
  assert.equal(old.status, "superseded");
  assert.equal(old.superseded_by, requote.quote.id);
  assert.equal(old.amount_cents, 30000, "the old amount survives as the record of what was offered");
  assert.equal(new Date(old.expires_at).getTime(), new Date(oldExpiry).getTime(), "and when it died");

  // The traveler cannot accept the superseded row, and is pointed at the newer one by name.
  const stale = refused(await acceptQuote({ quoteId: req.quote.id, travelerId: ids.traveler }), "accept superseded");
  assert.equal(stale.code, "quote_superseded");

  // The 2-day choice is the provider's, under the ceiling, and is what the new row carries.
  const newExpiryMs = new Date(requote.quote.expiresAt!).getTime();
  assert.ok(Math.abs(newExpiryMs - (Date.now() + 2 * DAY_MS)) < 60_000);
});

test("Q6 · ACCEPT under a DOUBLE CALL mints EXACTLY ONE booking, priced off the quote, born unpaid", async () => {
  const serviceId = await makeQuoteListing();
  const req = ok(await requestQuote({ serviceId, travelerId: ids.traveler, note: "rooftop, if possible" }), "request");
  ok(await issueQuote({ quoteId: req.quote.id, actorUserId: ids.provider, amountCents: 48250 }), "issue");
  assert.equal(await bookingCountFor(serviceId), 0);

  const [a, b] = await Promise.all([
    acceptQuote({ quoteId: req.quote.id, travelerId: ids.traveler }),
    acceptQuote({ quoteId: req.quote.id, travelerId: ids.traveler }),
  ]);
  const ra = ok(a, "accept A");
  const rb = ok(b, "accept B");
  assert.equal(ra.bookingId, rb.bookingId, "both calls name the SAME booking");
  assert.equal([ra.minted, rb.minted].filter(Boolean).length, 1, "exactly one call minted");
  assert.equal(await bookingCountFor(serviceId), 1, "§15: one booking under a double call");

  const booking = (
    await db.execute(sql`
      SELECT status, total_amount, platform_fee, provider_earnings, stripe_payment_intent_id,
             deposit_amount, balance_amount, traveler_id, provider_id, booking_details
      FROM service_bookings WHERE id = ${ra.bookingId}
    `)
  ).rows[0] as any;
  assert.equal(booking.total_amount, "482.50", "§14: the total IS the quote's amount — the accept carried none");
  assert.equal(booking.status, "pending", "born in the same unpaid state POST /api/bookings births");
  assert.equal(booking.stripe_payment_intent_id, null, "§19a: no PaymentIntent is born on the row");
  assert.equal(booking.deposit_amount, null, "deposits off ⇒ the columns stay NULL (byte-identical to a full charge)");
  assert.equal(booking.traveler_id, ids.traveler);
  assert.equal(booking.provider_id, ids.provider);
  assert.equal(booking.booking_details?.notes, "rooftop, if possible", "the traveler's own words ride along");

  // §8: the split is the fee_bands answer through the ONE resolver, computed here the same way.
  const share = await resolveServiceOwnerShareRate({ ownerUserId: ids.provider, ownerIsProvider: true, feeCategory: null });
  if (share !== null) {
    const amount = 482.5;
    assert.equal(booking.platform_fee, (amount * (1 - share)).toFixed(2));
    assert.equal(booking.provider_earnings, (amount * share).toFixed(2));
  }

  const q = await quoteRow(req.quote.id);
  assert.equal(q.status, "accepted");
  assert.ok(q.accepted_at);
  assert.equal(q.booking_id, ra.bookingId, "the quote names the booking it minted");
  assert.equal(ra.quote.bookingId, ra.bookingId);

  // A third call, later, is the same answer again — and mints nothing.
  const c = ok(await acceptQuote({ quoteId: req.quote.id, travelerId: ids.traveler }), "accept C");
  assert.equal(c.minted, false);
  assert.equal(c.bookingId, ra.bookingId);
  assert.equal(await bookingCountFor(serviceId), 1);

  // An accepted quote can no longer be re-quoted or withdrawn out from under its booking.
  assert.equal(
    refused(await issueQuote({ quoteId: req.quote.id, actorUserId: ids.provider, amountCents: 1 }), "issue on accepted").code,
    "wrong_status",
  );
  assert.equal(
    refused(await withdrawQuote({ quoteId: req.quote.id, actorUserId: ids.provider }), "withdraw accepted").code,
    "wrong_status",
  );
});

test("Q7 · the listing's deposit config applies UNCHANGED to the quoted amount, and the snapshot says deposit_balance (D-31)", async () => {
  const serviceId = await makeQuoteListing({ depositPercentage: 25 });
  const req = ok(await requestQuote({ serviceId, travelerId: ids.traveler }), "request");
  ok(await issueQuote({ quoteId: req.quote.id, actorUserId: ids.provider, amountCents: 40000 }), "issue");
  const r = ok(await acceptQuote({ quoteId: req.quote.id, travelerId: ids.traveler }), "accept");

  const booking = (
    await db.execute(sql`
      SELECT total_amount, deposit_amount, balance_amount, deposit_paid, balance_paid,
             offering_contract_snapshot
      FROM service_bookings WHERE id = ${r.bookingId}
    `)
  ).rows[0] as any;
  // The SAME derivation checkout runs, fed the quoted amount as the line total (brief §3).
  const plan = resolveDepositPlan({ depositEnabled: true, depositType: "percentage", depositPercentage: 25 }, 400);
  assert.ok(plan, "fixture config yields a real split");
  assert.equal(booking.total_amount, "400.00", "total stays the FULL quoted amount — the split is the schedule");
  assert.equal(booking.deposit_amount, plan!.depositAmount.toFixed(2));
  assert.equal(booking.balance_amount, plan!.balanceAmount.toFixed(2));
  assert.equal(booking.deposit_paid, false);
  assert.equal(booking.balance_paid, false);

  // D-31 on a REAL row: the contract composed at birth consulted the deposit fact.
  const snap = booking.offering_contract_snapshot;
  assert.ok(snap, "the birth writer composed a contract snapshot");
  const snapText = JSON.stringify(snap);
  assert.match(snapText, /"chargeMode":"deposit_balance"/, "a quote-born booking that takes a deposit SAYS so");
  assert.doesNotMatch(snapText, /"chargeMode":"after_quote"/);
  assert.match(snapText, /"commitmentMode":"quote_approve"/, "the commitment is still the quote");
  assert.match(snapText, /"priceAuthority":"server_quote"/);
});

test("Q8 · punchlist V-22: POST /api/expert-booking-requests carries the SAME priceless refusal its four siblings carry", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
  const start = src.indexOf('app.post("/api/expert-booking-requests"');
  assert.ok(start > 0, "the handler exists");
  const end = src.indexOf("app.post(", start + 10);
  // COMMENTS STRIPPED before indexing (the operating procedure's rule for every static pin): the
  // handler's own audit note quotes `Number(service.price ?? 0)` ahead of the gate it describes.
  const handler = src
    .slice(start, end > 0 ? end : undefined)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const gate = handler.indexOf("hasPublishedPrice(service.price)");
  const refusal = handler.indexOf("PRICELESS_LISTING_REFUSAL.reason");
  const birth = handler.indexOf("storage.createServiceBooking(");
  const amount = handler.indexOf("Number(service.price ?? 0)");
  assert.ok(gate > 0, "the ONE price predicate is consulted");
  assert.ok(refusal > 0, "and answers in the resolver's own vocabulary");
  assert.ok(birth > 0, "the rail still births PRICED bookings");
  assert.ok(gate < amount && gate < birth, "the gate runs BEFORE the amount derivation and the birth — a refusal is not a $0 purchase");
});

test("Q9 · withdraw (owner) and decline (traveler) are terminal and DIFFERENT facts", async () => {
  const serviceId = await makeQuoteListing();

  // Decline: the traveler's answer.
  const r1 = ok(await requestQuote({ serviceId, travelerId: ids.traveler }), "request 1");
  ok(await issueQuote({ quoteId: r1.quote.id, actorUserId: ids.provider, amountCents: 9900 }), "issue 1");
  assert.equal(refused(await declineQuote({ quoteId: r1.quote.id, travelerId: ids.other }), "stranger decline").status, 404);
  const declined = ok(await declineQuote({ quoteId: r1.quote.id, travelerId: ids.traveler }), "decline");
  assert.equal(declined.quote.status, "declined");
  assert.ok(declined.quote.declinedAt);
  assert.equal(refused(await acceptQuote({ quoteId: r1.quote.id, travelerId: ids.traveler }), "accept declined").code, "quote_declined");
  assert.equal(refused(await declineQuote({ quoteId: r1.quote.id, travelerId: ids.traveler }), "decline twice").code, "wrong_status");

  // Withdraw: the provider's answer — on a fresh request, since the declined one is terminal and
  // the open-quote lookup will not return it.
  const r2 = ok(await requestQuote({ serviceId, travelerId: ids.traveler }), "request 2");
  assert.equal(r2.created, true, "a declined quote does not block a new request");
  assert.equal(r2.quote.position, 2);
  ok(await issueQuote({ quoteId: r2.quote.id, actorUserId: ids.provider, amountCents: 9900 }), "issue 2");
  assert.equal(refused(await withdrawQuote({ quoteId: r2.quote.id, actorUserId: ids.other }), "stranger withdraw").status, 404);
  const withdrawn = ok(await withdrawQuote({ quoteId: r2.quote.id, actorUserId: ids.provider }), "withdraw");
  assert.equal(withdrawn.quote.status, "withdrawn");
  assert.ok(withdrawn.quote.withdrawnAt);
  assert.equal(refused(await acceptQuote({ quoteId: r2.quote.id, travelerId: ids.traveler }), "accept withdrawn").code, "quote_withdrawn");

  // The vocabulary is the shared list, and nothing here wrote a value outside it.
  const statuses = await db.execute(sql`SELECT DISTINCT status FROM service_quotes WHERE service_id = ${serviceId}`);
  for (const row of statuses.rows as any[]) {
    assert.ok((SERVICE_QUOTE_STATUSES as readonly string[]).includes(row.status), `unknown status ${row.status}`);
  }
  assert.equal(centsToAmount(9900), "99.00");
  assert.equal(centsToAmount(5), "0.05");
  assert.equal(await bookingCountFor(serviceId), 0, "neither answer mints anything");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// D32/D33 · ledger `2026-09-20-quote-listing-goes-live` — the price gate no longer strands a
// custom-quote listing before it ever reaches `active`.
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("D32a · a real submitted→approved custom_quote listing (built through storage, never seeded active) can take a request", async () => {
  const id = `sq-${RUN}-d32a-${crypto.randomUUID().slice(0, 6)}`;
  // Built the way a create actually leaves a row: no `approvalStatus` override (F2 clamps it to
  // "submitted"), price NULL, priceType "custom_quote", bookingMode "request" (the ONE combination
  // `resolveOfferingCommerceContract` requires for P5 — an `instant` mode would be refused as
  // `instant_commitment_with_custom_quote`, a separate, already-guarded rule this test does not
  // re-prove). `status: "active"` is sent explicitly, mirroring the exact shape the PRICE_REQUIRED
  // gate used to refuse unconditionally — this fixture proves what happens on the FAR side of that
  // gate; `listing-price-gate.test.ts` proves the gate itself and its wiring.
  const created = await storage.createProviderService({
    userId: ids.provider,
    serviceName: `D32a quote listing ${RUN}`,
    description: "fixture",
    price: null,
    priceType: "custom_quote",
    bookingMode: "request",
    deliveryMethod: "in_person",
    categoryId,
    status: "active",
  } as any);
  createdServiceIds.push(created.id);
  assert.equal(created.approvalStatus, "submitted", "F2: a create can never be born approved");
  assert.equal(created.price, null, "a custom_quote listing's price authority is the quote — never a stored number");

  // Admin approval, for a VERIFIED owner (goLive=true) — the real writer both admin.routes.ts and
  // the auto-activation sweep call. NOTE (confusing but real): `ProviderServiceListing.status` is
  // mapped from `provider_services.approval_status` (`mapProviderServiceToListing`, storage.ts),
  // and `.isActive` reads the raw `status` column — asserted below in the DTO's own vocabulary,
  // then cross-checked against the raw row so the READ side of this fixture cannot mask a bug.
  const approved = await storage.approveProviderServiceListing(created.id, ids.other, true);
  assert.ok(approved, "approval must return the updated row");
  assert.equal(approved!.status, "approved", "DTO .status is approvalStatus");
  assert.equal(approved!.isActive, true, "DTO .isActive reads the raw status column");
  const rawAfterApprove = await db.execute(sql`SELECT status, approval_status FROM provider_services WHERE id = ${created.id}`);
  assert.equal((rawAfterApprove.rows[0] as any).status, "active");
  assert.equal((rawAfterApprove.rows[0] as any).approval_status, "approved");

  // Before this fix, no custom_quote listing could ever reach this state through the app at all —
  // every request against it answered `listing_not_found` because `status`/`approvalStatus` could
  // never both be true. Now the real `requestQuote` succeeds against a REAL pipeline-built row.
  const req = ok(await requestQuote({ serviceId: created.id, travelerId: ids.traveler }), "request against D32a listing");
  assert.equal(req.quote.status, "requested");
  assert.equal(req.quote.serviceId, created.id);
});

test("D32b · listingPriceGate itself: custom_quote passes with a NULL price (the defect's exact shape) — pure pin, no DB", () => {
  assert.deepEqual(listingPriceGate({ priceType: "custom_quote", price: null }), { ok: true });
});

test("D33 · D33b: a FIXED-price listing with price=null still gets PRICE_REQUIRED — the gate is unchanged for every non-quote shape", async () => {
  // D33b — the predicate directly: unaffected by this fix.
  assert.deepEqual(listingPriceGate({ priceType: "fixed", price: null }), { ok: false, code: "PRICE_REQUIRED" });
  assert.deepEqual(listingPriceGate({ priceType: undefined, price: null }), { ok: false, code: "PRICE_REQUIRED" });

  // D33 — end to end: a fixed-price listing born with no price still cannot be admin-approved into
  // a state `requestQuote` would even consider requestable (it is not `custom_quote`, so
  // `buildListingBuyAction`'s booking_request landing never applies to it) — recorded here as the
  // negative twin of D32a, on a listing that reaches active+approved but is priceless.
  const id = `sq-${RUN}-d33-${crypto.randomUUID().slice(0, 6)}`;
  const created = await storage.createProviderService({
    userId: ids.provider,
    serviceName: `D33 fixed listing ${RUN}`,
    description: "fixture",
    price: null,
    priceType: "fixed",
    deliveryMethod: "in_person",
    categoryId,
    status: "draft",
  } as any);
  createdServiceIds.push(created.id);
  assert.equal(created.approvalStatus, "submitted");
  assert.equal(created.price, null);
  // The listing-level PRICE_REQUIRED gate lives in routes.ts, ahead of storage; this fixture
  // instead pins that the SAME row, judged by the predicate the route calls, is refused —
  // the row this test builds is exactly the shape that gate would see on a publish attempt.
  const gate = listingPriceGate({ priceType: created.priceType, price: created.price });
  assert.deepEqual(gate, { ok: false, code: "PRICE_REQUIRED" });
});
