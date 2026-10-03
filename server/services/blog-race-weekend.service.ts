/**
 * blog-race-weekend.service.ts — post type 3, RACE WEEKEND FROM [MARKET] (ledger
 * `2026-09-30-blog-race-weekend`; decision-maker dispatch, Sep 30, 2026: "a motorsport event within a
 * travel-time budget of a launch market (Suzuka from Kyoto first). Type 1 plus the getting-there leg
 * from the A8 travel-time service. Refused if no leg computes.").
 *
 *   type 1's ONE fact builder (`loadEventGuideFacts`) + ONE getting-there leg from the launch market's
 *   centre to the venue, through the ONE travel-time service (`loadLegResolver`, A8, exact) → ONE
 *   model call through `claudeService.completeJson` (R226; sourceType `ai_blog_race_weekend`) → the
 *   ONE shared draft check (`checkPlatformDraft`) → a platform `draft` carrying `city_event_id`, so
 *   the post's door is type 1's live door. Nothing here publishes.
 *
 * THE LEG ADMITS; IT IS NEVER PRINTED (ruling `2026-09-30-public-content-facts-rank-only`). Its minutes
 * decide whether the venue is within `RACE_WEEKEND_LEG_BUDGET_MINUTES` of the market and which mode is
 * quicker, and are then dropped: the model sees `{ from, mode }` and nothing else, and the number
 * check refuses any digit the facts do not carry. A straight-line ESTIMATE is not a leg (the A8 "est."
 * tier is a label for a plan, never evidence for a post), so a venue with only an estimate is refused
 * `no_leg` — "refused if no leg computes", read strictly.
 *
 * Refusals, each by name: `no_city_event`; `not_motorsport` (the STATED vertical — never guessed from
 * a title, migration 335); `unknown_market`; `travel_time_service_off` (A8's flag — its callers are
 * gated on it); `no_venue_location`; `no_leg`; `beyond_budget` (the budget stated, the leg's minutes
 * not); `already_drafted`; and the draft check's `race_weekend_*` refusals.
 */
import type { LatLng } from "@shared/travel-time";
import type { LegMode } from "@shared/travel-speeds";
import type { ResolvedLeg } from "@shared/leg-resolution";
import { db } from "../db";
import { cityEvents } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { claudeService } from "./claude.service";
import { BlogError, createPost } from "./blog-posts.service";
import { loadEventGuideFacts, type EventGuideFacts } from "./blog-event-facts.service";
import { blogSlugExists, checkPlatformDraft, eventPostSources, promptFacts, type EventGuideDeps, type RawDraft } from "./blog-event-guide.service";
import { getMarketByKey } from "./trend-engine/operating-markets";
import { loadLegResolver } from "./travel-time.service";
import { travelTimeServiceEnabled } from "../config/travel-time.config";
import { RACE_WEEKEND_LEG_BUDGET_MINUTES } from "../config/blog.config";

/** The modes a getting-there leg is tried in. Walking and cycling to a circuit are not a leg. */
export const RACE_WEEKEND_LEG_MODES: readonly LegMode[] = ["transit", "drive"];

export interface RaceWeekendFacts extends EventGuideFacts {
  /** The launch market and the quicker computed mode. No minutes, no distance — ever. */
  gettingThere: { from: string; mode: LegMode };
}

export const RACE_WEEKEND_SYSTEM_PROMPT = [
  "You write a short race-weekend guide for Traveloure: ONE motorsport event, reached from ONE city, from the JSON facts you are given and nothing else.",
  "gettingThere names the city the reader starts from and the mode (transit means by train or public transport; drive means by car). Say the venue is within reach of that city by that mode. Never give minutes, hours, kilometres, or a comparison between modes.",
  "Use only the facts' names, dates and times. Do not state prices, capacities, distances, durations, ratings, weather or any number the facts do not contain.",
  "If venueFacts is empty, say nothing about the venue beyond its name. If alsoOn is empty, leave that section out. Where to stay: base the weekend in the gettingThere city; name stayNear neighbourhoods only if given.",
  "Write no URLs and no links. End by inviting the reader to start a plan around the race.",
  'Return JSON of the form {"title":"…","summary":"one sentence","body":"plain text, short paragraphs"}.',
].join("\n");

/**
 * Pure. The quickest COMPUTED leg within the budget, as a mode only. An estimate is not computed;
 * no computed leg ⇒ `no_leg`; every computed leg over the budget ⇒ `beyond_budget`.
 */
export function pickGettingThereLeg(
  legs: ReadonlyArray<ResolvedLeg | null>,
  budgetMinutes: number,
): { mode: LegMode } | { refused: "no_leg" | "beyond_budget" } {
  const computed = legs.filter((l): l is ResolvedLeg => !!l && l.basis !== "est" && Number.isFinite(l.minutes));
  if (computed.length === 0) return { refused: "no_leg" };
  const within = computed.filter((l) => l.minutes <= budgetMinutes).sort((a, b) => a.minutes - b.minutes);
  return within.length === 0 ? { refused: "beyond_budget" } : { mode: within[0].mode };
}

