/**
 * demand-onepager.service.ts — the DB glue for the Phase 4 recruitment one-pager.
 *
 * L6: this file adds NO computation. It reads `readAdminDemandRollup` (every row floored at
 * `cross_partner`=10 — the public tier, R30), hands the market's summary + rows to the pure
 * `buildOnepagerModel` (demand-onepager.compute.ts), and renders the returned view-model via the
 * DB-free `renderOnepagerPdf` (demand-onepager.render.ts). Every figure on the page is a field of
 * that model; nothing here re-derives demand.
 *
 * The three-way split mirrors the demand-rollup L6 shape: `.compute.ts` = pure model (no DB, no PDF),
 * `.render.ts` = pure PDF (no DB), `.service.ts` = DB read + orchestration. The render lives in its
 * own module precisely so its visual/determinism check runs without a database.
 *
 * Determinism (dispatch 4.1): the view-model is a pure function of the rollup rows, hence BYTE-STABLE
 * (deep-equal) — that is what the determinism gate asserts. The rendered PDF is CONTENT-stable (same
 * model ⇒ same visible text/layout); its bytes are not guaranteed identical because pdfkit stamps a
 * document CreationDate — which `render.ts` PINS to a fixed epoch so the only residual is pdfkit's
 * internal structure, never our data. We assert on the model, not the PDF bytes.
 *
 * R32: the service GENERATES DRAFTS — the rendered PDF carries a DRAFT watermark (render default)
 * unless the post-approval admin flow renders with `watermark: null`.
 */

import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { travelPulseCalendarEvents, partnerDemandRollup } from "@shared/schema";
import { readAdminDemandRollup, type RollupReadOpts } from "./demand-rollup.service";
import { getMarketByKey } from "./trend-engine/operating-markets";
import {
  buildOnepagerModel,
  qualifyingMarkets,
  type OnepagerModel,
  type OnepagerEventInput,
} from "./demand-onepager.compute";
import { renderOnepagerPdf } from "./demand-onepager.render";
import { DEMAND_WINDOW_DAYS } from "../config/demand-floors.config";

export { renderOnepagerPdf };

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * R33 — forward event windows for a market from `travel_pulse_calendar_events` (the only real
 * dated-event source; the trend engine stores aggregate metrics, not dated rows). Matched on the free
 * `city` string LOWERCASED (there is no market-slug column here). `end` falls back to `start` for a
 * single-day event. Empty for a market with no ingested forward events (e.g. Kyoto today ⇒ spotlight
 * ships dark — self-unlocking when events are ingested).
 */
async function fetchForwardEvents(marketName: string, now: Date): Promise<OnepagerEventInput[]> {
  const today = isoDay(now);
  const horizon = new Date(now);
  horizon.setUTCDate(horizon.getUTCDate() + DEMAND_WINDOW_DAYS);
  const rows = await db
    .select({
      name: travelPulseCalendarEvents.eventName,
      start: travelPulseCalendarEvents.startDate,
      end: travelPulseCalendarEvents.endDate,
    })
    .from(travelPulseCalendarEvents)
    .where(
      and(
        eq(sql`lower(${travelPulseCalendarEvents.city})`, marketName.toLowerCase()),
        gte(travelPulseCalendarEvents.startDate, today),
        lte(travelPulseCalendarEvents.startDate, isoDay(horizon)),
      ),
    );
  return rows.map((r) => ({ name: r.name, start: String(r.start), end: String(r.end ?? r.start) }));
}

/**
 * R34 — distinct-date weeks of computed daily rollup history for a market. Uses `date` (the demand
 * day-cell), NOT `computedAt` (job write time, which the REPLACE-BY-DATE job overwrites). Below
 * TREND_MIN_WEEKS the trend block stays dark; at launch this is only days old ⇒ dark, self-unlocking.
 */
async function fetchHistoryWeeks(marketSlug: string): Promise<number> {
  const [row] = await db
    .select({ days: sql<number>`count(distinct ${partnerDemandRollup.date})` })
    .from(partnerDemandRollup)
    .where(eq(partnerDemandRollup.marketSlug, marketSlug));
  const days = Number(row?.days ?? 0);
  return Math.floor(days / 7);
}

export interface OnepagerDraft {
  model: OnepagerModel;
  pdf: Buffer;
}

export interface QualifyingMarket {
  slug: string;
  name: string;
}

/**
 * Resolve the one-pager view-model for a market from the admin (public-floored) rollup. Returns null
 * when the market does not clear the public floor for any figure class (R30/R31 — no artifact).
 */
export async function resolveOnepagerModel(
  marketSlug: string,
  opts: RollupReadOpts = {},
): Promise<OnepagerModel | null> {
  const read = await readAdminDemandRollup(opts);
  const summary = read.summary.find((s) => s.marketSlug === marketSlug);
  const marketName = getMarketByKey(marketSlug)?.cityName ?? marketSlug;
  const rows = read.rows.filter((r) => r.marketSlug === marketSlug);

  // 4.2b feeds (R33/R34). Each self-omits its block when empty/below-threshold (all dark for Kyoto
  // today). R35 gap pairing: `coverageGap` is intentionally NOT wired — the only coverage read
  // (`resolveCoverageGaps`, market-insights.service.ts) counts provider_services (SERVICE supply), and
  // the property-led hero would need PROPERTY coverage, which no read produces (§13 — never pair
  // stay-demand with a service-coverage number). Left null pending a property-coverage read (followup);
  // a service-led market can wire the service-coverage gap here later (the compute already pairs it).
  const now = opts.now ?? new Date();
  const [events, historyWeeks] = await Promise.all([
    fetchForwardEvents(marketName, now),
    fetchHistoryWeeks(marketSlug),
  ]);

  return buildOnepagerModel({
    marketSlug,
    marketName,
    summary,
    rows,
    window: read.window,
    events,
    historyWeeks,
    coverageGap: null,
  });
}

/**
 * The markets that qualify for a one-pager right now (R32 admin control). A market qualifies iff a
 * figure class clears the public floor. Names resolved for display; non-qualifying markets are simply
 * absent (the admin control renders the honest "no figure clears the public floor yet" line for them).
 */
export async function listQualifyingMarkets(opts: RollupReadOpts = {}): Promise<QualifyingMarket[]> {
  const read = await readAdminDemandRollup(opts);
  return qualifyingMarkets(read.summary).map((slug) => ({
    slug,
    name: getMarketByKey(slug)?.cityName ?? slug,
  }));
}

/**
 * Full draft: resolve the model for a market and render its DRAFT PDF. Null when the market does not
 * qualify (R30/R31 — the floors decide). This is the admin control's generate action (R32).
 */
export async function generateOnepagerDraft(
  marketSlug: string,
  opts: RollupReadOpts = {},
): Promise<OnepagerDraft | null> {
  const model = await resolveOnepagerModel(marketSlug, opts);
  if (!model) return null;
  const pdf = await renderOnepagerPdf(model, { watermark: "DRAFT" });
  return { model, pdf };
}
