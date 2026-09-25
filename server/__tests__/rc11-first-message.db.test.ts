/**
 * rc11-first-message.db.test.ts — AUDIT RC-11: A TRAVELER CAN SEND THE FIRST MESSAGE.
 *
 * (ledger `2026-09-25-rc11-first-message`; `docs/audits/GAP_REGISTER.md` §A RC-11; CLAUDE.md Locked
 *  Decision 40, §13, §14.)
 *
 * The storefront's "Message" opens `/chat` with the opaque id `POST /api/conversations/start` just
 * returned. That rail records the thread's `conversation_contexts` row and sends nothing unless the
 * traveler typed an `about`, so the thread has NO message yet — and the send rail resolved a public
 * id only against threads that already had messages. The first send was a 404.
 *
 *   F1  a thread opened by the start rail (context row, no message) resolves for the OPENER
 *   F2  ...and for the other party, with each seeing the other as the counterpart
 *   F3  a STRANGER holding the same public id resolves nothing (still no oracle)
 *   F4  a user id that is a PREFIX of a party's id never matches (the LIKE only narrows)
 *   F5  the send rail and the thread read both still resolve through this one function
 *
 * DISPOSABLE DB ONLY; every row written is deleted in after().
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  buildConversationId,
  resolvePublicConversationId,
  toPublicConversationId,
} from "../services/messages.service";
import { recordConversationContext } from "../services/contact-rails.service";

const RUN = crypto.randomUUID().slice(0, 8);
const traveler = `rc11${RUN}t`;
const earner = `rc11${RUN}e`;
const stranger = `rc11${RUN}s`;
// A prefix of the traveler's id: must never be read as a party to the traveler's thread.
const prefixOfTraveler = traveler.slice(0, -1);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);

before(async () => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
    let host = "";
    try {
      host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
    } catch {
      /* no URL */
    }
    if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[rc11] refusing to write fixtures on '${host}'`);
  }
  for (const id of [traveler, earner, stranger, prefixOfTraveler]) {
    await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${id}, ${`${id}@t.test`}, 'user')`);
  }
  // Exactly what the start rail writes before any message: the context row, keyed on the
  // INTERNAL pair id, through the ONE writer.
  await recordConversationContext(buildConversationId(traveler, earner), { kind: "storefront", id: `h${RUN}` }, traveler);
});

after(async () => {
  await db
    .execute(sql`DELETE FROM conversation_contexts WHERE conversation_id = ${buildConversationId(traveler, earner)}`)
    .catch(() => {});
  for (const id of [traveler, earner, stranger, prefixOfTraveler]) {
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`).catch(() => {});
  }
});

const publicId = () => toPublicConversationId(buildConversationId(traveler, earner));

test("F1: the opener resolves the thread the start rail just opened, before any message exists", async () => {
  const [{ n }] = (
    await db.execute(sql`
      SELECT count(*)::int AS n FROM user_and_expert_chats
       WHERE (sender_id = ${traveler} AND receiver_id = ${earner}) OR (sender_id = ${earner} AND receiver_id = ${traveler})
    `)
  ).rows as any[];
  assert.equal(n, 0, "the thread really has no message yet — this is the RC-11 state");
  const resolved = await resolvePublicConversationId(traveler, publicId());
  assert.ok(resolved, "the first send must not be a 404");
  assert.equal(resolved!.otherUserId, earner);
  assert.equal(resolved!.internalId, buildConversationId(traveler, earner));
});

test("F2: the other party resolves it too, with the opener as counterpart", async () => {
  const resolved = await resolvePublicConversationId(earner, publicId());
  assert.ok(resolved);
  assert.equal(resolved!.otherUserId, traveler);
});

test("F3: a stranger holding the same public id resolves nothing", async () => {
  assert.equal(await resolvePublicConversationId(stranger, publicId()), null);
});

test("F4: a user whose id is a prefix of a party's id is not a party", async () => {
  assert.equal(await resolvePublicConversationId(prefixOfTraveler, publicId()), null);
});

test("F5: the send rail and the thread read still resolve through this one function", () => {
  const mono = readFileSync(new URL("../routes.ts", import.meta.url), "utf8");
  assert.match(mono, /messagingService\.resolvePublicConversationId\(sessionUserId, publicConversationId\)/);
  const svc = readFileSync(new URL("../services/messages.service.ts", import.meta.url), "utf8");
  assert.match(svc, /from\(conversationContexts\)/, "the resolver's walk includes context-opened threads");
});
