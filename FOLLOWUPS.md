# FOLLOWUPS

Work identified by a lane but deliberately **not absorbed** by it. The repo is the tracker (R4).
Each entry states what was found, why it was not fixed in place, and where the evidence lives.

---

## From the Experts & Services earn-demo seed lane

### FU-1 — Review source-of-truth reconciliation

The demo seed writes current public provider reviews to `service_reviews`, while legacy expert
ratings live in `review_ratings`. If profile and review totals diverge, reconcile the DTO/source
contract rather than duplicating review rows across both tables.

### FU-2 — Provider directory category/location presentation

The provider form stores category and location, but the public directory payload currently focuses on
handle-bearing providers, service counts, ratings, and the location resolver. If category facets or
provider-city filtering become required, give them an explicit public DTO contract.

### FU-3 — Seed proof lane

After the seed commit is approved, run the two-pass seed idempotency proof and the prescribed desktop
and mobile surface captures. This remains intentionally outside the seed commit.

### FU-4 — Ready-made market constraint

`ready_made_trips.market CHECK permits Kyoto only — widening to other launch markets is a ruling +
migration, not a seed change.` The city feed's `{City}`-wide ready-made fill will render for Kyoto
and honestly show nothing elsewhere until that contract is widened.

---

## From the fee-ledger lane (2026-08-06, rulings 47–52)

### FU-1 — SD-2: a paid booking can be cancelled with no refund and no reversal
**Owner lane:** unified-refund system. **Inherits:** the reversal map in `docs/testing/FEE_LEDGER_AUDIT.md` §4
(16 backward paths, their rate behaviour, DB writes, diary posture and transaction boundaries).

A `confirmed` booking — payment captured, `provider_earnings` written — can be cancelled with **zero** refund,
zero earnings reversal and zero `platform_revenue` reversal. Traveler path `server/routes.ts:4837-4853`; provider
path `server/routes.ts:4662-4668`, whose own comment records it as *"a SEPARATE, still-unruled finding (audit
SD-2 / Q2) and is deliberately not changed here rather than silently altered under cover of this fix."*

