/**
 * CN-1e: the concierge task log (migration 430).
 *
 * One engagement = one service_bookings row whose listing is service_type 'concierge', resolved by
 * the id in the route (T6), never by (trip, expert). The traveler is service_bookings.traveler_id;
 * the assigned expert is provider_id.
 *
 *   Create      → 'requested'. The traveler, or the expert proposing for the traveler (within the
 *                 access window). The booking must be confirmed. The kind must be offered by the
 *                 listing (T1); a cap counts live tasks under a row lock (T2). A link only on a
 *                 link-only kind (T3).
 *   traveler_ok → the traveler only. Admins read, never OK.
 *   done / could_not_get → the assigned expert only, inside the access window, on a confirmed
 *                 booking. A link-only kind is 'done' only with an https link ("link sent"); no
 *                 booking by the expert is ever recorded for stays or transport.
 *   withdrawn   → the traveler only, before the expert resolves.
 *
 * Every transition is one atomic conditional on the from-state plus one event row, in one
 * transaction. A repeat of an applied transition answers the current task and writes nothing.
 * Decline and timeout (CN-1d) do not touch tasks: access ends, so they become unreachable (T5).
 * A listing edit after tasks exist affects future creates only (T7). No amount, price or payment
 * field exists (T4). Notifications are machine-typed; the words are CN-1e-UI's; no email.
 */
import crypto from "node:crypto";
import { and, asc, count, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  conciergeTaskEvents,
  conciergeTaskKinds,
  conciergeTasks,
  providerServiceConciergeTasks,
  providerServices,
  serviceBookings,
} from "@shared/schema";
import {
  CONCIERGE_TASK_ACTOR_FOR,
  CONCIERGE_TASK_ERRORS as E,
  CONCIERGE_TASK_FREED_STATES,
  CONCIERGE_TASK_NOTIFICATION_TYPE,
  isHttpsLink,
  isLegalConciergeTaskTransition,
  type ConciergeTaskActorType,
  type ConciergeTaskState,
} from "@shared/concierge-task-log";
import { isConciergeLinkOnly } from "@shared/concierge-tasks";
import { isTripAdvisorWithWriteAccess } from "../utils/trip-advisor";

export type TaskResult<T> = { ok: true; status: number; body: T } | { ok: false; status: number; body: Record<string, unknown> };

const fail = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  ({ ok: false as const, status, body: { code, ...extra } });

interface Engagement {
  id: string;
  serviceId: string | null;
  travelerId: string | null;
  providerId: string | null;
  tripId: string | null;
  status: string | null;
  isConcierge: boolean;
}

async function loadEngagement(bookingId: string): Promise<Engagement | null> {
  const [row] = await db
    .select({
      id: serviceBookings.id,
      serviceId: serviceBookings.serviceId,
      travelerId: serviceBookings.travelerId,
      providerId: serviceBookings.providerId,
      tripId: serviceBookings.tripId,
      status: serviceBookings.status,
      serviceType: providerServices.serviceType,
    })
    .from(serviceBookings)
    .leftJoin(providerServices, eq(providerServices.id, serviceBookings.serviceId))
    .where(eq(serviceBookings.id, bookingId))
    .limit(1);
  if (!row) return null;
  return { ...row, isConcierge: row.serviceType === "concierge" };
}

async function isAdmin(userId: string): Promise<boolean> {
  const user = await storage.getUser(userId);
  return (user as any)?.role === "admin";
}

/** The assigned expert's window: a §12 write-status advisor row on the trip whose access has not ended. */
async function expertWindowOpen(e: Engagement): Promise<boolean> {
  return !!e.providerId && (await isTripAdvisorWithWriteAccess(e.tripId, e.providerId));
}

function roleOf(e: Engagement, userId: string): "traveler" | "expert" | null {
  if (e.travelerId && e.travelerId === userId) return "traveler";
  if (e.providerId && e.providerId === userId) return "expert";
  return null;
}

async function notifyCounterpart(e: Engagement, taskId: string, toState: ConciergeTaskState, actor: "traveler" | "expert") {
  const userId = actor === "traveler" ? e.providerId : e.travelerId;
  if (!userId) return;
  try {
    await storage.createNotificationOnce({
      userId,
      type: CONCIERGE_TASK_NOTIFICATION_TYPE,
      // Machine codes only: the words are CN-1e-UI's (CN1_COPY task strings).
      title: CONCIERGE_TASK_NOTIFICATION_TYPE,
      message: toState,
      relatedId: e.id,
      relatedType: "booking",
      data: { taskId, bookingId: e.id, toState },
      dedupeKey: `concierge-task:${taskId}:${toState}`,
    } as any);
  } catch (err) {
    console.error(`[concierge-task] notification failed (${(err as any)?.code ?? "error"})`);
  }
}

