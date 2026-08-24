/**
 * Distribution-format registry — F1 skeleton (docs/backoffice/DISTRIBUTION_FORMATS.md, §17).
 *
 * A build's rendering FORMAT is driven by where the plan is going — the distribution CHANNEL —
 * flavored by experience type and styled by market ("channel × experience type × market",
 * ratified Jul 27, 2026). The channel picks the STRUCTURE: Client = the full Workstation
 * itinerary, Store = the Ready Made Trip product page, Social = story/caption kit, Direct =
 * link-preview/OG. Pure client registry, no schema change: channel is intrinsic to the surface
 * doing the rendering; type/market come from `trips.eventType` / `trips.destination`.
 *
 * F2 adds the first real structures to the F1 skeleton: `client:kyoto-cultural` (grouping
 * "neighborhoods" — the city_neighborhoods walk), `client:kyoto-wedding` and `client:event`
 * (grouping "venue-timeline"). `client:default` (grouping "days") stays today's PlanCard
 * day-list, unchanged — zero regression for non-Kyoto / non-event builds. F3 adds
 * `social:default` → `social:story` (grouping "story-frames", the Distribute-panel social kit).
 * F4 adds the store family mirroring the client family — `store:kyoto-cultural` (leads with a
 * neighborhood strip), `store:kyoto-wedding` (leads with the venue hero), `store:default` (the
 * current Ready Made detail page, zero regression — the terminal store fallback) — plus
 * `direct:default` (grouping "link-preview": the OG/link-preview format; the actual OG tags are
 * injected server-side by storefront.routes.ts's /ready-made/:id interception, extending the
 * existing /p/:handle pattern). Store entries' `layout` records
 * `{ surface: "ready-made-detail", lead: "map-strip" | "venue-hero" | "standard" }` — the store
 * detail page branches its LEAD section only; the §10 teaser gate is untouched.
 *
 * Vocabulary is NOT duplicated here: it resolves through the existing
 * `getTemplateConfig(eventType)` (client/src/components/plancard/plancard-types.tsx), which
 * this registry absorbs as its vocabulary layer.
 *
 * Expert notes (the notes contract in DISTRIBUTION_FORMATS.md): there is no separate insertion
 * step — notes live on the build and the format decides where they surface at render time. For
 * `client:*` they are first-class and render wherever PlanCard renders them today; this file
 * changes nothing about the notes pipeline.
 */
import { getTemplateConfig, type TemplateConfig } from "@/components/plancard/plancard-types";

export type Channel = "client" | "store" | "social" | "direct";

export type FormatGrouping =
  | "days"
  | "neighborhoods"
  | "venue-timeline"
  | "story-frames"
  | "link-preview";

/** Ordered section slot — maps itinerary items in by itemType/category (F2+). */
export interface FormatSection {
  key: string;
  label: string;
  itemTypes?: string[];
}

/** Photo strategy + stat labels, per channel (F2+ fills these in). */
export interface HeroSpec {
  photoStrategy: "trip-hero" | "none";
  statLabels?: string[];
}

/** How THIS channel's surface renders the format (store page layout, story frames, …). */
export interface ChannelLayoutSpec {
  surface: string;
  [key: string]: unknown;
}

export interface BuildFormat {
  key: string;
  channel: Channel;
  grouping: FormatGrouping;
  sections: FormatSection[];
  /** Absorbs today's getTemplateConfig(eventType) label sets. */
  vocabulary: TemplateConfig;
  hero?: HeroSpec;
  layout?: ChannelLayoutSpec;
}

type RegistryEntry = Omit<BuildFormat, "vocabulary">;

/**
 * client:kyoto-cultural sections — the mockup's four badges (mockup-destination-formats.html §2).
 * A section WITH `itemTypes` claims those item types; the one WITHOUT `itemTypes` is the honest
 * catch-all ("everything else = Experiences" — §13: never guessed into a themed bucket).
 */
const KYOTO_CULTURAL_SECTIONS: FormatSection[] = [
  { key: "temples", label: "Temples & Shrines", itemTypes: ["culture", "temple", "shrine"] },
  { key: "food", label: "Food & Tea", itemTypes: ["dining", "food", "restaurant", "cafe", "tea"] },
  { key: "transport", label: "Getting Around", itemTypes: ["transport", "transportation", "transfer"] },
  { key: "experiences", label: "Experiences" },
];

