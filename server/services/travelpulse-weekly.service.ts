/**
 * travelpulse-weekly.service.ts — TravelPulse PR 3 (ledger `2026-09-30-travelpulse-weekly`): the
 * platform-authored weekly post, drafted from the platform's OWN displayed signal.
 *
 *   displayed signal (the ONE Trend + crowd display rules) → facts → ONE model call through
 *   `claudeService.completeJson` (R226; sourceType `ai_travelpulse_weekly`, the admin as actor) →
 *   a checked draft → an ordinary platform `draft` through the ONE `createPost`. Nothing here
 *   publishes: an admin publishes through the existing rail (Locked Decision 57, ruling 5).
 *
 * Rules that must not be weakened:
 *  - FACTS ARE WHAT A PUBLIC SURFACE MAY ALREADY SAY. The generator reads `displayedSignalByMarket`,
 *    which passes every market through `displayTrendScore` / `displayCrowdBand`. A market with no
 *    shown Trend number is not in the post. No raw PredictHQ, BestTime, X or other signal value, and
 *    no confidence number, is ever in the prompt or the post.
 *  - NOT ENOUGH SIGNAL, NO POST. Fewer than `TRAVELPULSE_WEEKLY_MIN_MARKETS` markets (config,
 *    default 3) with a shown Trend number refuses with `not_enough_signal`; a week is never written
 *    from nothing.
 *  - THE MODEL MAY NOT ADD FACTS. A draft is REFUSED whole when it states a number that is not a
 *    fact's Trend number, the ISO week or the year, or names an operating market that is not in the
 *    facts (`weekly_draft_unknown_number` / `weekly_draft_unknown_market`).
 *  - ONE POST PER ISO WEEK. The slug is `travelpulse-weekly-<year>-w<week>`; `blog_posts.slug` is
 *    UNIQUE, so a second run for the same week answers `already_drafted` and writes nothing.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { blogPosts } from "@shared/schema";
import { claudeService } from "./claude.service";
import { BlogError, createPost, type BlogDeps } from "./blog-posts.service";
import { OPERATING_MARKETS } from "./trend-engine/operating-markets";

export interface WeeklyMarketSignal {
  marketKey: string;
  cityName: string;
  trend: number | null;
  crowd: string | null;
}

export interface WeeklyFact {
  cityName: string;
  trend: number;
  crowd: string | null;
}

export function travelPulseWeeklyMinMarkets(): number {
  const raw = Number(process.env.TRAVELPULSE_WEEKLY_MIN_MARKETS);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 3;
}

/** ISO-8601 week of `d` (UTC). */
export function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

export function weeklySlug(now: Date): string {
  const { year, week } = isoWeek(now);
  return `travelpulse-weekly-${year}-w${String(week).padStart(2, "0")}`;
}

/** Pure. Markets with a shown Trend number, highest first; ties by city name (deterministic). */
export function buildWeeklyFacts(signal: readonly WeeklyMarketSignal[]): WeeklyFact[] {
  return signal
    .filter((m) => m.trend != null && Number.isFinite(m.trend))
    .map((m) => ({ cityName: m.cityName, trend: m.trend as number, crowd: m.crowd ?? null }))
    .sort((a, b) => b.trend - a.trend || a.cityName.localeCompare(b.cityName));
}

export const WEEKLY_SYSTEM_PROMPT = [
  "You write Traveloure's short weekly TravelPulse note from the facts you are given, and nothing else.",
  "Each fact is a city, its Trend number this week (0–100; 50 is that city's usual level of interest, higher is more than usual) and, where given, its crowd level.",
  "Use ONLY these cities and ONLY these numbers. Do not add prices, events, dates, weather, reasons or any other claim.",
  "Say plainly that Trend measures public interest compared with each city's own usual level, not quality. Say crowd only where a crowd level is given.",
  "Plain, practical prose. No superlatives, no emoji, no headings beyond a short list.",
  'Return JSON of the form {"title":"…","summary":"one sentence","body":"markdown"}.',
].join("\n");

