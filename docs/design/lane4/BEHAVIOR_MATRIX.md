# Lane 4 — City-feed bento behavior matrix

Every clickable element on `/discover/location/:city` (`client/src/pages/discover-location.tsx`
and the `CityFeedCard*` / `feed/*` components it renders), its expected behavior, the
handler that implements it, and how it is proven.

- **Proof — `spec`**: asserted under the fixture by `playwright/tests/discover-tabs.spec.ts`
  (the `city-feed bento — /discover/location` describe). Test numbers below.
- **Proof — `real-data`**: not decidable under the empty-DB fixture (needs a seeded market
  or a live navigation target); verified on the Replit `main` pass (Mumbai + Kyoto, signed
  in, with the network log).

Line numbers are as of the Phase 2e commit on branch `city-feed-bento`.

| Element | Expected behavior | Handler (file:line) | Proof | Status |
|---|---|---|---|---|
| Gem chip | Filters ALL sections to that kind; empty neighbourhoods drop; `All gems` restores | `chipMatches` `discover-location.tsx:409` (delegates to `filterFeedStream`); `SpineChipRail` → `setActiveFilter` | `spec` — test 7 | ✅ green |
| Jump-list item (no filter) | Scrolls to the section anchor (`href="#bento-nb-<slug>"`) | jump nav `<a>` `discover-location.tsx:1146` | `spec` — test 9 (href) | ✅ green |
| `See all in {nb} →` | Sets `?neighborhood=<slug>`; feed renders only that section; jump list flips to filter mode; back clears | `bento-see-all` `<a onClick>` `discover-location.tsx:874` → `onSeeAll` → `setNeighbourhoodFilter` `:1605` (`buildNeighbourhoodHref` `:1598`) | `spec` — test 8 | ✅ green |
| Jump-list item (filter active) | Switches `?neighborhood=` to that slug; active one filled; `All neighbourhoods` restores | filter-mode jump nav `discover-location.tsx:1137` + `jump-all-neighbourhoods` restore | `spec` — test 8 (`jump-all-neighbourhoods`, `data-active`) | ✅ green |
| `Add to trip` | Opens `AddToExperienceDialog`; TripStrip chip increments; label chain Add → Added | `btn-add-*` → `onAdd` → `handleAdd` `discover-location.tsx:1620` → `<AddToExperienceDialog>` | `spec` — test 9 (dialog opens; propagation) · increment + label chain = `real-data` | ✅ dialog / ⏳ increment |
| `Book now` | gem/vendor → `/services/:id` (date/time → cart → audited `/api/checkout`); rec → `/services?categoryKey=&location=<feed city>&neighborhood=<bento neighborhood>` | gem `bookHref` `city-feed-card.tsx:739`; vendor `window.location=/services/:id` `:1515`; rec `onBook` → `handleBookRecommendation` `discover-location.tsx` | `spec` — test 11 asserts the Kyoto URL + city/neighborhood click context; Mumbai/Kyoto URL unit contract | ✅ city-scoped |
| `Ask an expert` | Expert handoff carrying `destination` + `neighborhood` | `btn-ask-*` → `askExpert({ city, subject })` — `useAskExpert` (`@/lib/use-ask-expert`) | `real-data` (handoff target) | ⏳ real-data |
| `Plan with {name} · from $N` | Expert/request-help entry; price from `expertLowestPrice`, never fabricated | `button-plan-with-expert` in `<Link href="/experts/:id">` `expert-card.tsx:200` | `spec` — test 3 (anchor renders) · `/experts/:id` nav = `real-data` | ✅ renders / ⏳ nav |
| `View profile` (anchor) | `/experts/:id` | `button-view-profile` in `<Link href="/experts/:id">` `expert-card.tsx:208` | `spec` — test 9 (href present) | ✅ green |
| `Get this trip` | `/ready-made/:id` (buyer detail); the whole card (body + source + CTA) is one destination | `detailHref`/`btn-view-package-*` `feed/ready-made-card.tsx:57` | `spec` — test 9 (href SHAPE) · id resolves on `/api/ready-made/:id` = `real-data` | ✅ href / ⏳ resolves |
| `Offer this` | Recruitment deep-link with `city` + `neighborhood` + `offering` | `link-wanted-apply` `feed/wanted-slot-card.tsx:71` | `spec` — test 9 (deep-link shape) | ✅ green |
| `Become an expert` / `List a service` | `/earn` | `btn-earn-expert` `feed/earn-card.tsx:56` / `btn-earn-provider` `:60` | `spec` — test 9 (href) | ✅ green |
| `View source` (partner stub) | `window.open(url, "_blank", "noopener,noreferrer")`; NO storefront/profile link on the tile | `external-stub-source-*` `<button onClick={handleViewSource}>` `city-feed-card-external-stub.tsx:90,193` | `spec` — test 4 + 9 (no `/s/`, no `/experts/`, source present) · outbound `rel` = `real-data` | ✅ no-storefront / ⏳ rel |
| Recommendation impression | `POST /api/upsell/impression` fires once per rendered rec tile (on mount) | `useEffect` + `impressionFiredRef` `city-feed-card-recommendation.tsx:140` | `spec` — test 9 (the Nishiki rec tile renders) + test 10 (exactly one impression POST on a fresh load) | ✅ green |
| `Request a service` | Request form dialog | `<ServiceRequestDialog>` (`section-service-request`) `discover-location.tsx:2201` | `spec` — test 6 (present) · submit = `real-data` | ✅ present |
| Two-field search | "what" narrows client-side; "where" read-only — NEVER writes trip context | `input-search` → `setSearchQuery` (local `visibleItems` narrow) `discover-location.tsx:2101`; `input-location` `readOnly` `:2111` | `spec` — test 9 (where is `readonly`) | ✅ green |
| Card body click | Opens the item's detail (sheet / detail page); action buttons `stopPropagation` so they never also fire | `cardLinkProps` `city-feed-card.tsx:160` (e.g. gem wrapper `:966`) + `e.stopPropagation()` on every button | `spec` — test 9 (body opens sheet; button opens ONE dialog) | ✅ green |

## Notes on the `real-data` rows
- **`Book now` / `Ask an expert` / `Plan with` navigation** land on routes and handoffs whose
  targets are empty under the fixture; the click WIRING is asserted here, the DESTINATION is a
  Replit-pass row.
- **`Get this trip` id resolution**: the feed's package tiles come from `/api/expert-templates`;
  `/ready-made/:id` fetches `/api/ready-made/:id`. Both are believed to key on the same
  `expert_templates.id`, but that equivalence is confirmed on the Replit pass, not under the fixture.
- **Recommendation POST-once** (now fixture-provable, Phase 2g): the third neighbourhood
  (Nishiki) carries the platform-recommendation tile, so test 10 counts `/api/upsell/impression`
  on a fresh load and asserts exactly one — the once-per-mount side effect no longer needs the
  Replit network log.
- **`View source` `rel`**: the outbound uses `window.open(url, "_blank", "noopener,noreferrer")`
  (in `handleViewSource`); the DOM has no `<a rel>` to assert, so the flag is a Replit-log row —
  the spec asserts only that the tile carries no storefront/profile link.
