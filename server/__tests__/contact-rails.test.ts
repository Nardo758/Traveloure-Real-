/**
 * contact-rails.test.ts — ledger `2026-09-05-user-id-is-internal`, CLAUDE.md Locked Decision 40.
 *
 * `users.id` is INTERNAL; an earner's public identity is the HANDLE; contact happens only through
 * platform channels, addressed by CONTEXT (handle / service / booking) and resolved SERVER-SIDE.
 *
 * No DB and no HTTP here. The three decisions worth proving are pure by construction — the public
 * conversation id is an HMAC projection, the address body is a `.strict()` allowlist, and "who is
 * the other party to this booking" is a function of the row — and everything else the lane decides
 * is a fact about shipped artifacts (the A-series below), checkable without either. `server/routes.ts` imports
 * the entire server, so an HTTP test would need a database this lane cannot reach and would prove
 * nothing the assertions below do not.
 *
 * NEGATIVE SPACE: nothing here proves the routes are REACHED (the unmounted-router guard is that
 * layer), nor that the DB refuses a bad `context_kind` — it deliberately does not, the value set is
 * app-enforced with no CHECK (publish-trap posture), and the allowlist below is what enforces it.
 *
 * Run: npx tsx --test server/__tests__/contact-rails.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isPublicConversationIdShape,
  matchPublicConversationId,
  toPublicConversationId,
  PUBLIC_CONVERSATION_ID_LENGTH,
} from "../services/conversation-public-id.pure";
import { contextLabel, resolveBookingCounterpart } from "../services/contact-rails.pure";
import {
  addressKindOf,
  CONTACT_ABOUT_MAX,
  contactStartBodySchema,
} from "@shared/contact-address";
import { HANDLE_RE, isHandleShape, normalizeHandle } from "@shared/handle";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

const SECRET = "unit-test-secret-not-for-production";
const OTHER_SECRET = "a-different-secret";

// ─── P: the public conversation id ────────────────────────────────────────────────────────────
// buildConversationId is `<userIdA>_<userIdB>` sorted — the THREAD KEY IS the counterpart's user
// id. That is the leak no participant-object projection would ever catch.

test("P1 the public id is 32 lowercase hex chars and is deterministic for one secret", () => {
  const internal = "user-aaa_user-bbb";
  const first = toPublicConversationId(internal, SECRET);
  assert.equal(first.length, PUBLIC_CONVERSATION_ID_LENGTH);
  assert.match(first, /^[0-9a-f]{32}$/);
  assert.equal(toPublicConversationId(internal, SECRET), first);
  assert.ok(isPublicConversationIdShape(first));
});

test("P2 the public id contains NEITHER user id — the whole point of the projection", () => {
  const a = "traveler-9f3c2b";
  const b = "earner-7d1e40";
  const publicId = toPublicConversationId([a, b].sort().join("_"), SECRET);
  assert.ok(!publicId.includes(a), "public id leaks the traveler id");
  assert.ok(!publicId.includes(b), "public id leaks the earner id");
  assert.ok(!publicId.includes("_"), "public id still has the pair separator");
});

test("P3 different threads and different secrets project differently", () => {
  const one = toPublicConversationId("a_b", SECRET);
  const two = toPublicConversationId("a_c", SECRET);
  assert.notEqual(one, two);
  assert.notEqual(one, toPublicConversationId("a_b", OTHER_SECRET));
});

test("P4 a public id resolves ONLY inside its own participant's conversation list", () => {
  const mine = ["me_you", "me_them"];
  const strangers = ["someone_else", "third_party"];
  const publicId = toPublicConversationId("me_you", SECRET);

  assert.equal(matchPublicConversationId(publicId, mine, SECRET), "me_you");
  // A non-participant holding a perfectly valid public id resolves NOTHING: their own list has no
  // internal id that projects to it.
  assert.equal(matchPublicConversationId(publicId, strangers, SECRET), null);
  assert.equal(matchPublicConversationId(publicId, [], SECRET), null);
});

test("P5 malformed ids are refused with the SAME answer as not-yours (§13, no oracle)", () => {
  const mine = ["me_you"];
  for (const bad of [
    undefined,
    null,
    "",
    "me_you", // the INTERNAL id is not a public id
    "ZZ" + "0".repeat(30), // wrong alphabet
    "0".repeat(31), // too short
    "0".repeat(33), // too long
    toPublicConversationId("me_you", SECRET).toUpperCase(), // case matters
  ]) {
    assert.equal(matchPublicConversationId(bad as any, mine, SECRET), null, `accepted: ${String(bad)}`);
    assert.equal(isPublicConversationIdShape(bad as any), false, `shape accepted: ${String(bad)}`);
  }
});

test("P6 the key is SESSION_SECRET, and there is no fixed literal fallback", () => {
  const src = read("server", "services", "conversation-public-id.pure.ts");
  assert.match(src, /process\.env\.SESSION_SECRET/, "does not read SESSION_SECRET");
  assert.match(src, /randomBytes\(/, "no random fallback — an unset secret must not be a literal");
  assert.ok(
    !/(secret|key)\s*=\s*["'][A-Za-z0-9-]{6,}["']/.test(src.replace(/HMAC_DOMAIN[\s\S]*?;/, "")),
    "a fixed literal secret would make every public id computable from this file",
  );
});

// ─── B: the address body is a .strict() ALLOWLIST (§19) ───────────────────────────────────────

test("B1 exactly one address is accepted, and a handle is normalized", () => {
  const parsed = contactStartBodySchema.safeParse({ handle: "  KyotoGuide  " });
  assert.ok(parsed.success);
  assert.equal(parsed.data.handle, "kyotoguide");
  assert.equal(addressKindOf(parsed.data), "handle");

  for (const body of [{ serviceId: "svc-1" }, { bookingId: "bk-1" }]) {
    const ok = contactStartBodySchema.safeParse(body);
    assert.ok(ok.success, JSON.stringify(body));
  }
});

test("B2 TWO addresses are refused — picking one for the caller would be a guess (§13)", () => {
  const r = contactStartBodySchema.safeParse({ serviceId: "svc-1", bookingId: "bk-1" });
  assert.equal(r.success, false);
});

test("B3 ZERO addresses are refused", () => {
  assert.equal(contactStartBodySchema.safeParse({}).success, false);
  assert.equal(contactStartBodySchema.safeParse({ about: "hello" }).success, false);
});

test("B4 the LEGACY id-addressed shape is refused on this rail, loudly", () => {
  // `.strict()` is load-bearing: `receiverId` must be a 400, not a silently ignored key, so a
  // client that "ports" by renaming the URL fails rather than appearing to work.
  for (const body of [
    { receiverId: "user-1" },
    { handle: "kyotoguide", receiverId: "user-1" },
    { handle: "kyotoguide", senderId: "user-2" },
    { handle: "kyotoguide", userId: "user-3" },
  ]) {
    assert.equal(contactStartBodySchema.safeParse(body).success, false, JSON.stringify(body));
  }
});

test("B5 `about` is bounded and non-empty when present", () => {
  assert.ok(contactStartBodySchema.safeParse({ handle: "kyotoguide", about: "hi" }).success);
  assert.equal(
    contactStartBodySchema.safeParse({ handle: "kyotoguide", about: "x".repeat(CONTACT_ABOUT_MAX + 1) }).success,
    false,
  );
  assert.equal(contactStartBodySchema.safeParse({ handle: "kyotoguide", about: "   " }).success, false);
});

test("B6 a handle that is not handle-SHAPED never reaches the database", () => {
  for (const handle of ["a", "-lead", "trail-", "dou--ble", "UPPER".repeat(9), "has space", "e@mail"]) {
    assert.equal(
      contactStartBodySchema.safeParse({ handle }).success,
      false,
      `accepted non-handle: ${handle}`,
    );
  }
  assert.ok(isHandleShape("kyoto-guide"));
  assert.equal(normalizeHandle("  KYOTO-Guide "), "kyoto-guide");
  assert.equal(HANDLE_RE.source, /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,28}[a-z0-9]$/.source);
});

// ─── K: who is the other party to a booking ───────────────────────────────────────────────────

test("K1 the traveler's counterpart is the SERVICE OWNER", () => {
  const booking = { travelerId: "trav-1", providerId: "prov-1", serviceOwnerId: "owner-1" };
  assert.equal(resolveBookingCounterpart(booking, "trav-1"), "owner-1");
});

test("K2 the earner's counterpart is the traveler — from either earner column", () => {
  const booking = { travelerId: "trav-1", providerId: "prov-1", serviceOwnerId: "owner-1" };
  assert.equal(resolveBookingCounterpart(booking, "owner-1"), "trav-1");
  // provider_id is denormalized and may differ from the service's owner; accepting either is
  // strictly more correct than picking one.
  assert.equal(resolveBookingCounterpart(booking, "prov-1"), "trav-1");
});

test("K3 a booking with no service row (the transport-commerce exception) still resolves", () => {
  // service_bookings.service_id is nullable for transport bookings (CLAUDE.md, migration 050), so
  // serviceOwnerId is absent and provider_id is the only earner column there is.
  const booking = { travelerId: "trav-1", providerId: "prov-1", serviceOwnerId: null };
  assert.equal(resolveBookingCounterpart(booking, "trav-1"), "prov-1");
  assert.equal(resolveBookingCounterpart(booking, "prov-1"), "trav-1");
});

test("K4 a stranger is refused — and the route answers that as 404, not 403 (§13)", () => {
  const booking = { travelerId: "trav-1", providerId: "prov-1", serviceOwnerId: "owner-1" };
  assert.equal(resolveBookingCounterpart(booking, "nobody-9"), null);

  const svc = read("server", "services", "contact-rails.service.ts");
  const routes = read("server", "routes", "conversations.routes.ts");
  // "no such booking" and "not your booking" must be the SAME sentence, or the rail is an oracle.
  assert.ok(!/reason:\s*"forbidden"/.test(svc), "a distinct forbidden reason would leak existence");
  assert.match(routes, /status\(404\)/);
});

test("K5 a person who is somehow both parties has nobody to message", () => {
  const booking = { travelerId: "same", providerId: "same", serviceOwnerId: "same" };
  assert.equal(resolveBookingCounterpart(booking, "same"), null);
});

// ─── L: context labels are resolved server-side, and never invented ───────────────────────────

test("L1 a storefront context is labelled by handle", () => {
  assert.equal(contextLabel("storefront", "kyotoguide", "kyotoguide"), "@kyotoguide");
});

test("L2 a service with no resolvable name says what KIND it is, never 'Unknown service'", () => {
  assert.equal(contextLabel("service", "svc-1", "Tea ceremony walk"), "Tea ceremony walk");
  const gone = contextLabel("service", "svc-1", null);
  assert.equal(gone, "A service listing");
  assert.ok(!/unknown/i.test(gone));
});

test("L3 a booking with no short reference is not given a fabricated one", () => {
  assert.equal(contextLabel("booking", "bk-1", "BK7Q2X"), "Booking BK7Q2X");
  const gone = contextLabel("booking", "bk-1", null);
  assert.equal(gone, "A booking");
  assert.ok(!gone.includes("bk-1"), "a raw row id is not a label");
});

// ─── A: the shipped artifacts ─────────────────────────────────────────────────────────────────

test("A1 the start rail is authenticated, allowlisted, and returns NO user id", () => {
  const src = read("server", "routes", "conversations.routes.ts");
  assert.match(src, /router\.post\(\s*"\/api\/conversations\/start",\s*isAuthenticated/);
  assert.match(src, /contactStartBodySchema\.safeParse\(req\.body\)/);
  // The recipient card is the ONLY thing describing the counterpart, and it has no id field.
  const svc = read("server", "services", "contact-rails.service.ts");
  const card = svc.slice(svc.indexOf("export interface PublicRecipientCard"));
  const cardBody = card.slice(0, card.indexOf("}"));
  assert.ok(!/\bid\b\s*:/.test(cardBody), "PublicRecipientCard must not carry a user id");
  assert.match(cardBody, /handle/);
});

test("A2 the start rail reads NO recipient identity from the body (§14, applied to the recipient)", () => {
  const src = read("server", "routes", "conversations.routes.ts");
  const code = src
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
    .join("\n");
  for (const name of ["receiverId", "recipientId", "senderId", "userId"]) {
    assert.ok(
      !new RegExp(`req\\.body[^\\n]*${name}`).test(code) && !new RegExp(`body\\.${name}`).test(code),
      `start rail reads ${name} from the body`,
    );
  }
});

test("A3 the admin context index rides §2's BLANKET guard — no per-endpoint admin check", () => {
  const src = read("server", "routes", "conversations.routes.ts");
  assert.match(src, /router\.get\("\/api\/admin\/conversations"/);
  // §2: per-endpoint opt-in is the pattern that leaked. The blanket app.use("/api/admin", …) is it.
  assert.ok(!/requireAdmin|isAdmin\(/.test(src), "per-endpoint admin check reintroduced");
  const routes = read("server", "routes.ts");
  assert.match(routes, /app\.use\("\/api\/admin", adminApiGuard\)/);
  assert.match(routes, /app\.use\(conversationsRoutes\)/);
  // Read-only, and NO message bodies — reading what two people said is a separate decision.
  const svc = read("server", "services", "contact-rails.service.ts");
  const adminFn = svc.slice(svc.indexOf("export async function listAdminConversationsForContext"));
  assert.ok(!/userAndExpertChats\.message/.test(adminFn), "admin listing selects message bodies");
});

test("A4 the 'Not sensitive — user ids are already public' claim is GONE from the storefront", () => {
  const src = read("server", "routes", "storefront.routes.ts");
  assert.ok(!/Not sensitive — user ids are already public/.test(src));
  assert.match(src, /Locked Decision 40/);
  // UPDATED BY LANE 2 (ledger `2026-09-05-ld40-lane2-public-ids`). Lane 1 kept the field working
  // and this assertion pinned the sentence saying so ("Lane 2 REMOVES this field"). Lane 2 removed
  // it, so the assertion now pins the END STATE rather than the promise: the earner payload names
  // the handle and carries no `owner.id` at all. `owner.id` is still read INSIDE the builder — an
  // internal key used internally — so the check is scoped to the returned payload.
  assert.match(src, /handle: owner\.handle/);
  const payload = src.slice(src.indexOf("  return {\n    earner: {"));
  assert.ok(payload.length > 0, "loadStorefront's earner payload not found");
  assert.ok(
    !/^\s*id: owner\.id,\s*$/m.test(payload.slice(0, payload.indexOf("services: resolvedServices"))),
    "loadStorefront still publishes the earner's users.id",
  );
});

test("A5 the legacy id-addressed inputs still work and warn ONCE PER PROCESS", () => {
  const routes = read("server", "routes.ts");
  const messages = read("server", "routes", "messages.ts");
  for (const [name, src] of [["routes.ts", routes], ["messages.ts", messages]] as const) {
    assert.match(src, /warnedDeprecated\w*\s*=\s*false/, `${name}: no once-per-process latch`);
    assert.match(src, /Removed after lane 3/, `${name}: deprecation not annotated`);
  }
  // The public-id path exists on BOTH send rails.
  assert.match(routes, /isPublicConversationIdShape/);
  assert.match(messages, /resolvePublicConversationId/);
});

test("A6 conversation_contexts is declared in shared/schema.ts and registered as migration 287", () => {
  const schema = read("shared", "schema.ts");
  // Deploy-push durability rule: an object shared/schema.ts does not declare is dropped at publish
  // and never recreated, because the migration is already stamped.
  assert.match(schema, /pgTable\("conversation_contexts"/);
  assert.match(schema, /uniqueIndex\("conversation_contexts_unique"\)/);
  assert.match(schema, /index\("conversation_contexts_target_idx"\)/);
  // Publish-trap posture: the value set is app-enforced, so there must be NO DB CHECK.
  const sql = read("server", "migrations", "287_conversation_contexts.sql");
  assert.ok(!/\bCHECK\s*\(/i.test(sql), "a CHECK here is the publish-time push failure");
  assert.ok(!/\bINSERT\s+INTO\s+conversation_contexts/i.test(sql), "no backfill — §13");
  assert.match(read("server", "migrations", "migration-files.ts"), /"287_conversation_contexts\.sql"/);
});

test("A7 the context insert schema is a pick-based ALLOWLIST (§19 / #PS18)", () => {
  const schema = read("shared", "schema.ts");
  assert.match(schema, /insertConversationContextSchema = createInsertSchema\(conversationContexts\)\.pick\(/);
});

test("A8 there is ONE handle shape and ONE verification predicate (§18 rule 1)", () => {
  const storefront = read("server", "routes", "storefront.routes.ts");
  // The named list widened with ledger `2026-09-05-handles-are-claimed` (the route now also reads
  // HANDLE_MIN_LENGTH/HANDLE_MAX_LENGTH from the same module instead of re-typing 3/30), so this
  // pins the ONE SOURCE rather than one exact import line.
  assert.match(storefront, /import \{[^}]*\bHANDLE_RE\b[^}]*\} from "@shared\/handle"/);
  assert.ok(!/const HANDLE_RE\s*=/.test(storefront), "a second copy of the handle regex");
  assert.ok(
    !/\.min\(3,|\.max\(30,/.test(storefront),
    "the length bounds come from shared/handle.ts, never re-typed at the route",
  );
  assert.match(storefront, /from "\.\.\/utils\/earner-verification"/);
  assert.ok(
    !/async function isOwnerIdentityVerified/.test(storefront),
    "a second copy of the verification predicate",
  );
});
