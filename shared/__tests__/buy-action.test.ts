/**
 * `resolveBuyAction` — the ONE reading of `provider_services.booking_mode`.
 * Ledger `2026-09-08-recorded-cleanups` (§18 rule 1). Pure; no DB, no DOM, no network.
 *
 * Run: npx tsx --test shared/__tests__/buy-action.test.ts
 *
 * WHAT THESE PROVE:
 *   C1  each mode maps to its own KIND — the three are never collapsed.
 *   C2  `hidden` is `enquire`, which is NOT a buy action; it carries its own kind so a surface with
 *       no enquiry affordance (the Catalog preview) can drop it while the storefront card renders it.
 *   C3  `instantLabel` applies to `instant` ONLY — a caller's verb can never rename a request or an
 *       enquiry into a booking.
 *   C4  NULL/undefined ⇒ instant, stated once here rather than defaulted at each caller.
 *   C5  the Catalog preview DELEGATES rather than restating the rule — its own labels come back
 *       from the resolver, which is the drift this lane closed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveBuyAction } from "../buy-action";
import { deriveBookingCta } from "../../client/src/lib/catalog-preview-presentation";

describe("resolveBuyAction — the one buy-affordance rule", () => {
  it("C1: each booking mode names its own kind", () => {
    assert.equal(resolveBuyAction("instant").kind, "book");
    assert.equal(resolveBuyAction("request").kind, "request");
    assert.equal(resolveBuyAction("hidden").kind, "enquire");
  });

  it("C2: hidden is an enquiry, not a differently-worded booking", () => {
    const hidden = resolveBuyAction("hidden");
    assert.equal(hidden.kind, "enquire");
    assert.equal(hidden.label, "Enquire");
    assert.notEqual(hidden.kind, "book");
    // …and a caller's own booking verb does not reach it (see C3).
    assert.equal(resolveBuyAction("hidden", { instantLabel: "View & book →" }).label, "Enquire");
  });

  it("C3: instantLabel applies to `instant` only", () => {
    assert.equal(resolveBuyAction("instant", { instantLabel: "Check dates →" }).label, "Check dates →");
    assert.equal(resolveBuyAction("request", { instantLabel: "Check dates →" }).label, "Request to book");
    // A blank or whitespace verb is not a label — the ruled default stands (§13: an empty string is
    // not an answer, and rendering one would give the card an unnamed button).
    assert.equal(resolveBuyAction("instant", { instantLabel: "   " }).label, "Book");
    assert.equal(resolveBuyAction("instant", { instantLabel: "" }).label, "Book");
  });

  it("C4: NULL/undefined resolves to instant, in one place", () => {
    assert.equal(resolveBuyAction(null).kind, "book");
    assert.equal(resolveBuyAction(undefined).kind, "book");
    assert.equal(resolveBuyAction(null).label, "Book");
  });

  it("C5: the Catalog preview delegates — its labels ARE the resolver's", () => {
    assert.equal(deriveBookingCta("request")?.label, resolveBuyAction("request").label);
    assert.equal(deriveBookingCta("instant")?.label, resolveBuyAction("instant").label);
    // The preview's own presentation decision survives: no button at all for the enquire case,
    // because that mock draws no enquiry affordance.
    assert.equal(deriveBookingCta("hidden"), null);
    assert.equal(deriveBookingCta("request")?.variant, "outline");
    assert.equal(deriveBookingCta("instant")?.variant, "solid");
  });
});
