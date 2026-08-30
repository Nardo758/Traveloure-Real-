import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FeedItem } from "../feed-stream";
import { resolveBentoCompactActionState } from "../bento-action-state";

function item(kind: FeedItem["kind"], data: Record<string, unknown> = {}): FeedItem {
  return { kind, id: `${kind}-item`, data };
}

describe("Bento compact action state (§4)", () => {
  it("maps a Traveloure booking rail to platform", () => {
    assert.equal(
      resolveBentoCompactActionState(item("loose-gem", { providerServiceId: "svc-123" })),
      "platform",
    );
    assert.equal(resolveBentoCompactActionState(item("vendor-service")), "platform");
  });

  it("maps a partner item to affiliate before considering any booking fields", () => {
    assert.equal(
      resolveBentoCompactActionState(
        item("recommendation", {
          candidate: { sourceType: "affiliate", offeringId: "partner-tour" },
        }),
      ),
      "affiliate",
    );
  });

  it("maps items without an available booking rail to not-bookable", () => {
    assert.equal(resolveBentoCompactActionState(item("event")), "not-bookable");
    assert.equal(resolveBentoCompactActionState(item("expert", { role: "local_expert" })), "not-bookable");
  });
});