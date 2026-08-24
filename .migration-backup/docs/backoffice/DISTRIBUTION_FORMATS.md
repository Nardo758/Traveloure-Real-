# Distribution Formats — the build renderer stops being one Trip Card

**Status:** design ratified. **CORRECTED Jul 27, 2026:** the first same-day ratification mis-read
"destination" as geography. The decision-maker's intent: **"destination" = the DISTRIBUTION
destination — the channel the plan is going to.** A plan shipped to Social media needs a
social-media-driven format, not the Trip Card. Re-ratified axes: **channel × experience type ×
market** ("option 1 & 3"); Social output = **both** the story-style rendering and the caption +
share-image pack.

## Why

The Workstation renders every build through the same PlanCard structure regardless of where the
build is going. But §17's build-first/distribute-later model already says a build ships to four
distribution channels with independent state — and each channel is a fundamentally different
rendering problem:

| Channel | What the render actually is |
|---|---|
| **Client** | The full working itinerary the client receives — detail-dense, day/area navigable |
| **Store** | A product page a buyer evaluates — teaser-gated (§10 content gate), price-led |
| **Social** | Scroll-native visual content — a story/carousel, not a day list |
| **Direct** | A link preview — OG card + landing for WhatsApp / trackable booking short-links |

One Trip Card cannot be all four. The format registry makes the channel pick the structure.

## The registry contract

```ts
// client/src/lib/build-formats/registry.ts (to be built)
type Channel = "client" | "store" | "social" | "direct";

interface BuildFormat {
  key: string;                 // "client:kyoto-cultural", "social:story", "store:kyoto-wedding", …
  channel: Channel;            // the structural family — the primary axis
  // STRUCTURE — what makes this a real format, not a label set:
  grouping: "days" | "neighborhoods" | "venue-timeline" | "story-frames" | "link-preview";
  sections: FormatSection[];   // ordered; maps itinerary items in by itemType/category
  vocabulary: TemplateConfig;  // absorbs today's getTemplateConfig(eventType) label sets
  hero: HeroSpec;              // photo strategy + stat labels (per channel)
  layout: ChannelLayoutSpec;   // how THIS channel's surface renders it
}

function resolveFormat(channel: Channel, experienceType: string | null, market: string | null): BuildFormat
// Fallback chain: (channel, type, market) → (channel, type) → (channel, market) → channel default.
// Channel is never null — every rendering surface knows which channel it is.
// Market matching normalizes via the same vocabulary as LAUNCH_MARKETS (§12).
```

- **Pure client registry, no schema change.** Channel is intrinsic to the surface doing the
  rendering (the Workstation client view, the store detail page, the social preview, the /p/ or
  short-link landing); type and market come from `trips.eventType` / `trips.destination`. Nothing
  new is stored → no migration, no publish-push trap. (If a build ever needs to PIN a format
  against registry evolution, that becomes an additive nullable column — a later decision.)
- The channel defaults are the current behavior: `client` default = today's PlanCard day-list,
  `store` default = the current Ready Made detail layout — **zero regression by construction**.

## Expert notes — when and where they enter the render (decision-maker Q, Jul 27)

There is NO separate insertion step. Notes are authored in the Workstation and already live on the
build (trip-level + item-level); the format resolves at render time and decides where they surface.
The Trip Plan Card starts consuming format info at **F1** (the `client:default` extraction adds the
resolved-format input to PlanCard); the notes data pipeline is untouched. Per-channel contract:

- **Client — first-class, always.** Notes are part of the paid deliverable. Item-level notes travel
  WITH their item into whatever group the format assigns (a Kiyomizu-dera note renders inside the
  Higashiyama group; a florist note inside Vendors & Services). **Every `client:*` format carries a
  dedicated trip-level Expert Notes section slot** so a regrouping (neighborhoods / venue-timeline)
  can never orphan trip-level notes.
- **Store — behind the teaser gate.** Notes ARE the paid expert value → same §10 content-gate
  posture as `itineraryData`: never on the public product page; full notes only for
  purchaser/owner/admin. The store layout may show an honest COUNT ("includes N expert notes") —
  real data, not content.
- **Social — omitted by default.** Story frames render item names/areas, never notes. A pulled
  quote from a note as a frame is an expert-chosen action in the Distribute panel, never automatic
  (§13: nothing publishes that the expert didn't pick).
- **Direct — never.** The link preview is title/OG/short-link only; notes appear post-click on the
  gated surface the link lands on.

## Channel formats (proposal for the decision-maker's read)

### `client:*` — the Workstation / client itinerary (Trip Card family)
The geographic/type work from the first draft survives HERE, as market×type entries:
- **`client:kyoto-cultural`** (client, travel, Kyoto) — grouped by the `city_neighborhoods` spine
  (Gion, Arashiyama, Higashiyama…) with a day ribbon inside each area; sections Temples & Shrines ·
  Food & Tea · Experiences · Getting Around; seasonal slot only with real `bestSeason` (§13).
- **`client:kyoto-wedding`** (client, wedding/proposal, Kyoto) — venue-timeline: Ceremony & Venues ·
  Timeline · Vendors & Services · Guest Logistics.
- **`client:event`** (client, event types, any market) — venue-timeline with today's wedding/corporate
  vocabularies deepened from labels to structure.
- **`client:default`** — today's PlanCard day-list, unchanged.

### `store:*` — the Ready Made Trip product page
Consumes the format's `layout` for the §10 store detail (teaser-gated, price-led). Market/type
entries mirror the client family: `store:kyoto-cultural` leads with a neighborhood map strip;
`store:kyoto-wedding` leads with venue + date window + party size. `store:default` = current page.

### `social:*` — the social kit (ratified: BOTH outputs)
1. **Story view** (`grouping: "story-frames"`): a condensed carousel/story-style rendering — hero
   frame, 3–5 highlight frames (best items by section), CTA frame carrying the trackable link.
   Previewable in the Workstation Distribute panel before posting. Frames render only real build
   content (§13 — no invented highlights).
2. **Caption + share-image pack**: extends the EXISTING `promo-text.service.ts` (captions) and the
   share-image ready-made layout — packaged per platform next to the story view. Do not build a
   parallel caption engine.

### `direct:*` — link preview + landing
The OG/preview format for WhatsApp shares and trackable booking short-links — extends the existing
storefront OG-injection pattern (`/p/:handle`) and short-link redirects. `direct:default` first;
market flavoring later if it earns its keep.

## Execution (own PR cycle, after the audit-fixes PR merges)

1. **F1** Registry + `resolveFormat` (channel-primary) + extract `client:default` from the current
   PlanCard (pure refactor, behavior-identical, proven by the existing smokes).
2. **F2** `client:kyoto-cultural` + `client:kyoto-wedding` / `client:event` (the builder-side
   structures), Workstation consuming the registry.
3. **F3** The Social kit: story view rendering + preview in the Distribute panel, wired to the
   existing promo-text + share-image services.
4. **F4** `store:*` layouts on the Ready Made detail (+ preview-as-buyer), and `direct:*` link
   preview polish.

Per-phase gates as always (tsc baseline, build, guards) + one behavioral boot.
