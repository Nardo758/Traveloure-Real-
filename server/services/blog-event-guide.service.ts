/**
 * blog-event-guide.service.ts — post type 1, the EVENT WEEKEND GUIDE (ledger
 * `2026-09-30-blog-event-guide`; decision-maker dispatch, Sep 30, 2026).
 *
 *   the ONE fact builder (`loadEventGuideFacts`) → ONE model call through `claudeService.completeJson`
 *   (R226; sourceType `ai_blog_event_guide`; the session admin as actor, §14) → the ONE number/link
 *   check (`shared/draft-facts-check.ts`) → a platform `draft` through the ONE `createPost`, carrying
 *   `city_event_id` so the post page renders its "Start this plan" door from the LIVE event row.
 *   Nothing here publishes; the admin rail does.
 *
 * Refusals, each by name: `no_city_event` (no live row — the dispatch's rule), `already_drafted` (one
 * guide per event; the UNIQUE slug is the guard), and a draft that states a number or a link the facts
 * do not carry, or names another operating market, is refused WHOLE (`event_guide_unknown_number`,
 * `event_guide_foreign_link`, `event_guide_unknown_market`). The ticket link is attached as a SOURCE row
 * (the model is told to write no URL at all), and only when R208 and the partner registry allow it.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { blogPosts } from "@shared/schema";
import { blogBannedHits } from "@shared/banned-copy";
import { calendarDay, hasStructuredDates, proseDatesArePast, structuredDatesArePast } from "@shared/blog-publish-checks";
import { firstForeignLink, firstInventedNumber, numbersInFacts } from "@shared/draft-facts-check";
import { claudeService } from "./claude.service";
import { BlogError, createPost, type BlogDeps } from "./blog-posts.service";
import { loadEventGuideFacts, type EventFactsDeps, type EventGuideFacts } from "./blog-event-facts.service";
import { OPERATING_MARKETS, getMarketByCityName, timezoneForMarket } from "./trend-engine/operating-markets";

export type RawDraft = { title?: unknown; summary?: unknown; body?: unknown };

const UNSUPPORTED_MEASUREMENT = /\b\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?|kilometers?|kilometres?|kms?|miles?|meters?|metres?|feet|ft|yards?|yds?)\b/i;

export const EVENT_GUIDE_SYSTEM_PROMPT = [
  "You write a short weekend guide to ONE event for Traveloure, from the JSON facts you are given and nothing else.",
  "Use only the facts' names, dates and times. Do not state prices, capacities, distances, durations, ratings, weather or any number the facts do not contain.",
  "Where to stay: name the stayNear neighbourhoods in their given order and describe them only as closest or a short ride from the venue. Never give minutes or kilometres.",
  "If venueFacts is empty, say nothing about the venue beyond its name. Never write a date, a source name, or the words verified or confirmed about a venueFact: the post adds each fact's source and checked date itself. If alsoOn is empty, leave that section out.",
  "Write no URLs and no links. End by inviting the reader to start a plan around the event.",
  'Return JSON of the form {"title":"…","summary":"one sentence","body":"plain text, short paragraphs"}.',
].join("\n");

/**
 * Pure. What the MODEL sees and what the number check allows: the facts minus the row id and the
 * ticket link, whose digits are identifiers, not facts a reader could be told (a UUID's digits would
 * otherwise license invented numbers).
 */
export function promptFacts(facts: EventGuideFacts) {
  const { id: _id, ticketUrl: _t, ...event } = facts.event;
  // The attribution links go to the post's source list, never to the model (ruling R-p).
  // The event page's attributed facts carry the same links, so they stay out too (ledger `2026-10-06-event-page`).
  // CS-1 item 2: the fact stamps are written into the post by code, never by the model.
  const { venueFactSources: _s, attributedFacts: _a, factStamps: _f, ...rest } = facts;
  return { ...rest, event };
}

/**
 * Pure. CS-1 item 2: the post body with one code-written line per stamped venue fact appended —
 * "<fact> — Checked <date> · Source: <official site>", from the stored fields only. No stamps ⇒ the body unchanged.
 */
export function withFactStamps(body: string, facts: Pick<EventGuideFacts, "factStamps">): string {
  const lines = (facts.factStamps ?? []).map((f) => `${f.text} — ${f.stamp}`);
  return lines.length ? `${body}\n\n${lines.join("\n")}` : body;
}

/** The post's sources: the ticket page, then one "from <official source>" per attributed venue fact. */
export function eventPostSources(facts: EventGuideFacts) {
  return [
    ...(facts.event.ticketUrl ? [{ url: facts.event.ticketUrl, title: "Tickets", retrievedAt: new Date() }] : []),
    ...facts.venueFactSources.filter((s) => s.url !== facts.event.ticketUrl),
  ];
}

/** Pure. A stable, unique slug per event: `event-weekend-<first date>-<title words>`. */
export function eventGuideSlug(facts: EventGuideFacts): string {
  const words = facts.event.title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `event-weekend-${facts.event.firstDate}-${words || "event"}`.slice(0, 160).replace(/-+$/, "");
}

