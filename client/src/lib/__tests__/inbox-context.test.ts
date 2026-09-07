/**
 * Inbox context chips (ledger `2026-09-07-inbox-context`; Console & AI Concierge brief §10 row
 * L13 — CLAUDE.md Locked Decision 40, and its D22 amendment adding the `advisor` kind).
 *
 * The lane READS `conversation_contexts`. Its whole point is the absence: migration 287 was
 * deliberately not backfilled, so a thread that predates it has NO context row, and the row must
 * then draw NO chip — never "storefront", which is a claim nobody made.
 *
 * STATED NEGATIVE SPACE: these are a pure join and three source reads. They cannot see the chip
 * render, and they cannot see the server's own resolution — that is `contact-rails.test.ts` and
 * `advisor-conversation-context.test.ts`, which already pin `contextLabel`'s §13 fallbacks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contextsByCounterpartId, type ConversationSummaryRow } from "../inbox-context";

const root = join(import.meta.dirname, "..", "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

test("X1: a thread's contexts are joined onto its counterpart, verbatim", () => {
  const rows: ConversationSummaryRow[] = [
    { otherUserId: "u1", contexts: [{ kind: "service", id: "svc-1", label: "Tea ceremony walk" }] },
    { otherUserId: "u2", contexts: [{ kind: "advisor", id: "trip-1", label: "Plan: Kyoto wedding" }] },
  ];
  const map = contextsByCounterpartId(rows);
  assert.deepEqual(map.get("u1"), [{ kind: "service", id: "svc-1", label: "Tea ceremony walk" }]);
  assert.equal(map.get("u2")?.[0].label, "Plan: Kyoto wedding");
});

test("X2: §13 — an OLDER thread (no context rows) is absent from the map, so it draws no chip", () => {
  const map = contextsByCounterpartId([
    { otherUserId: "u1", contexts: [] },
    { otherUserId: "u2" },
    { otherUserId: "u3", contexts: null },
  ]);
  assert.equal(map.has("u1"), false);
  assert.equal(map.has("u2"), false);
  assert.equal(map.has("u3"), false);
  // And nothing is manufactured for a missing page either.
  assert.equal(contextsByCounterpartId(undefined).size, 0);
  assert.equal(contextsByCounterpartId(null).size, 0);
});

test("X3: a context the server could not LABEL is dropped, not rendered as a blank chip", () => {
  const map = contextsByCounterpartId([
    {
      otherUserId: "u1",
      contexts: [
        { kind: "service", id: "svc-1", label: "   " } as any,
        { kind: "booking", id: "bk-1", label: "Booking BK7Q2X" },
      ],
    },
  ]);
  assert.deepEqual(map.get("u1")?.map((c) => c.kind), ["booking"]);
});

test("X4: a thread about TWO things keeps both — it is never reduced to one silently", () => {
  const map = contextsByCounterpartId([
    {
      otherUserId: "u1",
      contexts: [
        { kind: "storefront", id: "kyotoguide", label: "@kyotoguide" },
        { kind: "booking", id: "bk-1", label: "Booking BK7Q2X" },
      ],
    },
  ]);
  assert.equal(map.get("u1")?.length, 2);
});

test("X5: the client RENDERS the server's label and restates none of its own (§18 rule 1)", () => {
  const page = read("client", "src", "pages", "inbox.tsx");
  assert.match(page, /data-testid=\{`inbox-thread-context-\$\{ctx\.kind\}`\}/);
  assert.match(page, /\{ctx\.label\}/, "the chip prints the server's own label");
  // The four kind WORDS are the server's to write. A client-side switch over them would be a
  // second labeller and would drift the day a fifth kind lands (LD 40: no DB CHECK, on purpose).
  for (const kind of ["storefront", "service", "booking", "advisor"]) {
    assert.ok(
      !new RegExp(`case "${kind}"`).test(page),
      `inbox.tsx must not label the ${kind} kind itself`,
    );
  }
  // §13's half: the chip block is gated on there BEING contexts.
  assert.match(page, /thread\.contexts\.length > 0 &&/);
});

test("X6: no writer and no backfill was added, and no user id is published", () => {
  const hook = read("client", "src", "hooks", "use-conversation-threads.ts");
  const page = read("client", "src", "pages", "inbox.tsx");
  const lib = read("client", "src", "lib", "inbox-context.ts");
  for (const [name, src] of [
    ["use-conversation-threads.ts", hook],
    ["inbox.tsx", page],
    ["inbox-context.ts", lib],
  ] as const) {
    assert.ok(!/conversation-contexts/.test(src), `${name} opens no context write rail`);
  }
  // `contexts[].id` is a handle / service / booking / trip id — the type says so, and the chip
  // keys on it rather than printing it, so no id of any kind reaches the screen.
  assert.match(lib, /never a `users\.id`/);
  // The server read is UNCHANGED by this lane: it already emitted `contexts`.
  const svc = read("server", "services", "messages.service.ts");
  assert.match(svc, /conv\.contexts = contextMap\.get\(conv\.conversationId\) \?\? \[\];/);
});
