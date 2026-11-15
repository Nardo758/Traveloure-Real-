/**
 * Row 328 (Leon, Nov 15) — "Add to checkout" on the Trip Card opens Finalize with that item in hand.
 *
 * The control lives on the board (`ActivitiesSection`), the modal lives in the slip rail (`SlipRail`), with no
 * shared parent state; `finalize-request.ts` is the one channel between them. The wording does not change.
 *
 * Pinned: the button still says "Add to checkout" and still stages the route, the press asks for Finalize
 * with ITS itemId, the rail listens and passes the item on, and the modal accepts it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { onFinalizeRequest, requestFinalizeFor } from "../finalize-request";

test("the request channel carries the item, and says whether anyone is listening", () => {
  const seen: string[] = [];
  assert.equal(requestFinalizeFor("item-1"), false, "no listener ⇒ false, and nothing throws");
  const stop = onFinalizeRequest((req) => seen.push(req.itemId));
  assert.equal(requestFinalizeFor("item-1"), true);
  stop();
  requestFinalizeFor("item-2");
  assert.deepEqual(seen, ["item-1"], "only while the rail is mounted");
  assert.equal(requestFinalizeFor(""), false, "an empty id is not a request");
});

test("the Trip Card control keeps its wording and asks for Finalize", () => {
  const src = fs.readFileSync("client/src/components/plancard/ActivitiesSection.tsx", "utf8");
  assert.match(src, /label="Add to checkout"/, "the wording stays");
  assert.match(src, /requestFinalizeFor\(itemId\)/, "the press names its item");
  assert.match(src, /mutation\.mutate\("ready_for_checkout"\)/, "and the route is still staged");
  assert.match(src, /button-route-add-checkout-\$\{itemId\}/, "the testid is unchanged");
});

test("the rail owns the modal: it listens and hands the item over", () => {
  const rail = fs.readFileSync("client/src/components/plancard/SlipRail.tsx", "utf8");
  assert.match(rail, /onFinalizeRequest\(/, "the rail subscribes");
  assert.match(rail, /setFinalizeFocusItemId\(req\.itemId\)/, "it records which item was pressed");
  assert.match(rail, /focusItemId=\{finalizeFocusItemId\}/, "and passes it to the modal");
  const modal = fs.readFileSync("client/src/components/plancard/FinalizeBookingModal.tsx", "utf8");
  assert.match(modal, /focusItemId\?: string \| null/, "the modal accepts it");
});