Not absorbed: this is **money moving wrongly**, not a fee recorded wrongly. The ledger makes it visible; it does
not correct it. Fixing it inside a fee-recording lane would put an unreviewed fourth writer on the money path
(the §17 detect-don't-repair principle).

### FU-2 — Transport affiliate margins are computed and silently discarded
**Evidence:** `FEE_LEDGER_AUDIT.md` §1c.

`server/services/transport-booking-options.service.ts:100-101, 134-135, 483-540` sets `revenueType` and
`revenueRate` on every transport option, but `transport_booking_options` **has no such columns**
(`shared/schema.ts:5290-5366`) and the `...opt` spread at `:184` drops them. Every transport affiliate margin is
calculated and thrown away — silent revenue loss, invisible to every report.

Related, same file: `AFFILIATE_MARGIN_DEFAULTS` (`:275-282`, e.g. `discovercars: 0.10`, `kiwi: 0.06`) and a bare
`?? 0.08` at `:318` are live rate literals carrying **no** `fee-literal-ok` / `fee-literal-debt` annotation
(ruling 32).

### FU-3 — Reversal-diary absence (2 of 16 backward paths)
**Pattern to follow:** #1028's `item_transition_log` write. **Evidence:** `FEE_LEDGER_AUDIT.md` §4.

`item_transition_log` is written on exactly two backward paths — `item-routing.service.ts:137-144`
(`actorType:"refund"`) and `checkout-claim.service.ts:453` (`checkout_claim_expired`). **Every money-ledger
reversal** — earnings flips, revenue reversals, dispute holds, credit releases — writes no transition row at all
(rulings 12/16/18 ABSENCE). The `refund` actor type exists in the vocabulary and is used only for the routing flip.

Also recorded there and worth folding into the same lane: `reversePlatformRevenueForBooking`
(`server/storage.ts:3952-3978`) flips the original row to `status='reversed'` **and** inserts a compensating
negative row that also carries `status='reversed'`, so the admin summary's reversed bucket
(`storage.ts:4288-4327`) reads **~2× the true reversal**. Ruling 52's repoint retires this by construction, but
until the repoint lands the double-count is live.

### FU-4 — D3 copy follow-ups (ruling 50)
Filed explicitly as *not absorbed* by the ruling that created them:
- **`/earn` copy verification** against the final bands. The page computes its percentage live from a band
  (`client/src/pages/earn.tsx:76-80`) rather than hardcoding it, so it will move with the bands — but which band it
  reads must be re-verified against structure C.
- **Checkout line-item label audit** — the traveler service fee is now a first-class disclosed line and must be
  labeled as such, distinctly from the provider-side commission.
- **Business-plan revenue language** — the "4–12%" framing and the Year-1 provider-revenue line understate
  structure C (a disclosed traveler fee plus a category-resolved provider commission). Investor-facing documents
  must not lag the ruled model.

### FU-5 — Admin-assigned band at approval time for custom services (from R1 / ruling 51)
R1 set `Custom / Other` → `moderate` as an **explicit interim** so checkout cannot throw. The durable model is an
admin assigning the commission band explicitly when approving a custom service, rather than the category default
standing in. Not built in the fee-ledger lane by ruling.

**Carries the same need (delta recorded in ruling 51):** categories R1 did not name took `moderate` under the same
interim principle and want explicit assignment —
`Specialty Services`, `TaskRabbit Services`, `Travel Services`, `Trip Services`, `Visa Assistance`, and the four
`Affiliate: *` rows. The `Affiliate: *` bands are **inert** for commission (affiliate resolves `affiliate_standard`
via `source="affiliate"`); they exist only to satisfy R2's `NOT NULL` and should not be read as a statement about
affiliate economics.

### FU-6 — Ledger coverage debt (ruling 52's honest accounting)
The fee-ledger lane covers the cart/provider rail. The census found **56 fee write points across 12 money paths**
(`FEE_LEDGER_AUDIT.md` §1). Every uncovered path carries a `deferred:<path>` marker and the reconciliation output
states coverage on every run — **no silent partial ledger**. The uncovered paths, for planning: legacy `bookings`
rail · request rail (`routes.ts:1398-1442`, which bypasses `fee_bands` entirely for `commissionCalculator` tier
literals with `providerTier` pinned to `1`) · ready-made purchase · template purchase · tips · AI concierge /
coordination · expert review · affiliate margin · payouts.

---

### FU-12 — Crowd Calibration Lane

**Scope:** Fits `calibration_constant × proxy_composite` against external ground truth; constants fitted per season-calendar window.

**Coverage tiers:**
- Market-level, all 8 operating markets: official visitor statistics as ground truth — Kyoto City Tourism Survey/JNTO, VisitScotland/ALVA, INE/Turismo de Portugal, Migración Colombia/MinCIT + Cartagena cruise counts, India MoT state-level stats.
- Neighborhood-level, Kyoto only: NTT docomo Mobile Spatial Statistics (500m-mesh), `licensed_no_resale`, cost-ceilinged.
- Gem-level, ticketed venues only.

**Rendering contract:** Range display with "estimated" label; per-entity earned display (L9 extension); no-calibration fallback → band-only (L11 remains as floor).

**Supporting cross-checks:** Hotel occupancy × inventory; airport passenger stats.

**Blocked on:** ≥1 full season of `trend_signals` proxy history (Phases 2–3 output) + docomo MSS quote.

**Leon-side action (not agent work):** Request docomo MSS pricing for Kyoto 500m-mesh — long lead time expected, start early.

---

Related literal debt surfaced by the same census and not owned by any lane yet: `PROCESSING_FEE_RATE = 0.03`
(`server/services/commission.ts:57`, `fee-literal-debt:#PS2`) is the **only live rate with no `fee_bands` row**,
applied at six write points; `pricing.service.ts:23`'s deposit `0.25`; `commissionCalculator.ts:41-46, :72`;
`storage.ts:3742`'s referral `'50'`; and a client-side `subtotal * 0.12` in
`client/src/components/booking/BookingFlowModal.tsx:151, :258` that matches no resolved band.

---

## #13 — India holiday-pressure signals for Mumbai / Jaipur / Goa

**Status:** Open  
**Trigger:** Corrective Dispatch 2, Item C — Nager.Date does not cover India (IN not in AvailableCountries). Three of eight operating markets (Mumbai, Jaipur, Goa) have no public holiday signal. Diwali-class calendar pressure is exactly what `nager_date` exists for and these three markets currently lack it.

**Why it matters:** The `nager_date` metric (`public_holiday: 0|1`) feeds the §4.1 scorer for seasonal overlay. Indian holidays (Diwali, Holi, Republic Day, Independence Day) drive substantial travel volume spikes — their absence creates a systematic undercount of peak-pressure events for 37.5% of operating markets.

**Options (agent to evaluate in a future dispatch):**
1. **Static embed** — Hardcode India's national holiday calendar as a JSON file in `server/services/trend-engine/adapters/` updated annually. Fastest to ship; requires manual upkeep.
2. **Alternate API** — [Calendarific](https://calendarific.com) or [Abstract Holidays API](https://www.abstractapi.com/holidays-api) both support India. Free tier covers the use case. Requires a new API key.
3. **Google Calendar public feed** — India national calendar is available via the Google Calendar ICS feed (no auth, free). Parsing ICS is straightforward.

**Blocked on:** Leon picks the approach before agent implements.  
**Agent action:** None until Leon decides. Then create a new adapter or extend `nager-date.adapter.ts`.

---

## From the earn-grammar lanes (2026-08-25)

### FU — Lane 0 executed from Claude Code, not Replit (dispatch-record correction)
The earn-grammar dispatch (`DISPATCHES_earn_grammar_lanes.md`) scopes **Lane 0 — "Land the spec"** to
Replit on a single `main` checkout. It was instead executed **from Claude Code** on branch
`claude/new-session-i39ogn`, at the decision-maker's explicit direction (session 2026-08-25). One
commit landed the four canonical Lane 0 files — mock + spec copied into `docs/design/`, the 15 SPEC §0
rulings appended to `docs/DECISIONS.md` as `[advisory]` date-slug rows, the mock added to
`SESSION_MOCKS_INDEX.md` — plus this record. Recorded so the dispatch record matches what happened;
no product effect (the landed content is identical to a Replit-run Lane 0).

### FU — Lane branch alias for `discover-polish`
`claude/new-session-i39ogn` **is** the Lane 1 (`discover-polish`) branch for this session — the session
is pinned to push only to that name, superseding the dispatch's `lane/discover-polish`. Replit fetches
the lane by that name at merge time (`git fetch origin claude/new-session-i39ogn`). Recorded here per
the decision-maker's Phase 0 instruction.

### FU — service-detail.tsx Geist-Mono label pass (SPEC §1 type rule, pixel-guided)
Lane 1 Phase 3 re-tokened `client/src/pages/service-detail.tsx` to the `--earn-*` palette + Inter
body (Fraunces headings already present). SPEC §1 also wants **Geist Mono for labels & numbers**
(eyebrows, facts, prices, crumbs, verified pills, fee lines). That pass was **deferred by the
decision-maker** to a focused follow-up guided by the `/services/:id` ROOTPREVIEW — mono-izing the
exact label spans (and *not* body text) on a 2022-line money page benefits from seeing the render.
No testid/structure/handler change; palette + Fraunces + Inter landed and gate-green first.

### FU — ja nav translations need a native-speaker check (author-derived, not final copy)
The i18n-key-parity gate was red on the base (`f06356f`): `en/nav.json` carried `links.serviceProviders`
and `links.eventPlanners` (Aug-24 nav ratification, `2026-08-24-provider-directory`) with no
`ja/nav.json` counterpart — Japanese users saw those two nav items in English. Fixed in commit
`fix(i18n): ja nav keys for Service Providers / Event Planners` by adding:
- `links.serviceProviders` → **サービス事業者**
- `links.eventPlanners` → **イベントプランナー**

These were **authored/selected by Claude**, not supplied by a translator — chosen to reuse this file's
own already-shipped role strings (`partner.serviceProvider` = サービス事業者, `partner.eventPlanner` =
イベントプランナー; the file already reuses `partner.*` strings for `links.localExperts`/`links.tripPlanners`).
Lower risk because they mirror reviewed in-file copy, but **not confirmed by a native speaker** — flag for
a native check before treating as final. Gate now at full parity (289/289).

2026-08-23-optimizer-three-variants flag 'PR #563 built V1+V2 only' is stale — the grid renders up to 3 as of 9d3f8ab; ledger note to close it.

### FU — Lane 2 (experts-services-polish) base + branch
Lane 2 (SPEC §3.7–3.11) was restarted from `origin/main` HEAD **`b28be54`** after Lane 1 merged
(PRs #579–583), on the same session branch `claude/new-session-i39ogn` (the discover-polish alias
above; Replit fetches by that name). Executed from Claude Code in **unattended mode** — Phases 1–5 run
consecutively behind the draft PR's CI, HALT on the dispatch triggers, never merge/mark-ready/push-main.

### FU — §3.10 storefront attribution sidebar deferred (needs a server field)
The role-agnostic storefront deliberately still omits the "Came from a provider link?" sidebar:
`/api/storefront/:handle` returns no attribution/fee fields and §3.10 forbids computing them client-side
(§13/§14). **FOLLOWUP:** add a read-only `resolveStorefrontAttribution(viewerId, ownerId)` that returns
`{ travelerFeeStatus, repeatRate }` from the session acquisition reference and the repeat-pair check,
without returning amounts. `acquired_via_provider_id` does not exist; current attribution is the
acquisition reference plus `rails-attribution.service.ts`. The sidebar may render only when both strings
exist. This is a new read model, not a change to fee math or checkout resolution.

### FU — §3.11 /providers market facet
Phase 5 renders the honest total ("Providers · N") with name/handle search only — **no `?market=`
filter or per-market count**, because `/api/provider-storefronts` carries no market/location facet
(the page's own §13 note). Empty state reads "No providers yet" without a market name. Deferred per
decision-maker (Phase 0). **FOLLOWUP:** a market facet on `/api/provider-storefronts` — `location` is
already on the row, so a server-side `?market=` is likely one `WHERE`.

### FU — discover-tabs `/ready-made` flake LEFT FOR BASE (decision-maker, Lane 2 session)
The `discover-tabs-smoke` gate (`discover-tabs.spec.ts:103`) is red on Lane 2's PR: on
`/ready-made`, when the CI seed produces no `expert_templates` and `/api/expert-templates`
hasn't settled within the 5s window, neither the `card-template-*` cards nor the empty-state
CTA `button-become-expert-packages` are in the DOM → timeout. It is a **seed/timing flake in
Lane 1 code** (`discover.tsx` / `discover-tabs.spec.ts`), byte-identical on base `b28be54`,
reproducing across every Lane 2 commit; Lane 2's diff (experts/expert-detail/storefront/
providers/nav) never touches the Marketplace surfaces the spec tests. Decision-maker ruled
**leave it for base** — Lane 2 does not touch `discover-tabs.spec.ts` or `discover.tsx` (both
outside Lane 2 write targets), and the PR simply is not all-green on that one gate. **Fix when
taken up on main:** wait for the `/ready-made` templates query to settle before the branch, and
accept the Lane-1 `rm-shelf-card-*` cards as populated evidence (not only legacy
`card-template-*`).

### FU — §3.9 expert-detail DTO fields (responds / since / consultation)
Phase 3 applies §13 omit-on-absent: the hardcoded `responseTime || "< 24 hours"` fallback is removed,
and the "since" and consultation-kv facts are omitted until a real field exists (no fabrication).
Deferred per decision-maker (Phase 0). **FOLLOWUP:** add `responseTimeMinutes`, `memberSince`, and
consultation fields to the expert DTO — all three exist as data somewhere (message timestamps,
`users.created_at`, consultation scheduling), so this is wiring, not new tracking.

### FU — Lane 4 city-feed bento (draft PR `city-feed-bento`)
Phase 2 landed the bento + family-card convergence. **Follow-up commit (decision-maker ruling)
resolved three of these:** (a) the §13 three-state action row — the vendor-service card now gates
`Book`/`Reserve` on one `resolveBookability` value that also feeds the single inline badge, so a
"Not bookable" badge can never sit beside a live `Book` button; (b) the tile-height metric is now
documented as two-tracks-per-1×1 / anchor-four (accepted as-is — see ledger
`2026-08-26-city-feed-bento-landed` and SPEC §3.13); (c) the band is full-bleed, lifted to a
`Layout`-level sibling. Remaining deferred, non-blocking:
- **Source-link `/s/:handle` on feed tiles.** Tiles use the ruled id-based fallbacks
  (`/experts/:id`, `/services/:id`) because the `handle` field is not on the
  `/api/discover/location/:city` payload. Server DTO followup: surface `handle`; tiles switch
  to `/s/:handle` with no structural change (`2026-08-25-card-source-link`).
- **Editorial neighbourhood headings.** The bento heading reads
  `neighbourhood.editorialTitle ?? headline ?? tagline`, falling back to the plain name when the
  payload populates none. Author per-neighbourhood copy (or a dedicated copy field) so headings
  aren't the bare name.
- **Lead-expert on the city row (Lane 3).** If Lane 3 surfaces a lead-local-expert per
  neighbourhood on the row, wire it into the anchor selection to improve the anchor beyond
  "first expert in the run".
- **Inline-card props with no family-card home.** None found blocking during convergence; if one
  surfaces (e.g. an engine-only field on the recommendation candidate), add it additively rather
  than dropping it.

### FU — Marketplace-fixes lane deferrals (audit `docs/audits/marketplace-surface-audit.md`)
The `marketplace-fixes` lane landed the four live DISPLAY bugs (B1 avatar field-name, B2
browse-card specialties dead fallback, R1 [PR #602], R2 verified-clean) and the two clean DISPLAY
gaps (D1 member-since fact, D2 expert cover image); D3 (ABOUT section) was already on `main` via
`aae09f08` on both `/experts/:id` and `/s/:handle`. The following audit rows are **filed, not
built** — each is a separate lane:

- **INTAKE — onboarding never writes `users.bio` (all 4 roles). ✅ CONSUMED by the
  `intake-fixes` lane (C1–C4, C6; decision-maker ratified Aug 27 2026):** onboarding now
  mirrors the role-form bio into `users.bio` on all submit routes + aliases (C1 experts,
  C2 providers — `description` ruled to BE the provider bio, column kept); provider photo
  intake reuses the shared `PATCH /api/expert/photo` rail (C3); provider city persists
  discretely (migration 261) and `resolveEarnerLocation` reads it (C4); existing earners
  fixed by the operator-run `scripts/backfill-users-bio.ts` (C6 — report-only default,
  `--apply`, prod-refusing). The storefront read stayed on `users.bio` per the ruling.
- **SCHEMA — consultation config has no column.** The expert-detail consultation facts (duration,
  price, format) have no backing column anywhere; the surface omits them (§13). Needs a real
  schema decision before any display. → schema lane (decision-maker ratification required).
- **SCHEMA — providers directory has no `?market=` / facet.** `/providers` cannot filter by market
  or facet; there is no endpoint parameter for it. → schema/endpoint lane.
- **DISPLAY (larger) — storefront fee-attribution sidebar.** Blocked on a DTO field that does not
  exist yet (the fee breakdown is not in the storefront payload). → deferred until the DTO carries
  it; do not derive a fee client-side (§8/§18).
- **DISPLAY (larger) — card-family grammar conformance.** A sweep to bring every marketplace card
  onto one grammar (price pill, meta line, source link) is its own lane; not mechanical.
- **LATENT BUG — `trip_planner` → `travel_expert` label mapping. ✅ CONSUMED by the
  `intake-fixes` lane (C5):** both `ROLE_LABELS` maps (`expert-detail.tsx`,
  `expert/profile.tsx`) now alias `trip_planner` to the same label as `travel_expert`, so a
  stray literal renders "Trip planner", never the generic "Expert".

---

## From the Plus occasions lane (2026-08-27)

- **CI check rejecting duplicate migration numeric prefixes** — happened twice today (258×2, 260×2). A guard that fails when two registered migration files share the same `NNN` prefix would catch the collision at PR time; not built in this docs lane.
