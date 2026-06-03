# Traveloure — Discover & Location Marketplace Design Spec

**Type:** consolidated design + IA spec (hand to Replit Agent). **Supersedes:** the current 5-tab Discover hub.
**Scope:** the Discover experience — information architecture, the location marketplace, the events view, the shared card pattern, and the data-source map. Provider-level wiring is intentionally **out of scope** (Replit reconciles live integrations; see Phase 0).
**Grounding:** structural audit against `main` `a3e2bed`. Design validated via mockups in the design thread (split-row card; location marketplace; neighborhood sub-ecosystem).

---

## 1. The core idea

Discovery has two natural axes, and the current hub mixes them into five flat, inconsistently-actionable tabs. Split them:

- **By location** — the destination *marketplace*. A place is a **sub-ecosystem** (neighborhoods, attractions, eat, do) with platform supply (hotels, experiences, experts, marquee) woven *into* it.
- **By date** — what's on, when. Events, festivals, time-sensitive happenings.

One principle governs both: **every item is actionable** — *Book*, *Add to experience*, or *Find a local expert*. No dead-end information.

---

## 2. The universal card pattern

The shared primitive across every surface. Two halves that marry:

- **Left = information.** Large photo of the attraction/content on top, then name, type, a one-line description, and the **why** signal (the trend/demand/creator reason it surfaced — e.g. "matches the cultural trend · loved by locals").
- **Right = content/action.** What you can do: priced *Book* where there's bookable inventory, *Add to experience* always, and *Find a local expert* where there's nothing to book.

Rules:
- Big imagery is mandatory — the photo is the primary "wow" lever.
- Never show empty placeholder metrics ("0 mentions"). Show the why-signal or nothing.
- Never duplicate the description.
- The card sits in a **max-width content column (~900–1000px, centered)** — never full-bleed. (Fixes the horizontal-stretch problem.)
- Right-side action set adapts to inventory; left-side content is constant.

---

## 3. Location view — the sub-ecosystem marketplace

A location is not a flat service list. Composition, top to bottom:

