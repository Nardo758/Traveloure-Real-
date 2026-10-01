/**
 * blog-series-follow.service.ts — post type 2, the SERIES FOLLOW (ledger
 * `2026-09-30-blog-series-follow`; decision-maker dispatch, Sep 30, 2026: "one series_key across
 * markets and dates, as a dated list with a door per instance. Refused under 2 instances.").
 *
 *   the ONE fact builder (`loadSeriesFollowFacts`, over `city_events.series_key`, migration 335) →
 *   ONE model call through `claudeService.completeJson` (R226; sourceType `ai_blog_series_follow`) →
 *   the ONE draft check type 1 runs (`checkPlatformDraft`) → a platform `draft` through `createPost`.
 *   Nothing here publishes; the admin rail does.
 *
 * THE DOORS ARE NOT IN THE TEXT. The post stores `city_event_id` = the soonest instance (the anchor),
 * and the public read lists a "Start this plan" door per LIVE instance of the anchor's `series_key`
 * every time it is read (`seriesDoorsFor`, blog-posts.service.ts) — an instance added later gains a
 * door, a withdrawn or past one loses it, and a deleted or withdrawn anchor means no doors at all.
 *
 * Refusals, each by name: `bad_series_key`; `series_too_small` (fewer than two live upcoming
 * instances, the count stated); `already_drafted` (one follow per series per soonest date — the UNIQUE
 * slug is the guard); and a draft stating a number or link the facts do not carry, or a market city
 * that is not one of the instances' (`series_follow_unknown_number` / `_foreign_link` /
 * `_unknown_market`), is refused WHOLE. Ticket links are SOURCE rows, never text (R208 applies).
 */
import { CITY_EVENT_SERIES_KEY_RE } from "@shared/city-events";
import { claudeService } from "./claude.service";
import { BlogError, createPost } from "./blog-posts.service";
import {
  loadSeriesFollowFacts,
  SERIES_FOLLOW_MIN_INSTANCES,
  type SeriesFollowFacts,
} from "./blog-event-facts.service";
import { blogSlugExists, checkPlatformDraft, type EventGuideDeps, type RawDraft } from "./blog-event-guide.service";

export const SERIES_FOLLOW_SYSTEM_PROMPT = [
  "You write a short guide to ONE recurring event series for Traveloure, from the JSON facts you are given and nothing else.",
  "List every instance in the given order as a dated list: its date, its city and its venue. Do not skip or add an instance.",
  "Use only the facts' names, dates and times. Do not state prices, capacities, distances, durations, ratings, weather or any number the facts do not contain.",
  "Write no URLs and no links. End by inviting the reader to pick an instance and start a plan around it.",
  'Return JSON of the form {"title":"…","summary":"one sentence","body":"plain text, short paragraphs"}.',
].join("\n");

/** Pure. What the MODEL sees and what the number check allows: no row ids, no ticket links. */
export function seriesPromptFacts(facts: SeriesFollowFacts) {
  return {
    series: facts.series,
    instances: facts.instances.map(({ id: _id, ticketUrl: _t, ...rest }) => rest),
  };
}

/** Pure. `series-follow-<key>-<soonest first date>`: a fresh follow once the soonest instance moves. */
export function seriesFollowSlug(facts: SeriesFollowFacts): string {
  return `series-follow-${facts.series.key}-${facts.instances[0].firstDate}`.slice(0, 160).replace(/-+$/, "");
}

/** Pure. The checked draft, or the reason it is refused. */
export function checkSeriesFollowDraft(raw: RawDraft, facts: SeriesFollowFacts) {
  return checkPlatformDraft(raw, seriesPromptFacts(facts), facts.instances.map((i) => i.city), "series_follow");
}

export interface SeriesFollowDeps extends Omit<EventGuideDeps, "facts"> {
  facts?: (seriesKey: string) => ReturnType<typeof loadSeriesFollowFacts>;
}

async function defaultModel(input: { system: string; user: string; actorId: string | null }): Promise<RawDraft> {
  const { result } = await claudeService.completeJson<RawDraft>({
    system: input.system,
    user: input.user,
    maxTokens: 2000,
    sourceType: "ai_blog_series_follow",
    userId: input.actorId,
    label: "Series follow",
  });
  return result;
}

/** Draft the follow for one series. Never publishes. */
export async function draftSeriesFollow(seriesKey: string, actorId: string | null, deps: SeriesFollowDeps = {}) {
  if (!CITY_EVENT_SERIES_KEY_RE.test(seriesKey)) throw new BlogError("bad_series_key", 400);
  const loaded = await (deps.facts ?? ((k) => loadSeriesFollowFacts(k, deps)))(seriesKey);
  if ("refused" in loaded) {
    throw new BlogError("series_too_small", 422, undefined, { instances: loaded.instances, minimum: SERIES_FOLLOW_MIN_INSTANCES });
  }
  const facts = loaded;
  const slug = seriesFollowSlug(facts);
  if (await (deps.slugExists ?? blogSlugExists)(slug)) throw new BlogError("already_drafted", 409);
  const raw = await (deps.model ?? defaultModel)({
    system: SERIES_FOLLOW_SYSTEM_PROMPT,
    user: `Facts:\n${JSON.stringify(seriesPromptFacts(facts), null, 2)}`,
    actorId,
  });
  const checked = checkSeriesFollowDraft(raw, facts);
  if ("error" in checked) throw new BlogError(checked.error, 422);
  const markets = Array.from(new Set(facts.instances.map((i) => i.marketKey).filter((m): m is string => !!m)));
  try {
    return await createPost({
      contentType: "series_follow",
      slug,
      title: checked.title,
      summary: checked.summary || null,
      body: checked.body,
      // One market ⇒ filed under it; a series across markets belongs to none (never a guessed one).
      marketSlug: markets.length === 1 ? markets[0] : null,
      cityEventId: facts.instances[0].id,
      sources: facts.instances
        .filter((i) => i.ticketUrl)
        .map((i) => ({ url: i.ticketUrl!, title: `Tickets — ${i.city} ${i.firstDate}`, retrievedAt: new Date() })),
    }, actorId, deps);
  } catch (e) {
    if (e instanceof BlogError && e.code === "slug_taken") throw new BlogError("already_drafted", 409);
    if ((e as { code?: string })?.code === "23505") throw new BlogError("already_drafted", 409);
    throw e;
  }
}
