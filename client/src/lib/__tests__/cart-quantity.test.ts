/**
 * DEAD SURFACES ARE GONE, AND THE CART QUANTITY IS TYPEABLE.
 * Ledger `2026-09-05-dead-surfaces-and-cart-qty` (build-order row 1.7 — no-decision housekeeping).
 *
 * WHY THIS EXISTS. Both halves of that lane fail SILENTLY and in the safe-looking direction.
 * A deleted-because-nobody-imported-it file comes back the moment someone copies a sibling page
 * and re-adds it, and nothing breaks when it does — an unreachable page renders for no one and
 * costs nothing until it drifts far enough from the live surface to mislead the next reader.
 * The typed quantity box is the mirror image: if a later edit gives it its own local cart state
 * or its own PATCH, the box still WORKS, and the second write path is only discovered when it
 * disagrees with the buttons beside it. So the deletions are pinned by ABSENCE and the input is
 * pinned by the fact that it goes through the one mutation.
 *
 * What these hold:
 *   Q1  the floor is the `−` button's own: 1, and there is no zero (Remove deletes a line).
 *   Q2  the ceiling is the STORAGE ceiling (`cart_items.quantity` is a Postgres integer), not an
 *       invented product cap — the `+` button never had one and this lane does not add one.
 *   Q3  digits only: a paste of "3 tickets" is 3, not a cleared field.
 *   Q4  an empty box is a DRAFT and stays empty for DISPLAY — it is never coerced to a number
 *       mid-keystroke.
 *   Q5  §13 — committing an empty or zero-only box REVERTS to the quantity the line already has;
 *       it never writes a 0, and never invents a 1 the traveler did not type.
 *   Q6  `clampCartQuantity` is total: a non-finite number is the minimum, never NaN on the wire.
 *   S1  `/expert/assigned-trips` page file is GONE and the redirect that replaced it is KEPT.
 *   S2  `TripExportButton` is GONE and nothing imports it.
 *   S3  `ExpertMatchCard` survives; its caller-less `onRequestMatch` CTA does not.
 *   S4  `optimizationContext.routedItemIds` is gone, and the item CAS flip it counted is NOT.
 *   S5  the cart's typed box exists, carries the ratified testid, and writes through the SAME
 *       `updateItemMutation` the +/− buttons write through — one write path, not two.
 *
 * Pure unit: no DOM, no DB, no fetch — the S-pins read the shipped source as text.
 * Run: npx tsx --test client/src/lib/__tests__/cart-quantity.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_CART_QUANTITY,
  MAX_CART_QUANTITY_DIGITS,
  MIN_CART_QUANTITY,
  clampCartQuantity,
  commitCartQuantity,
  parseCartQuantityInput,
} from "../cart-quantity";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = join(HERE, "..", "..");
const ROOT = join(HERE, "..", "..", "..", "..");
const readClient = (rel: string) => readFileSync(join(CLIENT_SRC, rel), "utf8");
const readRoot = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * Strip comments before an ABSENCE grep. A deletion this lane made is explained in a comment
 * where it was removed — that is how the next reader learns why the field is not there — so a
 * naive `includes()` would be satisfied by the explanation and never see the code come back.
 * The pin has to read the CODE, so the prose is removed first.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codeClient = (rel: string) => stripComments(readClient(rel));
const codeRoot = (rel: string) => stripComments(readRoot(rel));

describe("cart quantity — one normaliser for both controls", () => {
  it("Q1 the floor is 1, and there is no zero", () => {
    assert.equal(MIN_CART_QUANTITY, 1);
    assert.equal(clampCartQuantity(0), 1);
    assert.equal(clampCartQuantity(-7), 1);
    assert.equal(parseCartQuantityInput("0"), "1");
  });

  it("Q2 the ceiling is the storage ceiling, and the digit cap matches it", () => {
    assert.equal(MAX_CART_QUANTITY, 2147483647);
    assert.equal(MAX_CART_QUANTITY_DIGITS, String(MAX_CART_QUANTITY).length);
    assert.equal(clampCartQuantity(MAX_CART_QUANTITY + 1), MAX_CART_QUANTITY);
    assert.equal(parseCartQuantityInput("99999999999"), String(MAX_CART_QUANTITY));
  });

  it("Q3 digits only — a paste keeps the number it contained", () => {
    assert.equal(parseCartQuantityInput("3 tickets"), "3");
    assert.equal(parseCartQuantityInput(" 12 "), "12");
    assert.equal(parseCartQuantityInput("1.5"), "15");
  });

  it("Q4 an empty box is a draft and stays empty for display", () => {
    assert.equal(parseCartQuantityInput(""), "");
    assert.equal(parseCartQuantityInput("abc"), "");
    assert.equal(parseCartQuantityInput(null), "");
    assert.equal(parseCartQuantityInput(undefined), "");
  });

  it("Q5 committing an empty or zero box REVERTS rather than writing a value nobody typed", () => {
    assert.equal(commitCartQuantity("", 4), 4);
    assert.equal(commitCartQuantity("   ", 4), 4);
    assert.equal(commitCartQuantity("abc", 4), 4);
    assert.equal(commitCartQuantity("0", 4), 4);
    assert.equal(commitCartQuantity("00", 4), 4);
    // and a real answer commits as typed
    assert.equal(commitCartQuantity("8", 4), 8);
  });

  it("Q6 the clamp is total — a non-finite input is the minimum, never NaN", () => {
    assert.equal(clampCartQuantity(Number.NaN), MIN_CART_QUANTITY);
    assert.equal(clampCartQuantity(Number.POSITIVE_INFINITY), MIN_CART_QUANTITY);
    assert.equal(clampCartQuantity(Number.NEGATIVE_INFINITY), MIN_CART_QUANTITY);
    assert.equal(clampCartQuantity(3.9), 3);
  });
});

describe("deleted surfaces — pinned by absence, with the live replacement kept", () => {
  it("S1 the /expert/assigned-trips PAGE is gone; the redirect to Inbox is not", () => {
    assert.equal(
      existsSync(join(CLIENT_SRC, "pages/expert/assigned-trips.tsx")),
      false,
      "the retired page file must not come back",
    );
    const app = readClient("App.tsx");
    assert.ok(
      app.includes('<Route path="/expert/assigned-trips">'),
      "the C5 redirect route stays — the URL keeps working",
    );
    assert.ok(
      app.includes('<Redirect to="/expert/inbox?tab=assignments" />'),
      "and it still lands on the Inbox assignments tab",
    );
    assert.ok(
      !/from\s+["']@\/pages\/expert\/assigned-trips["']/.test(app),
      "nothing imports the deleted page",
    );
  });

  it("S2 TripExportButton is gone and nothing imports it", () => {
    assert.equal(
      existsSync(join(CLIENT_SRC, "components/itinerary/TripExportButton.tsx")),
      false,
      "the zero-importer component must not come back",
    );
  });

  it("S3 ExpertMatchCard survives; its caller-less Request Expert CTA does not", () => {
    const src = codeClient("components/expert-match-card.tsx");
    assert.ok(src.includes("export function ExpertMatchCard"), "the card itself is kept");
    assert.ok(!src.includes("onRequestMatch"), "the prop no caller passed is gone");
    assert.ok(!src.includes("button-request-expert"), "and so is the CTA it gated");
    assert.ok(
      src.includes('data-testid="button-view-profile"'),
      "the branch that actually rendered is the only one left",
    );
    const caller = codeClient("components/ai-matched-experts-section.tsx");
    assert.ok(caller.includes("<ExpertMatchCard"), "the one mount is untouched");
    assert.ok(!caller.includes("onRequestMatch"), "and it never passed the prop");
  });

  it("S4 routedItemIds is gone from the request jsonb; the item flip it counted is not", () => {
    const src = codeRoot("server/routes/booking-actions.ts");
    assert.ok(!src.includes("routedItemIds"), "the written-never-read field is gone");
    assert.ok(
      src.includes('routingStatus: "with_expert"'),
      "the in_planning → with_expert CAS flip is load-bearing and stays",
    );
    assert.ok(
      src.includes('eq(itineraryItemsTable.routingStatus, "in_planning")'),
      "including its from-state guard — the transition is still the guard, not a check",
    );
    assert.ok(src.includes("logItemTransition"), "and the diary row it writes in the same tx");
  });
});

describe("the typed cart box has ONE write path", () => {
  it("S5 the input carries the ratified testid and commits through the existing mutation", () => {
    const src = readClient("pages/cart.tsx");
    assert.ok(
      src.includes("data-testid={`cart-qty-input-${item.id}`}"),
      "the typed box exists under the ratified testid",
    );
    assert.ok(src.includes('inputMode="numeric"'), "it is a numeric input");
    assert.ok(
      src.includes("parseCartQuantityInput") && src.includes("commitCartQuantity"),
      "and it normalises through the one shared module, not a local regex",
    );
    assert.ok(
      /onCommit=\{\(quantity\) => updateItemMutation\.mutate\(\{ id: item\.id, quantity \}\)\}/.test(src),
      "the stepper's only write is the EXISTING quantity mutation",
    );
    assert.ok(
      !/apiRequest\("PATCH", `\/api\/cart\/\$\{item\.id\}`, \{ quantity/.test(src),
      "no second PATCH rail for quantity",
    );
    // Both controls go through the same clamp, so they cannot drift into two different bounds.
    assert.ok(
      src.includes("clampCartQuantity(current - 1)") && src.includes("clampCartQuantity(current + 1)"),
      "the −/+ buttons share the input's clamp",
    );
  });
});
