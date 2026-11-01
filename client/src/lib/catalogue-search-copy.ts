/**
 * Row 305 (CS-3 brief 8, D), client: the words on a catalogue search result, and the pure rules that choose them.
 *
 * Sources of every string:
 *   · placeholder, empty state — `CATALOGUE_SEARCH_COPY` (shared), approved by Leon, Oct 31, 2026, 8:51 PM ET.
 *   · "Book", "Book on Viator", "Book on the official site", "From [price] on Viator, as of [time]",
 *     "Not checked yet" — quoted in the row 305 brief (Claude session 2 doc / CS-3 brief 8).
 *   · "Add to plan" — `ADD_TO_PLAN_LABEL`; the commission line — `PARTNER_COMMISSION_NOTE` (both on main).
 *   · "from <source> · <checked date>" — the public attribution the server already formats
 *     (`publicFactAttribution`, ruling R-p).
 * Anything else is HELD for Leon and is a placeholder.
 */
import type { CatalogueResult } from "@shared/catalogue-search";
import { MARKET_TIMEZONES } from "@shared/market-today";
import { ADD_TO_PLAN_LABEL } from "./plan-vocabulary";
import { PARTNER_COMMISSION_NOTE } from "./browse-supply";
import { exactOperatingMarket } from "./experiences-entry";

export const CATALOGUE_RESULT_COPY = {
  book: "Book",
  bookOnViator: "Book on Viator",
  bookOnOfficialSite: "Book on the official site",
  addToPlan: ADD_TO_PLAN_LABEL,
  viatorPrice: (price: string, time: string) => `From ${price} on Viator, as of ${time}`,
  commission: PARTNER_COMMISSION_NOTE,
  notCheckedYet: "Not checked yet",
  /** The link to the official site beside "Not checked yet". HELD for Leon. */
  officialSiteLink: "[HELD for Leon]",
  /** Shown while the search is in flight. HELD for Leon. */
  searching: "[HELD for Leon]",
  /** Shown when the search fails. HELD for Leon. */
  searchFailed: "[HELD for Leon]",
} as const;

/** The one action label for a result. Never a request, never a fee. */
export function catalogueActionLabel(result: Pick<CatalogueResult, "kind" | "action">): string {
  switch (result.action.type) {
    case "book":
      return CATALOGUE_RESULT_COPY.book;
    case "book_on_site":
      return result.kind === "partner_viator" ? CATALOGUE_RESULT_COPY.bookOnViator : CATALOGUE_RESULT_COPY.bookOnOfficialSite;
    case "add_to_plan":
      return CATALOGUE_RESULT_COPY.addToPlan;
  }
}

/** The city's time zone, for "as of [time]"; null for a city that is not an operating market. */
export function catalogueTimeZone(city: string | null | undefined): string | null {
  const market = exactOperatingMarket(city);
  return market ? MARKET_TIMEZONES[market.marketKey] ?? null : null;
}

/** "From ¥5,000 on Viator, as of 14:05", in the city's time; null when the live price is missing or unreadable. */
export function viatorPriceLine(livePrice: CatalogueResult["livePrice"], timeZone: string | null): string | null {
  if (!livePrice || !Number.isFinite(livePrice.amount) || !livePrice.currency) return null;
  const at = new Date(livePrice.asOf);
  if (Number.isNaN(at.getTime())) return null;
  let price: string;
  try {
    price = new Intl.NumberFormat("en-US", { style: "currency", currency: livePrice.currency, maximumFractionDigits: 0 }).format(livePrice.amount);
  } catch {
    return null;
  }
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, ...(timeZone ? { timeZone } : {}) });
  return CATALOGUE_RESULT_COPY.viatorPrice(price, time);
}

/** The body the existing add dialog takes; a listing or Viator result keeps its link id. */
export function catalogueAddItem(result: CatalogueResult): Record<string, unknown> {
  return {
    title: result.addToPlan.title,
    type: result.kind === "hotel" ? "hotel" : "activity",
    ...(result.addToPlan.providerServiceId ? { providerServiceId: result.addToPlan.providerServiceId } : {}),
    ...(result.addToPlan.viatorProductCode ? { viatorProductCode: result.addToPlan.viatorProductCode } : {}),
  };
}
