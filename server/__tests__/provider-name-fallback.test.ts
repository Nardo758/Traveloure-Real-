/**
 * The provider display name, and the column it reads.
 *
 * The bug (live, not merely a type error): `getProviderMatches` selected
 * `providerUsername: users.username`, and `users` has no `username` column — the drizzle
 * table gives `undefined`, so the select map carried a missing column.
 *
 * The fix points the read at `users.handle`, the real column, and keeps it as the middle
 * rung of the display fallback: first+last, then the handle, then the word "Provider".
 *
 * This pins all three facts without a database: the column that does not exist, the column
 * that does, and the order of the chain (a handle must never outrank a real name, and
 * "Provider" must stay last).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { users } from "@shared/schema";

const SRC = fs.readFileSync("server/services/content-matching.service.ts", "utf8");

test("users has no username column; content-matching reads users.handle instead", () => {
  const table = users as any;
  assert.equal(table.username, undefined, "users.username does not exist — a select of it hands drizzle undefined");
  assert.ok(table.handle, "users.handle is the real column");

  assert.doesNotMatch(SRC, /users\.username/, "the dead read must not come back");
  assert.match(SRC, /providerHandle: users\.handle,/, "the select reads the real column");
});

test("the display chain is name, then handle, then the word Provider", () => {
  const chain = SRC.match(
    /\[row\.providerFirstName, row\.providerLastName\][\s\S]{0,220}?"Provider";/,
  );
  assert.ok(chain, "the providerName chain is present");
  const text = chain[0];
  const nameAt = text.indexOf("[row.providerFirstName, row.providerLastName]");
  const handleAt = text.indexOf("row.providerHandle");
  const wordAt = text.indexOf('"Provider"');
  assert.ok(nameAt >= 0 && handleAt > nameAt, "the real name outranks the handle");
  assert.ok(wordAt > handleAt, '"Provider" stays the last resort');
});