/** The projection both parties and admins read: ids, kind, words the traveler typed, state, timestamps, roles. */
export interface ConciergeTaskView {
  id: string;
  bookingId: string;
  kind: { taskKindKey: string; label: string; domain: string; linkOnly: boolean };
  title: string;
  note: string | null;
  linkUrl: string | null;
  state: ConciergeTaskState;
  requestedBy: "traveler" | "expert";
  requestedAt: string;
  travelerOkAt: string | null;
  resolvedAt: string | null;
  events: Array<{ fromState: ConciergeTaskState | null; toState: ConciergeTaskState; actorType: ConciergeTaskActorType; createdAt: string }>;
}

const iso = (d: Date | string | null | undefined) => (d == null ? null : new Date(d).toISOString());

async function viewTasks(e: Engagement, taskIds?: string[]): Promise<ConciergeTaskView[]> {
  const where = taskIds ? and(eq(conciergeTasks.serviceBookingId, e.id), inArray(conciergeTasks.id, taskIds)) : eq(conciergeTasks.serviceBookingId, e.id);
  const rows = await db
    .select({ task: conciergeTasks, kind: conciergeTaskKinds })
    .from(conciergeTasks)
    .innerJoin(conciergeTaskKinds, eq(conciergeTaskKinds.id, conciergeTasks.taskKindId))
    .where(where)
    .orderBy(asc(conciergeTasks.createdAt), asc(conciergeTasks.id));
  if (rows.length === 0) return [];
  const events = await db
    .select()
    .from(conciergeTaskEvents)
    .where(inArray(conciergeTaskEvents.taskId, rows.map((r) => r.task.id)))
    .orderBy(asc(conciergeTaskEvents.createdAt), asc(conciergeTaskEvents.id));
  return rows.map(({ task, kind }) => ({
    id: task.id,
    bookingId: task.serviceBookingId,
    kind: { taskKindKey: kind.id, label: kind.label, domain: kind.domain, linkOnly: isConciergeLinkOnly(kind) },
    title: task.title,
    note: task.note ?? null,
    linkUrl: task.linkUrl ?? null,
    state: task.state as ConciergeTaskState,
    requestedBy: task.requestedBy === e.providerId ? "expert" : "traveler",
    requestedAt: iso(task.requestedAt)!,
    travelerOkAt: iso(task.travelerOkAt),
    resolvedAt: iso(task.resolvedAt),
    events: events
      .filter((ev) => ev.taskId === task.id)
      .map((ev) => ({
        fromState: (ev.fromState as ConciergeTaskState | null) ?? null,
        toState: ev.toState as ConciergeTaskState,
        actorType: ev.actorType as ConciergeTaskActorType,
        createdAt: iso(ev.createdAt)!,
      })),
  }));
}

export async function listConciergeTasks(
  bookingId: string,
  viewerId: string,
): Promise<TaskResult<{ tasks: ConciergeTaskView[]; viewer: "traveler" | "expert" | "admin" }>> {
  const e = await loadEngagement(bookingId);
  if (!e || !e.isConcierge) return fail(404, E.engagementNotFound);
  const role = roleOf(e, viewerId);
  let viewer: "traveler" | "expert" | "admin";
  if (role === "traveler") viewer = "traveler";
  else if (role === "expert" && (await expertWindowOpen(e))) viewer = "expert";
  else if (await isAdmin(viewerId)) viewer = "admin";
  else return fail(404, E.engagementNotFound);
  return { ok: true, status: 200, body: { tasks: await viewTasks(e), viewer } };
}

export async function createConciergeTask(
  bookingId: string,
  actorId: string,
  input: { taskKindId: string; title: string; note?: string; linkUrl?: string },
): Promise<TaskResult<ConciergeTaskView>> {
  const e = await loadEngagement(bookingId);
  const role = e ? roleOf(e, actorId) : null;
  if (!e || !role) return fail(404, E.engagementNotFound);
  if (!e.isConcierge || e.status !== "confirmed") return fail(409, E.engagementNotActive);
  if (role === "expert" && !(await expertWindowOpen(e))) return fail(403, E.accessEnded);

  const [offer] = await db
    .select({ cap: providerServiceConciergeTasks.cap, kind: conciergeTaskKinds })
    .from(providerServiceConciergeTasks)
    .innerJoin(conciergeTaskKinds, eq(conciergeTaskKinds.id, providerServiceConciergeTasks.taskKindId))
    .where(and(eq(providerServiceConciergeTasks.serviceId, e.serviceId ?? ""), eq(providerServiceConciergeTasks.taskKindId, input.taskKindId)))
    .limit(1);
  if (!offer) return fail(400, E.kindNotOffered);

  const linkUrl = input.linkUrl?.trim() || null;
  if (linkUrl) {
    if (!isConciergeLinkOnly(offer.kind)) return fail(400, E.linkNotAllowed);
    if (!isHttpsLink(linkUrl)) return fail(400, E.linkInvalid);
  }

  const taskId = crypto.randomUUID();
  const now = new Date();
  const outcome = await db.transaction(async (tx) => {
    // T2: the booking row is the lock every concurrent create for this engagement waits on.
    await tx.execute(sql`SELECT id FROM service_bookings WHERE id = ${e.id} FOR NO KEY UPDATE`);
    if (offer.cap != null) {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(conciergeTasks)
        .where(
          and(
            eq(conciergeTasks.serviceBookingId, e.id),
            eq(conciergeTasks.taskKindId, input.taskKindId),
            notInArray(conciergeTasks.state, [...CONCIERGE_TASK_FREED_STATES]),
          ),
        );
      if (Number(n) >= offer.cap) return "cap" as const;
    }
    await tx.insert(conciergeTasks).values({
      id: taskId,
      serviceBookingId: e.id,
      taskKindId: input.taskKindId,
      title: input.title,
      note: input.note?.trim() || null,
      linkUrl,
      state: "requested",
      requestedBy: actorId,
      requestedAt: now,
      createdAt: now,
    });
    await tx.insert(conciergeTaskEvents).values({
      id: crypto.randomUUID(),
      taskId,
      serviceBookingId: e.id,
      fromState: null,
      toState: "requested",
      actorType: role,
      actorId,
      note: null,
      createdAt: now,
    });
    return "created" as const;
  });
  if (outcome === "cap") return fail(409, E.capReached);
  await notifyCounterpart(e, taskId, "requested", role);
  const [view] = await viewTasks(e, [taskId]);
  return { ok: true, status: 201, body: view };
}

