/**
 * TC-2 Phase 1 (decision-maker, Oct 12, 2026 — ledger `2026-10-12-tc2-affiliate-legs`): a plan leg's partner
 * options — the ONE resolver. The route rules are pure (`@shared/transport-affiliate`); this file adds what
 * only the server knows: the leg's ends and day, the plan's party size, and the partner registry.
 *
 *   · Registry gate (decisions 1 and 2): a partner renders only when its `affiliate_partners` row — found by
 *     its website host (`AFFILIATE_PARTNER_HOSTS`) — is approved, active, states a licence and an attribution
 *     (migration 376) and carries an https redirect template with `{url}`. Any one missing ⇒ the partner
 *     offers nothing; the health entry says why.
 *   · Party size from the plan (`partyTotal`); never a literal 1. Unknown ⇒ "set your party size".
 *   · The link is the partner's redirect with our marker wrapping the clean target (never the API token).
 *   · The order reads fit only (`orderAffiliateLegOptions`).
 *
 * Stored as the leg's `transport_booking_options` affiliate rows so the existing tracked click route and the
 * booking-agent rail read them by id; `syncLegAffiliateOptions` replaces the leg's not-booked affiliate rows
 * with the current answer on every read, under a per-leg lock, so a rule change reaches rows cached earlier.
 */
import { db } from "../db";
import { affiliatePartners, itineraryComparisons, itineraryVariants, transportBookingOptions, transportLegs, trips } from "@shared/schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { partyTotal } from "@shared/plan-vocabulary";
import {
  kiwitaxiClassLine,
  orderAffiliateLegOptions,
  plannedAffiliateOptions,
  wrapAffiliateRedirect,
  type AffiliatePartnerKey,
  type PlannedAffiliateOption,
  type TransportAffiliateConfig,
} from "@shared/transport-affiliate";
import { AFFILIATE_PARTNER_HOSTS, TRANSPORT_AFFILIATE_CONFIG } from "../config/transport-affiliate.config";
import { getTravelpayoutsMarker } from "./travelpayouts/travelpayouts-client";
import { reportProviderResult } from "./provider-health.service";

export interface RegistryPartner {
  id: string;
  websiteUrl: string | null;
  approvalStatus: string | null;
  isActive: boolean | null;
  license: string | null;
  attribution: string | null;
  affiliateLinkTemplate: string | null;
}

export type RegistryRefusal = "no_row" | "not_approved" | "inactive" | "no_license" | "no_attribution" | "no_template";

/** Pure. Why a registry row may not render a partner, or null when it may. */
export function affiliatePartnerRefusal(row: RegistryPartner | null | undefined): RegistryRefusal | null {
  if (!row) return "no_row";
  if (row.approvalStatus !== "approved") return "not_approved";
  if (row.isActive === false) return "inactive";
  if (!row.license?.trim()) return "no_license";
  if (!row.attribution?.trim()) return "no_attribution";
  const t = row.affiliateLinkTemplate?.trim() ?? "";
  if (!t.startsWith("https://") || !t.includes("{url}")) return "no_template";
  return null;
}