/** Pure. What the model sees and the number check allows: type 1's prompt facts plus `{ from, mode }`. */
export function racePromptFacts(facts: RaceWeekendFacts) {
  return { ...promptFacts(facts), gettingThere: facts.gettingThere };
}

/** Pure. `race-weekend-<from market>-<first date>-<title words>`. */
export function raceWeekendSlug(facts: RaceWeekendFacts, fromMarketKey: string): string {
  const words = facts.event.title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `race-weekend-${fromMarketKey}-${facts.event.firstDate}-${words || "race"}`.slice(0, 160).replace(/-+$/, "");
}

/** Pure. The shared check; the event's city and the launch city are the post's own. */
export function checkRaceWeekendDraft(raw: RawDraft, facts: RaceWeekendFacts) {
  return checkPlatformDraft(raw, racePromptFacts(facts), [facts.event.city, facts.gettingThere.from], "race_weekend");
}

type LegResolver = (from: LatLng, to: LatLng, mode: LegMode) => Promise<ResolvedLeg>;

export interface RaceWeekendDeps extends Omit<EventGuideDeps, "facts"> {
  facts?: (eventId: string) => Promise<EventGuideFacts | null>;
  /** The A8 resolver for the launch market (tests inject one; production loads it exact). */
  legResolver?: (marketKey: string) => Promise<LegResolver>;
  serviceEnabled?: () => boolean;
  budgetMinutes?: number;
}

async function defaultModel(input: { system: string; user: string; actorId: string | null }): Promise<RawDraft> {
  const { result } = await claudeService.completeJson<RawDraft>({
    system: input.system,
    user: input.user,
    maxTokens: 2000,
    sourceType: "ai_blog_race_weekend",
    userId: input.actorId,
    label: "Race weekend",
  });
  return result;
}

/** Draft the race weekend for one motorsport event from one launch market (default: its own). Never publishes. */
export async function draftRaceWeekend(
  input: { eventId: string; fromMarket?: string | null },
  actorId: string | null,
  deps: RaceWeekendDeps = {},
) {
  const [row] = await db.select().from(cityEvents)
    .where(and(eq(cityEvents.id, input.eventId), isNull(cityEvents.withdrawnAt))).limit(1);
  const base = row ? await (deps.facts ?? ((id) => loadEventGuideFacts(id, deps)))(input.eventId) : null;
  if (!row || !base) throw new BlogError("no_city_event", 404);
  if (row.vertical !== "motorsport") throw new BlogError("not_motorsport", 422);
  const fromKey = input.fromMarket ?? base.event.marketKey;
  const market = fromKey ? getMarketByKey(fromKey) : undefined;
  if (!market) throw new BlogError("unknown_market", 422);
  if (!(deps.serviceEnabled ?? travelTimeServiceEnabled)()) throw new BlogError("travel_time_service_off", 409);
  if (row.venueLat == null || row.venueLng == null) throw new BlogError("no_venue_location", 422);

  const budget = deps.budgetMinutes ?? RACE_WEEKEND_LEG_BUDGET_MINUTES;
  const resolve = await (deps.legResolver ?? ((k) => loadLegResolver(k, { exact: true })))(market.marketKey);
  const origin = { lat: market.lat, lng: market.lng };
  const venue = { lat: row.venueLat, lng: row.venueLng };
  const legs = await Promise.all(RACE_WEEKEND_LEG_MODES.map((m) => resolve(origin, venue, m).catch(() => null)));
  const picked = pickGettingThereLeg(legs, budget);
  if ("refused" in picked) {
    throw new BlogError(picked.refused, 422, undefined, picked.refused === "beyond_budget" ? { budgetMinutes: budget } : undefined);
  }

  const facts: RaceWeekendFacts = { ...base, gettingThere: { from: market.cityName, mode: picked.mode } };
  const slug = raceWeekendSlug(facts, market.marketKey);
  if (await (deps.slugExists ?? blogSlugExists)(slug)) throw new BlogError("already_drafted", 409);
  const raw = await (deps.model ?? defaultModel)({
    system: RACE_WEEKEND_SYSTEM_PROMPT,
    user: `Facts:\n${JSON.stringify(racePromptFacts(facts), null, 2)}`,
    actorId,
  });
  const checked = checkRaceWeekendDraft(raw, facts);
  if ("error" in checked) throw new BlogError(checked.error, 422);
  try {
    return await createPost({
      contentType: "race_weekend",
      slug,
      title: checked.title,
      summary: checked.summary || null,
      body: checked.body,
      marketSlug: market.marketKey,
      cityEventId: facts.event.id,
      sources: eventPostSources(facts),
    }, actorId, deps);
  } catch (e) {
    if (e instanceof BlogError && e.code === "slug_taken") throw new BlogError("already_drafted", 409);
    if ((e as { code?: string })?.code === "23505") throw new BlogError("already_drafted", 409);
    throw e;
  }
}
