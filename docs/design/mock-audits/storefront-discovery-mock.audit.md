# Audit brief — Storefront Discovery

**Mock:** `docs/design/storefront-discovery-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-22-handle-claim-nudge` (closes this audit); related: `2026-08-22-storefront-nav` (owner-side nav), `2026-08-22-nav-storefront-readymade` (directory-deferral ruling)
**Status:** merged Aug 22–23 set — code shipped against this mock; ruling text > merged code > mock pixels on any disagreement. **Important:** a LATER ruling (`2026-08-25-card-source-link`, from the separate Aug 25 earn-grammar session) further changed the card source-link placement — see Known divergences.
**Live surfaces:**
- `client/src/components/backoffice/SetupChecklistCard.tsx` (exists) — mounted in BOTH `client/src/pages/expert/today.tsx:596` and `client/src/pages/provider/dashboard.tsx:412` (confirmed both mounts present)
- `client/src/pages/discover.tsx` (exists) — provider→storefront link logic present (`providerHandle`, `sourceHref`, "More from @handle" pattern, `link-provider-storefront-${service.id}` testid)
- Storefront destination page `/p/:handle` (per ledger, pre-existing — not independently located in this pass; confirm route file during audit)

## Behaviors the mock ratifies

This mock's own Screen 2 caption states an audit correction: the Browse-Services→storefront link "EXISTS in production" already (shipped D1 #528) — the mock's explicit-row treatment was proposed as an ALTERNATIVE placement, not a missing feature. §09's "Audit findings" panel is the load-bearing content; the earlier screens illustrate context.

1. Entry flow: Discover → Browse Services tab → tap a seller's name/handle → their storefront (`/p/:handle`) — this is the described **shipped** path (D1 #528), not new in this mock.
2. §13 — a seller with a claimed handle gets a real link ("More from @handle" → `/p/@handle`); a seller with NO claimed handle renders as plain, non-clickable text — never a dead `/p/` link (StorefrontLink rule 1).
3. **Ratified placement decision:** the shipped image-overlay provider link (avatar + name overlaid on the card image) STANDS as of this ledger — the mock's alternative "More from @seller" explicit row is explicitly NOT adopted by this ruling ("no redesign without a reason"). Do not treat the mock's Screen 2 visual layout as the target; treat the audit findings text as the target.
4. **Negative rule (ratified):** partner/affiliate cards ("via Partners" catalog activities, curated-content items) must NEVER carry a storefront affordance — there is no platform storefront behind them, and rendering one would imply a storefront that doesn't exist (§13). This applies regardless of card layout.
5. **The real fix landed by this ledger:** `SetupChecklistCard` (which already had a server-derived "Claim your storefront handle" step, sourced from `/api/me/business-setup`) was mounted on `provider/dashboard.tsx` but NOT on the expert equivalent (`expert/today.tsx`) before this ruling. The fix is a ONE-LINE mount: `SetupChecklistCard` now also renders on `/expert/today` — experts (the Ready-Made authors whose storefront links ship on every ready-made card) are now prompted to claim their handle, same as providers.
6. `SetupChecklistCard`'s eligibility/dismiss/complete states are self-gating (server- or card-owned) — the fix is purely an additional mount point, not new state logic.
7. Storefront directory (`/providers` browsable page) stays PARKED — re-entry trigger is ≥10 live claimed-handle storefronts with active listings in a single market (a checkable threshold, not a vibe). Do not build or expect a directory page.
8. The storefront destination page itself (`/p/:handle` — cover, avatar, verified badge, rating, facts row, Services/Templates/Ready-Made lanes) is described as ALREADY BUILT, pre-existing — this mock's Screen 3 is documentation of an existing surface, not a new build item.
9. Owner-side "My Storefront" nav entries (provider and expert sidebars) already exist per the mock's Screen 4 convergence diagram — this was shipped by the separate `2026-08-22-storefront-nav` ledger row, not this one.

## Visual grammar

