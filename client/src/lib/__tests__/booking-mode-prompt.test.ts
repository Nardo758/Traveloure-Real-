/**
 * SELLER BOOKING-MODE PROMPT — ledger `2026-09-25-seller-booking-mode-prompt`.
 *
 * The decision-maker holds PR #1101 (checkout refuses request-mode lines) until enough listings are
 * instant, and FIRST asks sellers to choose. A banner that silently stops rendering breaks nothing
 * and logs nothing — the listings just stay undecided — so the pins are on the predicate, the copy
 * and the shipped mount.
 *   V1 an earner with ≥1 undecided listing is asked; quote-only / chosen-only is not.
 *   V2 a non-earner, a missing viewer and an UNANSWERED status read ask nobody (§13).
 *   V3 a session dismissal silences it (and only that).
 *   V4 the copy counts the undecided listings, names the mode they resolved to, and explains both.
 *   V5 "Choose per listing" goes to each console's own Catalog.
 *   S1 the banner mounts ONCE in BackofficeShell, beside the handle banner, gated on the predicate,
 *      and dismisses per SESSION (sessionStorage — never a permanent localStorage silence).
 *   S2 the bulk action calls the one owner-scoped rail; the expert toggle writes the EXISTING
 *      listing PATCH rail — no other writer of bookingMode appears in the new files.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bookingModeBannerCopy,
  catalogHrefForRole,
  shouldShowBookingModeBanner,
  undecidedListings,
  type BookingModeStatus,
} from "../booking-mode-prompt";

const CLIENT_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(CLIENT_SRC, rel), "utf8");

const status = (states: Array<["chosen" | "undecided" | "quote", "instant" | "request" | "hidden"]>): BookingModeStatus => {
  const listings = states.map(([state, mode], i) => ({ id: `s${i}`, name: `L${i}`, state, mode }));
  return { listings, undecidedCount: listings.filter((l) => l.state === "undecided").length };
};

describe("booking-mode prompt predicate", () => {
  it("V1 asks an earner with an undecided listing, and only then", () => {
    const expert = { role: "expert" };
    const provider = { role: "service_provider" };
    assert.equal(shouldShowBookingModeBanner(expert, status([["undecided", "request"]]), false), true);
    assert.equal(shouldShowBookingModeBanner(provider, status([["chosen", "instant"], ["undecided", "request"]]), false), true);
    assert.equal(shouldShowBookingModeBanner(expert, status([["quote", "request"]]), false), false, "quote is request by construction");
    assert.equal(shouldShowBookingModeBanner(expert, status([["chosen", "request"]]), false), false);
    assert.equal(shouldShowBookingModeBanner(expert, status([]), false), false);
  });

  it("V2 a non-earner, a missing viewer and an unanswered read ask nobody", () => {
    const s = status([["undecided", "request"]]);
    assert.equal(shouldShowBookingModeBanner({ role: "user" }, s, false), false);
    assert.equal(shouldShowBookingModeBanner({ role: "executive_assistant" }, s, false), false);
    assert.equal(shouldShowBookingModeBanner({ role: "admin" }, s, false), false);
    assert.equal(shouldShowBookingModeBanner(null, s, false), false);
    assert.equal(shouldShowBookingModeBanner({ role: "expert" }, undefined, false), false);
    assert.equal(shouldShowBookingModeBanner({ role: "expert" }, {} as any, false), false);
  });

  it("V3 a session dismissal silences it", () => {
    assert.equal(shouldShowBookingModeBanner({ role: "expert" }, status([["undecided", "request"]]), true), false);
  });

  it("V4 the copy counts, names the resolved mode and explains both choices", () => {
    const one = bookingModeBannerCopy(undecidedListings(status([["undecided", "request"], ["chosen", "instant"]])));
    assert.equal(one.headline, "Choose how travelers book your listings.");
    assert.equal(one.detail, "1 listing is set to 'Request to book' because you haven't chosen.");
    assert.match(one.instant, /pay at checkout/);
    assert.match(one.request, /approve each booking first/);
    const three = bookingModeBannerCopy(undecidedListings(status([["undecided", "request"], ["undecided", "request"], ["undecided", "request"]])));
    assert.equal(three.detail, "3 listings are set to 'Request to book' because you haven't chosen.");
    const inst = bookingModeBannerCopy(undecidedListings(status([["undecided", "instant"]])));
    assert.match(inst.detail, /'Instant booking'/, "never claims a default the rows do not carry");
  });

  it("V5 per-listing goes to each console's own Catalog", () => {
    assert.equal(catalogHrefForRole("expert"), "/expert/catalog");
    assert.equal(catalogHrefForRole("local_expert"), "/expert/catalog");
    assert.equal(catalogHrefForRole("service_provider"), "/provider/services");
  });
});

describe("booking-mode prompt mounts", () => {
  it("S1 one mount on the shared shell, gated on the predicate, dismissed per session", () => {
    const shell = read("components/backoffice/backoffice-shell.tsx");
    assert.equal((shell.match(/<BookingModeBanner\s*\/>/g) ?? []).length, 1);
    const banner = read("components/backoffice/booking-mode-banner.tsx");
    assert.ok(banner.includes("shouldShowBookingModeBanner(user, status, dismissed)"));
    assert.ok(banner.includes("sessionStorage"));
    assert.ok(!banner.includes("localStorage"), "a permanent dismissal would be the silence the prompt exists to end");
  });

  it("S2 the writes go through the existing rails only", () => {
    const banner = read("components/backoffice/booking-mode-banner.tsx");
    assert.ok(banner.includes('"/api/me/listings/booking-mode/decide"'));
    const toggle = read("components/backoffice/booking-mode-toggle.tsx");
    assert.ok(toggle.includes("`/api/provider/services/${listing.id}`"));
    assert.ok(toggle.includes("{ bookingMode: mode }"));
  });
});
