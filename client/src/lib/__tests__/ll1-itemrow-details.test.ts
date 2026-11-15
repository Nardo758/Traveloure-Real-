/**
 * LL-1 — the plan row's Details action goes to the stop's OWN in-app page, and nowhere else.
 *
 * The rule (Leon, Nov 13): a Details press may open the content's page inside the app; it may NOT become an
 * outside link, and when the item names no in-app page the sheet keeps its job exactly as before. Same
 * label, same `item-menu-details-{id}` testid, same position in the 4+1 menu.
 *
 * Pins the decision in one place so a later refactor cannot quietly turn every Details into either an
 * external link or a dead menu entry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isInAppHref, PENDING_LL1_STRINGS } from "../plan-stop-links";

const SRC = fs.readFileSync("client/src/components/plan/ItemRow.tsx", "utf8");

test("LL-1: an in-app href is accepted and an outside one is refused", () => {
  assert.equal(isInAppHref("/plans/abc"), true, "an internal path is in-app");
  assert.equal(isInAppHref("/experiences/kyoto"), true);
  assert.equal(isInAppHref("https://example.com/x"), false, "an outside URL must never become a plan link");
  assert.equal(isInAppHref("//evil.example/x"), false, "protocol-relative is outside too");
  assert.equal(isInAppHref(null), false, "nothing is not a link");
});

test("LL-1: Details draws the in-app link only when one exists, else today's sheet", () => {
  assert.match(SRC, /function inAppDetailsHref/, "one home for the decision");
  assert.match(SRC, /isInAppHref\(href\) \? href : null/, "the decision is isInAppHref, not a second rule");
  assert.match(SRC, /detailsHref \? \(/, "the menu branches on the decided href");
  assert.match(SRC, /<a href=\{detailsHref\}>/, "the link is the stop's page");
  assert.match(SRC, /onSelect=\{menu\.onDetails\}/, "no in-app page keeps the existing sheet");
  assert.match(SRC, /asChild/, "the menu item hosts the anchor rather than nesting a button");
  assert.match(SRC, /data-testid=\{`item-menu-details-\$\{id\}`\}/, "the testid is unchanged");
  // Scoped to the DETAILS block: ItemRow legitimately draws outside links for a place or a fact source
  // elsewhere, and those are not this action.
  const detailsBlock = SRC.slice(SRC.indexOf("detailsHref ? ("), SRC.indexOf(") : null}", SRC.indexOf("detailsHref ? (")));
  assert.ok(detailsBlock.length > 0, "the Details block is present");
  assert.doesNotMatch(detailsBlock, /target="_blank"/, "the Details action never opens a new tab");
});

test("LL-1: the two wordings are the approved constants, not new copy", () => {
  assert.equal(typeof PENDING_LL1_STRINGS.onDay, "function");
  assert.equal(PENDING_LL1_STRINGS.onDay(2), "On Day 2");
  assert.equal(PENDING_LL1_STRINGS.backToPlan, "Back to plan");
});
