/**
 * LD 40 lane 2 — the inboxes and the earner's message buttons stop naming a user id
 * (ledger `2026-09-25-ld40-lane2-inboxes`; CLAUDE.md Locked Decision 40 + D22).
 *
 *   T1  one thread-link rule: the opaque id when the join has it, the legacy link only when not
 *   T2  both earner inboxes read the SHARED thread list and link through that one rule
 *   T3  the traveler inbox links through the same rule (§18 rule 1)
 *   T4  the provider's booking "Message" addresses the BOOKING, not the traveler's user id
 *   T5  the workspace "Chat" addresses the PLAN (D22's `{ tripId }`), not the traveler's user id
 *
 * NEGATIVE SPACE: T2–T5 are source pins; the rails they call are proven server-side
 * (`contact-rails.test.ts`, `rc11-first-message.db.test.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { threadChatPath } from "../earner-address";

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("T1: the opaque id wins; the legacy link is only for a thread the join did not cover", () => {
  assert.equal(
    threadChatPath({ publicId: "a1b2", counterpartId: "u-1" }, "clientId"),
    "/chat?conversation=a1b2",
  );
  assert.equal(threadChatPath({ publicId: null, counterpartId: "u-1" }, "clientId"), "/chat?clientId=u-1");
  assert.equal(threadChatPath({ publicId: null, counterpartId: "u-1" }, "expertId"), "/chat?expertId=u-1");
  assert.equal(
    threadChatPath({ publicId: "a b", counterpartId: "u" }, "expertId"),
    "/chat?conversation=a%20b",
    "the id is encoded, never spliced raw",
  );
});

for (const rel of ["pages/provider/inbox.tsx", "pages/expert/inbox.tsx"]) {
  test(`T2: ${rel} reads the shared thread list and links through the one rule`, () => {
    const src = read(rel);
    assert.match(src, /useConversationThreads\(\)/);
    assert.match(src, /threadChatPath\(thread, "clientId"\)/);
    assert.doesNotMatch(src, /\/chat\?clientId=\$\{counterpartId\}/, "no hand-built id link remains");
    assert.doesNotMatch(src, /queryKey: \["\/api\/chats"\]/, "no second grouping of /api/chats");
  });
}

test("T3: the traveler inbox links through the same rule", () => {
  assert.match(read("pages/inbox.tsx"), /threadChatPath\(thread, "expertId"\)/);
});

test("T4: the provider's booking Message opens a BOOKING-addressed thread", () => {
  const src = read("pages/provider/inbox.tsx");
  assert.match(src, /startConversation\(\{ bookingId: booking\.id \}\)/);
  assert.doesNotMatch(src, /\/chat\?clientId=\$\{booking\.traveler/);
});

test("T5: the workspace Chat opens a PLAN-addressed thread", () => {
  const src = read("pages/expert/workspace.tsx");
  assert.match(src, /startConversation\(\{ tripId \}\)/);
  assert.doesNotMatch(src, /\/chat\?clientId=\$\{trip\.traveler_user_id\}/);
});