export async function transitionConciergeTask(
  taskId: string,
  actorId: string,
  to: Exclude<ConciergeTaskState, "requested">,
  input: { linkUrl?: string; note?: string } = {},
): Promise<TaskResult<ConciergeTaskView>> {
  const [task] = await db.select().from(conciergeTasks).where(eq(conciergeTasks.id, taskId)).limit(1);
  if (!task) return fail(404, E.notFound);
  const e = await loadEngagement(task.serviceBookingId);
  if (!e) return fail(404, E.notFound);

  const required = CONCIERGE_TASK_ACTOR_FOR[to];
  const role = roleOf(e, actorId);
  if (required === "traveler" && role !== "traveler") return fail(403, E.ownerOnly);
  if (required === "expert") {
    if (role !== "expert") return fail(403, E.expertOnly);
    if (!(await expertWindowOpen(e))) return fail(403, E.accessEnded);
    if (!e.isConcierge || e.status !== "confirmed") return fail(409, E.engagementNotActive);
  }

  const from = task.state as ConciergeTaskState;
  // A repeat of an applied transition: the current task, nothing written.
  if (from === to) {
    const [view] = await viewTasks(e, [taskId]);
    return { ok: true, status: 200, body: view };
  }
  if (!isLegalConciergeTaskTransition(from, to)) return fail(409, E.illegalTransition, { from, to });

  let linkUrl: string | null = task.linkUrl ?? null;
  if (to === "done") {
    const [kind] = await db.select().from(conciergeTaskKinds).where(eq(conciergeTaskKinds.id, task.taskKindId)).limit(1);
    const sent = input.linkUrl?.trim() || null;
    if (sent && !isHttpsLink(sent)) return fail(400, E.linkInvalid);
    if (kind && isConciergeLinkOnly(kind)) {
      linkUrl = sent ?? linkUrl;
      if (!linkUrl) return fail(400, E.linkRequired);
      if (!isHttpsLink(linkUrl)) return fail(400, E.linkInvalid);
    } else if (sent) {
      return fail(400, E.linkNotAllowed);
    }
  }

  const now = new Date();
  const note = input.note?.trim() || null;
  const applied = await db.transaction(async (tx) => {
    const patch: Partial<typeof conciergeTasks.$inferInsert> = { state: to };
    if (to === "traveler_ok") Object.assign(patch, { travelerOkAt: now, travelerOkBy: actorId });
    else Object.assign(patch, { resolvedAt: now, resolvedBy: actorId });
    if (to === "done") patch.linkUrl = linkUrl;
    const rows = await tx
      .update(conciergeTasks)
      .set(patch)
      .where(and(eq(conciergeTasks.id, taskId), eq(conciergeTasks.state, from)))
      .returning({ id: conciergeTasks.id });
    if (rows.length === 0) return false;
    await tx.insert(conciergeTaskEvents).values({
      id: crypto.randomUUID(),
      taskId,
      serviceBookingId: e.id,
      fromState: from,
      toState: to,
      actorType: required,
      actorId,
      note,
      createdAt: now,
    });
    return true;
  });
  if (!applied) {
    // Lost a race: answer what the row now says.
    const [now2] = await db.select({ state: conciergeTasks.state }).from(conciergeTasks).where(eq(conciergeTasks.id, taskId)).limit(1);
    if (now2?.state === to) {
      const [view] = await viewTasks(e, [taskId]);
      return { ok: true, status: 200, body: view };
    }
    return fail(409, E.illegalTransition, { from: now2?.state ?? from, to });
  }
  await notifyCounterpart(e, taskId, to, required);
  const [view] = await viewTasks(e, [taskId]);
  return { ok: true, status: 200, body: view };
}
