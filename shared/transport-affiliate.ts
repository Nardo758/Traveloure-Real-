/**
 * TC-2 Phase 1 (decision-maker, Oct 12, 2026 — ledger `2026-10-12-tc2-affiliate-legs`): which partner links a
 * plan leg offers, from where its two ends are. PURE — the config arrives as an argument, nothing here reads a
 * database, an environment variable or a fee.
 *
 *   · An end is an AIRPORT when it sits within the airport anchor's radius (KIX, ITM — points from the IATA
 *     anchors), else a CITY when it sits within one of the configured 12Go cities (a named OpenStreetMap node
 *     and a radius), else nowhere.
 *   · 12Go shows only on a leg whose ends are in DIFFERENT cities, or where one end is an airport — never inside
 *     one city, even where 12Go serves the pair (Kyoto → Arashiyama is served and must not show) — and only for a
 *     served pair listed in the config. A city or airport with no 12Go slug is never offered.
 *   · Kiwitaxi leads on an airport → city leg it serves (KIX or ITM → Kyoto Station). The vehicle class is
 *     suggested from the party size: the smallest configured class that seats the party; an unknown party
 *     suggests none and says "set your party size"; a party over the largest class gets the link and no class.
 *   · Every link is the partner's Travelpayouts redirect template with our marker wrapping the clean target path
 *     (`{marker}`, `{url}`); a partner with no template offers nothing.
 *   · The ORDER of the options reads fit only (`orderAffiliateLegOptions`) — never a fee, a margin or a
 *     commission.
 */

export type AffiliatePartnerKey = "12go" | "kiwitaxi";

export interface LatLng {
  lat: number;
  lng: number;
}

/** A 12Go city: a named OSM node (attributed wherever its point renders) and the radius that counts as "in it". */
export interface AffiliateCity {
  key: string;
  name: string;
  /** 12Go's own slug for the city in `12go.asia/en/travel/<from>/<to>`; null ⇒ never offered on 12Go. */
  twelveGoSlug: string | null;
  /** The OpenStreetMap node the point comes from; null ⇒ not yet read, and the city is left out. */
  osmNodeId: number | null;
  point: LatLng | null;
  radiusKm: number;
}

/** An airport anchor: its point is the IATA anchor's (`server/data/iata-airports.json`). */
export interface AffiliateAirport {
  iata: string;
  point: LatLng;
  radiusKm: number;
  /** 12Go's slug for the airport; null ⇒ 12Go is not offered from it. */
  twelveGoSlug: string | null;
}

/** A served route a partner page exists for, as read (direction as listed). */
export interface TwelveGoPair {
  from: string;
  to: string;
}
export interface KiwitaxiRoute {
  fromAirport: string;
  toCity: string;
  /** The clean path on kiwitaxi.com, never a query string. */
  path: string;
}

export interface KiwitaxiClass {
  name: string;
  passengers: number;
  bags: number;
}

export interface TransportAffiliateConfig {
  cities: readonly AffiliateCity[];
  airports: readonly AffiliateAirport[];
  twelveGoPairs: readonly TwelveGoPair[];
  kiwitaxiRoutes: readonly KiwitaxiRoute[];
  kiwitaxiClasses: readonly KiwitaxiClass[];
  /** What a bag is, said beside a suggested class. */
  kiwitaxiBagNote: string;
}

export type LegEnd = { kind: "airport"; key: string } | { kind: "city"; key: string } | null;