1. **Location hero** — name, pulse score, "what's happening now," and the supply summary ("142 services · 18 experts"). Carries the destination photo in-app.
2. **Explore spine** — the discovery dimensions as a filter/nav: **Neighborhoods · Attractions · Eat · Do · Stay · Experts**. This is the sub-ecosystem made navigable.
3. **Neighborhood as mini-ecosystem** — the signature unit. A neighborhood card shows its content (trend, creator features, why it's special) *and* the platform supply woven inside it: "5 things to do · 3 bookable," "8 places to eat · 2 reservable," "2 stays from €210," "an expert who knows it." A whole neighborhood is an addable unit ("Add a Marais day").
4. **Gems by category** — attractions / eat / do as universal cards (§2), each content-rich and actionable.
5. **Woven platform supply** — hotels (Stay), local experts (Plan with a local), and a **marquee/featured** spotlight. These are not siloed sections divorced from content; they attach to the ecosystem (a hotel belongs to a neighborhood; an expert covers areas).
6. **Handoff to By-date** — "what's on in {city} this week →".

The discovery layer (gems + content) and the commerce layer (services + experts + hotels) **marry at the neighborhood/geo grain**, not as separate tabs.

---

## 4. By-date view — Events

The time axis. Organized by date/timeframe rather than place.

- Events as universal cards (§2) with the temporal fields foregrounded: **date/time, venue, category**, plus *Book tickets* / *Add to experience* (onto the matching date in the user's experience).
- Cross-links to location: each event names its place; tapping it can jump to that location view.
- Same actionability rule — no info-only events.

---

## 5. Data — source map (by type, not provider)

Per his direction, this declares **what type of source** feeds each surface; Replit maps the specific providers and fixes wiring.

| Surface / section | Source type | Freshness need |
|---|---|---|
| Location hero (counts, pulse, "happening now") | native aggregation + AI trend intelligence | daily |
| Neighborhoods + gems (attractions/eat/do) | content/intelligence layer | daily / cached |
| Stay (hotels) | **blended** — native supply + network backfill | per-request + cache |
| Do (experiences/activities) | **blended** — native supply + network backfill | per-request + cache |
| Plan with a local (experts) | native | live |
| Marquee / featured | native (requires a featured flag) | admin-controlled |
| Recommendations ("why" signals) | demand-signal pipeline (trend-derived) | **scheduled regeneration** (currently 24h-expiry, manual trigger — must be automated) |
| Events (by-date) | network events feed (primary) + curated/manual (supplement) | scheduled ingest + expiry |

**Blended principle:** native inventory first, network/affiliate backfills gaps, sources not distinguished to the user. This is what lets a sparse launch market (Kyoto) render full while direct supply is built. Guardrail: monetized/featured placement must never bury a genuinely better native result.

### Foundational data work (the design depends on these — none exist today)
1. **Sub-city / neighborhood tagging** of services, gems, and experts (a neighborhood field or lat/lng). Without it, the neighborhood ecosystem rollups in §3 are fiction. **Prerequisite for the location model.**
2. **Per-location aggregation endpoint** — one call returning hero counts + sectioned supply, instead of 4+ stitched queries.
3. **Demand-signal regeneration on a schedule** — recommendations currently expire in 24h with only a manual trigger; wire the trend→signal generation into the daily scheduler per active market.
4. **A `featured`/marquee flag** on services + an admin control, with the trust guardrail above.

---

## 6. Consolidation

The two-view split absorbs the existing tabs and dangling routes:

- **Fold into the location view:** TravelPulse (city content), Browse Services, Influencer Curated (becomes a "creator picks" section, now actionable), Trip Packages.
- **Becomes the by-date view:** Travel Events.
- **Trip Packages** is synthetic today (auto-generated "Discover {city}" from trending cities). Decision: kill it, or convert to a real "build a trip from here" CTA inside the location view.
- **Route cleanup:** finish the redirect job — `/browse` still renders a live `BrowsePage` while its sibling `/explore` is already a redirect to `/discover`; redirect `/browse` too. (Other legacy aliases — `/travel-experts`, `/services-provider`, `/credits-billing`, `/checkout` — are already redirects; leave them.)

---

## 7. Cold-start / sparse-market handling

The design shines on data-rich Paris (seeded), but Paris isn't a launch market — **Kyoto is, and it's likely sparse.** Two requirements:
- The location view must degrade gracefully — deliberate sparse states that still feel intentional, never empty placeholder data.
- The **network backfill (§5)** is the real fix: it fills thin native supply so every market renders full. Priority is making the *launch* market's data deep, not Paris's.

---

## 8. Open decisions (needed before/within build)
1. **Marquee** — paid placement, editorial featuring, or both? (Drives the flag's meaning + the trust rules.)
2. **Trip Packages** — kill or convert to "build a trip" CTA?
3. **Events source** — lead on the network events feed, curated/manual, or both for launch?
4. **Neighborhood tagging** — explicit neighborhood field vs lat/lng proximity rollup?

---

## 9. Build sequence

**Phase 0 — Replit audits current wiring (live env, not the design).** For each §5 surface, confirm what it *currently* reads (native table vs network feed vs manual). Specifically resolve: does the events view read the live network events feed or the manual approve-queue? Which sources are keyed/live? Output: a current-vs-target source delta. *This is the plumbing audit — Replit does it in its environment.*

**Phase 1 — Foundations:** neighborhood/geo tagging; per-location aggregation endpoint; the `featured` flag; the add-to-experience action (still doesn't exist anywhere).

**Phase 2 — IA split:** two views (location / date); consolidate the 5 tabs; route cleanup (`/browse` redirect; Trip Packages decision).

**Phase 3 — The universal card + location composition:** the split-row card; the neighborhood-ecosystem unit; woven supply sections; max-width column.

**Phase 4 — Source wiring & blend:** point each surface at its §5 source per the Phase 0 delta; implement native-first blended fill; demand-signal scheduled regeneration.

**Phase 5 — By-date events view** on the events source.

Phases 1 and 4 are the data tracks that have been trailing the UI — they're the difference between a beautiful empty page and a working marketplace.

---

## 10. Out of scope
Individual content-provider integration detail (Replit's live wiring). The four prior code specs (Workspace, Workflow, Offerings, PlanCard) and the commission consolidation (Brief #2) are separate workstreams; the add-to-experience action here connects to the same experience-template model.
