/**
 * THE GUEST MAP'S WORDS AND ITS CENTRE (step 8d; ledger `2026-10-07-step8d-guest-map`; boards
 * `docs/design/experiences-map-planner/ExperienceMap.dc.html` / `ExperienceMapMobile.dc.html`, the
 * guest states). Pure — the page and the tests read the same functions.
 *
 *   · the centre comes from the eight-market list (`OPERATING_MARKETS`) by an EXACT city match — a
 *     canvas centre, never a pin; a destination outside the eight gets no centre (the list still shows,
 *     §13), and `/api/geocode` stays closed to guests;
 *   · the dialog repeats ONLY what the guest answered: the city, the dates as given, and the party
 *     when one was stated — never "1 traveler" for a party nobody gave (§13);
 *   · the copy is the board's, word for word.
 */
import type { DraftAnswers } from "@/lib/plan-resume";
import { exactOperatingMarket } from "@/lib/experiences-entry";

export const GUEST_MAP_BANNER = "Browse freely. Your plan is created when you sign in, and these answers come with you.";
export const GUEST_MAP_EYEBROW = "NO PLAN YET";
export const GUEST_MAP_TRAY = "Browse freely. Your plan is created when you sign in.";
export const GUEST_MAP_START_LABEL = "Sign in to start";
export const GUEST_GATE_TITLE = "Your plan is created when you sign in";
export const GUEST_GATE_DISMISS = "Keep browsing";

export type GuestGateKind = { kind: "add"; name: string } | { kind: "start" };

/** The board's `gateNext` line. */
export function guestGateNext(gate: GuestGateKind): string {
  return gate.kind === "add" ? `${gate.name} is added as soon as you are in.` : "Your empty plan opens here, on the map.";
}

/** The destination the guest answered: the first stop, else the door's own city / destination. */
export function guestDestination(
  answers: Pick<DraftAnswers, "stops"> | null | undefined,
  source?: { destination?: string | null; city?: string | null } | null,
): string | null {
  const first = (answers?.stops ?? []).map((s) => (s ?? "").trim()).find(Boolean);
  return first || source?.destination?.trim() || source?.city?.trim() || null;
}

/** The canvas centre — one of the eight cities, exactly, or none. A centre, never a pin. */
export function guestMapCenter(destination: string | null | undefined): { lat: number; lng: number } | null {
  const market = exactOperatingMarket(destination ?? null) ?? exactOperatingMarket((destination ?? "").split(",")[0]);
  return market ? { lat: market.lat, lng: market.lng } : null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDay(iso: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Thu 12 – Mon 16 Nov" (one month) or "Thu 30 Oct – Mon 3 Nov"; one day alone if only one was given. */
export function guestDateRange(startDate: string | null | undefined, endDate: string | null | undefined): string | null {
  const s = parseDay(startDate);
  const e = parseDay(endDate);
  const day = (d: Date) => `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
  const mon = (d: Date) => MONTHS[d.getUTCMonth()];
  if (s && e) {
    return s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()
      ? `${day(s)} – ${day(e)} ${mon(e)}`
      : `${day(s)} ${mon(s)} – ${day(e)} ${mon(e)}`;
  }
  const one = s ?? e;
  return one ? `${day(one)} ${mon(one)}` : null;
}

/** The party as stated, or null when the guest gave none (never a default). */
export function guestPartyCount(answers: Pick<DraftAnswers, "adults" | "kids"> | null | undefined): number | null {
  const n = (v: string | undefined) => {
    const t = (v ?? "").trim();
    if (!/^\d+$/.test(t)) return null;
    return Number(t);
  };
  const a = n(answers?.adults);
  const k = n(answers?.kids);
  if (a == null && k == null) return null;
  const total = (a ?? 0) + (k ?? 0);
  return total > 0 ? total : null;
}

/** "Kyoto, Thu 12 – Mon 16 Nov and 2 travelers" — only the parts the guest gave. Null when none. */
export function guestAnswersLine(answers: DraftAnswers | null | undefined, destination: string | null): string | null {
  const city = destination ? destination.split(",")[0].trim() : null;
  const dates = guestDateRange(answers?.startDate, answers?.endDate);
  const party = guestPartyCount(answers);
  const head = [city, dates].filter(Boolean).join(", ");
  const partyText = party != null ? `${party} ${party === 1 ? "traveler" : "travelers"}` : null;
  const line = head && partyText ? `${head} and ${partyText}` : head || partyText;
  return line || null;
}

/** The gate dialog's description: what is kept, then what happens next. */
export function guestGateDescription(answersLine: string | null, gate: GuestGateKind): string {
  const kept = answersLine ? `${answersLine} are kept from your answers.` : null;
  return [kept, guestGateNext(gate)].filter(Boolean).join(" ");
}
