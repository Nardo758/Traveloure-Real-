# Audit brief — Catalog preview (Manage ⇄ Preview-as-traveler, Card shows, map toolkit)

**Mock:** `docs/design/catalog-preview-mock.html` (open in a browser; List/Map layout toggle at
top, Manage/Preview-as-traveler toggle beside it). Sibling directories
`docs/design/catalog-preview-upgrade/` (`mock-reference.png`, `after-preview.png`,
`after-preview-hover.png`) and `docs/design/catalog-parity/` (`before.png`, `after.png`,
`after-cardshows-popover.png`, `after-health-popover.png`, `after-availability-deeplink.png`) are
before/after captures of the BUILT result — reference them as visual evidence that the List-view
Manage/Preview work landed; do not re-describe them pixel-by-pixel, and do not treat the mock's
Map-view content (see Known divergences) as covered by these captures, since they document the
list surface only.
**Ledger:** ruling 74 C2 (Manage ⇄ Preview as a separate axis from List ⇄ Map), `docs/DECISIONS.md`
rows 92–94 (map authoring moved off Catalog), 109–110 (Catalog visual parity / rebuild from the
ratified mock)
**Status:** Partially shipped. The List-view Manage/Preview toggle, per-card "Card shows"
controls and the storefront preview banner are built and ledger-cited elsewhere as done. The
Map-view AUTHORING toolkit this file draws (arm-style tool chips for pin/route/radius/pickup/
surcharge editing directly on Catalog's map) is the STALE side of a later ruling — see Known
divergences before treating it as a target.
**Live surfaces:**
- `client/src/pages/provider/services.tsx` (Catalog list view, storefront header,
  `data-testid="button-storefront-preview"` and related storefront testids)
- `client/src/components/provider/catalog-map-view.tsx` (Catalog map view — read-only per ruling
  93/§22, NOT the authoring toolkit this mock's map section shows)
- `client/src/lib/catalog-preview-presentation.ts` (+ its test file) — presentation logic for the
  preview surface
- `client/src/pages/provider/distribute.tsx` (Promote — this mock's "Promote" block is explicitly
  a deep-link into Distribute, not a second surface)

## Behaviors the mock ratifies

1. **Manage and Preview-as-traveler are peer modes of the SAME list**, toggled by a segmented
   control — not a separate route or a modal.
2. **Preview-as-traveler applies the storefront's exact visibility predicate**: paused and
   unapproved/in-review listings are hidden, "exactly like your public page" — never shown
   greyed-out for context. This mirrors the same predicate stated in the provider-console-mockup
   family (§22b / ruling 74 C2) — same rule, same wording, two mocks.
3. **Manage mode exposes a per-card "Card shows" control**: a Price on/off toggle and a Booking
   mode selector (Instant / Request / Hidden), settable per listing — independent of the price
   itself, which is set in the form.
4. **A health meter is per-card and names what's missing** in plain language ("no exact pin · no
   availability"), not just a numeric score.
5. **"Add New Service" opens Workstation** — "one door for service, bundle or property" — matching
   the one-door rule audited in the sibling provider-console-mockup brief.
6. **Promote is a deep-link INTO Distribute**, not a duplicate surface: the mock's own footer copy
   states the channels/share-kit/link-stats all live in Distribute — "one hub, no duplication."
7. **The mapping toolkit is explicitly split into "Traveler layers" (what ships to travelers: pin,
   numbered route stops, coverage radius or pickup route — pick one, the other isn't erased — and
   honest "X of Y located") versus "Business layers" (demand heat, coverage-gap alerts,
   travel-surcharge zone, market reach) versus "Also proposed · your pick"** — the mock itself
   labels the last column as open questions, not ratified.
8. **Everything on the map stays honest per §13**: no invented drive-times, no guessed pins, real
   data only — stated verbatim in the mock's own recommendation panel.
9. **"One door — decided"** is called out explicitly as already-ratified in this mock's closing
   recommendation panel, alongside genuinely open questions (which new mapping ideas ship in v1,
   whether to keep the hover Edit affordance on Preview cards, whether "Hidden price" applies to
   all services or only quote-based ones) — these open questions are NOT yet decided; do not
   audit them as if they were.

## Visual grammar

- `.banner.preview` / `.banner.manage` — mode-specific banners restating the active mode's rule in
  one line; check the ACTIVE banner's text matches the active toggle state, not just that a
  banner exists.
- The three-column "mapping toolkit" recommendation block at the bottom uses column headers
  (Traveler layers · Business layers · Also proposed) as the authority on what is ratified vs.
  open — an item's column, not its visual styling, is what to cite.

## How to audit

1. Open `/provider/services`, toggle to Preview as traveler with at least one paused and one
   in-review listing present — confirm both are absent from the preview grid (not shown
   greyed-out) and the banner text matches this mock's wording (or its ratified successor).
2. In Manage mode, toggle a card's Price display off and its Booking mode to "Request" — confirm
   these persist independently of the listing's actual price value, and that Preview mode
   reflects the change (button/CTA and price visibility update accordingly).
3. `grep -n "data-testid=\"button-storefront-preview\"" client/src/pages/provider/services.tsx` —
   confirm the built preview entry point exists under this or an equivalent testid.
4. Open Catalog's Map view live and confirm it has NO pin-placement, route-editing, radius, or
   surcharge-zone EDITING controls (per ruling 93) — only a read-only rendering plus, at most, the
   demand/coverage-gap analytics overlays this mock itself flags as still-Catalog-resident pending
   a possible move to Performance.
5. Click "Add New Service" from Catalog and confirm it opens Workstation, not a form directly.
6. Open a listing's Promote entry from Catalog and confirm it hands off to `/provider/distribute`
   rather than opening a second promote surface on Catalog itself.

## Known divergences / notes

- This mock's Map view draws an AUTHORING toolkit (clickable "on" tool chips for Start pin, Route
  stops, Coverage radius, Pick-up/drop-off, Surcharge zone) directly on Catalog's map canvas. A
  later ruling (93, Aug 12/13 — see the provider-console-mockup family) moved ALL map authoring
  off Catalog into the create flow's step 4 "Logistics," leaving Catalog's map as a read-only
  traveler preview. This file was not resynced after that ruling. Audit Catalog's live map
  against ruling 93's read-only posture, not against this mock's authoring toolkit — the toolkit
  section is superseded, not a target to build toward.
- The demand-heat / coverage-gap "Business layers" shown on this mock's map are, per the sibling
  provider-console-mockup mock, PROPOSED to move to Performance and explicitly "not part of this
  approval" — so their continued presence on Catalog's map (if still there) is not itself a
  divergence; only their presence AS EDITABLE/authoring content would be.
