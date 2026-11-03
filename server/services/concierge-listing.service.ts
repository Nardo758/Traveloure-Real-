/**
 * CN-1a — concierge listing type and the tasks a listing picks.
 *
 * One admission. Callers: POST and PATCH /api/provider/services, and the two
 * side creates (duplicate, from-template) when the new row's service type is
 * concierge. service_type "concierge" is already in serviceTypeEnum. The
 * per-trip unit is pricing_unit "per_trip". Reply hours reuse
 * response_window_hours. Neither column is backfilled. Existing rows keep
 * the service_type they have.
 *
 * Task kinds are an admin list. A listing may pick only an active kind.
 * Stays and transport cannot be saved as bookable (shared/concierge-tasks.ts).
 */
import { asc, eq } from "drizzle-orm";
import { conciergePerTripPrice, conciergeResponseHoursLine } from "@shared/cn1-copy";
import { isExpertRole } from "@shared/roles";
import {
  PER_TRIP_PRICING_UNIT,
  conciergeTaskKindCreateSchema,
  conciergeTaskKindPatchSchema,
  conciergeTaskPicksSchema,
  isConciergeLinkOnly,
} from "@shared/concierge-tasks";
import { conciergeTaskKinds, providerServiceConciergeTasks, users } from "@shared/schema";
import { db } from "../db";

export interface ConciergeTaskView {
  taskKindKey: string;
  label: string;
  domain: string;
  linkOnly: boolean;
  cap: number | null;
}

export interface ConciergeTaskWrite {
  taskKindKey: string;
  cap: number | null;
}

export type ConciergeRefusal = {
  ok: false;
  status: number;
  body: { message: string; code: string };
};

export type ConciergeAdmit =
  | { ok: true; tasks: ConciergeTaskWrite[] | null }
  | ConciergeRefusal;

function refusal(status: number, code: string, message: string): ConciergeRefusal {
  return { ok: false, status, body: { message, code } };
}

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export async function admitConciergeListingWrite(input: {
  userId: string;
  body: unknown;
  storedServiceType: string | null;
  nextServiceType: string;
  pricingUnitProvided: boolean;
  nextPricingUnit: string | null;
  storedPricingUnit: string | null;
}): Promise<ConciergeAdmit> {
  const wantsConcierge =
    input.nextServiceType === "concierge" || input.storedServiceType === "concierge";
  if (wantsConcierge) {
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!isExpertRole(row?.role)) {
      return refusal(403, "CONCIERGE_EXPERT_REQUIRED", "A concierge listing is saved by an expert account.");
    }
  }

  const effectiveUnit = input.pricingUnitProvided ? input.nextPricingUnit : input.storedPricingUnit;
  if (effectiveUnit === PER_TRIP_PRICING_UNIT && input.nextServiceType !== "concierge") {
    return refusal(400, "PRICE_UNIT_PER_TRIP", "A per-trip price is for a concierge listing.");
  }

  const record = asRecord(input.body);
  const tasksPresent = !!record && Object.prototype.hasOwnProperty.call(record, "conciergeTasks");
  if (!tasksPresent) {
    if (input.storedServiceType === "concierge" && input.nextServiceType !== "concierge") {
      return { ok: true, tasks: [] };
    }
    return { ok: true, tasks: null };
  }

  const parsed = conciergeTaskPicksSchema.safeParse(record?.conciergeTasks);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const capIssue = issue?.path.includes("cap");
    return refusal(
      400,
      capIssue ? "TASK_CAP" : "CONCIERGE_TASKS_INVALID",
      capIssue
        ? "A task cap is a positive whole number, or empty."
        : "Each task needs a kind from the list, and a cap is a positive whole number or empty.",
    );
  }

  if (input.nextServiceType !== "concierge" && parsed.data.length > 0) {
    return refusal(400, "TASKS_NEED_CONCIERGE", "Task choices belong on a concierge listing.");
  }

  const seen = new Set<string>();
  const writes: ConciergeTaskWrite[] = [];
  for (const pick of parsed.data) {
    if (seen.has(pick.taskKindKey)) {
      return refusal(400, "CONCIERGE_TASK_DUPLICATE", "Each task is listed once.");
    }
    seen.add(pick.taskKindKey);
    const [kind] = await db
      .select({
        id: conciergeTaskKinds.id,
        domain: conciergeTaskKinds.domain,
        active: conciergeTaskKinds.active,
      })
      .from(conciergeTaskKinds)
      .where(eq(conciergeTaskKinds.id, pick.taskKindKey))
      .limit(1);
    if (!kind || kind.active === false) {
      return refusal(400, "TASK_NOT_ON_LIST", "That task is not on the concierge list.");
    }
    if (pick.bookable === true && isConciergeLinkOnly(kind)) {
      return refusal(
        400,
        "LINK_ONLY_TASK",
        "Stays and transport are links only. They cannot be saved as bookable tasks.",
      );
    }
    writes.push({ taskKindKey: kind.id, cap: pick.cap ?? null });
  }

  return { ok: true, tasks: writes };
}