const EARTH_KM = 6371;
export function distanceKm(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** A city counts only once its OSM node and point are read. */
export function usableCity(c: AffiliateCity): c is AffiliateCity & { osmNodeId: number; point: LatLng } {
  return Number.isSafeInteger(c.osmNodeId) && (c.osmNodeId as number) > 0 && !!c.point && Number.isFinite(c.point.lat) && Number.isFinite(c.point.lng) && c.radiusKm > 0;
}

/** Pure. Where a leg end is: an airport first (an airport inside a city's radius is still the airport), then the nearest city containing it. */
export function legEndOf(point: LatLng | null, cfg: TransportAffiliateConfig): LegEnd {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  for (const a of cfg.airports) if (distanceKm(point, a.point) <= a.radiusKm) return { kind: "airport", key: a.iata };
  let best: { key: string; d: number } | null = null;
  for (const c of cfg.cities) {
    if (!usableCity(c)) continue;
    const d = distanceKm(point, c.point);
    if (d <= c.radiusKm && (!best || d < best.d)) best = { key: c.key, d };
  }
  return best ? { kind: "city", key: best.key } : null;
}

export type KiwitaxiClassPick =
  | { kind: "class"; cls: KiwitaxiClass }
  | { kind: "party_unknown" }
  | { kind: "over_largest" };

/** Pure. The smallest class that seats the party; unknown ⇒ ask; over the largest ⇒ the link with no class. */
export function kiwitaxiClassFor(party: number | undefined, classes: readonly KiwitaxiClass[]): KiwitaxiClassPick {
  if (party === undefined || !Number.isInteger(party) || party <= 0) return { kind: "party_unknown" };
  const fit = [...classes].sort((a, b) => a.passengers - b.passengers || a.bags - b.bags).find((c) => c.passengers >= party);
  return fit ? { kind: "class", cls: fit } : { kind: "over_largest" };
}

/**
 * Pure. The partner's Travelpayouts redirect with our marker wrapping the clean target. The template must be an
 * https URL carrying `{url}` (and may carry `{marker}`); anything else ⇒ null, and the partner offers nothing.
 */
export function wrapAffiliateRedirect(template: string | null | undefined, marker: string, targetUrl: string): string | null {
  const t = (template ?? "").trim();
  if (!t.startsWith("https://") || !t.includes("{url}")) return null;
  const out = t.split("{marker}").join(encodeURIComponent(marker)).split("{url}").join(encodeURIComponent(targetUrl));
  try {
    new URL(out);
  } catch {
    return null;
  }
  return out;
}

/** One partner option a leg qualifies for, before the registry and template gate. */
export interface PlannedAffiliateOption {
  partnerKey: AffiliatePartnerKey;
  /** The clean target URL — no marker, no `?ref=` — that the redirect wraps. */
  targetUrl: string;
  title: string;
  /** Kiwitaxi only. */
  vehicleClass?: KiwitaxiClassPick;
  /** Why it qualifies, for the order: Kiwitaxi leads on an airport leg. */
  airportLeg: boolean;
}

function slugOf(end: NonNullable<LegEnd>, cfg: TransportAffiliateConfig): string | null {
  if (end.kind === "airport") return cfg.airports.find((a) => a.iata === end.key)?.twelveGoSlug ?? null;
  return cfg.cities.find((c) => c.key === end.key)?.twelveGoSlug ?? null;
}
function nameOf(end: NonNullable<LegEnd>, cfg: TransportAffiliateConfig): string {
  if (end.kind === "airport") return end.key;
  return cfg.cities.find((c) => c.key === end.key)?.name ?? end.key;
}

/**
 * Pure. The partner options a leg qualifies for under the route map. `dateIso` is the leg's day when the plan's
 * dates are chosen (12Go's `?date=`), else null and no date is sent.
 */
export function plannedAffiliateOptions(
  input: { from: LatLng | null; to: LatLng | null; party: number | undefined; dateIso: string | null },
  cfg: TransportAffiliateConfig,
): PlannedAffiliateOption[] {
  const from = legEndOf(input.from, cfg);
  const to = legEndOf(input.to, cfg);
  if (!from || !to) return [];
  const airportLeg = from.kind === "airport" || to.kind === "airport";
  const crossMarket = from.key !== to.key;
  const out: PlannedAffiliateOption[] = [];

  // Kiwitaxi: airport → city, a route the config lists.
  if (from.kind === "airport" && to.kind === "city") {
    const route = cfg.kiwitaxiRoutes.find((r) => r.fromAirport === from.key && r.toCity === to.key);
    if (route) {
      out.push({
        partnerKey: "kiwitaxi",
        targetUrl: `https://kiwitaxi.com${route.path}`,
        title: `${nameOf(from, cfg)} → ${nameOf(to, cfg)} transfer`,
        vehicleClass: kiwitaxiClassFor(input.party, cfg.kiwitaxiClasses),
        airportLeg: true,
      });
    }
  }

  // 12Go: different cities or an airport end, never inside one city; a served pair, both slugs known.
  if (crossMarket && (airportLeg || (from.kind === "city" && to.kind === "city"))) {
    const served = cfg.twelveGoPairs.some((p) => p.from === from.key && p.to === to.key);
    const f = slugOf(from, cfg);
    const t = slugOf(to, cfg);
    if (served && f && t) {
      const date = input.dateIso && /^\d{4}-\d{2}-\d{2}$/.test(input.dateIso) ? `?date=${input.dateIso}` : "";
      out.push({
        partnerKey: "12go",
        targetUrl: `https://12go.asia/en/travel/${f}/${t}${date}`,
        title: `${nameOf(from, cfg)} → ${nameOf(to, cfg)}`,
        airportLeg,
      });
    }
  }
  return out;
}

/** The fit facts the order reads — and nothing else. No fee, margin, commission or rate is an input. */
export interface AffiliateOrderInput {
  partnerKey: AffiliatePartnerKey;
  airportLeg: boolean;
}

/** Pure. Kiwitaxi leads on an airport leg; otherwise the route search; ties keep their order. */
export function orderAffiliateLegOptions<T extends AffiliateOrderInput>(options: readonly T[]): T[] {
  const rank = (o: AffiliateOrderInput) => (o.airportLeg && o.partnerKey === "kiwitaxi" ? 0 : 1);
  return options.map((o, i) => ({ o, i })).sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i).map(({ o }) => o);
}

/** The words beside a Kiwitaxi option for its class pick. */
export function kiwitaxiClassLine(pick: KiwitaxiClassPick | undefined, bagNote: string): string | null {
  if (!pick) return null;
  if (pick.kind === "party_unknown") return "Set your party size to see which car fits";
  if (pick.kind === "over_largest") return null;
  return `${pick.cls.name} fits your party · up to ${pick.cls.passengers} passengers, ${pick.cls.bags} bags (${bagNote})`;
}
