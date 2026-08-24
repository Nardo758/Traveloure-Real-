# Traveloure Marketplace — Cross-surface UI audit

**Scope:** `/destinations`, `/ready-made`, `/events`, and `/services` only. Reviewed against the four supplied 1024px marketplace captures and the supplied marketplace source. No product data or backend behavior is proposed for removal.

## Executive read

The new surface masthead is the right editorial move, but it currently sits above four bodies from different visual systems. **Destinations** and **Events** are information-rich “travel intelligence” products; **Ready-Made Trips** is a sparse storefront with visible incomplete inventory; **Services** is a dense transactional catalog. The shared Fraunces + emoji treatment creates an immediate page family, but the browser-default-looking emoji, cool dashboard controls, inconsistent content widths, and card-heavy density prevent it from feeling like one confident marketplace.

### Priority order
1. **P0 — Normalize the marketplace shell and filter hierarchy, especially Services.**
2. **P1 — Repair Ready-Made’s sparse/blank-card presentation and heading rhythm.**
3. **P1 — Make Events’ calendar a deliberate companion tool rather than a competing panel.**
4. **P2 — Reduce card chrome and badge vocabulary across destinations/services/events.**
5. **P2 — Replace decorative emoji masthead marks with a coherent small illustration/icon system.**

---

## `/destinations` — discovery scan

### What works
- **Masthead belongs conceptually:** `📍 Destinations` is an appropriately editorial label for a browse-first city index. The short subline matches the direct job of the page.
- The 4-up image-led city grid is immediately scannable at desktop width. The real destination imagery provides the personality the header alone cannot.
- The source intentionally suppresses CityGrid’s second “Trending Cities” header when the marketplace masthead exists (`hideHeader` is explicitly designed for this), avoiding a literal title duplicate.

### Findings

| Priority | Finding | Evidence / impact | Recommendation |
|---|---|---|---|
| P1 | **The masthead is editorial; the cards are an operational dashboard.** | Each card layers trending ribbon, numeric score tile, destination title/location overlay, seasonal line, tags, nightly price/delta, availability state, Pulse/trending/gems statistics, and CTA. This makes cities feel scored rather than chosen. | Give the city card one editorial premise: image, place, one seasonal signal, and one actionable fact. Move secondary metrics into the destination detail page or an expandable “travel pulse” row. |
| P1 | **Container change is abrupt.** | The masthead is constrained to `max-w-6xl`, while the shared content region is `max-w-[1400px]`; screenshot shows the grid opening much wider than the title band. | Use one marketplace reading measure for page labels and grids, e.g. a 1280–1320px shell. If a four-card grid needs more room, use a full-bleed grid section with a visibly intentional section label rather than a silent width jump. |
| P2 | **Badge overload dilutes the score.** | “Trending,” score, tag chips, availability chip, and metric row all compete for status attention. Several are synonymous or not decision-critical before click. | Establish a single “signal” token per card (e.g. score *or* seasonal note) and reserve colored chips for high-confidence alerts. |
| P2 | **Icon language is mixed.** | Pin emoji in masthead; line icons in cards; decorative “Trending” glyph; colored metric dots; airplane-like CTA glyph. | Pick a compact illustration system for mastheads and one 16px outlined icon set for utility. Do not use platform emoji as permanent brand UI. |

---

## `/ready-made` — purchasable trip shelf

### What works
- **Masthead is semantically right:** `🏅 Ready-Made Trips` gives the purchasable shelf a warmer, curated promise than a generic catalog heading. The explanatory line distinguishes it from editable templates.
- The source does the important product work of grouping by real, live themes and exposing real counts; that preserves authentic inventory instead of inventing categories.
- Unlike the wide service catalog, this page is intentionally constrained to `max-w-6xl`, which is directionally correct for a considered purchase.

### Findings

| Priority | Finding | Evidence / impact | Recommendation |
|---|---|---|---|
| P0 | **The capture reads as broken inventory, not an exclusive editorial selection.** | Two cards under “More trips”; one has a large empty image area and a dash for price. A second “More trips” heading begins below. The page has high empty-field density and no visual reason for it. | Preserve the real records, but standardize missing-media fallback as a deliberate art card and label unavailable price plainly (“Price on request” only if true; otherwise surface the existing pricing state). Avoid rendering a large blank media frame. |
| P1 | **Theme/filter labels and shelves compete in a low-stock state.** | “All experiences” + “More trips 1” chips, then “More trips” section, then another “More trips” heading. The source can produce a theme rail, a theme section, and filtered-state bar. With one listing, the taxonomy overwhelms the product. | Make the theme rail conditional on meaningful breadth (not merely nonzero stock), or collapse one-item themes into a quiet “More ready-made trips” continuation. One selected theme should produce one heading, not chip + status bar + shelf heading. |
| P1 | **The masthead feels richer than the body.** | Fraunces and medal imply curation/premium discovery; compact, generic shadcn cards with small uppercase category labels and dark author badges feel marketplace-admin. | Develop a “trip edition” card: larger visual or intentional fallback, destination/duration as caption, experience/theme as editorial eyebrow, price as a clear purchase fact, and author credibility in a quieter line. |
| P2 | **The body’s type system does not inherit the masthead’s confidence.** | Header uses serif; product and section titles remain small, utilitarian sans. | Use Fraunces selectively for section/shelf titles and trip titles; keep metadata and purchase UI in sans. This creates a real editorial hierarchy rather than a single decorative serif moment. |
| P2 | **Author-type badge is visually louder than the content in tiny cards.** | “LOCAL EXPERT” is dark and anchored at the card edge while the core price is an em dash. | Make author type a subtle provenance line/icon, not the strongest card-end element. |