/**
 * CN-1h. A duplicate is a create. When the copy's service type is concierge,
 * the source row's price unit and task picks go through the same admission
 * as POST /api/provider/services before the copy is inserted. Any other type
 * is not this admission's job.
 */
export async function admitDuplicatedConciergeListing(input: {
  userId: string;
  serviceId: string;
  serviceType: string | null | undefined;
  pricingUnit: string | null | undefined;
}): Promise<ConciergeAdmit> {
  if (input.serviceType !== "concierge") return { ok: true, tasks: null };
  const tasks = await loadListingConciergeTasks(input.serviceId);
  return admitConciergeListingWrite({
    userId: input.userId,
    body: {
      conciergeTasks: tasks.map((task) => ({ taskKindKey: task.taskKindKey, cap: task.cap })),
    },
    storedServiceType: null,
    nextServiceType: "concierge",
    pricingUnitProvided: true,
    nextPricingUnit: input.pricingUnit ?? null,
    storedPricingUnit: null,
  });
}

/**
 * CN-1h. Creating from a template is a create. When the template's service
 * type is concierge, the request body is admitted the same way as POST
 * /api/provider/services (task picks and price unit) before the row exists.
 * Any other template type skips this admission.
 */
export async function admitFromTemplateConciergeListing(input: {
  userId: string;
  serviceType: string | null | undefined;
  body: unknown;
}): Promise<ConciergeAdmit> {
  if (input.serviceType !== "concierge") return { ok: true, tasks: null };
  const record = asRecord(input.body);
  const pricingUnitProvided = !!record && Object.prototype.hasOwnProperty.call(record, "pricingUnit");
  const rawUnit = pricingUnitProvided ? record?.pricingUnit : null;
  return admitConciergeListingWrite({
    userId: input.userId,
    body: input.body,
    storedServiceType: null,
    nextServiceType: "concierge",
    pricingUnitProvided,
    nextPricingUnit: typeof rawUnit === "string" ? rawUnit : null,
    storedPricingUnit: null,
  });
}

export async function commitConciergeTasks(serviceId: string, tasks: ConciergeTaskWrite[] | null): Promise<void> {
  if (tasks === null) return;
  await db.transaction(async (tx) => {
    await tx.delete(providerServiceConciergeTasks).where(eq(providerServiceConciergeTasks.serviceId, serviceId));
    if (tasks.length === 0) return;
    await tx.insert(providerServiceConciergeTasks).values(
      tasks.map((task) => ({
        id: crypto.randomUUID(),
        serviceId,
        taskKindId: task.taskKindKey,
        cap: task.cap,
      })),
    );
  });
}

export async function loadListingConciergeTasks(serviceId: string): Promise<ConciergeTaskView[]> {
  const rows = await db
    .select({
      taskKindKey: providerServiceConciergeTasks.taskKindId,
      label: conciergeTaskKinds.label,
      domain: conciergeTaskKinds.domain,
      cap: providerServiceConciergeTasks.cap,
      kindId: conciergeTaskKinds.id,
    })
    .from(providerServiceConciergeTasks)
    .innerJoin(conciergeTaskKinds, eq(providerServiceConciergeTasks.taskKindId, conciergeTaskKinds.id))
    .where(eq(providerServiceConciergeTasks.serviceId, serviceId))
    .orderBy(asc(conciergeTaskKinds.sortOrder), asc(conciergeTaskKinds.id));
  return rows.map((row) => ({
    taskKindKey: row.taskKindKey,
    label: row.label,
    domain: row.domain,
    linkOnly: isConciergeLinkOnly({ id: row.kindId, domain: row.domain }),
    cap: row.cap ?? null,
  }));
}

