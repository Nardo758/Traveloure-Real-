/**
 * AP-1 — the words the save-then-warn confirmation draws (ledger `2026-10-13-ap1-save-then-warn`). Pure.
 *
 * Every sentence that already has a home is read from it (§18 rule 1): the hours lines are the findings' own
 * (`findingStopLines`, built server-side), the gap line is Getting around's (`gettingAroundUnlocatedLine`), the
 * leg line is the slip's (`routedLegLine` server-side), and the two engine headers are Getting around's.
 *
 * Audit B8: minutes print only from a checked (routed) leg. A straight-line or estimated reach prints no
 * line and no footer — the hours line still shows.
 */
import {
  ADD_CHECKS_POLL_MAX,
  HOURS_NOT_CHECKED_LINE,
  type StopChecks,
} from "@shared/add-checks";
import { GETTING_AROUND_DATES_HEADER, GETTING_AROUND_ENGINE_OFF_HEADER, GETTING_AROUND_PENDING, gettingAroundUnlocatedLine } from "./getting-around";

export const HOURS_CHECKED_CLEAR_LINE = "Hours checked — open at your time";
export const HOURS_NEED_A_TIME_LINE = "Add a time to check hours";
export const HOURS_CHECKING_LINE = "Checking hours…";

/** Pure. The confirmation's lines, in order. The footer is always null since audit B8 (no straight-line minutes). */
export function addChecksLines(c: StopChecks): { lines: string[]; footer: string | null } {
  const lines: string[] = [];
  const h = c.hours;
  if (h.status === "checked") {
    lines.push(...(h.lines.length ? h.lines : [HOURS_CHECKED_CLEAR_LINE]));
    if (h.caveat) lines.push(h.caveat);
  } else if (h.status === "not_checked") lines.push(HOURS_NOT_CHECKED_LINE);
  else if (h.status === "no_time") lines.push(HOURS_NEED_A_TIME_LINE);
  else lines.push(HOURS_CHECKING_LINE);

  const footer: string | null = null;
  const r = c.reach;
  if (r) {
    switch (r.kind) {
      case "routed":
        lines.push(`From ${r.from}: ${r.line}`);
        break;
      case "est":
      case "straight":
        // Audit B8: an unchecked travel time is not shown.
        break;
      case "unlocated":
        lines.push(gettingAroundUnlocatedLine(r.stop));
        break;
      case "no_route":
        lines.push(`From ${r.from}: no route found`);
        break;
      case "engine_off":
        lines.push(GETTING_AROUND_ENGINE_OFF_HEADER);
        break;
      case "dates_not_confirmed":
        lines.push(GETTING_AROUND_DATES_HEADER);
        break;
      case "pending":
        // Still arriving while polling; once polling has stopped, Getting around's own "not worked out yet".
        lines.push(c.pending ? `From ${r.from}: working out travel time…` : `From ${r.from}: ${GETTING_AROUND_PENDING}`);
        break;
    }
  }
  return { lines, footer };
}

/** Pure. Ask again? Only while something is still arriving, and at most `ADD_CHECKS_POLL_MAX` times. */
export function shouldPollAddChecks(c: StopChecks | null | undefined, polls: number): boolean {
  return !!c?.pending && polls < ADD_CHECKS_POLL_MAX;
}

/**
 * Pure. What to show once polling has stopped with something still pending (§13): an hours check that never
 * reported is "not checked"; a leg that never arrived reads Getting around's "not worked out yet" — never a
 * guessed time, and never "no route found", which is said only when the engine answered.
 */
export function settleAddChecks(c: StopChecks): StopChecks {
  if (!c.pending) return c;
  const hours = c.hours.status === "pending" ? ({ status: "not_checked" } as const) : c.hours;
  return { ...c, hours, pending: false };
}

/**
 * The polling loop the confirmation runs, with its clock injected so it is provable without a DOM. From the
 * POST's first answer: while something is still arriving, ask again every `intervalMs`, at most
 * `ADD_CHECKS_POLL_MAX` times; then settle ONCE (`onSettled`), turning a still-pending check into its honest
 * final form. A failed read keeps the last answer. Returns a cancel function.
 */
export function pollAddChecks(input: {
  initial: StopChecks;
  read: () => Promise<StopChecks | null>;
  onUpdate: (c: StopChecks) => void;
  onSettled: (c: StopChecks) => void;
  intervalMs: number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancelTimer?: (t: unknown) => void;
}): () => void {
  const schedule = input.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancelTimer = input.cancelTimer ?? ((t) => clearTimeout(t as any));
  let current = input.initial;
  let polls = 0;
  let cancelled = false;
  let settled = false;
  let timer: unknown = null;
  const settle = () => {
    if (settled || cancelled) return;
    settled = true;
    const final = settleAddChecks(current);
    input.onUpdate(final);
    input.onSettled(final);
  };
  const tick = async () => {
    if (cancelled) return;
    if (!shouldPollAddChecks(current, polls)) return settle();
    polls += 1;
    try {
      const next = await input.read();
      if (cancelled) return;
      if (next) {
        current = next;
        input.onUpdate(next);
      }
    } catch {
      // keep the last answer
    }
    if (cancelled) return;
    if (shouldPollAddChecks(current, polls)) timer = schedule(tick, input.intervalMs);
    else settle();
  };
  timer = schedule(tick, current.pending ? input.intervalMs : 0);
  return () => {
    cancelled = true;
    if (timer != null) cancelTimer(timer);
  };
}
