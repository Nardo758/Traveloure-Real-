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
 * `social:default` → `social:story` (grouping "story-frames", the Distribute-panel social kit);
 * `store:*` / `direct:*` land in F4.
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
 * Registry: `client:default` is today's PlanCard day-list (zero regression by construction);
 * the F2 Kyoto/event entries are aliased under every candidate key resolveFormat can emit for
 * them (keys are lowercase-normalized; market keys use the city segment before any comma).
 * Other channel defaults are added when their surfaces start consuming the registry (F3–F4).
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
 * vocabulary posture as LAUNCH_MARKETS, §12). Any lookup that misses every candidate resolves
 * to the channel default (today `client:default` — the terminal fallback for every channel
 * until the other channel defaults land with their consuming surfaces, F3–F4).
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
  // client:default is the terminal fallback for every channel until the other channel
  // defaults land with their consuming surfaces (F3–F4).
  if (!entry) entry = REGISTRY["client:default"];

  return { ...entry, vocabulary: getTemplateConfig(experienceType) };
}