---

## `/events` — time-based destination finder

### What works
- **Masthead belongs:** `📅 Events` and its literal “upcoming events & activities” subline match the page’s planning job and give a calendar context upfront.
- Events has the clearest page-specific structure: filters on the left, date intelligence on the right, “Best Time to Visit” results below.
- The calendar is not fake decoration; the source supports month/week/day selection, event data, and a hide/show control. Keep that real utility.

### Findings

| Priority | Finding | Evidence / impact | Recommendation |
|---|---|---|---|
| P1 | **Two control systems compete for the same answer: “when/where should I go?”** | Left side offers destination vibe chips; right side has its own Month/Week/Day mode and selected month. The page title says Events, but the first major body title is “Where to Go.” | Make the filter contract explicit: **time** belongs in the calendar; **travel mood** belongs in a compact horizontal rail above results. Put a single results sentence under them (“August · Romantic · 8 places”). |
| P1 | **The calendar dominates the first viewport without a clear relationship to the cards.** | At 1024px it consumes nearly half the content area while two city cards are partially visible; its detailed mini-month content is hard to scan at that scale. | Treat it as a persistent planning instrument: on wide desktop, use a narrower sticky right rail with a concise selected-period summary; on tablet, place it above results as an intentional full-width planning step. Avoid a cramped split at this breakpoint. |
| P2 | **“Best Time to Visit” duplicates the destination product within the Events surface.** | The first content shelf is city cards that look nearly identical to Destinations and is introduced before the visible event listings. | Keep city recommendations, but make event relevance the dominant card fact: date/event line first, seasonal score second. The actual “Events & Festivals” list should be pulled higher or paired with each recommendation. |
| P2 | **The masthead emoji has a different visual weight from the calendar icon system.** | The colorful calendar emoji feels casual/browser-native while the body is thin monochrome outline UI. | Replace with a small branded calendar illustration or a fixed-color icon tile matching the marketplace art direction. |
| P2 | **The 9-chip filter rail is dense at tablet width.** | Filters wrap in three uneven rows (All Destinations, Romantic, Adventure, Cultural, etc.). It reads as an admin filter bank, not an editorial browse prompt. | Show 4–5 prominent moods plus “More,” or use a horizontally scrollable rail. Keep all real filters reachable through More. |

---

## `/services` — bookable services catalog

### What works
- **Masthead is functional but least convincing aesthetically.** `🛎️ Services` correctly describes the route, and Services is the only surface where a search input belongs in the masthead because it actually filters the catalog.
- Real category, location, price, rating, and sort controls are all necessary for a transactional marketplace. The problem is arrangement, not feature removal.
- The 4-up result grid makes comparison possible.

### Findings

| Priority | Finding | Evidence / impact | Recommendation |
|---|---|---|---|
| P0 | **Category is duplicated as both a prominent chip rail and dropdown.** | Screenshot shows “All Services / Tours & Experiences / Food & Culinary…” directly above a filter bar containing “All categories.” Source confirms both write the same `selectedCategory` state. | Keep the chip rail as the editorial category browse mechanism **or** keep the dropdown as an advanced filter—never both in the default state. Recommended: chips for top categories, with “More categories” opening the same dropdown. |
| P0 | **Search is split into unclear scopes.** | Masthead says “Search services, destinations…” while a separate bar begins with “Location.” Users must infer whether a destination entered in search differs from Location. | Use one primary intent field: “What are you looking for?” plus a distinct destination field. Or make the masthead search global-only and remove it after a result context is established. Label the scope clearly. |
| P0 | **Filter controls are visually equal, creating an admin-toolbar effect.** | Location, category, Min $, Max $, rating, and sort sit as six same-weight outlined fields. The chip rail immediately above has the same button treatment. | Use progressive disclosure: Destination + sort visible; “Filters” opens price/rating/category refinements, with active-filter count. Keep selected refinements as removable tokens in one place. |
| P1 | **Services density is excessive even before catalog continuation.** | Four cards contain status ribbons, people count, score, provider avatar/verified status/rating/location, description, category and duration chips, price/status, tip panel, stats footer, and CTA. Below that the source can add partner activities, creating a second catalog language. | Simplify a service card to provider, service title, one location/rating line, price, and one key delivery attribute. Move “heat,” capacity, coaching copy, and duplicated stats into detail. Ensure partner results have a clearly labeled but visually compatible card treatment. |
| P1 | **Card imagery cannot support trust if it is placeholder/random.** | Source maps every category to `picsum.photos`; screenshot makes unrelated listings feel interchangeable (three Paris products use similarly generic forest imagery). | Use provider-uploaded images when present; use category-specific branded fallback art only when no provider image exists. Do not let an arbitrary category image imply the actual service venue. |
| P1 | **Status semantics are muddy.** | A card can show Hot/New, a score (98), a people count, verified provider, rating, “Busy,” and star/reviews. “Busy” is inferred from rating, not availability. | Separate quality from availability. Retain one credibility signal (rating/reviews) and one real booking state only when backed by data. |
| P2 | **The bell emoji does not match the page’s businesslike task.** | The masthead is elegant; the yellow bell reads playful/hospitality-generic, while dense controls below read utility. | Use a bespoke compass/service mark or a line icon tile; reserve color for the primary action and real state. |

