/**
 * V-26 — A SLOT CLAIM CARRIES THE LINE'S UNIT COUNT, AND THE STATEMENT IS THE GUARD
 * (punchlist V-26; ledger `2026-09-15-v26-slot-units`; §15/C3, §18 rule 1, §13, D-14).
 *
 * THE DEFECT. `storage.bookSlot(id)` took no count. It added exactly 1 to
 * `vendor_availability_slots.booked_count` and guarded `COALESCE(booked_count,0) < COALESCE(capacity,1)`
 * — a predicate that refuses only an ALREADY-FULL slot and can never refuse an over-subscribing
 * line. The checkout called it once per cart line while the MONEY on that same line was
 * `rate x quantity` (`resolveItemBaseAmount`) and the booking row recorded
 * `bookingDetails.quantity`. The traveler was charged for three, the provider's calendar was
 * debited one, and the discrepancy was durable and visible on the row. D-14
 * (`2026-09-15-d14-quantity-is-units`) made it reachable through the SUPPORTED flow rather than a
 * crafted body: it derives `quantity = party_size` server-side for exactly the seat-shaped
 * `in_person`/`hybrid` archetype that is slot-bound.
 *
 * WHAT THIS FILE PROVES, AND IN WHICH LAYER.
 *   S1  a 3-unit line fills a capacity-3 slot EXACTLY (the arithmetic is the line's, not 1)
 *   S2  a 2-unit line against 1 remaining seat is REFUSED and `booked_count` is UNCHANGED —
 *       refused, never clamped (§13): a partial claim is a booking nobody made
 *   S3  two concurrent 2-unit claims on capacity 3: exactly ONE wins (the single statement IS the
 *       guard, §15/C3 — not a SELECT followed by a decision)
 *   S4  a cancel gives back EXACTLY the units the claim recorded taking
 *   S5  a PRE-V-26 row releases 1 — including one carrying `bookingDetails.quantity: 3`, which is
 *       what it was PRICED at and not what it CLAIMED (§13: never guess more than was recorded)
 *   S6  0 / negative / fractional units are refused BY NAME on both writers, with no row touched
 *   S7  static pin: the checkout claim passes the SAME expression `resolveItemBaseAmount`
 *       multiplies by (§18 rule 1) — one derivation, `resolveItemUnitCount`, not two spellings
 *   S8  static pin: the STAY branch passes 1, per NIGHT, and says why
 *
 * ── STATED NEGATIVE SPACE (§18d), and it is the load-bearing half ────────────────────────────────
 * These proofs are about HOW MANY units a claim moves. They say NOTHING about:
 *   • WHICH slot a line claims, or who may claim it — that is the checkout's own eligibility and
 *     ownership gating, tested elsewhere.
 *   • the §15b/§15c CLAIM/PROMOTE/VOID predicates, which this lane did not touch: the void's
 *     `status='payment_pending' AND stripe_payment_intent_id IS NULL`, every idempotency key and
 *     every atomic conditional on `service_bookings` are byte-identical to main. S4 exercises the
 *     RELEASE's size, never the transition that authorizes it.
 *   • what a traveler is CHARGED. No money path changed; `resolveItemBaseAmount` returns the same
 *     number for every input it did before (S7 pins that it still multiplies by the same thing).
 *   • whether `cart_items.quantity` was admitted correctly in the first place — that is D-14's
 *     `archetypeAsks`, one rail earlier, and its own test file.
 *
 * NO FEE LITERALS (§8): the fixtures' amounts are arbitrary fixture money and are asserted for
 * nothing. NO SCHEMA CHANGE: `capacity` and `booked_count` are already `integer`.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * No Stripe key and no network.
 *
 * Run solo: npx tsx --test server/__tests__/slot-units.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  CLAIMED_SLOT_UNITS_KEY,
  deriveClaimedSlotUnits,
} from "../services/checkout-claim.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `su-${RUN}-prov`,
  traveler: `su-${RUN}-trav`,
  service: `su-${RUN}-svc`,
};
const createdSlotIds: string[] = [];
const createdBookingIds: string[] = [];

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const src = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

/** Line comments cannot satisfy a static pin — a comment quoting the call is not the call. */
function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const i = line.indexOf("//");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

/**
 * The top-level argument list of every call to `needle` in `source`, split on commas that are not
 * inside nested brackets, quotes or template literals. Used instead of a regex so a call whose own
 * arguments contain parentheses — `storage.bookSlot(slotIdByDate.get(d)!, 1)` — is read correctly,
 * and instead of a literal call-site count so the pin survives code moving.
 */