export function conciergeListingExtras(
  service: {
    serviceType?: string | null;
    pricingUnit?: string | null;
    price?: string | null;
    responseWindowHours?: number | null;
  },
  tasks: ConciergeTaskView[],
): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  if (service.serviceType === "concierge" || tasks.length > 0) extras.conciergeTasks = tasks;
  if (service.serviceType === "concierge" && service.pricingUnit === PER_TRIP_PRICING_UNIT && service.price) {
    extras.conciergePriceLabel = conciergePerTripPrice(String(service.price));
  }
  if (service.serviceType === "concierge" && typeof service.responseWindowHours === "number") {
    extras.conciergeResponseHoursLabel = conciergeResponseHoursLine(service.responseWindowHours);
  }
  return extras;
}

export interface ConciergeTaskKindView {
  id: string;
  label: string;
  domain: string;
  linkOnly: boolean;
  sortOrder: number | null;
  active: boolean | null;
}

function toKindView(row: {
  id: string;
  label: string;
  domain: string;
  sortOrder: number | null;
  active: boolean | null;
}): ConciergeTaskKindView {
  return {
    id: row.id,
    label: row.label,
    domain: row.domain,
    linkOnly: isConciergeLinkOnly(row),
    sortOrder: row.sortOrder,
    active: row.active,
  };
}

export async function listPublicConciergeTaskKinds(): Promise<ConciergeTaskKindView[]> {
  const rows = await db
    .select()
    .from(conciergeTaskKinds)
    .orderBy(asc(conciergeTaskKinds.sortOrder), asc(conciergeTaskKinds.id));
  return rows.filter((row) => row.active !== false).map(toKindView);
}

export async function listAdminConciergeTaskKinds(): Promise<ConciergeTaskKindView[]> {
  const rows = await db
    .select()
    .from(conciergeTaskKinds)
    .orderBy(asc(conciergeTaskKinds.sortOrder), asc(conciergeTaskKinds.id));
  return rows.map(toKindView);
}

function bookableRefusal(kind: { id: string; domain: string }, bookable: boolean | undefined): ConciergeRefusal | null {
  if (bookable === true && isConciergeLinkOnly(kind)) {
    return refusal(
      400,
      "LINK_ONLY_TASK",
      "Stays and transport are links only. They cannot be saved as bookable tasks.",
    );
  }
  return null;
}

export async function createConciergeTaskKind(body: unknown): Promise<{ ok: true; kind: ConciergeTaskKindView } | ConciergeRefusal> {
  const parsed = conciergeTaskKindCreateSchema.safeParse(body);
  if (!parsed.success) {
    return refusal(400, "CONCIERGE_TASK_KIND_INVALID", "A task kind needs a key, a label, and a domain from the list.");
  }
  const blocked = bookableRefusal({ id: parsed.data.taskKey, domain: parsed.data.domain }, parsed.data.bookable);
  if (blocked) return blocked;
  try {
    const [row] = await db
      .insert(conciergeTaskKinds)
      .values({
        id: parsed.data.taskKey,
        label: parsed.data.label,
        domain: parsed.data.domain,
        active: parsed.data.active === undefined ? true : parsed.data.active,
        sortOrder: parsed.data.sortOrder ?? null,
      })
      .returning();
    return { ok: true, kind: toKindView(row) };
  } catch (err) {
    const pgCode = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
    if (pgCode === "23505") {
      return refusal(409, "CONCIERGE_TASK_KIND_EXISTS", "That task is already on the list.");
    }
    throw err;
  }
}

export async function updateConciergeTaskKind(
  id: string,
  body: unknown,
): Promise<{ ok: true; kind: ConciergeTaskKindView } | ConciergeRefusal> {
  const parsed = conciergeTaskKindPatchSchema.safeParse(body);
  if (!parsed.success) {
    return refusal(400, "CONCIERGE_TASK_KIND_INVALID", "That task kind edit cannot be saved.");
  }
  const [existing] = await db.select().from(conciergeTaskKinds).where(eq(conciergeTaskKinds.id, id)).limit(1);
  if (!existing) return refusal(404, "CONCIERGE_TASK_KIND_NOT_FOUND", "That task is not on the concierge list.");
  const next = {
    id: existing.id,
    domain: parsed.data.domain ?? existing.domain,
  };
  const blocked = bookableRefusal(next, parsed.data.bookable);
  if (blocked) return blocked;
  const set = {
    ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
    ...(parsed.data.domain !== undefined ? { domain: parsed.data.domain } : {}),
    ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
    ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
  };
  if (Object.keys(set).length === 0) return { ok: true, kind: toKindView(existing) };
  const [row] = await db.update(conciergeTaskKinds).set(set).where(eq(conciergeTaskKinds.id, id)).returning();
  return { ok: true, kind: toKindView(row) };
}