/** Pure. The host a website URL names, lower-case, without `www.`. */
export function hostOf(url: string | null | undefined): string | null {
  try {
    return new URL(String(url ?? "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Every partner key's registry row (the first whose host matches), ready or not. */
export async function registryRowsByKey(): Promise<Map<AffiliatePartnerKey, RegistryPartner>> {
  const rows = (await db
    .select({
      id: affiliatePartners.id,
      websiteUrl: affiliatePartners.websiteUrl,
      approvalStatus: affiliatePartners.approvalStatus,
      isActive: affiliatePartners.isActive,
      license: affiliatePartners.license,
      attribution: affiliatePartners.attribution,
      affiliateLinkTemplate: affiliatePartners.affiliateLinkTemplate,
    })
    .from(affiliatePartners)) as RegistryPartner[];
  const out = new Map<AffiliatePartnerKey, RegistryPartner>();
  for (const [key, host] of Object.entries(AFFILIATE_PARTNER_HOSTS) as Array<[AffiliatePartnerKey, string]>) {
    const matches = rows.filter((r) => hostOf(r.websiteUrl) === host);
    // A ready row wins over one that is not, so a stale duplicate never hides a configured partner.
    const ready = matches.find((r) => affiliatePartnerRefusal(r) === null);
    const row = ready ?? matches[0];
    if (row) out.set(key, row);
  }
  return out;
}

/** The registry id for a stored option's `source`, for the click record — null when the partner has no row. */
export async function affiliatePartnerIdForSource(source: string | null | undefined): Promise<string | null> {
  if (source !== "12go" && source !== "kiwitaxi") return null;
  return (await registryRowsByKey()).get(source)?.id ?? null;
}

const HEALTH_KEY: Record<AffiliatePartnerKey, string> = { "12go": "twelvego_link", kiwitaxi: "kiwitaxi_link" };

export interface LegAffiliateOption {
  partnerKey: AffiliatePartnerKey;
  partnerId: string;
  title: string;
  description: string;
  modeType: string;
  url: string;
  airportLeg: boolean;
}

/**
 * Pure past the registry read. The options a leg offers: the route plan, gated by the registry, wrapped in the
 * partner's redirect, in fit order.
 */
export function gateAffiliateOptions(
  planned: readonly PlannedAffiliateOption[],
  registry: ReadonlyMap<AffiliatePartnerKey, RegistryPartner>,
  marker: string,
  cfg: TransportAffiliateConfig,
  report: (partner: AffiliatePartnerKey, outcome: "ok" | "empty", detail?: string) => void = () => {},
): LegAffiliateOption[] {
  const out: LegAffiliateOption[] = [];
  for (const p of planned) {
    const row = registry.get(p.partnerKey);
    const refusal = affiliatePartnerRefusal(row);
    if (refusal) {
      report(p.partnerKey, "empty", `registry: ${refusal}`);
      continue;
    }
    const url = wrapAffiliateRedirect(row!.affiliateLinkTemplate, marker, p.targetUrl);
    if (!url) {
      report(p.partnerKey, "empty", "registry: no_template");
      continue;
    }
    const lines = [row!.attribution!.trim()];
    const cls = p.partnerKey === "kiwitaxi" ? kiwitaxiClassLine(p.vehicleClass, cfg.kiwitaxiBagNote) : null;
    if (cls) lines.unshift(cls);
    out.push({
      partnerKey: p.partnerKey,
      partnerId: row!.id,
      title: p.title,
      description: lines.join(" · "),
      modeType: p.partnerKey === "kiwitaxi" ? "car" : "transit",
      url,
      airportLeg: p.airportLeg,
    });
    report(p.partnerKey, "ok");
  }
  return orderAffiliateLegOptions(out);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isoOf(v: unknown): string | null {
  const s = v instanceof Date ? v.toISOString() : String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/** The leg, its plan's party and its day (only when the plan's dates are chosen). */
async function legContext(legId: string) {
  const [leg] = await db
    .select({
      id: transportLegs.id,
      tripId: transportLegs.tripId,
      variantId: transportLegs.variantId,
      dayNumber: transportLegs.dayNumber,
      fromLat: transportLegs.fromLat,
      fromLng: transportLegs.fromLng,
      toLat: transportLegs.toLat,
      toLng: transportLegs.toLng,
    })
    .from(transportLegs)
    .where(eq(transportLegs.id, legId))
    .limit(1);
  if (!leg) return null;
  let tripId = leg.tripId ?? null;
  if (!tripId && leg.variantId) {
    const [v] = await db
      .select({ tripId: itineraryComparisons.tripId })
      .from(itineraryVariants)
      .innerJoin(itineraryComparisons, eq(itineraryComparisons.id, itineraryVariants.comparisonId))
      .where(eq(itineraryVariants.id, leg.variantId))
      .limit(1);
    tripId = v?.tripId ?? null;
  }
  const [trip] = tripId
    ? await db.select({ adults: trips.adults, kids: trips.kids, startDate: trips.startDate, datesConfirmedAt: trips.datesConfirmedAt }).from(trips).where(eq(trips.id, tripId)).limit(1)
    : [];
  const start = trip?.datesConfirmedAt ? isoOf(trip.startDate) : null;
  return {
    leg,
    party: trip ? partyTotal(trip.adults, trip.kids) : undefined,
    dateIso: start && leg.dayNumber ? addDays(start, leg.dayNumber - 1) : null,
  };
}

/** The current partner options for one leg (no write). */
export async function affiliateOptionsForLeg(legId: string, cfg: TransportAffiliateConfig = TRANSPORT_AFFILIATE_CONFIG): Promise<LegAffiliateOption[]> {
  const ctx = await legContext(legId);
  if (!ctx) return [];
  const planned = plannedAffiliateOptions(
    {
      from: { lat: Number(ctx.leg.fromLat), lng: Number(ctx.leg.fromLng) },
      to: { lat: Number(ctx.leg.toLat), lng: Number(ctx.leg.toLng) },
      party: ctx.party,
      dateIso: ctx.dateIso,
    },
    cfg,
  );
  if (!planned.length) return [];
  const registry = await registryRowsByKey();
  return gateAffiliateOptions(planned, registry, getTravelpayoutsMarker(), cfg, (p, outcome, detail) =>
    reportProviderResult(HEALTH_KEY[p], outcome, detail),
  );
}

/** The stored row id of a leg's partner option: fixed per leg and partner, so a re-sync replaces only its own rows. */
export function legAffiliateOptionId(legId: string, partnerKey: AffiliatePartnerKey): string {
  return `tc2-${legId}-${partnerKey}`;
}
export function isLegAffiliateOptionId(id: string | null | undefined, legId: string): boolean {
  return typeof id === "string" && id.startsWith(`tc2-${legId}-`);
}

/**
 * Replace the leg's not-booked resolver rows with the current answer, under a per-leg transaction lock so two
 * reads never both insert. A booked or confirmed row is never touched, and an affiliate row stored before this
 * resolver is never deleted — the leg-options read hides it instead (`isLegAffiliateOptionId`).
 */
export async function syncLegAffiliateOptions(legId: string, cfg: TransportAffiliateConfig = TRANSPORT_AFFILIATE_CONFIG): Promise<void> {
  const options = await affiliateOptionsForLeg(legId, cfg);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tc2-leg-affiliate:${legId}`}))`);
    await tx
      .delete(transportBookingOptions)
      .where(
        and(
          eq(transportBookingOptions.transportLegId, legId),
          eq(transportBookingOptions.bookingType, "affiliate"),
          sql`${transportBookingOptions.id} LIKE ${`tc2-${legId}-%`}`,
          or(isNull(transportBookingOptions.bookingStatus), inArray(transportBookingOptions.bookingStatus, ["available"])),
        ),
      );
    // A partner whose row is booked keeps that row; it is not offered a second time.
    const kept = (await tx
      .select({ id: transportBookingOptions.id })
      .from(transportBookingOptions)
      .where(and(eq(transportBookingOptions.transportLegId, legId), sql`${transportBookingOptions.id} LIKE ${`tc2-${legId}-%`}`))) as Array<{ id: string }>;
    const fresh = options.filter((o) => !kept.some((k) => k.id === legAffiliateOptionId(legId, o.partnerKey)));
    if (!fresh.length) return;
    await tx.insert(transportBookingOptions).values(
      fresh.map((o) => ({
        id: legAffiliateOptionId(legId, o.partnerKey),
        transportLegId: legId,
        bookingType: "affiliate",
        source: o.partnerKey,
        title: o.title,
        description: o.description,
        modeType: o.modeType,
        priceDisplay: "Compare prices",
        externalUrl: o.url,
        sortOrder: 1 + options.indexOf(o),
        isRecommended: options.indexOf(o) === 0,
      })),
    );
  });
}
