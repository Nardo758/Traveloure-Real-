/**
 * THE EXPERT DOOR — the slip's words and the card's per-viewer state (ledger `2026-09-29-expert-door`).
 *
 * Every NUMBER (band, count, price, reply time) is the server's; this module only chooses the words
 * around it (§18 rule 1 — the component and its tests read one home). The card's open/dismissed
 * state is a per-viewer convenience (localStorage, every access wrapped): an unreadable store reads
 * as "not dismissed", because showing a card once more is the harmless failure.
 */
import type { HelpLevel } from "@shared/expert-door";

export const EXPERT_DOOR_QUERY = "help";
export const EXPERT_DOOR_VALUE = "expert";

/** Where "Get a local expert" lands: the plan's slip, asking how much help. */
export function expertDoorHref(tripId: string): string {
  return `/plans/${tripId}?${EXPERT_DOOR_QUERY}=${EXPERT_DOOR_VALUE}`;
}

export interface LevelCopy {
  level: HelpLevel;
  title: string;
  line: string;
}

/** The three choices, in the dispatch's order; the fourth ("I just have a question") is a text link. */
export const HELP_LEVEL_CHOICES: readonly LevelCopy[] = [
  { level: "check", title: "Check my plan", line: "A local reads your plan and tells you what to change." },
  { level: "plan", title: "Plan it with me", line: "A local builds the days with you." },
  { level: "handle", title: "Handle it for me", line: "A local arranges it; you approve and pay for each booking." },
];

export const QUESTION_LINK = "I just have a question";
export const HELP_CARD_TITLE = "How much help do you want?";
export const ADD_EXPERT_LABEL = "Add a local expert";
export const EMPTY_ACTION = "Start with the free AI draft; we'll tell you when one does";

/** The line under a choice's title: its band, or — with nobody offering it — nothing numeric. */
export function levelBandLine(bandLabel: string | null, expertCount: number): string | null {
  if (expertCount === 0) return null;
  const who = expertCount === 1 ? "1 local expert" : `${expertCount} local experts`;
  return bandLabel ? `${bandLabel} · ${who}` : who;
}

/** A listing's own price as the picker shows it; no published price reads "By quote", never "$0". */
export function offeringPriceLabel(price: string | null, showPrice: boolean | null): string {
  const n = Number(price);
  if (showPrice === false || !Number.isFinite(n) || n <= 0) return "By quote";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Whether a listing can be requested on the storefront rail, which refuses a priceless listing. */
export function offeringRequestable(price: string | null, showPrice: boolean | null): boolean {
  const n = Number(price);
  return showPrice !== false && Number.isFinite(n) && n > 0;
}

export type DoorCardState = "open" | "dismissed";
const key = (tripId: string) => `expert-door:${tripId}`;

export function readDoorCardState(tripId: string): DoorCardState | null {
  try {
    const v = window.localStorage.getItem(key(tripId));
    return v === "open" || v === "dismissed" ? v : null;
  } catch {
    return null;
  }
}

export function writeDoorCardState(tripId: string, state: DoorCardState): void {
  try {
    window.localStorage.setItem(key(tripId), state);
  } catch {
    /* a blocked store only costs the card's memory */
  }
}
