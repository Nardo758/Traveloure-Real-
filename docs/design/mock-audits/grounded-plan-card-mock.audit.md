# Audit brief — Grounded Plan Card

**Mock:** `docs/design/grounded-plan-card-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-23-item2-affiliate` (plus `2026-08-23-item2-affiliate-server`, `2026-08-23-item2-affiliate-reconcile`, `2026-08-23-item2-grounding` for the resolver rungs it builds on)
**Status:** merged Aug 22–23 set — code shipped against this mock; ruling text > merged code > mock pixels on any disagreement.
**Live surfaces:**
- `client/src/components/plancard/AffiliateBookButton.tsx` (exists)
- `client/src/components/plancard/affiliate-booking.ts` (exists)
- `server/services/slip-grounding.service.ts` (exists)
- `server/services/slip-grounding-match.ts` (exists, cited by mock as `slip-grounding-match.ts`)

## Behaviors the mock ratifies

1. Every AI-generated itinerary item resolves through exactly one of four **mutually exclusive** rungs, first match wins, at match threshold `0.82`: (1) Catalog, (2) Affiliate, (3) DMO, (4) honest Suggestion.
2. Rung 1 (Catalog): item matched to a real `provider_services` row — pill reads "Bookable on Traveloure", shows a real "Add to trip · from $N" price, no fabricated price.
3. Rung 2 (Affiliate): item matched to an `affiliate_products` row classified `affiliate_bookable` — pill reads "Partner product"; CTA is "Book via your Traveloure agent", not a raw link.
4. Rung 3 (DMO): item matched to a `dmo_extracted_places` row — pill reads "From the [city] city guide"; no booking CTA, only "Free to visit · no booking needed" (informational, never bookable).
5. Rung 4 (honest suggestion): no confident match on any rung — pill reads "AI suggestion · unverified"; CTA area shows "We couldn't match this to a real listing yet" — the item is still shown, never dropped or silently upgraded (§13).
6. Coordinates are copied from the matched entity onto the item ONLY when the item itself has none — never overwritten, never geocoded from a guess.
7. §16: the affiliate URL never reaches the client. The CTA carries only an opaque server-minted `bookingToken`; clicking it POSTs to `/api/affiliate-booking-requests`. There must be **no `window.open(affiliateUrl)`** anywhere in the affiliate CTA path.
8. The affiliate CTA (`resolveAffiliateBooking()`/equivalent) renders a button ONLY when `bookingType === "affiliate_bookable"` AND a real token is present — absent either, no button renders (fail-closed, not a disabled/dead button).
9. `affiliateBooking` is present on `TripPlanActivity` only for really-grounded bookable partner items — an absent key on every other item, never a null-valued key standing in for "not applicable".
10. Signed-out tap on the agent CTA opens sign-in (`openSignInModal()`) before firing; success shows a "Booking request sent" toast and the button locks to "Requested ✓".
11. `groundAiItems()` is fail-closed: a resolver failure degrades all items to ungrounded/honest-suggestion, never blocks the itinerary build.

## Visual grammar

- Provenance pill palette: `--catalog-bg/-ink` (green), `--affiliate-bg/-ink` (amber), `--dmo-bg/-ink` (violet), `--honest-bg/-ink` (grey) — must mirror the content-history dialog's change-type hues exactly (shared semantic vocabulary across surfaces).
- `--accent` (deep travel-teal) is the only bold/coral-adjacent hue on this surface, used for the agent CTA and eyebrow only — sparing use, not a coral flood.
- Geist-family mono (`JetBrains Mono` in this mock) used for eyebrow, timestamps, pill icon-adjacent labels, and the spec-side rung numbers/contract keys — never for body copy.
- Card-on-ground: `.plancard` is `--surface` (white/near-black) floated on `--ground` with `--shadow`, `--radius: 14px` — standard card-on-ground token pairing.

## How to audit

1. Confirm the four rungs exist and are mutually exclusive in the resolver:
   `grep -n "0.82\|MATCH_THRESHOLD" server/services/slip-grounding-match.ts` (expect the threshold constant).
2. Confirm no raw outbound on the affiliate CTA:
   `grep -rn "window.open" client/src/components/plancard/AffiliateBookButton.tsx client/src/components/plancard/affiliate-booking.ts` — expect **no matches**.
3. Confirm the CTA copy:
   `grep -n "Book via your Traveloure agent" client/src/components/plancard/AffiliateBookButton.tsx` — expect a match.
4. Confirm the booking rail target:
   `grep -rn "affiliate-booking-requests" client/src/components/plancard/` — expect a POST to this path, not a direct affiliate URL fetch.
5. Confirm fail-closed presence semantics:
   `grep -n "affiliateBooking" client/src/components/plancard/affiliate-booking.ts` and check the guard returns `null`/`undefined` (not a falsy-but-present object) when `bookingType !== "affiliate_bookable"` or no token.
6. Confirm `groundAiItems` never throws: `grep -n "try\|catch" server/services/slip-grounding.service.ts` and read the outer wrapper (structure check only, per task scope — do not review full contents beyond confirming the fail-closed shape referenced by the ledger).
7. In the running app: generate an AI itinerary for a market with catalog + affiliate + DMO coverage (e.g. Kyoto), open the resulting plan card, and visually confirm all four pill states can occur and that an unmatched item still renders with the honest-suggestion pill rather than being omitted from the card.
8. Confirm the DMO rung never renders a CTA: on a DMO-pilled item, expect only the "Free to visit" text, no button element.

## Known divergences / notes

None recorded. The mock's own status line already states "shipped · main @6509fa2b" — auditor should treat any drift found as a live defect, not an intended design change, since the ledger governs.