export function buildWeeklyPrompt(facts: readonly WeeklyFact[], now: Date): string {
  const { year, week } = isoWeek(now);
  return [
    `Week ${week} of ${year}.`,
    "Facts:",
    ...facts.map((f) => `- ${f.cityName}: Trend ${f.trend}${f.crowd ? `; crowd ${f.crowd}` : ""}`),
  ].join("\n");
}

/** Pure. The checked draft, or the reason it is refused. */
export function checkWeeklyDraft(
  raw: { title?: unknown; summary?: unknown; body?: unknown },
  facts: readonly WeeklyFact[],
  now: Date,
): { title: string; summary: string; body: string } | { error: string } {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!title || !body) return { error: "weekly_draft_malformed" };
  const text = `${title}\n${summary}\n${body}`;
  const { year, week } = isoWeek(now);
  const allowed = new Set<string>([...facts.map((f) => String(f.trend)), String(year), String(week), "0", "50", "100"]);
  for (const m of Array.from(text.matchAll(/\d+(?:\.\d+)?/g), (x) => x[0])) {
    if (!allowed.has(m)) return { error: "weekly_draft_unknown_number" };
  }
  const inFacts = new Set(facts.map((f) => f.cityName.toLowerCase()));
  for (const m of OPERATING_MARKETS) {
    if (!inFacts.has(m.cityName.toLowerCase()) && new RegExp(`\\b${m.cityName}\\b`, "i").test(text)) {
      return { error: "weekly_draft_unknown_market" };
    }
  }
  return { title: title.slice(0, 200), summary, body };
}

export interface WeeklyDeps extends BlogDeps {
  slugExists?: (slug: string) => Promise<boolean>;
  signal?: () => Promise<WeeklyMarketSignal[]>;
  model?: (input: { system: string; user: string; actorId: string }) => Promise<{ title?: unknown; summary?: unknown; body?: unknown }>;
  now?: Date;
}

async function defaultSlugExists(slug: string): Promise<boolean> {
  const rows = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);
  return rows.length > 0;
}

async function defaultSignal(): Promise<WeeklyMarketSignal[]> {
  const { travelPulseService } = await import("./travelpulse.service");
  return travelPulseService.displayedSignalByMarket();
}

async function defaultModel(input: { system: string; user: string; actorId: string }) {
  const { result } = await claudeService.completeJson<{ title?: unknown; summary?: unknown; body?: unknown }>({
    system: input.system,
    user: input.user,
    maxTokens: 1500,
    sourceType: "ai_travelpulse_weekly",
    userId: input.actorId,
    label: "TravelPulse weekly",
  });
  return result;
}

/** Draft this ISO week's TravelPulse post. Never publishes. */
export async function draftTravelPulseWeekly(actorId: string, deps: WeeklyDeps = {}) {
  const now = deps.now ?? new Date();
  const slug = weeklySlug(now);
  // A cheap read first so a second run for the week spends no model call. It is NOT the guard: the
  // UNIQUE slug index is, and a lost race is answered `already_drafted` below.
  if (await (deps.slugExists ?? defaultSlugExists)(slug)) throw new BlogError("already_drafted", 409);
  const facts = buildWeeklyFacts(await (deps.signal ?? defaultSignal)());
  if (facts.length < travelPulseWeeklyMinMarkets()) throw new BlogError("not_enough_signal", 422);
  const raw = await (deps.model ?? defaultModel)({ system: WEEKLY_SYSTEM_PROMPT, user: buildWeeklyPrompt(facts, now), actorId });
  const checked = checkWeeklyDraft(raw, facts, now);
  if ("error" in checked) throw new BlogError(checked.error, 422);
  try {
    return await createPost({
      contentType: "travelpulse_weekly",
      slug,
      title: checked.title,
      summary: checked.summary || null,
      body: checked.body,
      sources: [],
    }, actorId, deps);
  } catch (e) {
    if (e instanceof BlogError && e.code === "slug_taken") throw new BlogError("already_drafted", 409);
    if ((e as { code?: string })?.code === "23505") throw new BlogError("already_drafted", 409);
    throw e;
  }
}
