/**
 * advisor-conversation-context.test.ts — D22: the conversation context kinds gain `advisor`.
 *
 * Ledger `2026-09-05-slip-decisions-d18-d22` (the ruling) and `2026-09-06-slip-small-additions`
 * (this build). CLAUDE.md Locked Decision 40 as amended by Locked Decision 42's D18–D22 addendum;
 * §13, §14, §18 rule 1, Locked Decision 12.
 *
 * WHY THIS EXISTS. Every rule this half of the lane ships is invisible on happy-path data:
 *
 *  · The whole POINT of the kind is that the recipient is server-derived. A rail that quietly
 *    accepted `{ tripId, receiverId }` — or that let a handle ride alongside the trip — would work
 *    perfectly for every honest client and would have reintroduced exactly the addressing Locked
 *    Decision 40 removed. `.strict()` is what refuses it, and nothing goes red if it is dropped.
 *  · "Owner ⇒ advisor, advisor ⇒ owner" is a two-way rule and a one-way implementation passes
 *    every test written from the traveler's side.
 *  · A plan with NO advisor must be the SAME 404 as a plan that does not exist. A helpful 403
 *    ("you have no expert yet") is a probe: it tells an unauthenticated-ish caller which trip ids
 *    are real, which is the custom-venues precedent this codebase already paid for once.
 *  · A stranger on somebody else's trip id is the case a resolver written around "is there an
 *    advisor?" gets wrong — it would hand them the advisor.
 *
 * NEGATIVE SPACE, stated so a green run is read correctly (§18d habit):
 *  - NO DATABASE and NO HTTP. The resolver's SQL — including the §12 status filter — is asserted
 *    as a fact about the shipped file (the A-series), not executed. Whether the query returns the
 *    right rows is the database's job and this suite cannot see it.
 *  - it says NOTHING about blocking, rate limiting or the opaque conversation id. Those are the
 *    start route's existing layers, unchanged by this lane and proven by `contact-rails.test.ts`.
 *  - it does not prove the route is REACHED (the unmounted-router guard is that layer), nor that
 *    the DB refuses a bad `context_kind` — it deliberately does not, the value set is app-enforced
 *    with NO CHECK (the publish-trap posture), and that is exactly why this lane needed no
 *    migration.
 *
 * Run: npx tsx --test server/__tests__/advisor-conversation-context.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  contextLabel,
  pickPlanAdvisor,
  resolvePlanCounterpart,
} from "../services/contact-rails.pure";
import {
  addressKindOf,
  CONTACT_ADDRESS_KINDS,
  contactStartBodySchema,
} from "@shared/contact-address";
import { conversationContextKindEnum } from "@shared/schema";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

const OWNER = "user-owner";
const ADVISOR = "user-advisor";
const OTHER_ADVISOR = "user-advisor-2";
const STRANGER = "user-stranger";

// ─── V: the vocabulary ────────────────────────────────────────────────────────────────────────

test("V1 the context-kind vocabulary includes `advisor`, and keeps the original three", () => {
  for (const kind of ["storefront", "service", "booking", "advisor"]) {
    assert.ok(
      (conversationContextKindEnum as readonly string[]).includes(kind),
      `context kind ${kind} missing`,
    );
  }
  // The set is exactly four — a fifth would be a ruling, not a refactor.
  assert.equal(conversationContextKindEnum.length, 4);
});

test("V2 `tripId` is an ADDRESS kind, and the address kinds are still a closed set", () => {
  assert.ok((CONTACT_ADDRESS_KINDS as readonly string[]).includes("tripId"));
  assert.deepEqual([...CONTACT_ADDRESS_KINDS].sort(), [
    "bookingId",
    "handle",
    "serviceId",
    "tripId",
  ]);
});

test("V3 an `advisor` context is labelled by the plan's TITLE, never by the trip id", () => {
  assert.equal(contextLabel("advisor", "trip-abc123", "Your Kyoto wedding"), "Plan: Your Kyoto wedding");
  // §13 — a plan with no title resolves to no name, and the label says what KIND of thing the
  // thread is about. It must NOT fall through to the id, which is an internal key.
  const unnamed = contextLabel("advisor", "trip-abc123", null);
  assert.equal(unnamed, "A plan");
  assert.ok(!unnamed.includes("trip-abc123"), "the label leaks the trip id");
  // And it is not silently borrowing the booking branch's wording.
  assert.doesNotMatch(unnamed, /booking/i);
});

// ─── B: the body allowlist refuses an identity ────────────────────────────────────────────────

test("B1 `{ tripId }` alone parses, and is reported as the tripId kind", () => {
  const parsed = contactStartBodySchema.safeParse({ tripId: "trip-1" });
  assert.ok(parsed.success);
  assert.equal(addressKindOf(parsed.data), "tripId");
});

test("B2 a client-supplied USER ID or HANDLE is REFUSED alongside the trip — the whole rule", () => {
  // A `receiverId` is not a key this schema has: `.strict()` makes it a 400 rather than a silently
  // ignored field, which is what stops a client "porting" to this kind by renaming a URL.
  for (const body of [
    { tripId: "trip-1", receiverId: "user-advisor" },
    { tripId: "trip-1", expertUserId: "user-advisor" },
    { tripId: "trip-1", localExpertId: "user-advisor" },
    { tripId: "trip-1", userId: "user-advisor" },
    { tripId: "trip-1", advisorId: "user-advisor" },
  ]) {
    assert.equal(contactStartBodySchema.safeParse(body).success, false, JSON.stringify(body));
  }
  // A HANDLE beside the trip is refused too — not because a handle is dangerous but because two
  // addresses is a caller who has not said which conversation they mean (§13). The handle kind
  // remains the precise address when a surface genuinely holds one.
  assert.equal(
    contactStartBodySchema.safeParse({ tripId: "trip-1", handle: "aya" }).success,
    false,
  );
  assert.equal(
    contactStartBodySchema.safeParse({ tripId: "trip-1", bookingId: "bk-1" }).success,
    false,
  );
});

test("B3 an empty or absent tripId is not an address", () => {
  assert.equal(contactStartBodySchema.safeParse({ tripId: "" }).success, false);
  assert.equal(contactStartBodySchema.safeParse({ tripId: "   " }).success, false);
  assert.equal(contactStartBodySchema.safeParse({}).success, false);
});

// ─── R: owner ↔ advisor resolution (pure, over injected rows) ─────────────────────────────────

test("R1 OWNER ⇒ the plan's advisor; ADVISOR ⇒ the plan's owner", () => {
  const plan = { ownerId: OWNER, advisors: [{ userId: ADVISOR, assignedAt: "2026-09-01T00:00:00Z" }] };
  assert.equal(resolvePlanCounterpart(plan, OWNER), ADVISOR);
  assert.equal(resolvePlanCounterpart(plan, ADVISOR), OWNER);
});

test("R2 NO ADVISOR ⇒ null, which the route answers as the SAME 404 as no such plan (§13)", () => {
  assert.equal(resolvePlanCounterpart({ ownerId: OWNER, advisors: [] }, OWNER), null);
  // A row with no user id on it is not an advisor either — never a thread with nobody.
  assert.equal(
    resolvePlanCounterpart({ ownerId: OWNER, advisors: [{ userId: null }] }, OWNER),
    null,
  );
});

test("R3 a STRANGER on somebody else's plan resolves NOTHING — never the advisor", () => {
  const plan = { ownerId: OWNER, advisors: [{ userId: ADVISOR }] };
  assert.equal(resolvePlanCounterpart(plan, STRANGER), null);
  // The authoring builds have userId = NULL (migration 133) and no traveler principal at all.
  assert.equal(resolvePlanCounterpart({ ownerId: null, advisors: [{ userId: ADVISOR }] }, STRANGER), null);
  // An advisor on an OWNERLESS plan has nobody to message, and is not handed the other advisor.
  assert.equal(
    resolvePlanCounterpart(
      { ownerId: null, advisors: [{ userId: ADVISOR }, { userId: OTHER_ADVISOR }] },
      ADVISOR,
    ),
    null,
  );
});

test("R4 somebody who is BOTH owner and advisor gets null, never a thread with themself", () => {
  assert.equal(
    resolvePlanCounterpart({ ownerId: OWNER, advisors: [{ userId: OWNER }] }, OWNER),
    null,
  );
});

test("R5 several advisors ⇒ a STATED tie-break, deterministic for the same rows", () => {
  const rows = [
    { userId: OTHER_ADVISOR, assignedAt: "2026-09-01T00:00:00Z" },
    { userId: ADVISOR, assignedAt: "2026-09-03T00:00:00Z" },
  ];
  // Most recently assigned first.
  assert.equal(pickPlanAdvisor(rows)?.userId, ADVISOR);
  assert.equal(pickPlanAdvisor([...rows].reverse())?.userId, ADVISOR);
  assert.equal(resolvePlanCounterpart({ ownerId: OWNER, advisors: rows }, OWNER), ADVISOR);

  // A NULL assigned_at sorts LAST — never ahead of a row that actually records when it landed.
  assert.equal(
    pickPlanAdvisor([{ userId: OTHER_ADVISOR, assignedAt: null }, { userId: ADVISOR, assignedAt: "2026-01-01T00:00:00Z" }])
      ?.userId,
    ADVISOR,
  );
  // Ties (both null, or the same instant) break on user id ASC, so the answer is stable.
  const tied = [{ userId: OTHER_ADVISOR, assignedAt: null }, { userId: ADVISOR, assignedAt: null }];
  assert.equal(pickPlanAdvisor(tied)?.userId, ADVISOR);
  assert.equal(pickPlanAdvisor([...tied].reverse())?.userId, ADVISOR);
  // An unparseable timestamp is treated as absent rather than as "now" (§13).
  assert.equal(
    pickPlanAdvisor([{ userId: OTHER_ADVISOR, assignedAt: "not-a-date" }, { userId: ADVISOR, assignedAt: "2020-01-01T00:00:00Z" }])
      ?.userId,
    ADVISOR,
  );
  assert.equal(pickPlanAdvisor([]), null);
});

// ─── A: facts about the shipped resolver ──────────────────────────────────────────────────────

test("A1 the tripId branch uses the CANONICAL §12 access allow-list, not a re-typed literal", () => {
  const src = read("server", "services", "contact-rails.service.ts");
  assert.match(src, /TRIP_ADVISOR_READ_ACCESS_STATUSES/);
  assert.match(src, /from "\.\.\/utils\/trip-advisor"/);
  // §18 rule 1 — the statuses themselves are never re-listed in this file. A literal list here
  // would be the second copy that drifts the day the allow-list moves.
  assert.doesNotMatch(src, /\["pending",\s*"accepted"/);
  assert.doesNotMatch(src, /'pending',\s*'accepted'/);
});

test("A2 the tripId branch resolves the counterpart SERVER-SIDE and never off the body", () => {
  const src = read("server", "services", "contact-rails.service.ts");
  assert.match(src, /resolvePlanCounterpart/);
  // §14's identity rule: the only body field this branch reads is the trip id itself.
  assert.doesNotMatch(src, /body\.(receiverId|recipientId|userId|expertUserId|localExpertId)/);
});

test("A3 a plan the caller is not on is `not_found`, never a 403 or a distinct reason", () => {
  const src = read("server", "services", "contact-rails.service.ts");
  const branch = src.slice(src.indexOf('if (kind === "tripId")'), src.indexOf("// bookingId —"));
  assert.ok(branch.length > 0, "tripId branch not found");
  assert.match(branch, /reason: "not_found"/);
  // The only OTHER refusal the rail has is `self`, which the caller already knows about.
  const reasons = [...branch.matchAll(/reason: "([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(reasons)].sort(), ["not_found", "self"]);
});

test("A4 D22 needed NO migration — the column carries no CHECK, by design", () => {
  const sql = read("server", "migrations", "287_conversation_contexts.sql");
  assert.match(sql, /context_kind varchar\(20\) NOT NULL/);
  // If a CHECK were ever added here, adding a fourth kind would become a publish-time push failure
  // — which is the exact trap the migration's own header refuses.
  assert.doesNotMatch(sql, /CHECK\s*\(\s*context_kind/i);
  // And no NEW migration was needed for this lane: nothing in the registry mentions the kind.
  assert.doesNotMatch(read("server", "migrations", "migration-files.ts"), /advisor_context|context_kind_advisor/);
});

test("A5 the slip's Message row addresses the PLAN, and sends no handle and no id", () => {
  const src = read("client", "src", "components", "plancard", "SlipRail.tsx");
  const row = src.slice(src.indexOf('expertState.kind === "message"'), src.indexOf('testId="slip-action-message-expert"'));
  assert.ok(row.length > 0, "message row not found");
  assert.match(row, /\btripId,/);
  assert.doesNotMatch(row, /handle:/);
  assert.doesNotMatch(row, /expertId:/);
  // With NO advisor the row is ABSENT, not a placeholder: the only other expert state is `hire`.
  assert.match(src, /expertState\.kind === "hire"/);
  assert.doesNotMatch(src, /no_handle/);
});
