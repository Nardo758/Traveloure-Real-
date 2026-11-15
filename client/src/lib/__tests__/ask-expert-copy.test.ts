/**
 * The ask chooser's copy is FINAL (Leon, Nov 13) and lines up 1:1 with the engine's kinds.
 *
 * The engine carries no copy, so this is where the words live. The pin is deliberately about EXACT strings:
 * a wording change should fail here and be re-approved, not drift in a component.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASK_EXPERT_COPY, askChoiceLabel } from "../ask-expert-copy";
import { ASK_CHOICES, resolveActions, type ActionContext, type ContentItem } from "../action-engine";

test("the four approved strings are final constants, word for word", () => {
  assert.equal(ASK_EXPERT_COPY.button, "Ask an expert");
  assert.equal(ASK_EXPERT_COPY.local, "Ask a local");
  assert.equal(ASK_EXPERT_COPY.tripPlanner, "Ask a trip planner");
  assert.equal(ASK_EXPERT_COPY.eventPlanner, "Ask an event planner");
});

test("every chooser kind the engine emits has exactly one approved label", () => {
  const kinds = ASK_CHOICES.map((c) => c.kind);
  assert.deepEqual(kinds, ["local_expert", "travel_expert", "event_planner"]);
  for (const kind of kinds) {
    const label = askChoiceLabel(kind);
    assert.ok(label.startsWith("Ask "), kind + " reads as an Ask verb: " + label);
  }
  assert.deepEqual(
    kinds.map((k) => askChoiceLabel(k)),
    ["Ask a local", "Ask a trip planner", "Ask an event planner"],
  );
});

test("the expert card's action carries the chooser and no copy of its own", () => {
  const expert: ContentItem = {
    type: "expert",
    id: "e1",
    title: "A guide",
    city: "Kyoto",
    origin: "platform",
    placeable: false,
    bookable: false,
    priced: false,
    hasExpert: true,
    detailHref: "/p/e1",
    officialUrl: null,
    publicOk: null,
    partnerSource: "none",
    shareUrl: null,
  };
  const ctx: ActionContext = { mode: "waitlist", signedIn: false, surface: "card" };
  const got = resolveActions(expert, ctx);
  assert.equal(got.primary?.key, "ask_expert");
  assert.deepEqual(got.primary?.askChoices, ["local_expert", "travel_expert", "event_planner"]);
  // No rendered words anywhere on the resolved action: only a label key.
  assert.equal((got.primary as any).label, undefined);
  assert.equal(got.primary?.labelKey, "ask_expert");
});
