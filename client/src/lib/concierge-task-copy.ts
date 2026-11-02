/**
 * CN-1e-UI (ledger `2026-11-02-cn1e-ui-task-log`): the concierge task log — every string the traveler and the expert
 * read, in ONE object, and the pure rules the screens follow.
 *
 * The server (CN-1e, `server/routes/concierge-task-log.routes.ts`) decides every move; these helpers only choose
 * which controls to SHOW (CONCIERGE_TASK_TRANSITIONS / CONCIERGE_TASK_ACTOR_FOR are read, never restated).
 * No amount, price or payment field exists in the task log: venue costs are paid by the traveler, off-platform.
 * Stays and transport are links only — a link-only task never says "Booked".
 *
 * Approved strings are CN1_COPY keys, read verbatim. Everything marked HELD is pending Leon and listed in the PR
 * body under NEEDS LEON APPROVAL.
 */
import { CN1_COPY } from "@shared/cn1-copy";
import {
  CONCIERGE_TASK_ACTOR_FOR,
  CONCIERGE_TASK_ERRORS,
  CONCIERGE_TASK_FREED_STATES,
  CONCIERGE_TASK_TRANSITIONS,
  isHttpsLink,
  type ConciergeTaskState,
} from "@shared/concierge-task-log";
import { parseApiRefusal } from "@/lib/api-refusal";
import { formatTripDates } from "@/lib/trip-dates";

export const CONCIERGE_TASK_COPY = {
  // ── Approved (CN-1 table; render verbatim) ──
  stateRequested: CN1_COPY.taskRequested,
  stateTravelerOk: CN1_COPY.taskTravelerOk,
  stateDone: CN1_COPY.taskDone,
  stateCouldNotGet: CN1_COPY.taskCouldNotGet,
  linkOnly: CN1_COPY.taskLinkOnly,
  // ── HELD (pending Leon) ──
  /** W1 — the state chip for a withdrawn task. */
  stateWithdrawn: "Withdrawn",
  /** L1 — the expert's https link on a done link-only task. */
  openLink: "Open link",
  /** T1 — the traveler OKs a requested task. */
  ok: "OK",
  /** T2 — the traveler withdraws a task. */
  withdraw: "Withdraw",
  /** T3 — the traveler's request button and form title. */
  request: "Request a task",
  /** C1 — a capped kind's use in the request form. */
  capUsed: "{used} of {cap}",
  /** E1 — the expert resolves a task as done. */
  markDone: "Mark done",
  /** E2 — the expert could not get it. */
  couldNotGet: "Couldn't get it",
  /** E3 — the https link field when marking a link-only task done. */
  linkField: "Link (https)",
  /** E4 — the expert's propose button and form title. */
  propose: "Propose a task",
  /** B1 — the button that opens the task log. */
  tasks: "Tasks",
  /** N1 — no tasks yet. */
  empty: "No tasks yet.",
  /** F1 — the kind picker's label. */
  kindField: "Task",
  /** F2 — the title field's label. */
  titleField: "What you need",
  /** F3 — the note field's label. */
  noteField: "Note (optional)",
  /** F4 — the form's submit button. */
  submit: "Send",
  /** F5 — the form's cancel button. */
  cancel: "Cancel",
  /** M1 — "requested by" marker for the viewer's own request. */
  byYou: "you",
  /** M2 — the actor name for the traveler, as the expert reads it. */
  traveler: "Traveler",
  /** V1 — the collapsed event list's toggle. */
  history: "History",
  /** X1–X8 — refusals, keyed by server code. */
  errors: {
    [CONCIERGE_TASK_ERRORS.capReached]: "This listing allows {cap} of these.",
    [CONCIERGE_TASK_ERRORS.accessEnded]: "Your access to this trip has ended.",
    [CONCIERGE_TASK_ERRORS.engagementNotActive]: "This hire isn't active.",
    [CONCIERGE_TASK_ERRORS.ownerOnly]: "Only the traveler can do that.",
    [CONCIERGE_TASK_ERRORS.expertOnly]: "Only your expert can do that.",
    [CONCIERGE_TASK_ERRORS.linkRequired]: "Add the https link first.",
    [CONCIERGE_TASK_ERRORS.linkInvalid]: "That link must start with https://",
    [CONCIERGE_TASK_ERRORS.linkNotAllowed]: "That link must start with https://",
  } as Readonly<Record<string, string>>,
} as const;

