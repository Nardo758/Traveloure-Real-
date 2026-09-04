/**
 * GUEST INVITE SEND — the SQL half (ledger `2026-09-04-invite-mailer`).
 *
 * ── EXECUTION STATUS (read this before citing it as evidence) ────────────────────────────────
 *
 * BENCH-ONLY, and **NOT EXECUTED** by the lane that wrote it. It needs a real Postgres —
 * `DATABASE_URL` pointing at a DISPOSABLE dev/CI database — and the environment that lane ran in
 * had none. Nothing here is skipped to manufacture a green run: with no `DATABASE_URL` the module
 * cannot even load (`server/db.ts` throws by design), and the file fails loudly rather than
 * reporting a pass it did not earn.
 *
 * The decision logic this file's SQL sits under IS proven, with no database, in
 * `server/__tests__/guest-invite-mailer.test.ts` (M1–M8, 25/25). What is proven ONLY here is the
 * part a fake cannot vouch for: that the claim's row lock and its `organizer_id` predicate behave
 * as claimed against a real engine.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run:
 *   DATABASE_URL=postgresql://…/traveloure_test npx tsx --test server/__tests__/guest-invite-send.db.test.ts
 *
 *   G1  the claim is organizer-scoped AT THE DB — a non-owner matches zero rows
 *   G2  the claim is experience-scoped — a foreign invite id matches zero rows
 *   G3  two CONCURRENT claims on one invite: exactly one wins (the row lock, not a pre-check)
 *   G4  a claim outside the debounce window succeeds and reports the value it replaced
 *   G5  releaseInviteSendClaim restores the previous value, and only for its own claim
 *   G6  invite_send_log rows are written and read back by experience
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { INVITE_SEND_DEBOUNCE_MS } from "../services/guest-invite-send.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `gis-${RUN}-owner`,
  stranger: `gis-${RUN}-stranger`,
  experience: `gis-${RUN}-exp`,
  otherExperience: `gis-${RUN}-exp2`,
  experienceType: `gis-${RUN}-type`,
};
const createdInviteIds: string[] = [];

// ── Disposable-DB guard (mirrors booking-birth-provenance.db.test.ts; never defaults open) ─────
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
      `[guest-invite-send] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function makeInvite(opts: {
  organizerId?: string;
  experienceId?: string;
  sentAt?: Date | null;
}): Promise<string> {
  const id = `gis-${RUN}-inv-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO event_invites (id, experience_id, organizer_id, guest_email, guest_name, unique_token, invite_sent_at)
    VALUES (
      ${id},
      ${opts.experienceId ?? ids.experience},
      ${opts.organizerId ?? ids.owner},
      ${`${id}@example.invalid`},
      'Fixture Guest',
      ${`tok-${id}`},
      ${opts.sentAt ?? null}
    )
  `);
  createdInviteIds.push(id);
  return id;
}

before(async () => {
  await assertDisposableDb();

  for (const userId of [ids.owner, ids.stranger]) {
    await db.execute(sql`
      INSERT INTO users (id, email) VALUES (${userId}, ${`${userId}@example.invalid`})
      ON CONFLICT (id) DO NOTHING
    `);
  }

  // A NON-hidden occasion type: the send-refusal path for `hidden` is a decision, proven without
  // a database in guest-invite-mailer.test.ts M3.
  await db.execute(sql`
    INSERT INTO experience_types (id, name, slug, default_visibility)
    VALUES (${ids.experienceType}, ${`GIS ${RUN}`}, ${`gis-${RUN}`}, 'shown')
    ON CONFLICT (id) DO NOTHING
  `);

  for (const expId of [ids.experience, ids.otherExperience]) {
    await db.execute(sql`
      INSERT INTO user_experiences (id, user_id, experience_type_id, title, location, event_date)
      VALUES (${expId}, ${ids.owner}, ${ids.experienceType}, 'Fixture Occasion', 'Kyoto, Japan', '2026-10-11')
      ON CONFLICT (id) DO NOTHING
    `);
  }
});

after(async () => {
  if (createdInviteIds.length > 0) {
    // invite_send_log cascades from event_invites.
    await db.execute(sql`DELETE FROM event_invites WHERE id = ANY(${createdInviteIds})`);
  }
  await db.execute(sql`DELETE FROM user_experiences WHERE id IN (${ids.experience}, ${ids.otherExperience})`);
  await db.execute(sql`DELETE FROM experience_types WHERE id = ${ids.experienceType}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.stranger})`);
});

// ── G1 ────────────────────────────────────────────────────────────────────────────────────────

test("G1 — the claim is organizer-scoped at the DB: a non-owner matches zero rows", async () => {
  const inviteId = await makeInvite({});
  const now = new Date();

  const claim = await storage.claimInviteSend({
    inviteId,
    experienceId: ids.experience,
    organizerId: ids.stranger, // not this row's organizer
    notSentSince: new Date(now.getTime() - INVITE_SEND_DEBOUNCE_MS),
    claimedAt: now,
  });

  assert.equal(claim, null, "a stranger must not claim another host's invite");

  const after = await db.execute(sql`SELECT invite_sent_at FROM event_invites WHERE id = ${inviteId}`);
  assert.equal((after.rows[0] as any).invite_sent_at, null, "and must not have stamped it");
});

// ── G2 ────────────────────────────────────────────────────────────────────────────────────────

test("G2 — the claim is experience-scoped: an invite from another event matches zero rows", async () => {
  const inviteId = await makeInvite({ experienceId: ids.otherExperience });
  const now = new Date();

  const claim = await storage.claimInviteSend({
    inviteId,
    experienceId: ids.experience, // the route's :experienceId, not this invite's
    organizerId: ids.owner,
    notSentSince: new Date(now.getTime() - INVITE_SEND_DEBOUNCE_MS),
    claimedAt: now,
  });

  assert.equal(claim, null);
});

// ── G3 ────────────────────────────────────────────────────────────────────────────────────────

test("G3 — two concurrent claims on one invite: exactly ONE wins", async () => {
  const inviteId = await makeInvite({});
  const now = new Date();
  const notSentSince = new Date(now.getTime() - INVITE_SEND_DEBOUNCE_MS);

  // Fired together on purpose: the row lock inside claimInviteSend is what serialises these. A
  // check-then-update would let both through, which is the bug this shape exists to prevent.
  const [a, b] = await Promise.all([
    storage.claimInviteSend({ inviteId, experienceId: ids.experience, organizerId: ids.owner, notSentSince, claimedAt: now }),
    storage.claimInviteSend({ inviteId, experienceId: ids.experience, organizerId: ids.owner, notSentSince, claimedAt: now }),
  ]);

  const winners = [a, b].filter((c) => c !== null);
  assert.equal(winners.length, 1, "a double click must claim exactly once");
});

// ── G4 ────────────────────────────────────────────────────────────────────────────────────────

test("G4 — a claim outside the debounce window succeeds and reports the value it replaced", async () => {
  const earlier = new Date(Date.now() - INVITE_SEND_DEBOUNCE_MS - 60_000);
  const inviteId = await makeInvite({ sentAt: earlier });
  const now = new Date();

  const claim = await storage.claimInviteSend({
    inviteId,
    experienceId: ids.experience,
    organizerId: ids.owner,
    notSentSince: new Date(now.getTime() - INVITE_SEND_DEBOUNCE_MS),
    claimedAt: now,
  });

  assert.ok(claim, "a deliberate re-send after the window is allowed");
  assert.ok(claim!.previousSentAt, "the replaced timestamp is reported so it can be restored");
  assert.equal(
    Math.abs(+claim!.previousSentAt! - +earlier) < 1000,
    true,
    "and it is the value that was actually there",
  );

  // Immediately again: now inside the window, so refused.
  const again = await storage.claimInviteSend({
    inviteId,
    experienceId: ids.experience,
    organizerId: ids.owner,
    notSentSince: new Date(Date.now() - INVITE_SEND_DEBOUNCE_MS),
    claimedAt: new Date(),
  });
  assert.equal(again, null);
});

// ── G5 ────────────────────────────────────────────────────────────────────────────────────────

test("G5 — release restores the previous value, and only for its own claim", async () => {
  const earlier = new Date(Date.now() - INVITE_SEND_DEBOUNCE_MS - 60_000);
  const inviteId = await makeInvite({ sentAt: earlier });
  const claimedAt = new Date();

  const claim = await storage.claimInviteSend({
    inviteId,
    experienceId: ids.experience,
    organizerId: ids.owner,
    notSentSince: new Date(claimedAt.getTime() - INVITE_SEND_DEBOUNCE_MS),
    claimedAt,
  });
  assert.ok(claim);

  // A release quoting the WRONG claim timestamp changes nothing — it cannot roll back a send it
  // did not make.
  await storage.releaseInviteSendClaim(inviteId, new Date(claimedAt.getTime() - 5_000), null);
  const mid = await db.execute(sql`SELECT invite_sent_at FROM event_invites WHERE id = ${inviteId}`);
  assert.ok(
    Math.abs(+new Date((mid.rows[0] as any).invite_sent_at) - +claimedAt) < 1000,
    "a foreign release is a no-op",
  );

  await storage.releaseInviteSendClaim(inviteId, claimedAt, claim!.previousSentAt);
  const done = await db.execute(sql`SELECT invite_sent_at FROM event_invites WHERE id = ${inviteId}`);
  assert.ok(
    Math.abs(+new Date((done.rows[0] as any).invite_sent_at) - +earlier) < 1000,
    "the earlier real send is restored, not erased",
  );
});

// ── G6 ────────────────────────────────────────────────────────────────────────────────────────

test("G6 — invite_send_log rows are written and read back by experience", async () => {
  const inviteId = await makeInvite({});

  await storage.recordInviteSendLog({
    inviteId,
    method: "email",
    recipientAddress: `${inviteId}@example.invalid`,
    status: "sent",
    errorMessage: null,
  });

  const log = await storage.getSendLogByExperience(ids.experience);
  const mine = log.filter((r) => r.inviteId === inviteId);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].status, "sent");
  assert.equal(mine[0].method, "email");
  // Delivery is NOT observed by this platform: these stay NULL rather than being guessed.
  assert.equal(mine[0].openedAt, null);
  assert.equal(mine[0].clickedAt, null);
});