- This mock uses the same coral/teal palette convention as `ready-made-by-theme-mock.html` (`--accent` coral for primary/eyebrow/active elements, `--teal` reserved for storefront/author-link affordances specifically) — teal-for-storefront-link is a recurring convention across both Aug 22 mocks.
- `.newpin::after` "SHIPPED · D1" corner tag is a mock-authoring annotation marking what's already live vs. proposed — not a UI element to look for in the app.
- Storefront hero: gradient cover + circular avatar overlapping the cover (negative margin) + verified badge + facts row (`.sf-facts`) — a distinct "identity hero" page pattern, separate from card-grid conventions used elsewhere.
- Convergence diagram (Screen 4, `.conv`) — a spec-authoring visualization of "many entry points → one storefront hub," not itself a UI screen.

## How to audit

1. Confirm both console mounts of `SetupChecklistCard` (already spot-checked):
   `grep -n "SetupChecklistCard" client/src/pages/expert/today.tsx client/src/pages/provider/dashboard.tsx` — expect an import + JSX usage in BOTH files.
2. Confirm the checklist's handle-claim item is server-derived, not hardcoded:
   `grep -n "business-setup\|handle" client/src/components/backoffice/SetupChecklistCard.tsx` — expect it to read from `/api/me/business-setup`, not a static list.
3. Confirm the honest-link rule on Discover service cards (already spot-checked):
   `grep -n "providerHandle\|sourceHref" client/src/pages/discover.tsx` — verify a three-way branch: claimed handle → real link, no handle but some `sourceHref` → link, no `sourceHref` at all → plain text span (no link).
4. Confirm partner/affiliate cards carry NO storefront affordance:
   search discover/curated-content card components for "via Partners"/curated-content rendering and confirm no `providerHandle`/storefront link is ever attached to those card types.
5. Confirm the directory stays parked:
   `grep -rn "/providers\b" client/src/App.tsx client/src/pages/` — confirm no new browsable provider-directory ROUTE was added (a `/providers/:id` single-card fallback route referenced in the ledger, if any, is different from a `/providers` browse/list page — distinguish the two).
6. Confirm `/p/:handle` storefront route exists and pre-dates this ledger (existence check only): `grep -rn "\"/p/:handle\"\|'/p/:handle'" client/src/App.tsx`
7. In the running app: log in as an expert with no claimed handle, visit `/expert/today`, and confirm the setup checklist shows a "claim your storefront handle" prompt (previously only providers saw this).
8. In the running app: on Discover's Browse Services tab, confirm a listing from a provider with no claimed handle shows plain provider text with no link, while one with a claimed handle links to `/p/:handle` (or `/s/:handle`, per current routing — see divergence note below).

## Known divergences / notes

- **Ratified, not a bug:** the mock's Screen 2 explicit "More from @seller" row layout was considered and explicitly REJECTED by `2026-08-22-handle-claim-nudge` in favor of keeping the shipped image-overlay treatment ("no redesign without a reason"). Do not flag the current UI for NOT matching the mock's row-based visual layout as of Aug 22.
- **Superseding change found in code:** a live read of `client/src/pages/discover.tsx` shows the provider link IS currently rendered as a below-card "Source row" (`/* Source row — every card points back to its source (2026-08-25-card-source-link) */`) rather than the image-overlay this ledger described as standing. This traces to a LATER, separate ruling (`2026-08-25-card-source-link`, part of the Aug 25 marketplace-earn-grammar transcription session, governed by `docs/design/MARKETPLACE_EXPERTS_EARN_GRAMMAR_SPEC.md`, not this Aug 22–23 mock set). **This is not a divergence from the Aug 22–23 ledger to fix** — a later, separately-ratified session moved the card layout again. Auditors should verify current behavior against `2026-08-25-card-source-link`'s own rules (claimed handle → `/s/:handle`; provider without handle → their `/providers` card; affiliate items → partner label only, never a storefront) rather than re-litigating the Aug 22 image-overlay-vs-row placement question, which is now moot.
- The mock's Screen 3 storefront URL uses `/p/:handle`; the Aug 25 ruling's resolution table above cites `/s/:handle` for a claimed handle. Confirm during audit which path is currently canonical (`/p/` vs `/s/`) — this may itself be a naming drift between the two sessions worth surfacing to the decision-maker rather than silently normalizing one way.