function topLevelArgsOf(source: string, needle: string): string[][] {
  const calls: string[][] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(needle, from);
    if (at === -1) break;
    let i = at + needle.length;
    let depth = 1;
    let current = "";
    const args: string[] = [];
    let quote: string | null = null;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (quote) {
        if (ch === "\\") { current += ch + (source[i + 1] ?? ""); i += 2; continue; }
        if (ch === quote) quote = null;
        current += ch;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { quote = ch; current += ch; i += 1; continue; }
      if (ch === "(" || ch === "[" || ch === "{") depth += 1;
      else if (ch === ")" || ch === "]" || ch === "}") {
        depth -= 1;
        if (depth === 0) { i += 1; break; }
      }
      if (ch === "," && depth === 1) { args.push(current.trim()); current = ""; i += 1; continue; }
      current += ch;
      i += 1;
    }
    if (current.trim()) args.push(current.trim());
    calls.push(args);
    from = i;
  }
  return calls;
}

// ── Disposable-DB guard (mirrors from-state-guards.db.test.ts; never defaults open) ──────────────
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
      `[slot-units] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────

/** Tomorrow — `bookSlot` refuses a past date, which is not what any of these proofs are about. */
function tomorrow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function seedSlot(capacity: number, bookedCount = 0, status = "available"): Promise<string> {
  const id = `su-${RUN}-slot-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, capacity, booked_count, status)
    VALUES (${id}, ${ids.service}, ${ids.provider}, ${tomorrow()}::date, ${capacity}, ${bookedCount}, ${status})
  `);
  createdSlotIds.push(id);
  return id;
}

async function readSlot(id: string): Promise<{ booked_count: number; status: string; capacity: number }> {
  const r = await db.execute(sql`
    SELECT booked_count, status, capacity FROM vendor_availability_slots WHERE id = ${id}
  `);
  const row = r.rows[0] as any;
  return { booked_count: Number(row.booked_count), status: String(row.status), capacity: Number(row.capacity) };
}

/** A confirmed, slot-bound booking whose `booking_details` is exactly what the test names. */
async function seedBooking(slotId: string, details: Record<string, unknown>): Promise<string> {
  const id = `su-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, slot_id,
                                  total_amount, platform_fee, provider_earnings, booking_details)
    VALUES (${id}, ${ids.service}, ${ids.traveler}, ${ids.provider}, 'confirmed', ${slotId},
            '100.00', '25.00', '75.00', ${JSON.stringify(details)}::jsonb)
  `);
  createdBookingIds.push(id);
  return id;
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`su-${RUN}-prov@t.test`}, 'SU', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`su-${RUN}-trav@t.test`}, 'SU', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status)
    VALUES (${ids.service}, ${ids.provider}, ${`SU service ${RUN}`}, 'fixture', '100.00', 'active', 'approved')
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM notifications WHERE data->>'bookingId' = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  for (const id of createdSlotIds) {
    await db.execute(sql`DELETE FROM vendor_availability_slots WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler})`).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// S1 — the claim is the LINE'S, not 1
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("S1: a 3-unit line fills a capacity-3 slot exactly — and the slot reads back fully_booked", async () => {
  const slotId = await seedSlot(3);

  const claimed = await storage.bookSlot(slotId, 3);
  assert.ok(claimed, "a 3-unit claim against 3 seats must succeed");

  const after = await readSlot(slotId);
  assert.equal(after.booked_count, 3, "three seats were sold, so three seats are gone — this read 1 on main");
  assert.equal(after.status, "fully_booked", "a slot at capacity says so");

  // And the slot is genuinely full afterwards: a further single unit is refused.
  assert.equal(await storage.bookSlot(slotId, 1), undefined, "no seat is left to claim");
  assert.equal((await readSlot(slotId)).booked_count, 3, "a refused claim moves nothing");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// S2 — REFUSED, NEVER CLAMPED (§13)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("S2: a 2-unit line against 1 remaining seat is refused, and booked_count is untouched", async () => {
  const slotId = await seedSlot(3, 2);

  const claimed = await storage.bookSlot(slotId, 2);
  assert.equal(claimed, undefined, "2 units cannot be taken when 1 is left — this SUCCEEDED on main");

  const after = await readSlot(slotId);
  assert.equal(after.booked_count, 2, "a refused claim writes nothing at all");
  assert.equal(after.status, "available", "and the slot is not marked full by a claim that failed");

  // CLAMPING would be the other tempting answer, and it is the wrong one: selling the traveler one
  // seat when they asked for two is a booking nobody made. The honest answer is the same
  // "this slot just booked" signal a full slot gives, which the checkout turns into a 409.
  assert.ok(await storage.bookSlot(slotId, 1), "the one seat that IS left is still claimable");
  assert.equal((await readSlot(slotId)).booked_count, 3);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// S3 — THE STATEMENT IS THE GUARD (§15/C3)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("S3: two concurrent 2-unit claims on a capacity-3 slot — exactly one wins", async () => {
  const slotId = await seedSlot(3);

  // Both calls are in flight before either resolves. There is no SELECT and no decision taken
  // against one: the conditional UPDATE is the whole decision, so the loser matches zero rows.
  const [a, b] = await Promise.all([
    storage.bookSlot(slotId, 2),
    storage.bookSlot(slotId, 2),
  ]);

  const winners = [a, b].filter(Boolean).length;
  assert.equal(winners, 1, "two 2-unit claims cannot both fit in 3 seats");

  const after = await readSlot(slotId);
  assert.equal(after.booked_count, 2, "exactly one claim's units landed — never 4, never an over-sell");
  assert.ok(after.booked_count <= after.capacity, "booked_count never exceeds capacity");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// S4 / S5 — THE RELEASE GIVES BACK WHAT THE CLAIM RECORDED TAKING
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("S4: cancelling a booking returns exactly the units its claim recorded", async () => {
  const slotId = await seedSlot(5);
  assert.ok(await storage.bookSlot(slotId, 3), "claim 3 of 5");
  assert.equal((await readSlot(slotId)).booked_count, 3);

  const bookingId = await seedBooking(slotId, { quantity: 3, [CLAIMED_SLOT_UNITS_KEY]: 3 });

  const updated = await storage.updateServiceBookingStatus(bookingId, "cancelled", "traveler cancelled");
  assert.ok(updated, "the cancel itself must land — this proof is about the size of the give-back");

  const after = await readSlot(slotId);
  assert.equal(after.booked_count, 0, "all three seats come back — main released 1 and leaked 2 forever");
  assert.equal(after.status, "available");
});

test("S5: a pre-V-26 booking releases 1 — its priced quantity is not its claim", async () => {
  // THE POPULATION THIS IS ABOUT: rows born before this lane. The old writer added exactly 1
  // whatever the line held, so a row carrying `quantity: 3` holds ONE unit of its slot. Releasing
  // three would hand back capacity nobody took — V-26's defect pointing the other way.
  const slotId = await seedSlot(5, 1);
  const legacyPriced = await seedBooking(slotId, { quantity: 3, notes: "born before V-26" });

  assert.equal(
    deriveClaimedSlotUnits({ quantity: 3, notes: "born before V-26" }),
    1,
    "the priced quantity is NOT read as a claim record (§13 — never guess more than was recorded)",
  );

  const updated = await storage.updateServiceBookingStatus(legacyPriced, "cancelled", "cancelled");
  assert.ok(updated);
  assert.equal((await readSlot(slotId)).booked_count, 0, "exactly the one unit it took comes back");

  // And a row with no `booking_details` at all — the oldest shape there is — behaves identically.
  const slotId2 = await seedSlot(5, 1);
  const bare = await seedBooking(slotId2, {});
  assert.equal(deriveClaimedSlotUnits(null), 1, "no details at all still means one unit");
  assert.equal(deriveClaimedSlotUnits(undefined), 1);
  assert.ok(await storage.updateServiceBookingStatus(bare, "cancelled", "cancelled"));
  assert.equal((await readSlot(slotId2)).booked_count, 0);

  // A value that is not a positive integer is not a claim record either — it releases one rather
  // than moving an amount nobody can vouch for.
  assert.equal(deriveClaimedSlotUnits({ [CLAIMED_SLOT_UNITS_KEY]: 0 }), 1);
  assert.equal(deriveClaimedSlotUnits({ [CLAIMED_SLOT_UNITS_KEY]: -2 }), 1);
  assert.equal(deriveClaimedSlotUnits({ [CLAIMED_SLOT_UNITS_KEY]: 1.5 }), 1);
  assert.equal(deriveClaimedSlotUnits({ [CLAIMED_SLOT_UNITS_KEY]: "3" }), 1);
  assert.equal(deriveClaimedSlotUnits({ [CLAIMED_SLOT_UNITS_KEY]: 4 }), 4, "and a real record is honoured");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// S6 — A NONSENSE UNIT COUNT IS REFUSED BY NAME, NEVER DEFAULTED
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("S6: 0, negative and fractional units are refused on BOTH writers, and no row moves", async () => {
  const slotId = await seedSlot(5, 2);

  for (const bad of [0, -1, 1.5, Number.NaN] as number[]) {
    await assert.rejects(
      () => storage.bookSlot(slotId, bad),
      /positive integer/,
      `bookSlot must refuse ${bad} by name rather than defaulting to 1`,
    );
    await assert.rejects(
      () => storage.releaseSlot(slotId, bad),
      /positive integer/,
      `releaseSlot must refuse ${bad} by name rather than defaulting to 1`,
    );
  }

  assert.equal((await readSlot(slotId)).booked_count, 2, "a refused call is not a partial one");

  // The honest neighbour: a legitimate release still works on the same row.
  await storage.releaseSlot(slotId, 2);
  assert.equal((await readSlot(slotId)).booked_count, 0);

  // And a release can never drive a slot negative, however large the recorded claim.
  await storage.releaseSlot(slotId, 99);
  assert.equal((await readSlot(slotId)).booked_count, 0, "the floor at 0 holds");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// S7 / S8 — STATIC PINS: the checkout reads ONE derivation, and the stay branch says why it is 1
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("S7: the checkout claim passes the SAME expression resolveItemBaseAmount multiplies by (§18 rule 1)", () => {
  const routes = stripLineComments(src("server/routes/payments.routes.ts"));

  // ONE derivation exists, and it is what the MONEY reads.
  assert.match(
    routes,
    // Locked Decision 56: the one derivation reads the CART line's count through the shared
    // `cartLineUnitCount` (a per-booking place service is one unit, every other rule the row's own
    // `quantity || 1`), so the charge, the claim and the cart's own review read ONE rule.
    /export function resolveItemUnitCount\(item: any\): number \{\s*return cartLineUnitCount\(item\?\.service \?\? null, item\?\.quantity\);\s*\}/,
    "resolveItemUnitCount is the one derivation of a line's unit count",
  );
  assert.match(
    routes,
    /return rate \* resolveItemUnitCount\(item\);/,
    "resolveItemBaseAmount's non-stay branch multiplies by that derivation, not by a second spelling",
  );
  assert.doesNotMatch(
    routes,
    /rate \* \(item\?\.quantity \|\| 1\)/,
    "the inlined multiplier is gone — two spellings is how the charge and the claim drift apart",
  );

  // DERIVED, not a literal: read the identifier the non-stay claim binds from
  // `resolveItemUnitCount(item)` and require THAT identifier to be what `bookSlot` is handed. A
  // rename keeps passing; a second, differently-derived number does not.
  const bind = routes.match(/const (\w+) = resolveItemUnitCount\(item\);/);
  assert.ok(bind, "the checkout binds the line's unit count from the shared derivation");
  const unitsIdent = bind![1];
  assert.ok(
    new RegExp(`storage\\.bookSlot\\(itemSlotId,\\s*${unitsIdent}\\)`).test(routes),
    `the non-stay claim must pass ${unitsIdent} — the same number the charge multiplies by`,
  );

  // And no claim anywhere is left at the old fixed shape. DERIVED from the file, not from a count
  // of call sites: every `storage.bookSlot(` in this file is parsed for its own top-level argument
  // list, so a new claim site added tomorrow is checked too and a moved one still passes.
  const claimCalls = topLevelArgsOf(routes, "storage.bookSlot(");
  assert.ok(claimCalls.length > 0, "the checkout still claims through storage.bookSlot");
  for (const args of claimCalls) {
    assert.equal(
      args.length,
      2,
      `every bookSlot call names its unit count — a one-argument call is main's defect (saw: ${args.join(" | ")})`,
    );
  }
  const releaseCalls = topLevelArgsOf(routes, "storage.releaseSlot(");
  for (const args of releaseCalls) {
    assert.equal(args.length, 2, `every releaseSlot call names its unit count (saw: ${args.join(" | ")})`);
  }
});

