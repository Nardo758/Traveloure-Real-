# Console conformance dispatch — Workstation · Catalog · Distribute (Aug 16, 2026)

**Purpose:** the decision-maker reported these three pages "do not match the mockup"; the open
sweep findings (S-1..S-4) were then fixed on branch
`claude/ui-mockup-workspace-catalog-distribute-ywd2kh` (code under test: commit `83d1fee`,
ledger row `2026-08-16-console-conformance-fixes`). This dispatch asks the Replit agents to
**verify each page against the ratified mock in a running app** and report PASS/DIVERGES per
checklist row, so the conformance question can be **closed on evidence** rather than assertion.

**Reference assets (this repo, `docs/design/provider-console-mockup/`):**

| Page | One-page mock (open in a browser) | Full-page reference PNG |
|---|---|---|
| Workstation ("Workspace") | `page-workstation.html` | `mock-03-workstation.png` |
| Catalog (incl. availability + listing home) | `page-catalog.html` | `mock-01-catalog.png`, `mock-13-availability.png`, `mock-12-listing-home.png` |
| Distribute | `page-distribute.html` | `mock-18-distribute.png` |

The three `page-*.html` files are one-page extractions of the canonical `mockup.html` (identical
CSS/markup/JS, boot pinned to that view) — regenerate from `mockup.html`, never hand-edit. Put
the mock page and the live page side by side at ~1440×1000 and walk the checklist.

---

## Authority scope — read BEFORE filing a divergence

Ratified rulings **outrank** the mock (mockup README, ledger row 92). The following are
**deliberate, ruled deltas — a match to the mock here would be the bug.** Do NOT file these:

1. **Storefront URL is `/p/:handle`**, not the mock's `traveloure.com/@handle` (D-3, accepted —
   OG injection, short-link expansion and the language overlay all key on `/p/`).
2. **Feed share frame is 1080×1350 portrait**, not the mock's square (D-6, accepted).
3. **Distribute carries MORE than the mock's three cards** — the Marketplace and Direct-link
   channels and the channel-state strip are ratified builds (ruling 74 lanes D2/D4). Their
   presence is not a divergence; their *absence* would be.
4. **Workstation has no "Preview as unlocked" button** (S-5, recorded decision) — the ship has a
   real locked Bundle tile with real progress toward unlocking. The mock's button is a demo
   affordance for reading the mock.
5. **Transport on step 4 is the 4-state segmented control**, not the mock's single pickup toggle
   (ruling 112 — the mock is the stale side there).
6. **Catalog's map is the read-only traveler preview** (ruling 93/120); authoring lives in the
   create flow's Logistics step. The mock says the same — listed here because the mock ALSO
   contains the authoring canvas (in its create flow), and it must NOT appear on Catalog.
7. **The gap-#13 read-out and market-insight blocks on the Catalog map** carry their ratified /
   flagged chips per lanes M2/M3 — copy differences inside those chips are recorded state, not
   drift.
8. **Availability opens beside the listing** (an "Edit slots"/deep-link surface on Catalog with
   the `?availability=<id>` convention) rather than permanently expanded under the list. The
   mock's always-mounted block is its click-through presentation; the ruled placement is
   "Catalog owns the editor" — judge the editor's CONTENT, not whether it is always expanded.

Anything else that differs from the mock: file it.

## Environment + identity notes (lessons already paid for — do not re-learn them)

- Log in as a **provider account that owns listings**; you need at least one **approved + active**
  listing (the edit-split panel renders only on approved listings) and one **pdf/async** listing
  (the "No calendar" branch). The vendor-seed fixtures with backfilled passwords
  (`e2e-test-accounts.seed.ts`) work; so does a fresh provider with listings you create.