/** The zone the facts' calendar days are read in: the event's, the series' or the trip's city. */
function timeZoneForFacts(facts: unknown): string {
  if (!facts || typeof facts !== "object") return "Asia/Tokyo";
  const f = facts as { event?: { city?: unknown }; instances?: Array<{ city?: unknown }>; trip?: { city?: unknown } };
  const city = [f.event?.city, f.instances?.[0]?.city, f.trip?.city].find((c): c is string => typeof c === "string" && c.trim().length > 0);
  if (!city) return "Asia/Tokyo";
  return timezoneForMarket(getMarketByCityName(city)?.marketKey);
}

/**
 * Pure. The ONE draft check every event post type runs (§18 rule 1): a title and body, no banned
 * phrase, no event or trip date that has already ended, no number the given facts do not carry,
 * no link at all, and no operating-market city outside `ownCities`. Each refusal is `<prefix>_<reason>`.
 * `now` is injectable so a test can pin "today".
 */
export function checkPlatformDraft(
  raw: RawDraft,
  factsForNumbers: unknown,
  ownCities: readonly string[],
  prefix: string,
  now: Date = new Date(),
): { title: string; summary: string; body: string } | { error: string } {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!title || !body) return { error: `${prefix}_malformed` };
  const text = `${title}\n${summary}\n${body}`;
  if (blogBannedHits(text).length > 0) return { error: `${prefix}_banned_copy` };
  const today = calendarDay(now, timeZoneForFacts(factsForNumbers));
  const past = hasStructuredDates(factsForNumbers)
    ? structuredDatesArePast(factsForNumbers, today)
    : proseDatesArePast(text, today);
  if (past) return { error: `${prefix}_past_date` };
  if (UNSUPPORTED_MEASUREMENT.test(text)) return { error: `${prefix}_unknown_number` };
  if (firstInventedNumber(text, numbersInFacts(factsForNumbers)) !== null) return { error: `${prefix}_unknown_number` };
  if (firstForeignLink(text, []) !== null) return { error: `${prefix}_foreign_link` };
  const own = new Set(ownCities.map((c) => c.toLowerCase()));
  for (const m of OPERATING_MARKETS) {
    if (!own.has(m.cityName.toLowerCase()) && new RegExp(`\\b${m.cityName}\\b`, "i").test(text)) {
      return { error: `${prefix}_unknown_market` };
    }
  }
  return { title: title.slice(0, 200), summary, body };
}

/** Pure. The checked weekend guide, or the reason it is refused. */
export function checkEventGuideDraft(raw: RawDraft, facts: EventGuideFacts): { title: string; summary: string; body: string } | { error: string } {
  return checkPlatformDraft(raw, promptFacts(facts), [facts.event.city], "event_guide");
}

export interface EventGuideDeps extends BlogDeps, EventFactsDeps {
  facts?: (eventId: string) => Promise<EventGuideFacts | null>;
  slugExists?: (slug: string) => Promise<boolean>;
  model?: (input: { system: string; user: string; actorId: string | null }) => Promise<RawDraft>;
}

export async function blogSlugExists(slug: string): Promise<boolean> {
  return (await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1)).length > 0;
}

async function defaultModel(input: { system: string; user: string; actorId: string | null }): Promise<RawDraft> {
  const { result } = await claudeService.completeJson<RawDraft>({
    system: input.system,
    user: input.user,
    maxTokens: 2000,
    sourceType: "ai_blog_event_guide",
    userId: input.actorId,
    label: "Event weekend guide",
  });
  return result;
}

/** Draft the weekend guide for one city event. Never publishes. */
export async function draftEventWeekendGuide(eventId: string, actorId: string | null, deps: EventGuideDeps = {}) {
  const facts = await (deps.facts ?? ((id) => loadEventGuideFacts(id, deps)))(eventId);
  if (!facts) throw new BlogError("no_city_event", 404);
  const slug = eventGuideSlug(facts);
  // A cheap read so a second press spends no model call; the UNIQUE slug index is the guard.
  if (await (deps.slugExists ?? blogSlugExists)(slug)) throw new BlogError("already_drafted", 409);
  const raw = await (deps.model ?? defaultModel)({
    system: EVENT_GUIDE_SYSTEM_PROMPT,
    user: `Facts:\n${JSON.stringify(promptFacts(facts), null, 2)}`,
    actorId,
  });
  const checked = checkEventGuideDraft(raw, facts);
  if ("error" in checked) throw new BlogError(checked.error, 422);
  try {
    return await createPost({
      contentType: "event_weekend_guide",
      slug,
      title: checked.title,
      summary: checked.summary || null,
      body: withFactStamps(checked.body, facts),
      marketSlug: facts.event.marketKey,
      cityEventId: facts.event.id,
      sources: eventPostSources(facts),
    }, actorId, deps);
  } catch (e) {
    if (e instanceof BlogError && e.code === "slug_taken") throw new BlogError("already_drafted", 409);
    if ((e as { code?: string })?.code === "23505") throw new BlogError("already_drafted", 409);
    throw e;
  }
}
