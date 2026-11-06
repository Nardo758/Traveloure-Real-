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
// Row 302a (ledger `2026-10-31-tile-action-map`): one function decides each tile's primary label.
import { tileAction, tileActionLabel } from "../bento-action-state";
import { TILE_ACTION_COPY } from "../tile-action-copy";

const ALL_KINDS: FeedItem["kind"][] = [
  "neighborhood", "loose-gem", "event", "expert", "supply-hotel", "supply-activity", "vendor-service",
  "city-separator", "recommendation", "wanted-slot", "lead-expert", "earn-card", "package", "external-stub",
];

describe("tileAction (row 302a)", () => {
  // CAP-2 Phase 3 (sanctioned edit): save / book / hire words are PlanActions' (`lib/plan-actions.ts`); "Add to plan" is
  // retired (ruling Nov 6). The tile table keeps only the kinds whose action is not PlanActions'.
  it("the label constants are the ruled words", () => {
    assert.deepEqual(TILE_ACTION_COPY, {
      getThisTrip: "Get this trip",
      askThisExpert: "Ask this expert",
      viewProfile: "View profile",
      apply: "Apply",
    });
  });

  it("maps every FeedItemKind to its label (null where PlanActions owns the action)", () => {
    const expected: Record<FeedItem["kind"], string | null> = {
      "neighborhood": null,
      "city-separator": null,
      "external-stub": null,
      "loose-gem": null,
      "event": null,
      "supply-activity": null,
      "supply-hotel": null,
      "vendor-service": null,
      "recommendation": null,
      "package": "Get this trip",
      "expert": "View profile",
      "lead-expert": "View profile",
      "wanted-slot": "Apply",
      "earn-card": "Apply",
    };
    for (const kind of ALL_KINDS) assert.equal(tileActionLabel(kind), expected[kind], kind);
    assert.equal(Object.keys(expected).length, ALL_KINDS.length);
  });

  it("context picks the ask variant", () => {
    assert.equal(tileActionLabel("expert", { canAsk: true }), "Ask this expert");
    assert.equal(tileActionLabel("lead-expert", { canAsk: true }), "Ask this expert");
  });

  it("package is Get this trip and goes to the ready-made detail page", () => {
    assert.deepEqual(tileAction(item("package", { id: "rm-42" })), { label: "Get this trip", href: "/ready-made/rm-42" });
  });

  it("earn-card keeps /earn; other kinds leave the href to the card; partner stubs have none", () => {
    assert.deepEqual(tileAction(item("earn-card")), { label: "Apply", href: "/earn" });
    assert.equal(tileAction(item("loose-gem")), null, "a gem's action is PlanActions'");
    assert.equal(tileAction(item("external-stub")), null);
  });
});
