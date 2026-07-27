# Destination Formats — the build renderer stops being one Trip Card

**Status:** design ratified (axis + scope), format CONTENT below is the proposal for the
decision-maker's read. Ratified Jul 27, 2026: format resolves from **destination × experience
type** (both axes), applied to **builder + store page**.

## Why

The Workstation renders every build through the same PlanCard structure — day selector,
day-by-day activity list, transport — for every destination and every build type. The only
variance today is vocabulary (`getTemplateConfig(eventType)`: travel/wedding/corporate label
sets) and the hero photo. A Kyoto cultural itinerary, a Kyoto wedding, and a generic city trip
are structurally identical. The decision-maker's directive: each destination needs its own
format; the Trip Card is not the universal renderer.

## The registry contract

```ts
// client/src/lib/build-formats/registry.ts (to be built)
interface BuildFormat {
  key: string;                       // "kyoto-cultural", "kyoto-wedding", "event-generic", "travel-generic"
  // STRUCTURE — what makes this a real format, not a label set:
  grouping: "days" | "neighborhoods" | "venue-timeline" | "modules";
  sections: FormatSection[];         // ordered; each maps itinerary items in by itemType/category
  vocabulary: TemplateConfig;        // absorbs today's label sets
  hero: HeroSpec;                    // photo strategy + stat labels
  storeLayout: StoreLayoutSpec;      // how the Ready Made detail page renders this format
}

function resolveFormat(destination: string | null, experienceType: string | null): BuildFormat
// Fallback chain: exact (destination, type) → destination default → type default → travel-generic.
// Destination matching normalizes via the same market vocabulary as LAUNCH_MARKETS (§12).
```

- **Pure client registry, no schema change.** The format is DERIVED from fields every build
  already has (`trips.destination`, `trips.eventType`) — nothing new is stored, so there is no
  migration, no publish-push trap, and a format can be improved without touching data.
  (If a build ever needs to PIN a format against registry evolution, that becomes an additive
  nullable `format_key` column — a later decision, not this one.)
- Both renderers consume it: PlanCard (builder, `embedded`) and the Ready Made Trip store
  detail page. One registry, two surfaces — no fork.

## Launch formats (§12: Kyoto first) — PROPOSAL, needs decision-maker read

### `kyoto-cultural` — (Kyoto, travel/default)
- **Grouping: neighborhoods** — the `city_neighborhoods` spine already carries Kyoto
  neighborhoods with centroids; items group under Gion, Arashiyama, Higashiyama… with a
  day ribbon inside each group (an itinerary is walked by area in Kyoto, not by a flat
  day list).
- Sections: Temples & Shrines · Food & Tea · Experiences · Getting Around — mapped from
  existing itemType/category values; unmapped items land honestly in Experiences.
- Seasonal note slot: renders ONLY when the build carries real seasonal data
  (`bestSeason` on the listing) — never fabricated (§13).
- Store page: neighborhood map strip (existing MapControlCenter data) above the grouped
  sections; hero keeps the real Unsplash pick from the listing.

### `kyoto-wedding` — (Kyoto, wedding/proposal/honeymoon)
- **Grouping: venue-timeline** — an event build is venues + a timeline, not sightseeing
  days: Ceremony & Venues · Timeline (the day-of schedule from scheduled items) ·
  Vendors & Services (provider-service items) · Guest Logistics (transport/hotel items).
- Store page: leads with venue + date-window + party size; day-by-day only as a
  secondary view.

### `event-generic` — (any destination, wedding/proposal/honeymoon/corporate)
Venue-timeline structure with today's wedding/corporate vocabularies — the existing
event templates deepened from labels to structure.

### `travel-generic` — fallback
Today's PlanCard day-list, unchanged. Every existing build renders exactly as before
until a more specific format matches — **zero regression by construction**.

## Execution (own PR cycle, after the audit-fixes PR merges)

1. **F1** Registry + `resolveFormat` + `travel-generic` extracted from current PlanCard
   (pure refactor, behavior-identical, proven by the existing smokes).
2. **F2** `kyoto-cultural`: neighborhood grouping (match on itinerary item locationName /
   the neighborhoods the coverage spine knows), sections, builder + store rendering.
3. **F3** `kyoto-wedding` + `event-generic` (venue-timeline structure).
4. **F4** Store detail page consumes `storeLayout` (Ready Made detail + preview-as-buyer).

Per-phase gates as always (tsc baseline, build, guards) + one behavioral boot.