export type TaskViewer = "traveler" | "expert";

export interface TaskKindView {
  taskKindKey: string;
  label: string;
  domain?: string | null;
  linkOnly: boolean;
}

export interface TaskEventView {
  fromState: ConciergeTaskState | null;
  toState: ConciergeTaskState;
  actorType: "traveler" | "expert" | "system";
  createdAt: string;
  note?: string | null;
}

export interface TaskView {
  id: string;
  bookingId: string;
  kind: TaskKindView;
  title: string;
  note: string | null;
  linkUrl: string | null;
  state: ConciergeTaskState;
  requestedBy: "traveler" | "expert";
  requestedAt: string;
  travelerOkAt: string | null;
  resolvedAt: string | null;
  events: TaskEventView[];
}

export interface ListingTaskOption {
  taskKindKey: string;
  label: string;
  domain?: string | null;
  linkOnly: boolean;
  cap: number | null;
}

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v)), template);

/** An instant read as the viewer's calendar day ("Nov 3"), never an ISO string. Null when unreadable. */
export function calendarDateOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return formatTripDates(day);
}

/** The chip a state renders. `traveler_ok` carries the day the traveler said OK. */
export function stateLabel(state: ConciergeTaskState, travelerOkAt: string | null | undefined): string {
  switch (state) {
    case "requested":
      return CONCIERGE_TASK_COPY.stateRequested;
    case "traveler_ok": {
      const date = calendarDateOf(travelerOkAt);
      return date ? fill(CONCIERGE_TASK_COPY.stateTravelerOk, { date }) : CONCIERGE_TASK_COPY.stateTravelerOk.replace(" · {date}", "");
    }
    case "done":
      return CONCIERGE_TASK_COPY.stateDone;
    case "could_not_get":
      return CONCIERGE_TASK_COPY.stateCouldNotGet;
    case "withdrawn":
      return CONCIERGE_TASK_COPY.stateWithdrawn;
  }
}

export type TaskAction = "traveler_ok" | "withdrawn" | "done" | "could_not_get";

/** The moves this viewer may make from this state — the shared transition table filtered by the shared actor table. */
export function actionsFor(viewer: TaskViewer, state: ConciergeTaskState): TaskAction[] {
  return (CONCIERGE_TASK_TRANSITIONS[state] ?? []).filter(
    (to): to is TaskAction => to !== "requested" && CONCIERGE_TASK_ACTOR_FOR[to as TaskAction] === viewer,
  );
}

export const ACTION_PATH: Readonly<Record<TaskAction, string>> = {
  traveler_ok: "traveler-ok",
  withdrawn: "withdraw",
  done: "done",
  could_not_get: "could-not-get",
};

export function actionLabel(action: TaskAction): string {
  switch (action) {
    case "traveler_ok":
      return CONCIERGE_TASK_COPY.ok;
    case "withdrawn":
      return CONCIERGE_TASK_COPY.withdraw;
    case "done":
      return CONCIERGE_TASK_COPY.markDone;
    case "could_not_get":
      return CONCIERGE_TASK_COPY.couldNotGet;
  }
}

/** Tasks of a kind that still hold a cap slot (every state but could_not_get / withdrawn — the server's count). */
export function usedCount(tasks: readonly Pick<TaskView, "kind" | "state">[], taskKindKey: string): number {
  const freed = CONCIERGE_TASK_FREED_STATES as readonly string[];
  return tasks.filter((t) => t.kind.taskKindKey === taskKindKey && !freed.includes(t.state)).length;
}

export interface KindOption extends ListingTaskOption {
  used: number;
  atCap: boolean;
  capText: string | null;
}

/** The request form's kinds, from the listing's own conciergeTasks, with the cap shown and enforced. */
export function kindOptions(listing: readonly ListingTaskOption[] | null | undefined, tasks: readonly TaskView[]): KindOption[] {
  return (listing ?? []).map((k) => {
    const used = usedCount(tasks, k.taskKindKey);
    const capped = typeof k.cap === "number" && k.cap > 0;
    return {
      ...k,
      used,
      atCap: capped && used >= (k.cap as number),
      capText: capped ? fill(CONCIERGE_TASK_COPY.capUsed, { used, cap: k.cap as number }) : null,
    };
  });
}

