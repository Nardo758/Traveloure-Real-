/**
 * Row 155: the Workstation's add-from-search reads the server's outcome.
 *   AO1  a 202 {suggested:true, suggestion} is a suggestion; a normal item response is an add
 *   AO2  addFromSearchMutation's onSuccess files the suggestion toast and returns before "Added to itinerary"
 *   AO3  both Google Places adds set the green "added" chip only when the write was not a suggestion; the
 *        platform candidate add has no per-call handler, so it reads the mutation's own onSuccess
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { addOutcome, isSuggestedWrite } from "../expert-write-outcome";

const src = fs.readFileSync("client/src/pages/expert/workspace.tsx", "utf8");

test("AO1 — the outcome", () => {
  assert.equal(addOutcome({ suggested: true, suggestion: { id: "s1" } }), "suggested");
  assert.equal(addOutcome({ id: "item-1", title: "Synthetic" }), "added");
  assert.equal(addOutcome({ suggested: "true" }), "added", "only a real true counts");
  assert.equal(isSuggestedWrite(null), false);
});

test("AO2 — a suggestion never reads \"Added to itinerary\"", () => {
  const start = src.indexOf("const addFromSearchMutation = useMutation({");
  const body = src.slice(src.indexOf("onSuccess:", start), src.indexOf("onError:", start));
  const filed = body.indexOf("if (suggestionFiled(res, toast, tripId)) { setSelectedPin(null); return; }");
  const added = body.indexOf('title: "Added to itinerary"');
  assert.ok(filed > 0 && added > filed, "the suggestion check runs first and returns");
  assert.match(src, /toast\(\{ title: "Sent as a suggestion"/);
});

test("AO3 — the green chip only for a landed add", () => {
  const gated = src.match(/onSuccess: \(res\) => \{ if \(!isSuggestedWrite\(res\)\) setGoogleAddedDays\(/g) ?? [];
  assert.equal(gated.length, 2);
  assert.doesNotMatch(src, /onSuccess: \(\) => setGoogleAddedDays\(/);
  assert.match(src, /if \(result\) addFromSearchMutation\.mutate\(\{ result, day: focusDay \}\);/);
});
