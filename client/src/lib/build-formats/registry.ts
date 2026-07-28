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
 * v1 contains ONLY `client:default` (grouping "days") — today's PlanCard day-list, unchanged,
 * so the registry itself causes ZERO visual change. Later phases add `client:kyoto-cultural`,
 * `client:kyoto-wedding` / `client:event` (F2), `social:*` (F3), `store:*` / `direct:*` (F4).
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
 * v1 registry: ONLY the client channel default — today's PlanCard day-list. Channel defaults
 * are, by construction, the current behavior of each surface (zero regression); other channel
 * defaults are added when their surfaces start consuming the registry (F2–F4).
 */
const REGISTRY: Record<string, RegistryEntry> = {
  "client:default": {
    key: "client:default",
    channel: "client",
    grouping: "days",
    sections: [],
  },
};

function norm(value: string | null | undefined): string | null {
  const t = (value ?? "").trim().toLowerCase();
  return t.length > 0 ? t : null;
}

/**
 * Fallback chain: (channel, type, market) → (channel, type) → (channel, market) → channel
 * default. Channel is never null — every rendering surface knows which channel it is. Market
 * matching normalizes case/whitespace (the same vocabulary posture as LAUNCH_MARKETS, §12).
 * In v1, any lookup that misses resolves to `client:default` (the only registered entry).
 */
export function resolveFormat(
  channel: Channel,
  experienceType: string | null,
  market: string | null,
): BuildFormat {
  const type = norm(experienceType);
  const mkt = norm(market);

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
  // v1: only client:default is registered — it is the terminal fallback for every channel
  // until the other channel defaults land with their consuming surfaces.
  if (!entry) entry = REGISTRY["client:default"];

  return { ...entry, vocabulary: getTemplateConfig(experienceType) };
}
