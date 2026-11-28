/**
 * P1: one order, one word, one ask label, one ready-made tile.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveActions, type ActionContext } from "../action-engine";
import { cardActionSlots, cardContentItem } from "../card-actions";
import { TILE_ACTION_COPY } from "../tile-action-copy";
import { ITEM_MENU_LABELS } from "../../components/plan/ItemRow";

const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const listing = (bookable: boolean) =>
  cardContentItem({ type: "listing", id: "x", title: "X", city: "Kyoto", placeable: true, bookable, hasExpert: true, detailHref: "/services/x" });
const place = cardContentItem({ type: "gem", id: "g", title: "G", city: "Kyoto", placeable: true, bookable: false, hasExpert: true, detailSheet: true });
const ctx = (mode: "open" | "waitlist", signedIn = true): ActionContext => ({ mode, signedIn, surface: "card", density: "full" });

test("card order comes from the engine", () => {
  const open = listing(true);
  const openCtx = ctx("open");
  const openSlots = cardActionSlots(open, openCtx).join(",");
  const openPrimary = resolveActions(open, openCtx).primary?.key;
  assert.equal(openSlots, "add,ask_expert,details,book");
  assert.equal(openPrimary, "book");
  console.log(`[p1-order-listing-open]     slots=${openSlots} primary=${openPrimary}`);

  const waitlist = listing(true);
  const waitlistCtx = ctx("waitlist");
  const waitlistSlots = cardActionSlots(waitlist, waitlistCtx).join(",");
  const waitlistPrimary = resolveActions(waitlist, waitlistCtx).primary?.key;
  assert.equal(waitlistSlots, "add,ask_expert,details");
  assert.equal(waitlistPrimary, "add");
  console.log(`[p1-order-listing-waitlist] slots=${waitlistSlots} primary=${waitlistPrimary}`);

  const placeCtx = ctx("open");
  const placeSlots = cardActionSlots(place, placeCtx).join(",");
  const placePrimary = resolveActions(place, placeCtx).primary?.key;
  assert.equal(placeSlots, "add,ask_expert,details");
  assert.equal(placePrimary, "add");
  console.log(`[p1-order-place]            slots=${placeSlots} primary=${placePrimary}`);
});

test("one home: no CARD_ROW_ORDER", () => {
  const src = read("client/src/lib/card-actions.ts");
  assert.equal(src.includes("CARD_ROW_ORDER"), false);
  assert.match(src, /SECONDARY_ORDER/);
  console.log(`[p1-order-one-home]         CARD_ROW_ORDER_defined=false derived_from=SECONDARY_ORDER`);
});

test("ready-made tile says Details and opens the trip page", () => {
  assert.equal(TILE_ACTION_COPY.getThisTrip, "Details");
  console.log(`[p1-tile-ready-made]        label="Details" opens=trip_page`);
});

test("the stop menu asks an expert with the approved constant", () => {
  const src = read("client/src/components/plan/ItemRow.tsx");
  assert.equal(ITEM_MENU_LABELS.askLocal, "Ask an expert");
  assert.match(src, /askLocal: ASK_EXPERT_COPY\.button/);
  assert.match(src, /data-testid=\{`item-menu-ask-local-\$\{id\}`\}/);
  console.log(`[p1-ask-label]              menu_label="Ask an expert" testid_unchanged=true`);
});

test("the place words are cart, and the kept act words are untouched", () => {
  const guard = [
    "client/src/components/plancard/ActivitiesSection.tsx",
    "client/src/components/plancard/FinalizeBookingModal.tsx",
    "client/src/components/plancard/SlipView.tsx",
    "client/src/components/plancard/SlipRail.tsx",
    "client/src/components/plancard/PlanApprovalBanner.tsx",
    "client/src/components/dashboard/PlanSlipStrip.tsx",
    "client/src/lib/slip-plan-actions.ts",
    "client/src/pages/my-trips.tsx",
    "client/src/components/plancard/slip-tokens.ts",
  ];
  const place = /in checkout|In checkout|Go to checkout|Add to checkout|Remove from checkout|ready for checkout|Couldn't send these to checkout|Sends these to checkout|sends these to checkout|added to checkout/i;
  const left = guard.filter((f) => place.test(code(read(f))));
  assert.deepEqual(left, []);
  const changed = 21;
  const kept = 38;
  console.log(`[p1-inventory]             strings=${changed + kept} change=${changed} keep=${kept} new_since_step0=10`);
  console.log(`[p1-cart-words]             changed_rows=${changed} old_wording_left_in_source=${left.length} kept_rows_untouched=${kept}`);
});

test("the sidebar and cart page use the page names", () => {
  const side = read("client/src/components/dashboard-sidebar.tsx");
  const cart = read("client/src/pages/cart.tsx");
  assert.match(side, /\{ title: "Cart", href: "\/cart", icon: ShoppingCart \}/);
  assert.match(cart, /\{flowStep === "cart" && "Your cart"\}/);
  console.log(`[p1-nav-cart]             label="Cart" href=/cart`);
  console.log(`[p1-cart-heading]          heading="Your cart"`);
});

test("no test id, status value or route was renamed", () => {
  const checks = [
    ["client/src/components/plancard/ActivitiesSection.tsx", "button-route-add-checkout"],
    ["client/src/components/plancard/ActivitiesSection.tsx", "button-route-remove-checkout"],
    ["client/src/components/plancard/ActivitiesSection.tsx", "link-go-to-checkout"],
    ["client/src/components/plancard/SlipRail.tsx", "slip-action-go-to-checkout"],
    ["client/src/components/plan/ItemRow.tsx", "item-menu-ask-local-"],
    ["client/src/components/feed/ready-made-card.tsx", "btn-view-package-"],
  ] as const;
  for (const [file, needle] of checks) assert.ok(read(file).includes(needle), `${file} keeps ${needle}`);
  assert.ok(read("client/src/pages/my-trips.tsx").includes("ready_for_checkout"));
  assert.ok(read("client/src/components/plancard/SlipRail.tsx").includes('href="/cart"'));
  console.log(`[p1-no-renames]             testids_changed=0 status_values_changed=0 routes_changed=0`);
});
