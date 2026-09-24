import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPushPayload, pushPreferenceKeyFor, pushTargetPath } from "../push-notifications";

describe("phone push rules", () => {
  it("P1: each pushed type names its consent key; an unlisted type is never pushed", () => {
    assert.equal(pushPreferenceKeyFor("message_received"), "newMessage");
    assert.equal(pushPreferenceKeyFor("quote_requested"), "bookingRequest");
    assert.equal(pushPreferenceKeyFor("expert_suggestion"), "itineraryUpdate");
    assert.equal(pushPreferenceKeyFor("payout_processed"), "paymentReceived");
    assert.equal(pushPreferenceKeyFor("some_future_type"), null);
    assert.equal(pushPreferenceKeyFor(null), null);
  });

  it("P2: a tap opens an in-app path, never an external or protocol-relative URL", () => {
    assert.equal(pushTargetPath({ data: { workspacePath: "/expert/inbox" } }), "/expert/inbox");
    assert.equal(pushTargetPath({ data: { workspacePath: "https://evil.test" } }), "/");
    assert.equal(pushTargetPath({ data: { workspacePath: "//evil.test" } }), "/");
    assert.equal(pushTargetPath({ data: { tripId: "t1", workspacePath: "/trip/t1?tab=x" } }), "/plans/t1");
    assert.equal(pushTargetPath({ data: { tripId: "t1" } }), "/plans/t1");
    assert.equal(pushTargetPath({ type: "message_received", data: {} }), "/chat");
  });

  it("P3: the payload is bounded and tagged per notice", () => {
    const p = buildPushPayload({ id: "abc", title: "", message: "x".repeat(500) });
    assert.equal(p.title, "Traveloure");
    assert.equal(p.body.length, 240);
    assert.equal(p.tag, "n-abc");
  });
});
