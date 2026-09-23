/**
 * The EA roster's client label (ledger `2026-09-23-ea-accepted-client-name`). Pure.
 *
 *   L1  An accepted client with no typed name shows their account name, and the email once.
 *   L2  A stored display name equal to the invitation email is not a typed name (the first #502
 *       release stored the email there) — case-insensitively.
 *   L3  A pending invitation never shows account data, even if a row carries it.
 *   L4  A name the EA typed wins, and a client with nothing known reads "Unknown client".
 *
 * Run: npx tsx --test client/src/lib/__tests__/ea-client-label.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eaClientLabel } from "../ea-client-label";

const base = {
  clientUserId: null as string | null,
  clientEmail: "sam@example.com" as string | null,
  displayName: null as string | null,
  userFirstName: null as string | null,
  userLastName: null as string | null,
  userEmail: null as string | null,
};

test("L1: an accepted client shows their account name and the email once", () => {
  const label = eaClientLabel({
    ...base,
    clientUserId: "u1",
    userFirstName: "Sam",
    userLastName: "Rivera",
    userEmail: "sam@example.com",
  });
  assert.deepEqual(label, { primary: "Sam Rivera", secondary: "sam@example.com" });
});

test("L2: a display name that is just the invitation email is not a typed name", () => {
  const accepted = {
    ...base,
    clientUserId: "u1",
    displayName: "Sam@Example.com",
    userFirstName: "Sam",
    userLastName: null,
    userEmail: "sam@example.com",
  };
  assert.deepEqual(eaClientLabel(accepted), { primary: "Sam", secondary: "sam@example.com" });
  assert.deepEqual(eaClientLabel({ ...base, displayName: "sam@example.com" }), {
    primary: "sam@example.com",
    secondary: null,
  });
});

test("L3: a pending invitation never shows account data", () => {
  const label = eaClientLabel({ ...base, userFirstName: "Sam", userLastName: "Rivera" });
  assert.deepEqual(label, { primary: "sam@example.com", secondary: null });
});

test("L4: a typed name wins; nothing known reads Unknown client", () => {
  assert.deepEqual(
    eaClientLabel({ ...base, clientUserId: "u1", displayName: "The CEO", userFirstName: "Sam", userEmail: "sam@example.com" }),
    { primary: "The CEO", secondary: "sam@example.com" },
  );
  assert.deepEqual(eaClientLabel({ ...base, clientEmail: null }), { primary: "Unknown client", secondary: null });
});