---

## Cross-route inconsistencies and duplicate controls

### Container and spacing
- Mastheads use `max-w-6xl`; shared content uses `max-w-[1400px]`; Ready-Made nests back to `max-w-6xl`. This creates three perceived page widths. Establish a shared marketplace container with documented exceptions.
- The header uses a tight `py-5`, but each route moves into a much larger pale body gap. The visual “chapter break” is useful, but the gap should be a consistent 32–40px rather than route-dependent empty real estate.
- Grid gaps differ by job (`gap-6` for Cities/Services, `gap-4` for Ready-Made). That is defensible, but card density does not follow the same reasoning: the tightest page has the most blank content.

### Type
- Fraunces is currently only a masthead accent. The rest relies on generic bold sans and frequent uppercase micro-labels, so the editorial promise ends after one line.
- Keep **Fraunces for page and shelf titles**; use a calm humanist sans for descriptions and transaction metadata. Reserve all-caps for small provenance/status labels only.

### Icon and color language
- Route mastheads use platform emoji (`📍`, `🏅`, `📅`, `🛎️`), while the bodies combine Lucide, tiny colored dots, decorative glyphs, badges, and some emoji within cards. This makes iconography feel assembled rather than branded.
- Define: (1) a four-piece fixed marketplace illustration/icon family for mastheads, (2) Lucide only for actions/inputs, (3) one semantic badge scale. Keep pink/red as the action/selection color, not a universal attention color.

### Duplicate / competing filters and toggles
1. **Services category:** chip rail duplicates the `All categories` select (same state).
2. **Services query vs location:** masthead query promises destinations; filter bar separately captures location.
3. **Services active filters:** controls, removable filter badges, `Clear`, and `Clear all` coexist. One token row plus one reset action is sufficient.
4. **Events time controls:** calendar Month/Week/Day selector competes with the conceptual “Where to Go” results context; calendar hide/show adds another state at desktop. Retain, but clarify hierarchy and responsive placement.
5. **Ready-Made theme state:** category chip, repeated shelf heading, and filtered-state bar can all describe the same selection; collapse to one selection indicator plus one shelf title.

---

## Recommended unifying direction

### **“The Field Guide” — editorial index + practical booking layer**

Build the marketplace as a travel journal with tools, not four admin views wearing the same header.

- **Shared frame:** warm off-white paper ground; restrained ink/navy type; rose-red only for selected/primary actions; a fixed 1280px marketplace content frame. Use subtly tinted section bands only to mark a change in task, not every card.
- **Masthead:** replace emoji with a 28–32px fixed-color miniature editorial mark (pin / laurel / calendar / bell or equivalent). Fraunces page title, concise sans deck, optional single page-specific control. The masthead should be identically structured across all four routes.
- **Route jobs remain distinct:**
  - *Destinations:* image-first field notes and travel signals.
  - *Ready-Made:* curated trip editions with strong purchase facts.
  - *Events:* a date-led planning desk, with event relevance prominent.
  - *Services:* a searchable booking catalog with progressive filters.
- **Cards:** adopt shared radius, image ratio, metadata spacing, and action placement; vary the information hierarchy by product rather than reusing every badge. Each card gets one primary signal, one proof point, and one action.
- **Controls:** one “browse” layer (chips or rail) plus one “refine” layer (filters). Never present two controls that mutate the same state unless one is a clearly disclosed overflow.
- **Personality:** let destination photography, real trip themes, event dates, and provider provenance do the talking. The design should make real data feel collectible and legible rather than decorate every fact with a pill.

## First implementation sequence

1. Consolidate the shared container and masthead component tokens, then replace masthead emoji with a coherent fixed illustration/icon family.
2. Recompose Services: one category entry point, one query/location model, progressive refinements, and a reduced service card.
3. Rework Ready-Made low-stock/missing-media states and collapse redundant theme labeling.
4. Restructure Events at tablet/desktop around one explicit time filter and event-first result context.
5. Reduce destination card signals to a clear editorial scan line while retaining real detail in the destination page.