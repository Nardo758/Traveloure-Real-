/**
 * CN-1e: the concierge task log, shared rules (migration 430).
 *
 * A task is asked of one concierge engagement (a service_bookings row whose listing is
 * service_type 'concierge'). It is created 'requested' (by the traveler, or by the assigned expert
 * on the traveler's behalf), OK'd only by the traveler, and resolved only by the assigned expert
 * inside the access window. Every transition writes one event row.
 *
 * The API returns state codes and machine error codes only. The words a traveler or expert reads
 * are CN-1e-UI's (CN1_COPY.taskRequested / taskTravelerOk / taskDone / taskCouldNotGet / taskLinkOnly).
 * No amount, price or payment field exists here: venue costs never pass through the platform.
 */
import { z } from "zod";

export const CONCIERGE_TASK_STATES = ["requested", "traveler_ok", "done", "could_not_get", "withdrawn"] as const;
export type ConciergeTaskState = (typeof CONCIERGE_TASK_STATES)[number];

/** States that no longer hold a cap slot. */
export const CONCIERGE_TASK_FREED_STATES = ["could_not_get", "withdrawn"] as const satisfies readonly ConciergeTaskState[];

export const CONCIERGE_TASK_TERMINAL_STATES = ["done", "could_not_get", "withdrawn"] as const satisfies readonly ConciergeTaskState[];

export type ConciergeTaskActorType = "traveler" | "expert" | "system";

/** The legal moves: requested → traveler_ok | withdrawn; traveler_ok → done | could_not_get | withdrawn. */
export const CONCIERGE_TASK_TRANSITIONS: Readonly<Record<ConciergeTaskState, readonly ConciergeTaskState[]>> = {
  requested: ["traveler_ok", "withdrawn"],
  traveler_ok: ["done", "could_not_get", "withdrawn"],
  done: [],
  could_not_get: [],
  withdrawn: [],
};

export function isLegalConciergeTaskTransition(from: ConciergeTaskState, to: ConciergeTaskState): boolean {
  return CONCIERGE_TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Who may move a task into a state. The traveler is service_bookings.traveler_id; the expert is provider_id. */
export const CONCIERGE_TASK_ACTOR_FOR: Readonly<Record<Exclude<ConciergeTaskState, "requested">, "traveler" | "expert">> = {
  traveler_ok: "traveler",
  withdrawn: "traveler",
  done: "expert",
  could_not_get: "expert",
};

export const CONCIERGE_TASK_ERRORS = {
  notFound: "concierge_task_not_found",
  engagementNotFound: "concierge_engagement_not_found",
  engagementNotActive: "concierge_engagement_not_active",
  ownerOnly: "concierge_task_owner_only",
  expertOnly: "concierge_task_expert_only",
  accessEnded: "concierge_access_ended",
  kindNotOffered: "concierge_task_kind_not_offered",
  capReached: "concierge_task_cap_reached",
  linkRequired: "concierge_link_required",
  linkInvalid: "concierge_link_invalid",
  linkNotAllowed: "concierge_link_not_allowed",
  illegalTransition: "concierge_task_illegal_transition",
  invalidBody: "concierge_task_invalid_body",
} as const;

/** A link a concierge sends for a link-only kind: https only. */
export function isHttpsLink(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !!u.hostname;
  } catch {
    return false;
  }
}

export const conciergeTaskCreateBodySchema = z
  .object({
    taskKindId: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(200),
    note: z.string().trim().max(2000).optional(),
    linkUrl: z.string().trim().max(2000).optional(),
  })
  .strict();

export const conciergeTaskDoneBodySchema = z
  .object({
    linkUrl: z.string().trim().max(2000).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

export const conciergeTaskNoteBodySchema = z.object({ note: z.string().trim().max(2000).optional() }).strict();

export const conciergeTaskEmptyBodySchema = z.object({}).strict();

/** The notification type the counterpart gets on every transition. No email outbox lists it. */
export const CONCIERGE_TASK_NOTIFICATION_TYPE = "concierge_task_update";
