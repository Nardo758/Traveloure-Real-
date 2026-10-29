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
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { deriveInviteSendState } from "../../shared/invite-send-state";
import { guestInviteExpiresAt, UNWINDOWED_EMAIL_TYPES } from "../services/email-outbox-expiry";
import { buildGuestLanding } from "../services/guest-invite-landing";
import { enqueueGuestInviteEmail } from "../services/email-outbox.service";
import { loadInviteSendStates } from "../services/invite-send-state";
import { INVITE_SEND_DEBOUNCE_MS, sendExperienceInvites } from "../services/guest-invite-send.service";

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
  await db.execute(sql`
    DELETE FROM email_outbox
    WHERE email_type = 'guest_invite'
      AND metadata->>'inviteId' LIKE ${`gis-${RUN}-%`}
  `);
  if (createdInviteIds.length > 0) {
    // invite_send_log cascades from event_invites.
    // T-8 (ledger `2026-09-15-orphans-t8-t9-server-tests-class`): `ANY(${array})` interpolated as a
    // PARENTHESISED PARAMETER LIST — `ANY(($1, $2, …))` — which is not valid SQL, so this after()
    // hook threw and failed the file even though all six proofs had passed. `sql.join` builds the
    // `IN (…)` list explicitly. No assertion changed.
    await db.execute(
      sql`DELETE FROM event_invites WHERE id IN (${sql.join(createdInviteIds.map((id) => sql`${id}`), sql`, `)})`,
    );
  }
  await db.execute(sql`DELETE FROM user_experiences WHERE id IN (${ids.experience}, ${ids.otherExperience})`);
  await db.execute(sql`DELETE FROM user_experiences WHERE id LIKE ${`gis-${RUN}-s7-%`}`);
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`gis-${RUN}-tz-%`}`);
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

// ── Row 207 (S1–S8). The organizer read derives send state. Nothing below edits a pinned assertion. ──

async function insertOutbox(inviteId: string, status: string, toEmail = "guest@example.invalid"): Promise<number> {
  const inserted = await db.execute(sql`
    INSERT INTO email_outbox (email_type, to_email, subject, html, status, metadata)
    VALUES (
      'guest_invite',
      ${toEmail},
      'Invite',
      '<p>invite</p>',
      ${status},
      jsonb_build_object('inviteId', ${inviteId}::text)
    )
    RETURNING id
  `);
  return Number((inserted.rows[0] as { id: unknown }).id);
}

async function sendStateOf(experienceId: string, inviteId: string): Promise<string> {
  const states = await loadInviteSendStates(experienceId);
  const state = states.get(inviteId);
  assert.ok(state, `organizer read has no state for ${inviteId}`);
  return state;
}

async function outboxFor(inviteId: string): Promise<Array<{ id: number; status: string; to_email: string; expires_at: Date | string | null }>> {
  const result = await db.execute(sql`
    SELECT id, status, to_email, expires_at
    FROM email_outbox
    WHERE email_type = 'guest_invite'
      AND metadata->>'inviteId' = ${inviteId}
    ORDER BY id ASC
  `);
  return (result.rows ?? []) as Array<{ id: number; status: string; to_email: string; expires_at: Date | string | null }>;
}

function instantIso(value: Date | string | null): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

test("S1 — not_sent when no log row", async () => {
  const inviteId = await makeInvite({});
  assert.equal(await sendStateOf(ids.experience, inviteId), "not_sent");

  const routes = fs.readFileSync("server/routes/guest-invites.ts", "utf8");
  assert.ok(routes.includes("loadInviteSendStates("), "the organizer list read derives send state");
  assert.ok(routes.includes("sendState:"), "each invite carries the derived code");
  assert.equal(deriveInviteSendState({
    hasLog: false,
    logStatus: null,
    outboxId: null,
    pointedStatus: null,
    unpointedStatuses: ["sent"],
  }), "not_sent");
});

test("S2 — held when the outbox row is held", async () => {
  const pointed = await makeInvite({});
  const outboxId = await insertOutbox(pointed, "held");
  await storage.recordInviteSendLog({
    inviteId: pointed,
    method: "email",
    recipientAddress: `${pointed}@example.invalid`,
    status: "sent",
    outboxId,
  });
  assert.equal(await sendStateOf(ids.experience, pointed), "held");

  const unpointed = await makeInvite({});
  await insertOutbox(unpointed, "held");
  await storage.recordInviteSendLog({
    inviteId: unpointed,
    method: "email",
    recipientAddress: `${unpointed}@example.invalid`,
    status: "sent",
  });
  assert.equal(await sendStateOf(ids.experience, unpointed), "held");
});

test("S3 — sent only when the outbox row is sent", async () => {
  const sentId = await makeInvite({});
  const sentOutbox = await insertOutbox(sentId, "sent");
  await storage.recordInviteSendLog({
    inviteId: sentId,
    method: "email",
    recipientAddress: `${sentId}@example.invalid`,
    status: "sent",
    outboxId: sentOutbox,
  });
  assert.equal(await sendStateOf(ids.experience, sentId), "sent");

  for (const status of ["processing", "pending", "held", "failed", "dead", "cancelled"]) {
    const inviteId = await makeInvite({});
    const id = await insertOutbox(inviteId, status);
    await storage.recordInviteSendLog({
      inviteId,
      method: "email",
      recipientAddress: `${inviteId}@example.invalid`,
      status: "sent",
      outboxId: id,
    });
    const state = await sendStateOf(ids.experience, inviteId);
    assert.notEqual(state, "sent", status);
    if (status === "processing" || status === "pending") assert.equal(state, "not_sent", status);
    if (status === "held") assert.equal(state, "held", status);
    if (status === "failed" || status === "dead" || status === "cancelled") assert.equal(state, "failed", status);
  }
});

test("S4 — failed", async () => {
  const failedId = await makeInvite({});
  const failedOutbox = await insertOutbox(failedId, "failed");
  await storage.recordInviteSendLog({
    inviteId: failedId,
    method: "email",
    recipientAddress: `${failedId}@example.invalid`,
    status: "sent",
    outboxId: failedOutbox,
  });
  assert.equal(await sendStateOf(ids.experience, failedId), "failed");

  const deadId = await makeInvite({});
  const deadOutbox = await insertOutbox(deadId, "dead");
  await storage.recordInviteSendLog({
    inviteId: deadId,
    method: "email",
    recipientAddress: `${deadId}@example.invalid`,
    status: "failed",
    outboxId: deadOutbox,
  });
  assert.equal(await sendStateOf(ids.experience, deadId), "failed");

  const enqueueFailed = await makeInvite({});
  await storage.recordInviteSendLog({
    inviteId: enqueueFailed,
    method: "email",
    recipientAddress: `${enqueueFailed}@example.invalid`,
    status: "failed",
    errorMessage: "outbox did not accept the message",
  });
  assert.equal(await sendStateOf(ids.experience, enqueueFailed), "failed");
});

test("S5 — old log row with null outbox_id never reads as sent", async () => {
  const bare = await makeInvite({});
  await storage.recordInviteSendLog({
    inviteId: bare,
    method: "email",
    recipientAddress: `${bare}@example.invalid`,
    status: "sent",
  });
  assert.equal(await sendStateOf(ids.experience, bare), "not_sent");

  const withSentRow = await makeInvite({});
  await insertOutbox(withSentRow, "sent");
  await storage.recordInviteSendLog({
    inviteId: withSentRow,
    method: "email",
    recipientAddress: `${withSentRow}@example.invalid`,
    status: "sent",
  });
  assert.equal(await sendStateOf(ids.experience, withSentRow), "not_sent");
  const log = await db.execute(sql`
    SELECT outbox_id FROM invite_send_log WHERE invite_id = ${withSentRow}
  `);
  assert.equal((log.rows[0] as { outbox_id: unknown }).outbox_id, null);
});

test("S6 — re-click creates no second outbox row, re-addresses the existing one, and leaves a sent row alone", async () => {
  const inviteId = await makeInvite({});
  const first = await sendExperienceInvites({
    experienceId: ids.experience,
    organizerId: ids.owner,
    inviteIds: [inviteId],
  });
  assert.equal(first.ok, true);
  assert.equal(first.ok && first.results[0].outcome, "enqueued");

  const again = await sendExperienceInvites({
    experienceId: ids.experience,
    organizerId: ids.owner,
    inviteIds: [inviteId],
  });
  assert.equal(again.ok && again.results[0].outcome, "skipped_recently_sent");
  assert.equal((await outboxFor(inviteId)).length, 1);

  await db.execute(sql`
    UPDATE email_outbox
    SET status = 'held'
    WHERE email_type = 'guest_invite' AND metadata->>'inviteId' = ${inviteId}
  `);
  const next = `next-${inviteId}@example.invalid`;
  await db.execute(sql`
    UPDATE event_invites
    SET guest_email = ${next},
        invite_sent_at = NOW() - INTERVAL '6 minutes'
    WHERE id = ${inviteId}
  `);
  const readdressed = await sendExperienceInvites({
    experienceId: ids.experience,
    organizerId: ids.owner,
    inviteIds: [inviteId],
  });
  assert.equal(readdressed.ok && readdressed.results[0].outcome, "enqueued");
  const rows = await outboxFor(inviteId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].to_email, next);
  assert.equal(rows[0].status, "held");

  const logs = await db.execute(sql`
    SELECT recipient_address, outbox_id FROM invite_send_log WHERE invite_id = ${inviteId}
  `);
  assert.equal(logs.rows.length, 1, "a re-click updates the log row");
  assert.equal((logs.rows[0] as { recipient_address: string }).recipient_address, next);
  assert.equal(Number((logs.rows[0] as { outbox_id: unknown }).outbox_id), Number(rows[0].id));

  const kept = rows[0].to_email;
  await db.execute(sql`
    UPDATE email_outbox SET status = 'sent' WHERE id = ${rows[0].id}
  `);
  const third = `third-${inviteId}@example.invalid`;
  await db.execute(sql`
    UPDATE event_invites
    SET guest_email = ${third},
        invite_sent_at = NOW() - INTERVAL '6 minutes'
    WHERE id = ${inviteId}
  `);
  const left = await sendExperienceInvites({
    experienceId: ids.experience,
    organizerId: ids.owner,
    inviteIds: [inviteId],
  });
  assert.equal(left.ok && left.results[0].outcome, "already_sent");
  const afterSent = await outboxFor(inviteId);
  assert.equal(afterSent.length, 1);
  assert.equal(afterSent[0].to_email, kept);
  assert.equal(afterSent[0].status, "sent");
  const logsAfter = await db.execute(sql`SELECT id FROM invite_send_log WHERE invite_id = ${inviteId}`);
  assert.equal(logsAfter.rows.length, 1);

  const ambiguousId = await makeInvite({});
  await insertOutbox(ambiguousId, "held", "one@example.invalid");
  await insertOutbox(ambiguousId, "failed", "two@example.invalid");
  const ambiguous = await enqueueGuestInviteEmail({
    toEmail: "three@example.invalid",
    inviteId: ambiguousId,
    experienceId: ids.experience,
    email: {
      guestName: "Guest",
      eventTitle: "Fixture",
      eventLocation: "Kyoto",
      eventDate: "October 11, 2026",
      inviteLink: "https://traveloure.com/invite/ambiguous",
    },
  });
  assert.equal(ambiguous && ambiguous.action, "ambiguous");
  const ambiguousRows = await outboxFor(ambiguousId);
  assert.equal(ambiguousRows.length, 2);
  assert.deepEqual(ambiguousRows.map((row) => row.to_email), ["one@example.invalid", "two@example.invalid"]);
});

test("S7 — enqueue sets expires_at = rsvp_by when set, else the event date", async () => {
  assert.ok(UNWINDOWED_EMAIL_TYPES.includes("guest_invite"));
  assert.equal(guestInviteExpiresAt("2026-11-01", "2026-10-11")?.toISOString(), "2026-11-02T00:00:00.000Z");
  assert.equal(guestInviteExpiresAt(null, "2026-10-11")?.toISOString(), "2026-10-12T00:00:00.000Z");
  assert.equal(guestInviteExpiresAt(null, null), null);

  const withRsvpId = `gis-${RUN}-s7-rsvp`;
  await db.execute(sql`
    INSERT INTO user_experiences (id, user_id, experience_type_id, title, location, event_date, rsvp_by)
    VALUES (${withRsvpId}, ${ids.owner}, ${ids.experienceType}, 'S7 rsvp', 'Kyoto, Japan', '2026-10-11', '2026-11-01')
  `);
  const rsvpInvite = await makeInvite({ experienceId: withRsvpId });
  const rsvpSend = await sendExperienceInvites({
    experienceId: withRsvpId,
    organizerId: ids.owner,
    inviteIds: [rsvpInvite],
  });
  assert.equal(rsvpSend.ok && rsvpSend.results[0].outcome, "enqueued");
  const withRsvp = await outboxFor(rsvpInvite);
  assert.equal(withRsvp.length, 1);
  assert.equal(instantIso(withRsvp[0].expires_at), "2026-11-02T00:00:00.000Z");

  const eventOnlyId = `gis-${RUN}-s7-event`;
  await db.execute(sql`
    INSERT INTO user_experiences (id, user_id, experience_type_id, title, location, event_date)
    VALUES (${eventOnlyId}, ${ids.owner}, ${ids.experienceType}, 'S7 event', 'Kyoto, Japan', '2026-10-11')
  `);
  const eventInvite = await makeInvite({ experienceId: eventOnlyId });
  const eventSend = await sendExperienceInvites({
    experienceId: eventOnlyId,
    organizerId: ids.owner,
    inviteIds: [eventInvite],
  });
  assert.equal(eventSend.ok && eventSend.results[0].outcome, "enqueued");
  const withEvent = await outboxFor(eventInvite);
  assert.equal(withEvent.length, 1);
  assert.equal(instantIso(withEvent[0].expires_at), "2026-10-12T00:00:00.000Z");

  const openId = `gis-${RUN}-s7-open`;
  await db.execute(sql`
    INSERT INTO user_experiences (id, user_id, experience_type_id, title)
    VALUES (${openId}, ${ids.owner}, ${ids.experienceType}, 'S7 open')
  `);
  const openInvite = await makeInvite({ experienceId: openId });
  const openSend = await sendExperienceInvites({
    experienceId: openId,
    organizerId: ids.owner,
    inviteIds: [openInvite],
  });
  assert.equal(openSend.ok && openSend.results[0].outcome, "enqueued");
  const openRows = await outboxFor(openInvite);
  assert.equal(openRows.length, 1);
  assert.equal(openRows[0].expires_at, null);
});

test("expires at the end of the rsvp day in Asia/Tokyo", async () => {
  assert.equal(
    guestInviteExpiresAt("2026-11-01", "2026-10-11", "Asia/Tokyo")?.toISOString(),
    "2026-11-01T15:00:00.000Z",
  );
  assert.equal(
    guestInviteExpiresAt(null, "2026-11-01", "Asia/Tokyo")?.toISOString(),
    "2026-11-01T15:00:00.000Z",
  );

  const tripId = `gis-${RUN}-tz-kyoto`;
  const expId = `gis-${RUN}-s7-tokyo`;
  await db.execute(sql`
    INSERT INTO trips (id, user_id, destination, start_date, end_date, timezone)
    VALUES (${tripId}, ${ids.owner}, 'Kyoto', '2026-11-01', '2026-11-03', 'Asia/Tokyo')
  `);
  await db.execute(sql`
    INSERT INTO user_experiences (id, user_id, experience_type_id, title, event_date, rsvp_by, trip_id)
    VALUES (${expId}, ${ids.owner}, ${ids.experienceType}, 'Kyoto ceremony', '2026-10-11', '2026-11-01', ${tripId})
  `);
  const inviteId = await makeInvite({ experienceId: expId });
  const sent = await sendExperienceInvites({
    experienceId: expId,
    organizerId: ids.owner,
    inviteIds: [inviteId],
  });
  assert.equal(sent.ok && sent.results[0].outcome, "enqueued");
  const rows = await outboxFor(inviteId);
  assert.equal(rows.length, 1);
  assert.equal(instantIso(rows[0].expires_at), "2026-11-01T15:00:00.000Z");
});

test("America/New_York expires at the local end of the day, not UTC midnight", () => {
  const at = guestInviteExpiresAt("2026-06-15", "2026-11-01", "America/New_York");
  assert.equal(at?.toISOString(), "2026-06-16T04:00:00.000Z");
  assert.notEqual(at?.toISOString(), "2026-06-16T00:00:00.000Z");
});

test("absent or unusable zone falls back to the next UTC day", () => {
  const utc = "2026-11-02T00:00:00.000Z";
  for (const zone of [null, undefined, "", "Mars/Phobos"]) {
    assert.equal(guestInviteExpiresAt("2026-11-01", "2026-10-11", zone)?.toISOString(), utc, String(zone));
  }
  assert.equal(guestInviteExpiresAt(null, "2026-10-11", "Not/AZone")?.toISOString(), "2026-10-12T00:00:00.000Z");
});

test("S8 — landing.hasVenueAddress is true only when venue_address is set", () => {
  const pending = buildGuestLanding({ venueAddress: "12 Garden Lane", rsvpStatus: "pending", title: "Maya" });
  assert.equal(pending.hasVenueAddress, true);
  assert.equal("venueAddress" in pending, false);
  assert.deepEqual(Object.keys(pending).sort(), ["hasVenueAddress", "title"]);

  const accepted = buildGuestLanding({ venueAddress: "12 Garden Lane", rsvpStatus: "accepted" });
  assert.equal(accepted.hasVenueAddress, true);
  assert.equal(accepted.venueAddress, "12 Garden Lane");

  for (const blank of [null, undefined, "", "   "]) {
    const result = buildGuestLanding({ venueAddress: blank as string | null, title: "Maya" });
    assert.equal("hasVenueAddress" in result, false, JSON.stringify(blank));
    assert.equal("venueAddress" in result, false, JSON.stringify(blank));
  }
  assert.deepEqual(buildGuestLanding({}), {});

  const full = buildGuestLanding({
    title: "Maya & Sam",
    eventDate: "2026-11-20",
    startTime: "18:30",
    location: "The Garden Hall",
    hostNote: "Dress warmly.",
    rsvpBy: "2026-11-01",
    venueAddress: "12 Garden Lane",
    hostFirstName: "Maya",
    marketSlug: "kyoto",
    tripTimezone: "Asia/Tokyo",
    rsvpStatus: "accepted",
    budget: "5000",
  } as any);
  assert.deepEqual(Object.keys(full).sort(), [
    "area", "eventDate", "hasVenueAddress", "hostFirstName", "hostNote", "rsvpBy",
    "startTime", "timezone", "title", "venue", "venueAddress",
  ]);
});