test("S8: the stay branch claims 1 unit per NIGHT, deliberately and not by omission", () => {
  const routesRaw = src("server/routes/payments.routes.ts");
  const routes = stripLineComments(routesRaw);

  assert.match(
    routes,
    /const claimed = await storage\.bookSlot\(slotIdByDate\.get\(d\)!, 1\);/,
    "a stay claims one unit of each night's slot",
  );
  // The literal must be EXPLAINED where it sits, not left as a bare 1 for the next lane to widen:
  // a stay's charge is nights x the nightly rate, so the line's count would double-count the
  // nights it is already spread across (D-14 pins a stay's quantity to 1; legacy rows do not).
  const stayBlock = routesRaw.slice(
    Math.max(0, routesRaw.indexOf("const claimed = await storage.bookSlot(slotIdByDate.get(d)!, 1);") - 1200),
    routesRaw.indexOf("const claimed = await storage.bookSlot(slotIdByDate.get(d)!, 1);"),
  );
  assert.match(stayBlock, /NIGHT/i, "the reason the stay's count is 1 is stated beside the call");

  // The stay's release must agree with its claim: one unit per night, never the line's count.
  assert.match(
    routes,
    /claimedThisStay\.map\(\(id\) => \(\{ id, units: 1 \}\)\)/,
    "the stay's compensation release gives back exactly the one unit each night took",
  );
});
