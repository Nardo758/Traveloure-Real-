/**
 * LiteAPI hotel → `hotel_cache` row, PURE (S1-d-1; ledger `2026-10-10-s1-d1-liteapi`). No db import, so the
 * mapping is provable without a database. The sync service is its one caller.
 */
import { LITEAPI_PROVIDER, type LiteapiEnv } from "@shared/liteapi";
import type { LiteapiHotel } from "./liteapi-client";

/** The market city's join key in `hotel_cache.city_code` (the booking_com writer's convention). */
export function liteapiCityCode(cityName: string): string {
  return cityName.slice(0, 10).toUpperCase();
}

export interface LiteapiRowContext {
  cityName: string;
  countryCode: string;
  env: LiteapiEnv;
  runStartedAt: Date;
}

/**
 * Pure: one API hotel → the `hotel_cache` values the sync writes, or null when it cannot be stored
 * honestly (no id, no name, or no finite coordinates — an unlocated stay never enters the pool, §13).
 * A half star is not rounded into a whole one: `star_rating` stays null and the value is kept in raw_data.
 */
export function liteapiHotelRow(h: LiteapiHotel, ctx: LiteapiRowContext) {
  const id = typeof h.id === "string" ? h.id.trim() : "";
  const name = typeof h.name === "string" ? h.name.trim() : "";
  const lat = Number(h.latitude);
  const lng = Number(h.longitude);
  if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  const stars = Number(h.stars);
  const rating = Number(h.rating);
  const type = Number(h.hotelTypeId);
  const image = typeof h.main_photo === "string" && /^https:\/\//i.test(h.main_photo) ? h.main_photo : null;
  return {
    hotelId: `${LITEAPI_PROVIDER}_${id}`.slice(0, 100),
    providerHotelId: id.slice(0, 100),
    provider: LITEAPI_PROVIDER,
    cityCode: liteapiCityCode(ctx.cityName),
    city: ctx.cityName,
    countryCode: ctx.countryCode,
    name: name.slice(0, 255),
    latitude: lat.toFixed(7),
    longitude: lng.toFixed(7),
    address: typeof h.address === "string" && h.address.trim() ? h.address.trim() : null,
    postalCode: typeof h.zip === "string" && h.zip.trim() ? h.zip.trim().slice(0, 20) : null,
    starRating: Number.isInteger(stars) && stars > 0 ? stars : null,
    hotelTypeId: Number.isInteger(type) ? type : null,
    guestRating: Number.isFinite(rating) && rating > 0 ? rating.toFixed(2) : null,
    mainImageUrl: image,
    rawData: {
      provenance: { source: LITEAPI_PROVIDER, env: ctx.env, fetchedAt: ctx.runStartedAt.toISOString() },
      content: {
        description: typeof h.hotelDescription === "string" ? h.hotelDescription : null,
        stars: Number.isFinite(stars) ? stars : null,
        chain: typeof h.chain === "string" ? h.chain : null,
        chainId: Number.isInteger(Number(h.chainId)) ? Number(h.chainId) : null,
        city: typeof h.city === "string" ? h.city : null,
      },
    },
    fetchedAt: ctx.runStartedAt,
    contentUpdatedAt: ctx.runStartedAt,
    // Born lapsed: only a COMPLETED pass confirms a row (and so advances the watermark).
    expiresAt: ctx.runStartedAt,
  };
}
