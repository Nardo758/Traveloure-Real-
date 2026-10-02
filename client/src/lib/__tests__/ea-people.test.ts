import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eaEventMatchesPerson, eaPersonOptions, type EaRosterClient } from "../ea-people";

const accepted: EaRosterClient = {
  id: "rel-1",
  clientUserId: "user-1",
  clientEmail: "traveler@example.com",
  displayName: null,
  userFirstName: "Kyoto",
  userLastName: "Traveler",
  userEmail: "traveler@example.com",
};

test("an accepted client is listed by name with no executive id", () => {
  const options = eaPersonOptions([], [accepted]);
  assert.equal(options.length, 1);
  assert.equal(options[0].name, "Kyoto Traveler");
  assert.equal(options[0].executiveId, null);
  assert.equal(options[0].key, "client:rel-1");
});

test("a pending invitation is not an option", () => {
  const pending = { ...accepted, clientUserId: null };
  assert.deepEqual(eaPersonOptions([], [pending]), []);
});

test("a directory executive keeps its id and a same-name client is not duplicated", () => {
  const options = eaPersonOptions(
    [{ id: "exec-1", name: "Kyoto Traveler" }],
    [accepted],
  );
  assert.equal(options.length, 1);
  assert.equal(options[0].executiveId, "exec-1");
});

test("a name-only event matches the client, not a different executive's id", () => {
  const [client] = eaPersonOptions([], [accepted]);
  const [exec] = eaPersonOptions([{ id: "exec-9", name: "Someone Else" }], []);
  assert.equal(eaEventMatchesPerson({ executiveId: null, executiveName: "Kyoto Traveler" }, client), true);
  assert.equal(eaEventMatchesPerson({ executiveId: "exec-9", executiveName: "Someone Else" }, client), false);
  assert.equal(eaEventMatchesPerson({ executiveId: "exec-9", executiveName: "Someone Else" }, exec), true);
});

test("the plan route uses the viewer's own shell", () => {
  const src = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
  assert.match(src, /PlanPageShell><ProtectedRoute component=\{SlipViewPage\}/);
});
