/**
 * LD 45 (1) — `conversations.trip_id`, the AI conversation's link to a plan.
 * Ledger `2026-09-08-conversation-trip-id`, migration 290. Pure; no DB, no network.
 *
 * Run: npx tsx --test shared/__tests__/conversation-trip-link.test.ts
 *
 * WHAT THESE PROVE, and why each is a RULE rather than a spelling:
 *   B1  the COLUMN is declared in the schema layer — the deploy-push durability rule. A column
 *       created only by a migration is dropped by Replit's publish-time push and never recreated,
 *       because the migration is stamped by then.
 *   B2  the INDEX is declared for the same reason (CLAUDE.md's second variant of that trap).
 *   B3  the FK is declared with ON DELETE SET NULL — deleting a plan must never delete the
 *       conversation that planned it. Declared HERE and not only in SQL, because the push drops
 *       constraints the schema does not declare. It also proves the circular
 *       `shared/schema.ts` ⇄ `shared/models/chat.ts` import resolves: the assertion cannot pass
 *       unless the lazy `.references()` callback found `trips`.
 *   B4  §19 — the generic insert schema does NOT admit `tripId`. Under an `.omit()` denylist a
 *       freshly-added column is client-settable BY DEFAULT; this is the negative fixture for that.
 *   B5  the ONE admission is pick-based and `.strict()` — an unknown key is REFUSED, not stripped.
 *   B6  absent / null / a value are THREE states the admission preserves (§13): `null` is an
 *       explicit "belongs to no plan", and it is not the same input as saying nothing.
 *
 * STATED NEGATIVE SPACE: these prove the DECLARATION and the ADMISSION. They do not prove the
 * server-side OWNERSHIP resolution (`resolveConversationTripLink`), which reads the `trips` table
 * and therefore needs a database; its refusal wording is exported as one constant so a later DB
 * test asserts the rule rather than a re-typed string.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTableConfig } from "drizzle-orm/pg-core";
import { conversations, conversationTripLinkSchema, insertConversationSchema } from "../schema";

const config = getTableConfig(conversations as any);

describe("LD 45 (1) conversations.trip_id", () => {
  it("B1: the column is declared in the schema layer (deploy-push durability)", () => {
    const names = config.columns.map((c: any) => c.name);
    assert.ok(names.includes("trip_id"), `conversations columns: ${names.join(",")}`);
    const col: any = config.columns.find((c: any) => c.name === "trip_id");
    assert.equal(col.notNull, false, "trip_id must be NULLABLE — NULL = belongs to no plan (§13)");
    assert.equal(col.hasDefault, false, "trip_id must carry NO DEFAULT (publish-trap posture)");
  });

  it("B2: the index is declared, or the publish push drops it and 290 never recreates it", () => {
    const indexNames = config.indexes.map((i: any) => i.config.name);
    assert.ok(
      indexNames.includes("idx_conversations_trip_id"),
      `conversations indexes: ${indexNames.join(",")}`,
    );
  });

  it("B3: the FK is declared, targets trips.id, and is ON DELETE SET NULL", () => {
    const fks = config.foreignKeys.filter((fk: any) => {
      const ref = fk.reference();
      return ref.columns.some((c: any) => c.name === "trip_id");
    });
    assert.equal(fks.length, 1, "exactly one FK from conversations.trip_id");
    const ref: any = fks[0].reference();
    assert.equal((ref.foreignColumns as any[])[0].name, "id");
    assert.equal(
      (fks[0] as any).onDelete ?? ref.onDelete,
      "set null",
      "deleting a plan must never delete the conversation that planned it",
    );
  });

  it("B4: §19 — the generic insert schema does not admit tripId", () => {
    const parsed = insertConversationSchema.parse({
      title: "New Chat",
      userId: "user-1",
      // A crafted body naming someone else's plan must not reach the row through the denylist.
      tripId: "trip-belonging-to-someone-else",
    } as any);
    assert.equal((parsed as any).tripId, undefined);
  });

  it("B5: the ONE admission is pick-based and strict", () => {
    assert.deepEqual(conversationTripLinkSchema.parse({ tripId: "trip-1" }), { tripId: "trip-1" });
    // .strict(): an unknown key is refused outright, never silently dropped.
    assert.throws(() => conversationTripLinkSchema.parse({ tripId: "trip-1", userId: "someone" }));
    // An empty string is not a plan id — it is how a caller would smuggle "unset" past a truthiness
    // check, so the shape refuses it and the caller must send an explicit null instead.
    assert.throws(() => conversationTripLinkSchema.parse({ tripId: "" }));
  });

  it("B6: absent, null and a value stay three distinct inputs (§13)", () => {
    assert.deepEqual(conversationTripLinkSchema.parse({}), {});
    assert.deepEqual(conversationTripLinkSchema.parse({ tripId: null }), { tripId: null });
    // The distinction that matters: parsing does not turn "said nothing" into "said null".
    assert.equal("tripId" in conversationTripLinkSchema.parse({}), false);
    assert.equal("tripId" in conversationTripLinkSchema.parse({ tripId: null }), true);
  });
});
