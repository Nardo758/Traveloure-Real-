# Traveloure — Complete Location Marketplace Wireframe + Supply Inventory

**Type:** complete wireframe spec (supersedes the piecewise mockups). Grounded in a full repo scan of provider + expert supply.
**Source:** `main` @ scan. The location view ("All gems" feed) replaces CityDetailView.

---

## PART 1 — The complete supply picture (scanned)

### Provider service categories (27) — the bookable supply
Photography & Videography · Transportation & Logistics · Food & Culinary (catering) · Childcare & Family · Tours & Experiences · Personal Assistance · TaskRabbit Services · Health & Wellness · Beauty & Styling · Pets & Animals · Events & Celebrations · Technology & Connectivity · Language & Translation · Specialty Services (wedding coordinators, relocation, visa) · Lodging & Accommodation · Music & Performance · Entertainment · Floral & Decoration · Arts & Crafts Instruction · Companionship & Assistance · Rental Services (car/bike/boat/equipment) · Cultural & Educational · Attire & Fashion · Safety & Security · Business & Professional · Technical Services · Restaurants & Dining.

### Expert service types (6) `serviceTypeEnum`
consultation · planning · action · concierge · experience · specialty.
*(Seeded examples: photography-tour planning, island-hopping packages, wellness retreats, budget itineraries, adventure expeditions.)*

### Experience / event types `experienceTypeSlugEnum` + `eventTypeEnum`
travel · wedding · proposal · romance · date-night · birthday · anniversary · honeymoon · corporate · corporate-events · reunions · retreats · baby-shower · boys-trip · girls-trip · wellness-retreat · group-travel · backpacking · adventure · cultural.

### Destination event types `destinationEventTypeEnum`
festival · holiday · cultural · sporting · religious · seasonal · weather.

### Match-relevant service types (in code)
photographer · tour_guide · hotel · expert — confirming matching is a designed concept (`serviceType`, schema:4742).

---

## PART 2 — The anchor model

Everything in the feed is a **typed gem-anchor**. A gem can be ANY of:
`neighborhood · attraction · place · photo-spot · restaurant · event · hotel · experience`.

The anchor's **type** drives three things at once:
1. **Tile size** (bento weight) — marquee/neighborhood = wide; small gem = half.
2. **Matched services** — which provider categories get pulled in (Part 4).
3. **Actions** — Book / Add to experience / Find a local expert / Tickets / Explore.

---

## PART 3 — Complete page wireframe (top → bottom)

```
┌──────────────────────────────────────────────────────────┐
│ HERO   Paris · 92 pulse · "happening now" strip            │
│        "142 services · 18 experts" · destination photo      │  [Overview+Insights summary+Happening Now]
├──────────────────────────────────────────────────────────┤
│ EXPLORE SPINE (sticky filters, not anchors)                │
│  [All gems] Neighborhoods · Eat · Do · Stay · Experts ·    │
│  Events · Photo spots                                       │
├──────────────────────────────────────────────────────────┤
│ ALL GEMS FEED  — bento, mixed shapes, grouped by place      │
│                                                            │
│  ╔══════════ NEIGHBORHOOD CONTAINER: Le Marais ═════════╗   │
│  ║ header: photo · name · trending · woven counts ·     ║   │  [neighborhood gem = container]
│  ║         Explore / + Add a day                        ║   │
│  ║ ┌── IN LE MARAIS (enclosed) ──────────────────────┐  ║   │
│  ║ │ [PHOTO SPOT]      [ATTRACTION]                   │  ║   │
│  ║ │  +photographer     Book/Add                      │  ║   │  ← matched services nested
│  ║ │ [MARQUEE STAY ─── +private car ─── Book both]    │  ║   │
│  ║ └──────────────────────────────────────────────────┘ ║   │
│  ╚════════════════════════════════════════════════════╝   │
│                                                            │
│  ╔══════════ NEIGHBORHOOD CONTAINER: Montmartre ════════╗   │
│  ║ … its own enclosed content …                         ║   │
│  ╚════════════════════════════════════════════════════╝   │
│                                                            │
│  ── ELSEWHERE IN PARIS (gems with no neighborhood tag) ──  │
│  [EVENT·Sat]   [EXPERT]   [EXPERIENCE·featured]            │  ← standalone typed gems, bento
│                                                            │
├──────────────────────────────────────────────────────────┤
│ ABOUT PARIS (reference — collapsed/secondary, not feed)    │
│   ▸ Media gallery (photos + video)        [Media tab]      │
│   ▸ Insights (9 AI subcards)              [AI Insights tab]│
├──────────────────────────────────────────────────────────┤
│ FOOTER → "What's on in Paris this week →" (by-date view)   │  [Events tab]
└──────────────────────────────────────────────────────────┘
```

**Two grouping modes (driven by the spine filter):**
- **"All gems" (default) → grouped by neighborhood** (containers + "Elsewhere in Paris" catch-all).
- **Type filter (Eat/Do/Stay/Experts/Events/Photo spots) → flattened** across the whole city (containers dissolve).

---

## PART 4 — Match-rule table (anchor type → matched provider category)

This is the marketplace intelligence. Each anchor pulls its relevant supply from the 27 categories; native-first, affiliate fill.

