# Experience Template — Content-Category Map (reinvestigation)

Foundation for the "template as logistics hub" rebuild. Defines, per template, **which content categories it surfaces** and **what each pulls from** — the thing every other workstream (content-network wiring, Platform Services wiring, split-screen map, profiling→upsell) builds on.

## The model (recap)
Split-screen: tailored **selectable** content on one side, live map (`ExperienceMap`, the existing template-native map) on the other. **No filters, no price parameters** — the **real-time cart total** is the budget feedback. Every selection **profiles the user**; that profile is what the paid Optimize upsell personalizes against. **Transport is NOT a template category** — it's chosen in the Trip Details command center post-planning (reaffirming the established principle). The template is the free build; the upsell is the paid AI optimize.

---

## 1. Content sources available (the master inventory)

| Content category | Source(s) | Profiling signal |
|---|---|---|
| **Flights** | Aviasales · Kiwi · Omio · Amadeus | international vs domestic, budget tier |
| **Stays** | Agoda · Hotellook · Amadeus | budget tier, area, length |
| **Activities & Experiences** | Viator · GetYourGuide · Klook · WeGoTrip | interests, pace, energy |
| **Tickets & Attractions** | Tiqets · Fever | culture vs nightlife vs family |
| **Events / "What's on"** | Fever · TravelPulse · Grok city intel | timing, vibe, spontaneity |
| **Dining** | Google Places (`/api/venues/search`) | cuisine, formality, budget |
| **Local Experts** | Platform — Expert Profile | intent depth → concierge funnel |
| **Platform Services** | Platform — Provider/Service marketplace (photo, guides, childcare, décor, entertainment, hair/makeup…) | service needs, spend level |
| **Travel Essentials** | Airalo (eSIM) · SafetyWing (insurance) · Stasher (luggage) | international, trip length, risk profile |
| **Happening Now / Seasonal** | TravelPulse · Grok | timing flexibility |
| **Custom Venues** | Operational (user/expert-added) | event specificity |
| ~~Transport~~ | Busbud · KiwiTaxi · GetTransfer · Welcome Pickups · Discover Cars · Rental Cars | **→ feeds the command center, NOT templates** |

---

## 2. Per-template category sets

Three archetypes share category patterns; per-template nuances noted.

### A. Travel trips (involve going somewhere)
*Travel Planning · Romantic Getaways · Retreats · Boys Trip · Girls Trip · Reunions · Corporate Retreats*

Base categories: **Flights · Stays · Activities & Experiences · Dining · Tickets & Events · Local Experts · Platform Services · Travel Essentials · Happening Now**

- **Travel Planning** — all of the above (the full set).
- **Romantic Getaways** — drop nightlife-weighted events; weight boutique Stays, couples Activities, romantic Dining.
- **Retreats** — wellness-weighted: retreat Stays, wellness Activities/Services (yoga, spa, Ayurveda), healthy Dining; de-emphasize nightlife.
- **Boys/Girls Trip** — add **Nightlife/Events** weight (Fever); group-sized Stays; group Activities; Local Experts for insider access.
- **Reunions** — Stays (group blocks), group Activities, Dining/Catering, Custom Venues, Platform Services.
- **Corporate Retreats** — Stays, **team Activities**, Dining/Catering, Platform Services (facilitation, AV), Local Experts; Flights if multi-city.

### B. Local events (no travel; happen at a venue)
*Date Night · Birthday Party · Engagement Party · Baby Shower · Corporate Events*

Base categories: **Venues / Custom Venues · Dining / Catering · Activities & Entertainment · Tickets & Events · Platform Services · Local Experts** — **no Flights, no Stays.**

- **Date Night** — Dining, Experiences/Activities (local), Events (Fever — shows/concerts tonight), Happening Now; light Platform Services (e.g., florals). High spontaneity signal.
- **Birthday Party** — Venues + Custom Venues, Catering, Entertainment (performers via Platform Services + Fever), Activities, Services (décor, cake, photo).
- **Engagement Party** — like Birthday + Photography/Florals (Platform Services) weighted.
- **Baby Shower** — Venues/Custom Venues, Catering, Décor/Services, light Activities; family-vibe content.
- **Corporate Events** — Venues, Catering, **AV/Production (Platform Services)**, team Activities, Entertainment, Services (planner); Accommodations only if multi-day.

### C. Hybrid (local-or-destination; most complex)
*Wedding · Proposal · Anniversary*

- **Wedding** — Venues, Catering, **Photography · Florals/Décor · Entertainment · Hair/Makeup · Officiant (all Platform Services)**, Accommodations (guest blocks via Agoda/Hotellook), welcome Activities; Flights *optional* (destination weddings). The most service-heavy template — keep it last in any rollout (its dual-mode complexity).
- **Proposal** — Locations/Venues, Dining, Photography (Platform Services), Experiences, Services (musicians, florals, planner), Special touches, Happening Now.
- **Anniversary** — scales between Date Night (local) and Romantic Getaway (travel): Dining, Experiences, Stays (if getaway), Services (photo, florals), Happening Now.

---

## 3. Missed opportunities (the reinvestigation findings)

Categories your integrated providers already support but the templates aren't surfacing:

1. **Events / "What's on" (Fever + TravelPulse + Grok).** Currently not a template category. Huge for Date Night, Boys/Girls Trip, Birthday, Anniversary ("what's happening while I'm there / tonight"). Fever is integrated and unused at the template layer. Strong spontaneity/vibe profiling signal.
2. **Local Experts as selectable content.** Surfacing the expert *inside* the template is proprietary, profiles intent depth strongly, and is the most direct funnel into the concierge/paid-optimize. Nothing external can replicate it.
3. **Happening Now / Seasonal (TravelPulse + Grok).** Timely, proprietary content as pickable items ("cherry blossoms peak next week"). High profiling value, and it's your differentiator vs. a static catalog.
4. **Travel Essentials (Airalo eSIM · SafetyWing insurance · Stasher luggage).** Integrated, almost certainly not surfaced. Low-friction adds with high attach on travel templates — *and* they profile sharply (eSIM + insurance ⇒ international trip; luggage storage ⇒ transit-day gap).
5. **Catering as distinct from Dining** for events. Dining = restaurants you go to; Catering = brought to a venue. Different content, different providers (Platform Services) — events need Catering, not a restaurant list.
6. **Photography / Décor / Entertainment / Hair-Makeup broken out of a generic "Services" tab** for events. These are distinct Platform Services categories with distinct intent; lumping them under "Services" hides them.

---

## 4. Notes / open items
- **Transport** providers (Busbud, KiwiTaxi, GetTransfer, Welcome Pickups, Discover Cars, Rental Cars) wire to the **Trip Details command center**, not the templates. The live Travel template's "Transportation" tab is drift from this principle — remove it.
- **Dining is sourced from Google Places** (`/api/venues/search?type=restaurant`) — confirmed wired in the Phase 0 audit. (Earlier "thin source" concern was wrong.)
- **Selection = profiling.** Each category's picks feed the implicit profile the Optimizer reads (the spec's "cart analysis"). The profiling-signal column above is what makes the upsell ("here's your vision optimized") land — design the selection events to capture it.
- **Per-template definition** holds the category list (which categories, in what order, weighted how) — this is the single source of truth the engine renders from. Authoring it per template *is* the foundation for the content-network + Platform-Services wiring workstreams.
