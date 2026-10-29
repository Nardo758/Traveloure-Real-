/**
 * Ledger `2026-10-29-rsvp-accommodation-by-answer`, against the running app.
 *
 *   H1  "maybe" and "declined" with no accommodation answer 200 and leave the stored column as it was
 *   H2  "accepted" with no accommodation answers 400 naming accommodationPreference, and writes nothing
 *   H3  "accepted" with a choice answers 200 and stores it
 *   H4  "maybe" carrying an accommodation value answers 400 naming the field
 *
 * Run against a disposable dev database only, with the app started:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/rsvp-accommodation-by-answer.http.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const HOST_EMAIL = `rsvp-acc-host-${RUN}@traveloure.test`;

let hostId = "";
const tokens: Record<string, string> = {};

async function call(method: string, path: string, cookie: string | null, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json };
}

async function stored(token: string) {
  const r = await pool.query(
    `SELECT rsvp_status, accommodation_preference FROM event_invites WHERE unique_token = $1`,
    [token],
  );
  return r.rows[0];
}

before(async () => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") throw new Error("set JOURNEY_DB_WRITES_OK=1 against a disposable database");
  const host = await registerAndSignIn({ baseUrl: BASE_URL, email: HOST_EMAIL, password: "TestPass123!", firstName: "Rsvp", lastName: "Host" });
  hostId = host.id;
  const trip = await call("POST", "/api/trips", host.cookie, { title: "RSVP accommodation", destination: "Kyoto, Japan", startDate: "2027-04-09", endDate: "2027-04-12" });
  assert.ok(trip.status < 300, `trip ${trip.status}`);
  const et = await pool.query(`SELECT id FROM experience_types ORDER BY slug LIMIT 1`);
  const ux = await call("POST", "/api/user-experiences", host.cookie, { experienceTypeId: et.rows[0].id, tripId: trip.json.id, title: "Garden ceremony" });
  assert.ok(ux.status < 300, `experience ${ux.status}`);
  const names = ["maybe", "declined", "acceptedBare", "acceptedChoice", "maybeWithValue"];
  const made = await call("POST", `/api/events/${ux.json.id}/invites`, host.cookie, {
    guests: names.map((n) => ({ name: `rsvp-acc-${n}-${RUN}`, email: `rsvp-acc-${n}-${RUN}@example.test` })),
  });
  assert.ok(made.status < 300, `invites ${made.status}`);
  const rows = await pool.query(`SELECT guest_name, unique_token FROM event_invites WHERE experience_id = $1`, [ux.json.id]);
  for (const row of rows.rows) tokens[row.guest_name.replace(`rsvp-acc-`, "").replace(`-${RUN}`, "")] = row.unique_token;
  assert.deepEqual(Object.keys(tokens).sort(), [...names].sort());
});

after(async () => {
  if (hostId) {
    await pool.query(`DELETE FROM event_invites WHERE organizer_id = $1`, [hostId]).catch(() => {});
    await pool.query(`DELETE FROM user_experiences WHERE user_id = $1`, [hostId]).catch(() => {});
    await pool.query(`DELETE FROM trips WHERE user_id = $1`, [hostId]).catch(() => {});
  }
  await pool.end();
});

test("H1 maybe and declined with no accommodation answer 200 and store nothing for it", async () => {
  for (const answer of ["maybe", "declined"]) {
    const before = await stored(tokens[answer]);
    const r = await call("POST", `/api/invites/${tokens[answer]}/rsvp`, null, { rsvpStatus: answer, numberOfGuests: 1, dietaryRestrictions: [], transportationNeeded: false, message: "" });
    assert.equal(r.status, 200, `${answer}: ${JSON.stringify(r.json)}`);
    assert.equal(r.json.invite.rsvpStatus, answer);
    assert.equal("accommodationPreference" in r.json.invite, false, "the guest projection is unchanged");
    const after = await stored(tokens[answer]);
    assert.equal(after.rsvp_status, answer);
    assert.equal(after.accommodation_preference, before.accommodation_preference, "the column is not written");
  }
});

test("H2 accepted with no accommodation answers 400 naming the field and writes nothing", async () => {
  const r = await call("POST", `/api/invites/${tokens.acceptedBare}/rsvp`, null, { rsvpStatus: "accepted", numberOfGuests: 1 });
  assert.equal(r.status, 400);
  assert.deepEqual(r.json.details.map((d: any) => d.path.join(".")), ["accommodationPreference"]);
  assert.equal((await stored(tokens.acceptedBare)).rsvp_status, "pending");
});

test("H3 accepted with a choice answers 200 and stores it", async () => {
  const r = await call("POST", `/api/invites/${tokens.acceptedChoice}/rsvp`, null, { rsvpStatus: "accepted", accommodationPreference: "own_booking" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const row = await stored(tokens.acceptedChoice);
  assert.equal(row.rsvp_status, "accepted");
  assert.equal(row.accommodation_preference, "own_booking");
});

test("H4 maybe carrying an accommodation value answers 400 naming the field", async () => {
  const r = await call("POST", `/api/invites/${tokens.maybeWithValue}/rsvp`, null, { rsvpStatus: "maybe", accommodationPreference: "hotel_block" });
  assert.equal(r.status, 400);
  assert.deepEqual(r.json.details.map((d: any) => d.path.join(".")), ["accommodationPreference"]);
  assert.equal((await stored(tokens.maybeWithValue)).rsvp_status, "pending");
});
