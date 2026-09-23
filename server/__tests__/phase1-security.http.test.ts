/**
 * PHASE 1 SECURITY — the four holes the Sep 23 board audit confirmed (ledger
 * `2026-09-23-phase1-security`). HTTP proofs against the running app.
 *
 *   P1  #1678 — a booking request is written only by its CLAIMANT (or an admin). Another expert's
 *       PATCH is one 404 and changes nothing; an unclaimed request is claimed by the first write;
 *       the holder writes normally.
 *   P2  #502  — an EA adding a client by email creates an INVITATION: no account is linked, no
 *       account name leaks, and the EA cannot push to the person. Only that person, from their own
 *       session, can accept (someone else is refused); after accepting the EA sees their name, and
 *       the person can remove the EA again.
 *   P3  #1334 — `POST /api/cache/refresh` is admin-only.
 *   P4  #1545 — the Instagram callback refuses a `state` this session was not issued, before any
 *       token exchange, and the return path can never be pointed off-site.
 *
 * Run against a disposable dev database only, with the app started:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/phase1-security.http.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { bookingRequestWriteStanding } from "../services/booking-agent-claim.service";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

type Account = { id: string; email: string; cookie: string };
const accounts: Record<string, Account> = {};
const createdRequestIds: string[] = [];

async function register(label: string, role: string | null): Promise<Account> {
  const email = `p1sec-${RUN}-${label}@traveloure.test`;
  const response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "Phase", lastName: label }),
  });
  const text = await response.text();
  assert.equal(response.status, 201, text);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const id = (JSON.parse(text) as { user: { id: string } }).user.id;
  if (role) await pool.query(`UPDATE users SET role = $1 WHERE id = $2`, [role, id]);
  const account = { id, email, cookie };
  accounts[label] = account;
  return account;
}

async function call(who: Account | null, method: string, path: string, body?: unknown) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(who ? { cookie: who.cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text, location: response.headers.get("location") };
}

async function newRequest(expertId: string | null): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO affiliate_booking_requests (id, user_id, expert_id, item_name, partner_name, affiliate_url, status)
     VALUES ($1, $2, $3, 'Phase 1 fixture tour', 'Klook', 'https://partner.example.com/p1', 'pending')`,
    [id, accounts.traveler.id, expertId],
  );
  createdRequestIds.push(id);
  return id;
}

async function requestRow(id: string) {
  const r = await pool.query(`SELECT expert_id, expert_notes FROM affiliate_booking_requests WHERE id = $1`, [id]);
  return r.rows[0] as { expert_id: string | null; expert_notes: string | null };
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await register("traveler", null);
  await register("agentA", "local_expert");
  await register("agentB", "local_expert");
  await register("ea", "executive_assistant");
  await register("invitee", null);
  await register("stranger", null);
});

after(async () => {
  try {
    await pool.query(`DELETE FROM affiliate_booking_requests WHERE id = ANY($1)`, [createdRequestIds]);
    const ids = Object.values(accounts).map((a) => a.id);
    await pool.query(`DELETE FROM ea_client_relationships WHERE ea_user_id = ANY($1)`, [ids]);
    await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [ids]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
  } finally {
    await pool.end();
  }
});

test("P1a: the write standing is decided once — holder, admin, unclaimed, not yours", () => {
  assert.equal(bookingRequestWriteStanding({ actorUserId: "a", actorIsAdmin: false, holderUserId: "a" }), "holder");
  assert.equal(bookingRequestWriteStanding({ actorUserId: "b", actorIsAdmin: false, holderUserId: "a" }), "not_yours");
  assert.equal(bookingRequestWriteStanding({ actorUserId: "b", actorIsAdmin: false, holderUserId: null }), "unclaimed");
  assert.equal(bookingRequestWriteStanding({ actorUserId: "b", actorIsAdmin: true, holderUserId: "a" }), "admin");
});

test("P1b: another expert cannot write a request someone else claimed", async () => {
  const id = await newRequest(accounts.agentA.id);
  const refused = await call(accounts.agentB, "PATCH", `/api/affiliate-booking-requests/${id}`, { expertNotes: "hijacked" });
  assert.equal(refused.status, 404, refused.text);
  const row = await requestRow(id);
  assert.equal(row.expert_id, accounts.agentA.id, "the claim is untouched");
  assert.equal(row.expert_notes, null, "nothing was written");

  const holder = await call(accounts.agentA, "PATCH", `/api/affiliate-booking-requests/${id}`, { expertNotes: "mine" });
  assert.equal(holder.status, 200, holder.text);
  assert.equal((await requestRow(id)).expert_notes, "mine", "the holder still writes");
});

test("P1c: the first write to an unclaimed request claims it", async () => {
  const id = await newRequest(null);
  const first = await call(accounts.agentB, "PATCH", `/api/affiliate-booking-requests/${id}`, { expertNotes: "claimed by writing" });
  assert.equal(first.status, 200, first.text);
  const row = await requestRow(id);
  assert.equal(row.expert_id, accounts.agentB.id, "the writer now holds the claim");
  assert.equal(row.expert_notes, "claimed by writing");

  const late = await call(accounts.agentA, "PATCH", `/api/affiliate-booking-requests/${id}`, { expertNotes: "too late" });
  assert.equal(late.status, 404, late.text);
});

test("P2: adding an EA client is an invitation the person must accept", async () => {
  const { ea, invitee, stranger } = accounts;
  const added = await call(ea, "POST", "/api/ea/clients", { email: invitee.email });
  assert.equal(added.status, 201, added.text);
  assert.equal(added.json.clientUserId, null, "no account is linked by typing an email");
  assert.equal(added.json.displayName, invitee.email, "the name is what the EA typed, never the account's");
  const linkId = added.json.id as string;

  let roster = await call(ea, "GET", "/api/ea/clients");
  let mine = roster.json.find((row: any) => row.id === linkId);
  assert.equal(mine.userFirstName, null, "the EA sees no account data before acceptance");
  const push = await call(ea, "POST", `/api/ea/clients/${linkId}/push`, { title: "Hi", message: "Hello" });
  assert.equal(push.status, 409, "no push before acceptance");

  const pending = await call(invitee, "GET", "/api/me/ea-invitations");
  assert.equal(pending.status, 200, pending.text);
  assert.ok(pending.json.pending.some((row: any) => row.id === linkId), "the invitee sees the invitation");
  assert.deepEqual((await call(stranger, "GET", "/api/me/ea-invitations")).json.pending.filter((r: any) => r.id === linkId), []);

  const hijack = await call(stranger, "POST", `/api/me/ea-invitations/${linkId}/accept`);
  assert.equal(hijack.status, 404, "someone else cannot accept it");
  const accepted = await call(invitee, "POST", `/api/me/ea-invitations/${linkId}/accept`);
  assert.equal(accepted.status, 200, accepted.text);

  roster = await call(ea, "GET", "/api/ea/clients");
  mine = roster.json.find((row: any) => row.id === linkId);
  assert.equal(mine.clientUserId, invitee.id);
  assert.equal(mine.userLastName, "invitee", "after acceptance the EA sees the account");
  assert.equal((await call(ea, "POST", `/api/ea/clients/${linkId}/push`, { title: "Hi", message: "Hello" })).status, 200);

  const revoked = await call(invitee, "DELETE", `/api/me/ea-links/${linkId}`);
  assert.equal(revoked.status, 200, revoked.text);
  roster = await call(ea, "GET", "/api/ea/clients");
  assert.equal(roster.json.some((row: any) => row.id === linkId), false, "the person can remove the EA");
});

test("P3: a full cache refresh is admin-only", async () => {
  const refused = await call(accounts.traveler, "POST", "/api/cache/refresh");
  assert.equal(refused.status, 403, refused.text);
});

test("P4: the Instagram callback refuses a state this session was not issued", async () => {
  const forged = await call(accounts.agentA, "GET", "/api/instagram/callback?code=attacker-code&state=forged");
  assert.equal(forged.status, 302);
  assert.match(forged.location ?? "", /error=invalid_state/, "refused before any token exchange");

  const noState = await call(accounts.agentA, "GET", "/api/instagram/callback?code=attacker-code");
  assert.match(noState.location ?? "", /error=invalid_state/);

  const offsite = await call(accounts.agentA, "GET", "/api/instagram/authorize?returnTo=//evil.example/x");
  assert.equal(offsite.status, 302);
  assert.ok(!(offsite.location ?? "").includes("evil.example"), "the return path never leaves the site");
});
