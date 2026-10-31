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
import { TILE_ACTION_COPY, addToPlanLabel } from "../tile-action-copy";

const ALL_KINDS: FeedItem["kind"][] = [
  "neighborhood", "loose-gem", "event", "expert", "supply-hotel", "supply-activity", "vendor-service",
  "city-separator", "recommendation", "wanted-slot", "lead-expert", "earn-card", "package", "external-stub",
];

describe("tileAction (row 302a)", () => {
  it("the label constants are the ruled words", () => {
    assert.deepEqual(TILE_ACTION_COPY, {
      // Main's existing casing (ADD_TO_PLAN_LABEL), unchanged by this row.
      addToPlan: "Add to Plan",
      checkDates: "Check dates",
      checkAvailability: "Check availability",
      getThisTrip: "Get this trip",
      askThisExpert: "Ask this expert",
      viewProfile: "View profile",
      apply: "Apply",
      bookNow: "Book now",
      bookOnPartner: "Book on partner",
    });
  });

  it("maps every FeedItemKind to its label", () => {
    const expected: Record<FeedItem["kind"], string | null> = {
      "neighborhood": null,
      "city-separator": null,
      "external-stub": null,
      "loose-gem": TILE_ACTION_COPY.addToPlan,
      "event": TILE_ACTION_COPY.addToPlan,
      "supply-activity": TILE_ACTION_COPY.addToPlan,
      "supply-hotel": "Check dates",
      "vendor-service": TILE_ACTION_COPY.addToPlan,
      "recommendation": TILE_ACTION_COPY.addToPlan,
      "package": "Get this trip",
      "expert": "View profile",
      "lead-expert": "View profile",
      "wanted-slot": "Apply",
      "earn-card": "Apply",
    };
    for (const kind of ALL_KINDS) assert.equal(tileActionLabel(kind), expected[kind], kind);
    assert.equal(Object.keys(expected).length, ALL_KINDS.length);
  });

  it("context picks the bookable, ask and dated variants", () => {
    assert.equal(tileActionLabel("vendor-service", { bookable: true }), "Check availability");
    assert.equal(tileActionLabel("recommendation", { bookable: true }), "Book now");
    assert.equal(tileActionLabel("recommendation", { bookable: true, affiliate: true }), "Book on partner");
    assert.equal(tileActionLabel("expert", { canAsk: true }), "Ask this expert");
    assert.equal(tileActionLabel("lead-expert", { canAsk: true }), "Ask this expert");
    const dated = addToPlanLabel("2026-11-03");
    assert.equal(dated, "Add to Nov 3");
    for (const kind of ["loose-gem", "event", "supply-activity"] as const) {
      assert.equal(tileActionLabel(kind, { scheduledDate: "2026-11-03" }), dated, kind);
    }
    assert.equal(tileActionLabel("supply-hotel", { scheduledDate: "2026-11-03" }), "Check dates");
  });

  it("package is Get this trip and goes to the ready-made detail page", () => {
    assert.deepEqual(tileAction(item("package", { id: "rm-42" })), { label: "Get this trip", href: "/ready-made/rm-42" });
  });

  it("earn-card keeps /earn; other kinds leave the href to the card; partner stubs have none", () => {
    assert.deepEqual(tileAction(item("earn-card")), { label: "Apply", href: "/earn" });
    assert.deepEqual(tileAction(item("loose-gem")), { label: TILE_ACTION_COPY.addToPlan });
    assert.equal(tileAction(item("external-stub")), null);
  });
});