/**
 * venue-timeline sections — the mockup's four panels. Panel membership precedence lives in
 * VenueTimelineView (Timeline claims any TIMED item first, matching the mockup where every
 * timed row is a timeline row); these itemType lists cover the UNTIMED items:
 *  - venues: the ceremony/reception spaces ("accommodation" reads venue-ish — a machiya/estate
 *    stay that IS the venue), NOT guest lodging;
 *  - vendors: platform-service linkage is checked first in the view (providerServiceId), then
 *    these service-ish types — dining/shopping ride the wedding vocabulary (Catering/Vendor);
 *  - logistics: transport + guest-lodging blocks ("hotel" = the guest hotel block).
 * Unmatched untimed items land in the view's visible "Other" list — never dropped (§13).
 */
const VENUE_TIMELINE_SECTIONS: FormatSection[] = [
  { key: "venues", label: "Ceremony & Venues", itemTypes: ["venue", "ceremony", "reception", "accommodation"] },
  { key: "timeline", label: "Timeline" },
  { key: "vendors", label: "Vendors & Services", itemTypes: ["service", "vendor", "dining", "food", "shopping", "catering"] },
  { key: "logistics", label: "Guest Logistics", itemTypes: ["transport", "transportation", "transfer", "hotel", "lodging"] },
];

const CLIENT_KYOTO_CULTURAL: RegistryEntry = {
  key: "client:kyoto-cultural",
  channel: "client",
  grouping: "neighborhoods",
  sections: KYOTO_CULTURAL_SECTIONS,
};

const CLIENT_KYOTO_WEDDING: RegistryEntry = {
  key: "client:kyoto-wedding",
  channel: "client",
  grouping: "venue-timeline",
  sections: VENUE_TIMELINE_SECTIONS,
};

/** Any-market event structure — same panels; the wedding/corporate vocabularies come through
 *  getTemplateConfig at resolve time (type flavors, market styles). */
const CLIENT_EVENT: RegistryEntry = {
  key: "client:event",
  channel: "client",
  grouping: "venue-timeline",
  sections: VENUE_TIMELINE_SECTIONS,
};

/**
 * store:* — the Ready Made Trip product page (F4). Entries mirror the client family; the store
 * detail is TEASER-GATED (§10) so it never renders itinerary sections — the section lists are
 * carried as structural metadata for parity with the client twin, and the page consumes only
 * `layout.lead` to re-lead itself. `lead: "map-strip"` = a neighborhood strip band (real
 * city_neighborhoods names — no fabricated pins); `lead: "venue-hero"` = the mockup's venue-led
 * hero (title + market + facts row of REAL DTO fields only, §13); `lead: "standard"` = the
 * current page, unchanged.
 */
const STORE_KYOTO_CULTURAL: RegistryEntry = {
  key: "store:kyoto-cultural",
  channel: "store",
  grouping: "neighborhoods",
  sections: KYOTO_CULTURAL_SECTIONS,
  layout: { surface: "ready-made-detail", lead: "map-strip" },
};

const STORE_KYOTO_WEDDING: RegistryEntry = {
  key: "store:kyoto-wedding",
  channel: "store",
  grouping: "venue-timeline",
  sections: VENUE_TIMELINE_SECTIONS,
  layout: { surface: "ready-made-detail", lead: "venue-hero" },
};

/**
 * Registry: `client:default` is today's PlanCard day-list (zero regression by construction);
 * the F2 Kyoto/event entries are aliased under every candidate key resolveFormat can emit for
 * them (keys are lowercase-normalized; market keys use the city segment before any comma).
 * All four channels register a default now (social F3, store/direct F4).
 */
