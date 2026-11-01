/**
 * CN-1b-UI (ledger `2026-11-01-cn1b-ui-concierge-fields`): the concierge listing's own fields — the per-trip price
 * unit, the task picker with optional caps, and response hours — and the admin task-kind screen's held words.
 *
 * The server (#1816, `concierge-listing.service.ts`) is the authority: it refuses a task outside the admin list, a cap
 * that is not a positive whole number, a link-only task saved as bookable, and a per-trip unit on a non-concierge
 * listing. This module only shapes what the form sends so the form never asks for any of those.
 *
 * Stays and transport are links only: the picker never offers a link-only kind, and nothing here ever sends
 * `bookable`. No traveler fee is shown anywhere on these fields.
 */
import { PER_TRIP_PRICING_UNIT } from "@shared/concierge-tasks";

/**
 * HELD for Leon — placeholder words for the parts CN-1's strings table does not cover. Not cleared copy.
 * The per-trip price and the response-hours lines come from `CN1_COPY` (pending Leon) and are not restated here.
 */
export const CN1B_HELD_COPY = {
  perTripToggle: "Price per trip",
  tasksHeading: "Tasks",
  capLabel: "Cap",
  capPlaceholder: "No cap",
  capInvalid: "A cap is a positive whole number, or empty.",
  responseHoursLabel: "Response hours",
  adminTitle: "Concierge tasks",
  adminAdd: "Add task",
  adminKey: "Key",
  adminLabel: "Label",
  adminDomain: "Domain",
  adminSortOrder: "Order",
  adminActive: "Listed",
  adminLinkOnly: "Link only",
  adminSave: "Save",
} as const;

export interface ConciergeTaskKindOption {
  id: string;
  label: string;
  domain: string;
  linkOnly: boolean;
}

/** One picked task as the form holds it: the kind and its cap as typed ("" = no cap). */
export interface ConciergeTaskPickForm {
  taskKindKey: string;
  cap: string;
}

/** The kinds a listing may pick: active kinds that are not link-only. */
export function pickableConciergeKinds(kinds: ReadonlyArray<ConciergeTaskKindOption>): ConciergeTaskKindOption[] {
  return kinds.filter((k) => !k.linkOnly);
}

/** A cap as typed: empty = no cap; otherwise a positive whole number, or refused. */
export function admitConciergeCap(raw: string): { ok: true; value: number | null } | { ok: false } {
  const v = raw.trim();
  if (v === "") return { ok: true, value: null };
  if (!/^\d+$/.test(v)) return { ok: false };
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? { ok: true, value: n } : { ok: false };
}

/** The picks a stored listing carries (`GET /api/provider/services/:id` → `conciergeTasks`). */
export function conciergeTasksFromStored(stored: unknown): ConciergeTaskPickForm[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((t: any) => t && typeof t.taskKindKey === "string" && t.linkOnly !== true)
    .map((t: any) => ({ taskKindKey: t.taskKindKey, cap: typeof t.cap === "number" ? String(t.cap) : "" }));
}

export function conciergePerTripFromStored(pricingUnit: string | null | undefined): boolean {
  return pricingUnit === PER_TRIP_PRICING_UNIT;
}

export interface ConciergeFieldsInput {
  serviceType: string;
  perTrip: boolean;
  /** The stored/edited pricing unit the rest of the form holds. */
  pricingUnit: string;
  responseHours: string;
  tasks: ReadonlyArray<ConciergeTaskPickForm>;
  kinds: ReadonlyArray<ConciergeTaskKindOption>;
}

export type ConciergeFieldsPayload =
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; reason: "cap" | "link_only" | "not_on_list" };

/**
 * What a write sends for the concierge fields. A concierge listing sends its unit, its response hours and its task
 * picks. Any other listing sends none of them, except to clear a stored per-trip unit the server would refuse.
 */
export function conciergeFieldsPayload(input: ConciergeFieldsInput): ConciergeFieldsPayload {
  if (input.serviceType !== "concierge") {
    return { ok: true, fields: input.pricingUnit === PER_TRIP_PRICING_UNIT ? { pricingUnit: null } : {} };
  }
  const byId = new Map(input.kinds.map((k) => [k.id, k]));
  const conciergeTasks: Array<{ taskKindKey: string; cap: number | null }> = [];
  for (const pick of input.tasks) {
    const kind = byId.get(pick.taskKindKey);
    if (!kind) return { ok: false, reason: "not_on_list" };
    if (kind.linkOnly) return { ok: false, reason: "link_only" };
    const cap = admitConciergeCap(pick.cap);
    if (!cap.ok) return { ok: false, reason: "cap" };
    conciergeTasks.push({ taskKindKey: pick.taskKindKey, cap: cap.value });
  }
  const hours = input.responseHours.trim();
  const hoursNum = hours === "" ? null : Number(hours);
  return {
    ok: true,
    fields: {
      pricingUnit: input.perTrip ? PER_TRIP_PRICING_UNIT : input.pricingUnit === PER_TRIP_PRICING_UNIT ? null : input.pricingUnit || null,
      responseWindowHours: hoursNum !== null && Number.isInteger(hoursNum) && hoursNum > 0 ? hoursNum : null,
      conciergeTasks,
    },
  };
}