/** The create body, exactly: { taskKindId, title, note? }. Null when the title is empty or too long. */
export function createBody(taskKindId: string, title: string, note: string): { taskKindId: string; title: string; note?: string } | null {
  const t = title.trim();
  if (!taskKindId || t.length < 1 || t.length > 200) return null;
  const n = note.trim();
  if (n.length > 2000) return null;
  return n ? { taskKindId, title: t, note: n } : { taskKindId, title: t };
}

/**
 * The done body. A link-only kind needs an https link (the server's rule, mirrored so http:// is refused before
 * posting); any other kind sends a note only.
 */
export function doneBody(
  linkOnly: boolean,
  linkUrl: string,
  note: string,
): { ok: true; body: { linkUrl?: string; note?: string } } | { ok: false; error: string } {
  const link = linkUrl.trim();
  const n = note.trim();
  const body: { linkUrl?: string; note?: string } = {};
  if (linkOnly) {
    if (!link) return { ok: false, error: CONCIERGE_TASK_COPY.errors[CONCIERGE_TASK_ERRORS.linkRequired] };
    if (!isHttpsLink(link)) return { ok: false, error: CONCIERGE_TASK_COPY.errors[CONCIERGE_TASK_ERRORS.linkInvalid] };
    body.linkUrl = link;
  }
  if (n) body.note = n;
  return { ok: true, body };
}

/** The held sentence for a server refusal, or null (the caller then shows the generic toast). */
export function taskErrorCopy(err: unknown, capForKind?: number | null): string | null {
  const code = parseApiRefusal(err).code;
  if (typeof code !== "string") return null;
  const text = CONCIERGE_TASK_COPY.errors[code];
  if (!text) return null;
  if (code === CONCIERGE_TASK_ERRORS.capReached) {
    return typeof capForKind === "number" && capForKind > 0 ? fill(text, { cap: capForKind }) : null;
  }
  return text;
}

/** Props for an external link, or null when the URL is not https (then the text is shown, not a link). */
export function safeLinkProps(url: string | null | undefined): { href: string; target: "_blank"; rel: "noopener noreferrer" } | null {
  if (!url || !isHttpsLink(url)) return null;
  return { href: url, target: "_blank", rel: "noopener noreferrer" };
}

export const linkOnlyLine = (name: string) => fill(CONCIERGE_TASK_COPY.linkOnly, { name });

/** Who made a move, as this viewer reads it. */
export function actorName(actorType: TaskEventView["actorType"], viewer: TaskViewer, expertFirstName: string): string | null {
  if (actorType === viewer) return CONCIERGE_TASK_COPY.byYou;
  if (actorType === "expert") return expertFirstName;
  if (actorType === "traveler") return CONCIERGE_TASK_COPY.traveler;
  return null;
}

/** The task log's query key — one cache entry per hire. */
export const taskLogQueryKey = (bookingId: string) => ["/api/concierge/bookings", bookingId, "tasks"] as const;

// ── Mount gates ────────────────────────────────────────────────────────────────────────────────

/** A booking row opens the task log only when it is a confirmed concierge hire. */
export function isConfirmedConciergeBooking(
  booking: { status?: string | null; service?: { serviceType?: string | null } | null } | null | undefined,
): boolean {
  return !!booking && booking.status === "confirmed" && booking.service?.serviceType === "concierge";
}

/** The Trip Card's Tasks button: a concierge advisor whose access has not ended. */
export function conciergeAccessOpen(
  advisor: { source?: string | null; accessUntil?: string | null } | null | undefined,
  now: Date,
): boolean {
  if (!advisor || advisor.source !== "concierge") return false;
  if (!advisor.accessUntil) return true;
  const until = new Date(advisor.accessUntil);
  return Number.isNaN(until.getTime()) || now.getTime() <= until.getTime();
}

/** The confirmed concierge booking for a trip, out of a booking list. */
export function conciergeBookingForTrip<T extends { tripId?: string | null; status?: string | null; service?: { serviceType?: string | null } | null }>(
  bookings: readonly T[] | null | undefined,
  tripId: string,
): T | null {
  return (bookings ?? []).find((b) => b.tripId === tripId && isConfirmedConciergeBooking(b)) ?? null;
}
