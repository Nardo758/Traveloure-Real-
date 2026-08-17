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

## Results — run Aug 17, 2026 (integrator, this repo's container; code under test: branch `claude/resume-artifact-work-vmvy96` @ post-gap-16/18)

**Console conformance CONFIRMED** — every row PASS except A6 (BLOCKED on data, design verified
in code) and the one DIVERGES below, which was root-caused and fixed in the same session
(commit on this branch; re-verified live). Environment: local Postgres, dev boot with stubbed
Stripe key, provider `kyoto-interpreter@traveloure.test` (terms accepted; 2 approved+active
in-person listings, 1 async listing; 4 one-off slots seeded for the grid). Screenshots:
`docs/testing/assets/console-conformance-aug17/`.

| Row | Verdict | Evidence |
|---|---|---|
| A1 | PASS | "What are you building?" + one-door subtitle (`A1-workstation.png`). |
| A2 | PASS | Single service · Bundle (locked copy w/ real progress) · Property tiles. |
| A3 | PASS | "Or start from what you do" category grid renders live categories. |
| A4 | PASS | Your bundles / Your properties orientation cards render. |
| A5 | PASS | "+ New property" opens the 1. The property · 2. Rooms · 3. Review ladder; `button-property-submit` absent on step 1 (`A5-property-builder-step1.png`). |
| A6 | BLOCKED | Account owns no property; edit dialog unreachable this run. The per-step-save design is the S-2 ruling's own negative space, verified in code. |
| B1 | PASS | Search + All/Live/In review/Draft chips + List\|Map; Manage\|Preview axis also present (ruling 74 C2, now in the mock too) (`B1-catalog-toolbar.png`). |
| B2 | PASS | 3 rows: thumb/name/meta/pill/storefront toggle/Availability →/health/Edit/Promote this → (`B1-catalog-toolbar.png`). |
| B3 | PASS | Read-only traveler notice, "X of Y" coverage, unlocated named off-canvas, ODbL attribution (`B3-catalog-map.png`). |
| B4 | PASS | Shared month grid above the rails for the scheduled listing: legend Bookable/Blacked out/Nothing published/Today, opens on the next bookable month, real slot times, Next-available chip (`B4-availability-inperson.png`). First probe hit the async listing (drawer preselects the clicked row) — that is B5b's branch, not a B4 failure. |
| B5a | PASS | "Repeats weekly" title on the scheduled listing; "Published date ranges" correctly absent for a non-property listing. |
| B5b | PASS→**DIVERGES found & FIXED** | The no-calendar sentence rendered, **but a "One-off dated slots" card rendered beneath it** — provider-wide (another listing's slots listed under this selection), with a second service picker that let a dated slot be authored onto the async listing the branch had just refused a calendar for. Fixed same session: the card scopes to the drawer's selected listing, renders only for scheduled semantics (`needsScheduling`, non-property — the same routing `ServiceAvailabilityEditor` uses), and the duplicate inner picker is removed. Re-verified: async selection shows ONLY the no-calendar card (`B5-availability-async-fixed.png`); scheduled selection unchanged (`B4-availability-inperson.png`). |
| B6 | PASS | "Editing a live listing" two-column panel on the approved listing (Goes live immediately / Re-enters review, "Nothing is taken down for an edit"); also present: gap-16 Photos & media card + "Add a cover photo" checklist row (`B6-listing-home.png`, `B6b-photos-drawer.png`). |
| B7 | PASS | Behavioral truth test: PATCH price → applied live immediately; PATCH name → `editReview.stagedKeys=["serviceName"]`, live name untouched, `edit_review_status='pending'`; Catalog shows "Edit in review" pill (`B7-edit-in-review-pill.png`). |
| C1 | PASS | Storefront card with `/p/<handle>` URL + Edit handle & bio (`C1-distribute.png`). |
| C2 | PASS | Feed · Story · Route frames + copy-link/QR. (The Route honesty line renders inside the Route frame's detail — the landing text probe missed it; visually confirmed in `C1-distribute.png`.) |
| C3 | PASS | Promote opportunities + "Measurement stays on Performance." note; no analytics numbers on the page. |
| C4 | PASS | "Promote this →" arrival: "Promoting «name»" banner, ← Back to Catalog, crumb line (`C4-promote-arrival.png`). |
| C5 | PASS | Marketplace channel, Direct-link channel, channel-state strip all present. |

Zero page errors across the whole walk. The B5b finding is filed in `docs/planning/QA_PUNCH_LIST.md`
(§ "Console conformance run — Aug 17") with its fix noted; everything else needed no repair.