| Gem anchor | Matched service(s) → category | Action shown |
|---|---|---|
| Photo spot | Photography & Videography (photographer) | "Book a shoot here" |
| Hotel / lodging (marquee) | Transportation & Logistics (private car/transfer) | "Book both" |
| Attraction | Tours & Experiences (guide) · tickets | "Book entry / Book guide" |
| Restaurant | reservation · Food & Culinary | "Reserve" |
| Neighborhood | Local expert · walking tour (Tours & Experiences) | "Plan with {expert}" |
| Event | tickets · Transportation (getting there) | "Tickets / + Add to {day}" |
| Wedding / proposal / venue | Floral & Decoration · Music & Performance · Food & Culinary · Photography | "Build the event" |
| Wellness place | Health & Wellness · Beauty & Styling | "Book treatment" |
| Family / kids gem | Childcare & Family · Entertainment | "Add a sitter / show" |
| Any gem (fallback) | Local expert (consultation) | "Find a local expert" |

*Rule of thumb: if a gem has no direct bookable match, it still offers "Add to experience" + "Find a local expert" — never a dead end.*

---

## PART 4.5 — Action grammar (the marketplace buttons)

Actions adapt to each gem's **bookability**. Two are universal; the primary "buy" action is conditional.

**Universal (every item, no exceptions — this is the "never a dead end" rule):**
- **Add to experience** — adds the item to the user's experience template / trip.
- **Ask an expert** — low-friction consult about *this specific item* (creates an `expert_request` → feeds the lead→workspace pipeline; it's demand-gen, not just a button).

**Conditional primary (by bookability + badge):**
| State | Primary action | Badge | Source |
|---|---|---|---|
| Platform-bookable | **Book now** (instant, Stripe) | green "Book on Traveloure" | native provider service |
| Affiliate-bookable | **Book on {partner}** (external) | blue "via {partner}" | matched affiliate product |
| Not bookable | — (none) | grey "Not bookable" | gem with no product |

Type-specific primary labels: Event → **Tickets**; Restaurant → **Reserve**; Neighborhood → **Explore** + **Add a day**.

**Bookability is derived per item:** resolve the gem against supply — maps to a native service → platform Book; maps to an affiliate product → Book on partner; maps to neither → not bookable (Add + Ask only, plus any matched service surfaces, e.g. free viewpoint → "photographer available → Book shoot"). This derivation drives the button state and is part of the match resolver (Part 6).

## PART 4.6 — Experts as marketed supply (not just a fallback)

Experts are **promoted in the feed** as first-class supply for services not tied to a single gem — itinerary planning above all, plus concierge/specialty. Three placements:
1. **Per-item:** "Ask an expert" on every gem (the soft consult above).
2. **Expert feed cards** (a typed anchor): markets an expert's services — "Sofia turns your picks into a day-by-day plan · itinerary planning · ★4.9 · from €249 · Plan with Sofia." Draws from the 6 expert service types (consultation/planning/action/concierge/experience/specialty).
3. **Contextual "plan it for me" prompts:** interspersed after a cluster of picks — "Want these turned into an itinerary? An expert can build it" — marketing the planning service at the moment of intent.

This makes **itinerary planning a promoted, first-class part of the feed**, and turns the whole marketplace into a demand-generation engine for experts (every "Ask"/"Plan with" is a routed lead).

## PART 5 — Layout & behavior rules
- **Bento weighting:** neighborhood containers + marquee = full-width (span 2); secondary gems = half; alternate 1-up / 2-up rows so it never reads as a stack of stretched rectangles.
- **Neighborhood = container:** belonging content (by Phase-1b `neighborhood` tag) nests inside, labeled "IN {neighborhood}". This is what the tagging foundation powers.
- **De-dup:** a gem renders inside its neighborhood container OR in the flat/catch-all view depending on active grouping — never both.
- **Every item actionable:** Book / Add to experience / Find a local expert / Tickets. No info-only blocks in the feed.
- **Reference out of feed:** Media + the 9 Insights subcards live in a secondary "About Paris" area, not the shoppable stream (kept, not lost).
- **Trust guardrail:** matched/marquee services must be genuinely relevant and must never bury a better native result (monetization-must-not-override-trust).
- **Cold-start:** thin markets (Kyoto) show sparser containers / fewer matches; affiliate fill backstops; never show empty placeholders.
- **Contained width:** max-width column ~900–1000px, centered.

---

## PART 6 — Data sources (reuse the orchestrator)
Everything reuses the existing `/api/discover/location/:city` orchestrator data:
- Neighborhoods + their tagged gems/services → Phase-1b rollups (native).
- Hotels / activities / experts → blended native + network.
- Matched services → resolved per Part 4 from native + affiliate supply.
- Media / Insights → existing media + AI-insights data (reference area).
- Events → Fever feed (footer + by-date view).

**New logic to build:** (1) the match-rule resolver (Part 4); (2) the bento weighting/render; (3) the feed grouping + de-dup. No new data pipelines — composition + matching on top of what exists.

---

*This wireframe is one parameterized template; every city renders identically from its own supply. Tested against Kyoto (real Phase-1b data); Paris shown for illustration.*