const REGISTRY: Record<string, RegistryEntry> = {
  "client:default": {
    key: "client:default",
    channel: "client",
    grouping: "days",
    sections: [],
  },
  // client:kyoto-cultural — a Kyoto travel build, and the Kyoto market default (a Kyoto build
  // with a null/other non-event type resolves here via the (channel, market) fallback).
  "client:travel:kyoto": CLIENT_KYOTO_CULTURAL,
  "client:kyoto": CLIENT_KYOTO_CULTURAL,
  // client:kyoto-wedding — Kyoto event builds (wedding family).
  "client:wedding:kyoto": CLIENT_KYOTO_WEDDING,
  "client:proposal:kyoto": CLIENT_KYOTO_WEDDING,
  "client:honeymoon:kyoto": CLIENT_KYOTO_WEDDING,
  // client:event — event builds in any market (a Kyoto corporate build also lands here via
  // the (channel, type) fallback: client:corporate:kyoto is unregistered).
  "client:wedding": CLIENT_EVENT,
  "client:proposal": CLIENT_EVENT,
  "client:corporate": CLIENT_EVENT,
  // social:story — the F3 social kit (SocialKitCard: hero → highlight frames of real build
  // items → CTA frame). Every social render resolves here in v1; type/market flavoring later.
  "social:default": {
    key: "social:story",
    channel: "social",
    grouping: "story-frames",
    sections: [],
  },
  // store:kyoto-cultural — a Kyoto travel listing, and the Kyoto market default (a Kyoto
  // listing with a null/other non-event type resolves here via the (channel, market) fallback).
  "store:travel:kyoto": STORE_KYOTO_CULTURAL,
  "store:kyoto": STORE_KYOTO_CULTURAL,
  // store:kyoto-wedding — Kyoto event listings (wedding family), mirroring the client keys.
  "store:wedding:kyoto": STORE_KYOTO_WEDDING,
  "store:proposal:kyoto": STORE_KYOTO_WEDDING,
  "store:honeymoon:kyoto": STORE_KYOTO_WEDDING,
  // store:default — the CURRENT Ready Made detail layout (zero regression by construction);
  // the terminal fallback for every store render that misses the Kyoto entries.
  "store:default": {
    key: "store:default",
    channel: "store",
    grouping: "days",
    sections: [],
    layout: { surface: "ready-made-detail", lead: "standard" },
  },
  // direct:default — the link-preview format (WhatsApp shares + trackable booking short-links).
  // The rendering itself is the server-side OG injection (storefront.routes.ts /ready-made/:id,
  // extending the /p/:handle pattern); this entry records the channel's structure so every
  // direct render resolves to a real format instead of leaking to client:default.
  "direct:default": {
    key: "direct:default",
    channel: "direct",
    grouping: "link-preview",
    sections: [],
  },
};

function norm(value: string | null | undefined): string | null {
  const t = (value ?? "").trim().toLowerCase();
  return t.length > 0 ? t : null;
}

/**
 * Market key from a build's destination: lowercase-normalized city segment before any comma —
 * "Kyoto, Japan" and "Kyoto" both key as "kyoto" (the same city-name vocabulary posture as
 * LAUNCH_MARKETS, §12). No fuzzy matching: an unrecognized market simply misses the market
 * candidates and falls through the chain to the channel default.
 */
function normMarket(value: string | null | undefined): string | null {
  const t = norm(value);
  if (!t) return null;
  const city = t.split(",")[0].trim();
  return city.length > 0 ? city : null;
}

/**
 * Fallback chain: (channel, type, market) → (channel, type) → (channel, market) → channel
 * default. Channel is never null — every rendering surface knows which channel it is. Market
 * matching normalizes case/whitespace and keys on the city segment (normMarket — the same
 * vocabulary posture as LAUNCH_MARKETS, §12). Every channel now registers its own default
 * (client/social F1–F3, store/direct F4); `client:default` remains the belt-and-suspenders
 * terminal fallback that can no longer be reached through a registered channel.
 */
export function resolveFormat(
  channel: Channel,
  experienceType: string | null,
  market: string | null,
): BuildFormat {
  const type = norm(experienceType);
  const mkt = normMarket(market);

  const candidates = [
    type && mkt ? `${channel}:${type}:${mkt}` : null,
    type ? `${channel}:${type}` : null,
    mkt ? `${channel}:${mkt}` : null,
    `${channel}:default`,
  ].filter((k): k is string => !!k);

  let entry: RegistryEntry | undefined;
  for (const key of candidates) {
    if (REGISTRY[key]) {
      entry = REGISTRY[key];
      break;
    }
  }
  // Unreachable for registered channels (each has a `<channel>:default` row); kept as the
  // belt-and-suspenders terminal fallback.
  if (!entry) entry = REGISTRY["client:default"];

  return { ...entry, vocabulary: getTemplateConfig(experienceType) };
}