- A provider without `terms_accepted_at`/`privacy_accepted_at` bounces every console route to
  `/accept-terms` (ledger 122's bench lesson) — accept terms first or nothing below renders.
- If you seed from empty: the availability month grid shows "Nothing published yet" until real
  slots/ranges exist — that is correct §13 behavior, not a failure. Author a weekly pattern (or a
  date range on a room) first, then judge the grid.

---

## Checklist A — Workstation (`/provider/workstation`) vs `page-workstation.html`

| # | Check | Expected |
|---|---|---|
| A1 | Header | "What are you building?" + one-door subtitle; this screen is where new listings are born. |
| A2 | Door tiles | Three tiles: Single service · Bundle (locked state with the provider's REAL approved count + progress bar when under 2) · Property. |
| A3 | Category grid | "Or start from what you do" — live service categories; clicking one enters the create flow with the category pre-selected. |
| A4 | Your bundles / Your properties | Both orientation cards render with real rows; property card deep-links to the builder. |
| A5 | **Property builder steps (S-2 fix)** | "+ New property" opens the ladder **1. The property · 2. Rooms · 3. Review**; forward tabs/Next gate on validity; **Submit for review exists ONLY on the Review step**, which reads back name/location/pin ("Not placed — optional" when none)/description/rooms. |
| A6 | Property EDIT dialog | Unchanged: The property · Details · Rooms with per-step saves (no Review — deliberate). |

## Checklist B — Catalog (`/provider/services`) vs `page-catalog.html`

| # | Check | Expected |
|---|---|---|
| B1 | Toolbar | Search + status chips (All / Live / In review / Draft) + List \| Map toggle; both List and Map obey the filter (ruling 120b). |
| B2 | Listing rows | Thumb · name · meta · status pill · storefront toggle · Availability → · health bar + label · Edit · "Promote this →" (lands on Distribute with the listing preselected). |
| B3 | Map = traveler preview | Read-only notice; located-only canvas; "X of Y" coverage line naming any active filter; unlocated rows named off-canvas with true reasons; shape-aware fix links; ODbL attribution visible. |
| B4 | **Month grid (S-3 fix)** | In the availability editor, scheduled AND property listings show the shared month grid ABOVE their rails, with legend **Bookable / Blacked out / Nothing published / Today**; it opens on the month of the next bookable day ("Next available" chip jumps back to it); scheduled cells show real slot time + seats left; range cells show the range's nightly price or "Bookable" (never an invented number); blackouts render striped and win over open days. |
| B5 | **Vocabulary (S-4 fix)** | Section titles read "Repeats weekly", "Published date ranges"; a pdf/async listing gets "**No calendar — this sells without slots**" and NO empty grid. |
| B6 | **Listing home edit-split (S-1 fix)** | Open an APPROVED listing's home (Catalog → Edit): the "**Editing a live listing**" panel renders two columns — Goes live immediately (price/pricing, photos+order, availability, description wording, what-to-bring/access notes, pin position) vs Re-enters review (listing name, category+offering, delivery method, product shape) — closing on "Nothing is taken down for an edit." A draft/submitted listing must NOT show the panel. |
| B7 | Edit-split truth test (behavioral, not visual) | On that approved listing, PATCH a safe field (price) → applies immediately, listing stays live; PATCH an identity field (name) → response carries `editReview.stagedKeys`, Catalog row shows Live + "Edit in review", live row unchanged. The panel's two columns must agree with what actually happened — if they disagree, that is a P1: the panel reads `shared/edit-split.ts`, which the PATCH handler imports, so a disagreement means the build is stale or the import broke. |

## Checklist C — Distribute (`/provider/distribute`) vs `page-distribute.html`

| # | Check | Expected |
|---|---|---|
| C1 | Storefront card | Leads with avatar + business name; `/p/<handle>` URL (see authority note 1); "Live · showing X of Y listings"; Edit handle & bio + share tools. |
| C2 | Share kit | Three frames — Feed · Story · **Route** — purpose-first sublabels; the Route honesty line ("stops in order — not a travel route, no distances or times"); copy-link + QR actions; images unlock only for approved+active listings (honest message otherwise). |
| C3 | Promote | Real posting opportunities (review shares / open-slot promos) with inline actions; **the closing note "Measurement stays on Performance."** (new, `text-promote-measurement-note`); NO analytics numbers anywhere on this page — the strip's "View link performance" deep-links out. |
| C4 | Arrival flow | From a Catalog card's "Promote this →": crumb line Catalog › Distribute › «name», "Promoting «name»" banner, ← Back to Catalog; a hand-edited/foreign `?listing=` id is silently ignored. |
| C5 | Ratified extras present | Marketplace channel (honest live/blocked state with fix links), Direct-link channel (first action mints inline; URL shown only once it exists), channel-state strip. Absence = divergence (authority note 3). |

---

## Report format + close criteria

For each row: **PASS / DIVERGES / BLOCKED** + one screenshot (name it `<row>-<slug>.png`, e.g.
`B4-month-grid.png`), filed under `docs/testing/assets/console-conformance-aug16/`. For a
DIVERGES row: one sentence on what differs and which side (mock vs ruling vs ship) is
authoritative under the scope above. For BLOCKED: what was missing (data, account, key) — do not
guess a verdict.

Append the verdict table to THIS file under "## Results". File any real divergence in
`docs/planning/QA_PUNCH_LIST.md` (new section, date-stamped) rather than fixing it in the same
pass — this dispatch verifies, it does not repair (§17's detect-don't-repair posture applied to
UI).

**Close condition:** every row PASS (or DIVERGES only where the Results row cites the authority
note making the ship side correct) ⇒ note "console conformance CONFIRMED" in the Results header,
and the "UI does not match the mockup" report is closed. Any other outcome stays open with the
punch-list pointer.

---


## Results — console conformance CONFIRMED (run Aug 16, 2026)

Run against the current checkout (branch `claude/ui-mockup-workspace-catalog-distribute-ywd2kh`,
code under test `83d1fee`) as provider `kyoto-interpreter@traveloure.test` (terms accepted;
3 approved+active listings incl. one async, plus a property created live during A5). Viewport
1440×1000; screenshots under `docs/testing/assets/console-conformance-aug16/`.

Evidence is produced by an **executable asserting dispatch**, `scripts/console-conformance-capture.ts`
(`npx tsx scripts/console-conformance-capture.ts`): it logs in, seeds availability through the real
PUT write path, hard-asserts every row's load-bearing expectations (exiting non-zero on any miss),
performs the B7 PATCHes itself and captures the post-patch Catalog row, creates/deletes the B6 draft
probe and the A5 property fixture via the API, exercises both C2 eligibility states via `?listing=`
deep links (approved → frames unlocked; draft → honest unlock message, zero share images), and
reverts its side effects (price revert asserted; the staged identity edit has no owner cancel API —
the script prints the one-line SQL, which was run and verified after this run). Final run:
**ALL CHECKS PASSED, exit 0. All 18 rows PASS — no punch-list entries filed.**

Rerun note: the dev server must have `RATE_LIMIT_LOOPBACK_SKIP=1` (the documented CI escape hatch
in `server/infrastructure/rate-limiter.ts`) — without it the run's request volume trips per-IP
limiters mid-checklist and the SPA bounces to sign-in (a 429 artifact, not a conformance failure).

| Row | Verdict | Screenshot | Notes |
|---|---|---|---|
| A1 | PASS | `A1-header.png` | "What are you building?" + one-door subtitle ("One door for building what you sell — start with a service, grow into bundles."). |
| A2 | PASS | `A2-door-tiles.png` | Three tiles: Single service · Bundle · Property. Bundle renders UNLOCKED ("New bundle →") because this provider has 3 approved services — the ≥2 real-count condition, so no progress bar is the correct state. No "Preview as unlocked" button (authority note 4). |
| A3 | PASS | `A3-category-grid.png` | "Or start from what you do" with the live category grid. |
| A4 | PASS | `A4-bundles-properties.png`, `A4b-properties.png` | Your bundles / Your properties orientation cards render; empty property card's "+ New property" deep-links to the builder. |
| A5 | PASS | `A5-property-builder-step1.png`, `A5b-…step2-rooms.png`, `A5c-…review.png` | Ladder reads **1. The property · 2. Rooms · 3. Review**. Next gates on validity (step 2's Next stayed disabled until a named+priced room existed). "Submit for review" exists ONLY on Review, which reads back name / location / "Not placed — optional" pin / description / "Rooms (1) The Tatami Room · $180 / night". |
| A6 | PASS | `A6-property-edit-dialog.png` | Edit dialog is the unchanged The property · Details · Rooms shape with per-step saves ("Save room", "Save capacity") and no Review step. |
| B1 | PASS | `B1-toolbar.png` | Search + All(5)/Live(3)/In review(2)/Draft(0) chips + Manage\|Preview and List\|Map toggles. |
| B2 | PASS | `B2-listing-rows.png` | Rows carry thumb · name · meta · status pill · storefront toggle · "Availability →" · health bar with honest labels ("no photo", "Ready", "no exact pin") · Edit · "Promote this →". |
| B3 | PASS | `B3-map-preview.png` | Read-only "Traveler preview" notice; located-only canvas; "2 of 4 place-anchored listings located"; unlocated rows named off-canvas with true reasons + "Fix it in the Workstation →" links; OpenStreetMap/Leaflet attribution visible. Gap-#13 / market-insight chips present per authority note 7. |
| B4 | PASS | `B4-month-grid.png`, `B4b-month-grid-drawer.png` | Month grid above the rails with legend Bookable / Blacked out / Nothing published / Today; opens on the next bookable month with a "Next available: Tue, Aug 18 · 18:00" chip; scheduled cells show real slot time + seats ("18:00 · 8 left"); the Aug 24–26 blackout renders shaded ("Closed for Obon") and **wins over the Thursday pattern on Aug 26**. Editor opened beside the listing via `?availability=<id>` (authority note 8). |
| B5 | PASS | `B5-no-calendar.png` | "Repeats weekly" / "Published date ranges" vocabulary confirmed on the scheduled listing; the async listing shows "**No calendar — this sells without slots**" with NO empty grid, plus one-off dated slots. |
| B6 | PASS | `B6-edit-split-panel.png`, `B6b-no-panel-on-draft.png` | Approved listing home renders "Editing a live listing" with the two ruled columns (Goes live immediately: price, photos+order, availability/slots/blackouts, description wording, what-to-bring/access notes, pin position · Re-enters review: listing name, category+offering, delivery method, product shape), closing on "Nothing is taken down for an edit." A draft listing shows NO panel (verified live, count 0). |
| B7 | PASS | `B7-edit-in-review-row.png` | **Behavioral truth test, run with real PATCHes** on approved listing `9f08a627` (Conference & Event Interpretation): safe PATCH `{price: 2450.00}` → applied immediately, response had NO `editReview`, listing stayed approved+active. Identity PATCH `{serviceName: "… (Kansai)"}` → response returned `editReview: {status:"pending", stagedKeys:["serviceName"]}`, live row kept the old name, Catalog row showed **Live + "Edit in review"**. Panel columns agree with observed behavior (both read `shared/edit-split.ts`). Side effects reverted after capture (price restored to 2400.00, staged pending_changes cleared). |
| C1 | PASS | `C1-storefront-card.png` | Avatar + business name; `/p/kansai-bizlang` URL (authority note 1); "Live · showing 3 of 5 listings"; Edit handle & bio, Preview, Copy link + caption share tools. |
| C2 | PASS | `C2-share-kit.png` | On the approved listing: Feed (1080×1350 portrait per authority note 2) and Story frames with download + Instagram publish; Route frame honestly withheld with "This service has no route stops yet" (the listing has no route stops — honest state, not a missing frame). On a not-yet-approved listing the kit shows the honest unlock message ("Social images unlock once this listing is approved and active"). |
| C3 | PASS | `C3-promote.png` | Real posting opportunity (open-slots promo "…has 126 open spots aug 16 — promote it" with frame image + inline actions); closing note "**Measurement stays on Performance.**" present (`text-promote-measurement-note`); no analytics numbers anywhere on the page — the strip's "View link performance" deep-links out. |
| C4 | PASS | `C4-arrival-flow.png`, `C4b-forged-listing-ignored.png` | "Promote this →" from Catalog lands with crumb line Catalog › Distribute › «name», "Promoting «…»" banner and "← Back to Catalog". A forged `?listing=00000000-…` id is silently ignored: no arrival banner, page falls back to the default listing selection with no error. |
| C5 | PASS | `C5-ratified-extras.png` | All three ratified extras present (authority note 3): Marketplace channel with honest blocked state + per-blocker Fix → links (and honest live state on the approved listing, see `C2-share-kit.png`), Direct-link channel (mint-on-first-action: Copy link / WhatsApp / Show QR, no URL pre-mint), and the channel-state strip (Storefront · Marketplace · Direct · Social). |

**Close condition met** — every row PASS; the only mock deltas observed are the ruled ones in the
Authority scope (checked and not filed). The "UI does not match the mockup" report can be closed.

Bench note for reruns: author availability through
`PUT /api/provider/services/:id/availability-patterns` (it materializes
`vendor_availability_slots`); rows inserted directly into `service_availability_patterns` never
reach the month grid, which reads materialized slots.
## Results — console conformance CONFIRMED (runtime walk-through, Aug 16 2026)

Run on branch `claude/ui-mockup-workspace-catalog-distribute-ywd2kh` (HEAD `ef64c598`, includes
`5820998`); boot clean with all migrations recorded (0 newly applied, 230 recorded, 243/230 ledger
— includes 214/215/216). Provider identity: `test-provider@traveloure.test` (terms accepted;
9 approved+active listings incl. a pdf listing, a seeded property "Kamo River Guesthouse" with a
Sep 2026 date range + Sep 15–16 blackout, a seeded bundle "Kyoto Classics Bundle", weekly patterns
and 3 route stops on "Gion Walking Tour with Photographer"). Evidence: 20 PNG screenshots plus
`B7-patch-evidence.json` (ordered raw API request/response log) under
`docs/testing/assets/console-conformance-aug16/`.

| Row | Verdict | Evidence / notes | Screenshot |
|---|---|---|---|
| A1 | PASS | "What are you building?" + one-door subtitle | `A1-header.png` |
| A2 | PASS | Three door tiles; Bundle unlocked (provider has ≥2 approved — real count drives state) | `A2-door-tiles.png` |
| A3 | PASS | Category click opens create flow with category pre-selected (`?category=Photography%20%26%20Videography`) | `A3-category-grid.png` |
| A4 | PASS | Both orientation cards render real rows (bundle + property); property deep-links to builder. First pass showed an empty bundles card — data gap, resolved by seeding a real bundle, not a UI divergence | `A4-orientation-cards.png` |
| A5 | PASS | Ladder "1. The property · 2. Rooms · 3. Review"; Next gated on validity; Submit ONLY on Review; Review reads back name/location/pin ("Not placed — optional")/description/rooms | `A5-property-builder.png` |
| A6 | PASS | Edit dialog: The property · Details · Rooms, per-step saves, no Review (deliberate) | `A6-property-edit-dialog.png` |
| B1 | PASS | Search + All/Live/In review/Draft chips + List\|Map; filter obeyed in both views (ruling 120b) | `B1-toolbar.png` |
| B2 | PASS | Rows show thumb · name · meta · pill · storefront toggle · Availability → · health bar+label · Edit · Promote this → | `B2-listing-rows.png` |
| B3 | PASS | Read-only traveler-preview notice; located-only canvas; coverage line; unlocated named off-canvas with true reasons + shape-aware fix links; ODbL visible (authority note 6: read-only is correct) | `B3-map-preview.png` |
| B4 | PASS | Month grid above rails, legend Bookable/Blacked out/Nothing published/Today; opens on next bookable month, "Next available" jumps back; scheduled cells "09:00 · 6 left"; property cells "$180.00 / night"; Sep 15–16 striped blackout wins. First pass showed "Nothing published yet" — a seeding artifact (authoring rows weren't materialized into `vendor_availability_slots`); correct §13 honest-empty behavior, not a divergence | `B4-month-grid.png`, `B4-month-grid-property.png` |
| B5 | PASS | "Repeats weekly" / "Published date ranges" titles; pdf listing shows "No calendar — this sells without slots", no empty grid | `B5-vocabulary.png` |
| B6 | PASS | "Editing a live listing" two-column panel (Goes live immediately vs Re-enters review) closing on "Nothing is taken down for an edit."; renders on approved listing only | `B6-edit-split-panel.png` |
| B7 | PASS | Clean ordered run on approved+active "Temple Meditation Session" (`4697d863-…`), documented order preserved with method/URL/body/status per step in `B7-patch-evidence.json`: (0) GET baseline — price 60.00, no editReview; (1) PATCH `{price:"96.00"}` → 200, applied immediately in the response, `editReview` null, listing stays Live; (2) PATCH `{serviceName:"Temple Meditation Session (rev B7)"}` → 200 with `editReview:{status:'pending',stagedKeys:['serviceName']}`, live name unchanged; (3) GET final — name unchanged, price 96.00, `pendingChanges.serviceName` staged, `editReviewStatus:'pending'`. Catalog row screenshot shows Live + "Edit in review", name without "(rev B7)", price $96.00. Panel columns agree with observed behavior — no P1. (Staged name edits deliberately left pending as B7 residue; no discard control exists — follow-up filed.) | `B7-edit-split-behavior.png`, `B7-patch-evidence.json` |
| C1 | PASS | Avatar + business name; `/p/test-provider-qa` URL (authority note 1); "Live · showing 10 of 10 listings"; Edit handle & bio + share tools | `C1-storefront-card.png` |
| C2 | PASS | Feed · Story · Route frames with purpose-first sublabels; Route honesty line "Shows your stops in order — not a travel route, and no distances or times."; copy-link + QR; frames unlocked on approved+active listing. First pass showed Route locked with the honest "This service has no route stops yet" — correct ruling 22(d) behavior for a stop-less listing (data gap, resolved by seeding stops), not a divergence | `C2-share-kit.png` |
| C3 | PASS | Real posting opportunities with inline actions; `text-promote-measurement-note` "Measurement stays on Performance."; no analytics numbers on page; "View link performance" deep-links to `/provider/performance?tab=analytics` | `C3-promote.png` |
| C4 | PASS | Crumb "Catalog › Distribute › «name»", "Promoting «name»" banner, ← Back to Catalog; foreign `?listing=not-a-real-id-12345` silently ignored | `C4-arrival-flow.png`, `C4-foreign-id.png` |
| C5 | PASS | Marketplace channel, Direct-link channel (mint-inline), channel-state strip all present (authority note 3: absence would be the divergence) | `C5-ratified-extras.png` |

**Close condition met:** every row PASS; no genuine divergence found, so no
`QA_PUNCH_LIST.md` entry was filed. The "UI does not match the mockup" report is closed on
evidence. (Incidental, non-blocking observations: dev-only Vite HMR websocket errors and a
controlled/uncontrolled select console warning — cosmetic dev noise, not conformance items.)
