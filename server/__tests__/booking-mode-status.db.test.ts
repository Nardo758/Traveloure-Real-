/**
 * Seller booking-mode prompt (ledger `2026-09-25-seller-booking-mode-prompt`). DB-backed.
 *   M1 the predicate: a listing's own mode, or an account flag of TRUE, is a choice; a NULL mode with
 *      no form, a NULL flag, or the column-default FALSE is not (nothing writes that flag today).
 *   M2 the owner status lists ONLY the session owner's approved+active listings, classifies each
 *      (chosen / undecided / quote), and never returns another seller's rows; an owner with none
 *      gets an empty list, not someone else's.
 *   M3 the bulk decide touches ONLY undecided, non-quote listings of that owner — a chosen listing,
 *      a custom-quote listing, a draft and another seller's undecided listing are all unchanged.
 *   M4 the admin summary counts move by exactly the seeded rows (instant chosen / request chosen /
 *      undecided / quote), and the pure summariser is correct on its own.
 *   M5 (HTTP, when a server is reachable) the owner read and the bulk decide refuse an anonymous
 *      caller with 401; the admin summary refuses one too (the §2 blanket guard).
 * Needs a disposable Postgres with migrations applied and JOURNEY_DB_WRITES_OK=1.
 * Run: npx tsx --test --test-force-exit server/__tests__/booking-mode-status.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { isBookingModeChosen } from "@shared/schema";
import {
  decideUndecidedBookingModes,
  loadBookingModeSummary,
  loadOwnerBookingModeStatus,
  summariseBookingModes,
} from "../services/booking-mode-status.service";

const RUN = crypto.randomUUID().slice(0, 8);
const expert = `bms-exp-${RUN}`; // no provider form ⇒ platform default
const provider = `bms-prov-${RUN}`; // provider form with the column-default false
const instantProvider = `bms-inst-${RUN}`; // provider form with instant_booking = true
const other = `bms-oth-${RUN}`;

const ids = {
  undecided1: `bms-u1-${RUN}`,
  undecided2: `bms-u2-${RUN}`,
  chosenInstant: `bms-ci-${RUN}`,
  chosenRequest: `bms-cr-${RUN}`,
  quote: `bms-q-${RUN}`,
  draft: `bms-d-${RUN}`,
  submitted: `bms-s-${RUN}`,
  provUndecided: `bms-pu-${RUN}`,
  instAccount: `bms-ia-${RUN}`,
  otherUndecided: `bms-ou-${RUN}`,
};

async function listing(
  id: string,
  userId: string,
  name: string,
  opts: { bookingMode?: string | null; priceType?: string; status?: string; approval?: string } = {},
) {
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, price_type, booking_mode, status, approval_status)
    VALUES (${id}, ${userId}, ${name}, '100', ${opts.priceType ?? "fixed"}, ${opts.bookingMode ?? null},
            ${opts.status ?? "active"}, ${opts.approval ?? "approved"})`);
}

async function modeOf(id: string): Promise<string | null> {
  const [row] = (await db.execute(sql`SELECT booking_mode FROM provider_services WHERE id = ${id}`) as any).rows;
  return row.booking_mode ?? null;
}

let summaryBefore: Awaited<ReturnType<typeof loadBookingModeSummary>>;

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  summaryBefore = await loadBookingModeSummary();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, role)
    VALUES (${expert}, ${expert + "@test.local"}, 'Ex', 'expert'),
           (${provider}, ${provider + "@test.local"}, 'Pr', 'service_provider'),
           (${instantProvider}, ${instantProvider + "@test.local"}, 'In', 'service_provider'),
           (${other}, ${other + "@test.local"}, 'Ot', 'expert')`);
  for (const [u, instant] of [[provider, null], [instantProvider, true]] as const) {
    await db.execute(sql`
      INSERT INTO service_provider_forms (id, user_id, business_name, name, email, mobile, country, address, business_type
        ${instant === null ? sql`` : sql`, instant_booking`})
      VALUES (${crypto.randomUUID()}, ${u}, 'Biz', 'Name', ${u + "@test.local"}, '000', 'JP', 'Addr', 'tour'
        ${instant === null ? sql`` : sql`, ${instant}`})`);
  }
  await listing(ids.undecided1, expert, "A undecided one");
  await listing(ids.undecided2, expert, "B undecided two");
  await listing(ids.chosenInstant, expert, "C chosen instant", { bookingMode: "instant" });
  await listing(ids.chosenRequest, expert, "D chosen request", { bookingMode: "request" });
  await listing(ids.quote, expert, "E custom quote", { priceType: "custom_quote" });
  await listing(ids.draft, expert, "F draft", { status: "draft" });
  await listing(ids.submitted, expert, "G in review", { approval: "submitted" });
  await listing(ids.provUndecided, provider, "H provider default-false");
  await listing(ids.instAccount, instantProvider, "I account instant");
  await listing(ids.otherUndecided, other, "J other seller undecided");
});

after(async () => {
  await db.execute(sql`DELETE FROM users WHERE id IN (${expert}, ${provider}, ${instantProvider}, ${other})`);
});

test("M1 the predicate counts a listing's own mode or a TRUE account flag, and nothing else", () => {
  assert.equal(isBookingModeChosen("instant", undefined), true);
  assert.equal(isBookingModeChosen("request", false), true);
  assert.equal(isBookingModeChosen("hidden", null), true);
  assert.equal(isBookingModeChosen(null, true), true, "account says instant booking");
  assert.equal(isBookingModeChosen(null, undefined), false, "no form row at all");
  assert.equal(isBookingModeChosen(null, null), false, "flag never answered");
  assert.equal(isBookingModeChosen(null, false), false, "the column default is not an answer");
  assert.equal(isBookingModeChosen("INSTANT", false), false, "an off-vocabulary value is not a declaration");
});

test("M2 the owner status is the owner's live listings only, classified by the server", async () => {
  const status = await loadOwnerBookingModeStatus(expert);
  const byId = new Map(status.listings.map((l) => [l.id, l]));
  assert.deepEqual(
    status.listings.map((l) => l.id).sort(),
    [ids.undecided1, ids.undecided2, ids.chosenInstant, ids.chosenRequest, ids.quote].sort(),
    "drafts and listings in review are not live; nobody else's rows appear",
  );
  assert.equal(byId.get(ids.undecided1)!.state, "undecided");
  assert.equal(byId.get(ids.undecided1)!.mode, "request", "platform default");
  assert.equal(byId.get(ids.chosenInstant)!.state, "chosen");
  assert.equal(byId.get(ids.chosenRequest)!.state, "chosen");
  assert.equal(byId.get(ids.quote)!.state, "quote");
  assert.equal(status.undecidedCount, 2);
  for (const l of status.listings) assert.deepEqual(Object.keys(l).sort(), ["id", "mode", "name", "state"]);

  const prov = await loadOwnerBookingModeStatus(provider);
  assert.equal(prov.listings[0].state, "undecided", "a default-false provider flag is not a choice");
  const inst = await loadOwnerBookingModeStatus(instantProvider);
  assert.equal(inst.listings[0].state, "chosen");
  assert.equal(inst.listings[0].mode, "instant");

  const nobody = await loadOwnerBookingModeStatus(`bms-none-${RUN}`);
  assert.deepEqual(nobody, { listings: [], undecidedCount: 0 });
  await assert.rejects(() => loadOwnerBookingModeStatus(""), /owner required/);
});

test("M4 the admin summary moves by exactly the seeded live rows", async () => {
  const after = await loadBookingModeSummary();
  const d = (k: keyof typeof after.all) => (after.all[k] as number) - (summaryBefore.all[k] as number);
  assert.equal(d("total"), 8, "8 seeded live listings (draft + in-review excluded)");
  assert.equal(d("instantChosen"), 2, "chosen instant + account instant");
  assert.equal(d("requestChosen"), 1);
  assert.equal(d("undecided"), 4, "two expert, one provider default-false, one other seller");
  assert.equal(d("undecidedResolvingRequest"), 4);
  assert.equal(d("quote"), 1);

  assert.deepEqual(
    summariseBookingModes([
      { mode: "instant", state: "chosen" },
      { mode: "request", state: "chosen" },
      { mode: "hidden", state: "chosen" },
      { mode: "request", state: "undecided" },
      { mode: "request", state: "quote" },
    ]),
    { total: 5, instantChosen: 1, requestChosen: 1, hiddenChosen: 1, undecided: 1, undecidedResolvingRequest: 1, quote: 1 },
  );
});

test("M3 the bulk decide touches only the owner's undecided, non-quote listings", async () => {
  const res = await decideUndecidedBookingModes(expert, "instant");
  assert.deepEqual(res.updatedIds.sort(), [ids.undecided1, ids.undecided2].sort());
  assert.equal(await modeOf(ids.undecided1), "instant");
  assert.equal(await modeOf(ids.undecided2), "instant");
  assert.equal(await modeOf(ids.chosenRequest), "request", "a chosen listing is never overwritten");
  assert.equal(await modeOf(ids.quote), null, "a custom-quote listing is never touched");
  assert.equal(await modeOf(ids.draft), null, "a draft is not part of the prompt");
  assert.equal(await modeOf(ids.otherUndecided), null, "another seller's listing is never touched");

  const status = await loadOwnerBookingModeStatus(expert);
  assert.equal(status.undecidedCount, 0);
  const again = await decideUndecidedBookingModes(expert, "request");
  assert.deepEqual(again.updatedIds, [], "a second press finds nothing undecided");
  assert.equal(await modeOf(ids.undecided1), "instant");

  const keep = await decideUndecidedBookingModes(provider, "request");
  assert.deepEqual(keep.updatedIds, [ids.provUndecided]);
  assert.equal(await modeOf(ids.provUndecided), "request", "Keep request records an explicit choice");
});

test("M5 anonymous callers are refused on every rail", async (t) => {
  const base = process.env.JOURNEY_BASE_URL;
  if (!base) return t.skip("no server (JOURNEY_BASE_URL unset)");
  const probe = async (method: string, path: string) =>
    (await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify({ mode: "instant" }) : undefined })).status;
  assert.equal(await probe("GET", "/api/me/listings/booking-mode-status"), 401);
  assert.equal(await probe("POST", "/api/me/listings/booking-mode/decide"), 401);
  assert.equal(await probe("GET", "/api/admin/listings/booking-mode-summary"), 401);
});
