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
import { firstForeignLink, firstInventedNumber, numbersInFacts } from "@shared/draft-facts-check";
import { claudeService } from "./claude.service";
import { BlogError, createPost, type BlogDeps } from "./blog-posts.service";
import { loadEventGuideFacts, type EventFactsDeps, type EventGuideFacts } from "./blog-event-facts.service";
import { OPERATING_MARKETS } from "./trend-engine/operating-markets";

export type RawDraft = { title?: unknown; summary?: unknown; body?: unknown };

export const EVENT_GUIDE_SYSTEM_PROMPT = [
  "You write a short weekend guide to ONE event for Traveloure, from the JSON facts you are given and nothing else.",
  "Use only the facts' names, dates and times. Do not state prices, capacities, distances, durations, ratings, weather or any number the facts do not contain.",
  "Where to stay: name the stayNear neighbourhoods in their given order and describe them only as closest or a short ride from the venue. Never give minutes or kilometres.",
  "If venueFacts is empty, say nothing about the venue beyond its name. If alsoOn is empty, leave that section out.",
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
  const { venueFactSources: _s, attributedFacts: _a, ...rest } = facts;
  return { ...rest, event };
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

/**
 * Pure. The ONE draft check every event post type runs (§18 rule 1): a title and body, no number the
 * given facts do not carry, no link at all, and no operating-market city outside `ownCities`. Each
 * refusal is `<prefix>_<reason>`.
 */
export function checkPlatformDraft(
  raw: RawDraft,
  factsForNumbers: unknown,
  ownCities: readonly string[],
  prefix: string,
): { title: string; summary: string; body: string } | { error: string } {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!title || !body) return { error: `${prefix}_malformed` };
  const text = `${title}\n${summary}\n${body}`;
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
      body: checked.body,
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
