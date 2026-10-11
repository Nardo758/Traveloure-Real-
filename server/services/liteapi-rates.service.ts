/**
 * S1-d-2 — LIVE RATES FOR ONE STAY ON THE CARD (ledger `2026-10-10-s1-d2-liteapi-rates`; brief
 * `docs/planning/briefs/s1-d2-liteapi-rates.md`). `GET /api/trips/:tripId/stays/:stayId/rates`.
 *
 *   · A LIVE CALL, NEVER STORED — no rate reaches any table (`hotel_offer_cache` included, S1-d-1).
 *   · ONLY A PLAN READER asks, behind `planRole(read)`; anything else is ONE not_found (LD 40). The plan
 *     page and this route are sign-in only, so a guest never requests a rate. No member-only (CUG) rate is
 *     requested at all: every price here is the PUBLIC rate.
 *   · THE CAP (R299 shape): `LITEAPI_RATES_DAILY_CAP` calls per UTC day, counted on `api_usage_logs`
 *     BEFORE the call; over it, unreadable, LiteAPI off, an error or a timeout ⇒ `unavailable` — the card
 *     says "Rates unavailable right now", never an error.
 *   · THE MARGIN is the `hotel_margin_public` band (LD 8), its declared fallback 0 = sell at SSP; the
 *     price is floored at the SSP (`shared/liteapi-rates.ts`).
 *   · NO GUESSED INPUT (§13): unconfirmed dates ⇒ `dates_needed`; no stated adults ⇒ `party_needed`.
 */
import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "../db";
import { hotelCache, trips } from "@shared/schema";
import { LITEAPI_PROVIDER } from "@shared/liteapi";
import { planDatesAreConfirmed } from "@shared/plan-dates";
import { isUsableTimeZone } from "@shared/plan-timing";
import { parseCheapestOffer, type StayRatesState } from "@shared/liteapi-rates";
import {
  liteapiConfig,
  liteapiCurrency,
  liteapiGuestNationality,
  liteapiRatesTimeoutMs,
  type LiteapiConfig,
} from "../config/liteapi.config";
import { createLiteapiClient, type LiteapiClient } from "./liteapi-client";
import { gatedLiteapiRatesCall, type LiteapiRatesGateDeps } from "./liteapi-rates-gate";
import { planRole } from "./plan-option-sets.service";
import { HOTEL_MARGIN_PUBLIC_BAND, declaredFallbackValue } from "./fee-band-requirements";
import { readBand } from "./fee-resolution.service";

export interface StayRatesDeps {
  config: () => LiteapiConfig | null;
  client: (cfg: LiteapiConfig) => LiteapiClient;
  gate?: LiteapiRatesGateDeps;
  marginFraction: () => Promise<number>;
  timeoutMs: () => number;
}

/** The public margin: the band's rate when it is an active percent row, else its declared fallback (0). */
export async function publicMarginFraction(): Promise<number> {
  try {
    const band = await readBand(HOTEL_MARGIN_PUBLIC_BAND);
    if (band && band.rateType === "percent" && band.rate >= 0) return band.rate;
  } catch {
    /* unreadable ⇒ the declared fallback, below */
  }
  return declaredFallbackValue(HOTEL_MARGIN_PUBLIC_BAND);
}

export const defaultStayRatesDeps: StayRatesDeps = {
  config: () => liteapiConfig(),
  client: (cfg) => createLiteapiClient(cfg),
  marginFraction: publicMarginFraction,
  timeoutMs: () => liteapiRatesTimeoutMs(),
};

export type StayRatesResult = StayRatesState | { state: "not_found" };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms).unref?.())]);
}

export async function stayRates(
  input: { tripId: string; userId: string | null | undefined; stayId: string },
  deps: StayRatesDeps = defaultStayRatesDeps,
): Promise<StayRatesResult> {
  if (!(await planRole(input.tripId, input.userId, "read"))) return { state: "not_found" };
  const [trip] = await db
    .select({ destination: trips.destination, startDate: trips.startDate, endDate: trips.endDate, datesConfirmedAt: trips.datesConfirmedAt, adults: trips.adults, kids: trips.kids, timezone: trips.timezone })
    .from(trips)
    .where(eq(trips.id, input.tripId))
    .limit(1);
  if (!trip) return { state: "not_found" };
  const city = (trip.destination ?? "").split(",")[0].trim();
  // Only a LiteAPI stay in THIS plan's city (the panel's own inventory rule, as the bind applies it).
  const [hotel] = city
    ? await db
        .select({ providerHotelId: hotelCache.providerHotelId })
        .from(hotelCache)
        .where(and(eq(hotelCache.id, input.stayId), eq(hotelCache.provider, LITEAPI_PROVIDER), or(ilike(hotelCache.city, city), ilike(hotelCache.cityCode, city))))
        .limit(1)
    : [];
  if (!hotel?.providerHotelId) return { state: "not_found" };
  if (!planDatesAreConfirmed(trip.datesConfirmedAt as any)) return { state: "dates_needed" };
  const adults = Number(trip.adults);
  if (!Number.isInteger(adults) || adults < 1) return { state: "party_needed" };
  const kids = Number.isInteger(Number(trip.kids)) ? Number(trip.kids) : 0;
  const cfg = deps.config();
  if (!cfg) return { state: "unavailable" };
  const checkin = String(trip.startDate).slice(0, 10);
  const checkout = String(trip.endDate).slice(0, 10);
  if (!(checkout > checkin)) return { state: "dates_needed" };
  const marginPercent = Math.round((await deps.marginFraction()) * 10_000) / 100;
  const timeoutMs = deps.timeoutMs();
  try {
    const out = await gatedLiteapiRatesCall(
      async () => {
        const body = await withTimeout(
          deps.client(cfg).hotelRates({
            hotelId: hotel.providerHotelId!,
            checkin,
            checkout,
            adults,
            currency: liteapiCurrency(),
            guestNationality: liteapiGuestNationality(),
            marginPercent,
            timeoutSeconds: Math.max(1, Math.floor(timeoutMs / 1000)),
          }),
          timeoutMs,
        );
        if (body === "timeout") throw new Error("timeout");
        return body;
      },
      { userId: input.userId ?? null, env: cfg.env, deps: deps.gate },
    );
    if ("refused" in out) return { state: "unavailable" };
    const offer = parseCheapestOffer(out.value, { adults, kids });
    if (!offer) return { state: "unavailable" };
    const tz = typeof trip.timezone === "string" && isUsableTimeZone(trip.timezone) ? trip.timezone : null;
    return { state: "ok", offer, checkin, timezone: tz };
  } catch (err: any) {
    console.warn(`[liteapi-rates] ${input.stayId}: ${err?.message ?? err}`);
    return { state: "unavailable" };
  }
}
