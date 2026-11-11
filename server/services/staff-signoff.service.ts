/**
 * staff-signoff.service.ts — provider and listing approvals in two steps (slice 0, Addendum A v2, ruling 1).
 *
 * A staff approval (platform_admin / regional_manager, per `platform_settings.provider_signoff_required_for`) does NOT
 * publish: it stamps `staff_approved_at` / `staff_approved_by` and leaves the status where it is. The owner's confirm
 * runs the EXISTING approve route, which flips the status as it always has. The owner sign-off queue is a derived read
 * (stamped AND still waiting); there is no queue table and no new status value (publish-trap posture).
 *
 * Every stamp is ONE atomic conditional on the row still waiting and not yet stamped (§15): a double click is one
 * effect, and a row the owner already decided cannot be stamped.
 */
import { and, asc, eq, isNotNull, isNull, notInArray } from "drizzle-orm";
import { db } from "../db";
import { platformSettingsTable, providerServices, serviceProviderForms } from "@shared/schema";
import { isOwnerRole } from "@shared/roles";
import { marketForListing, marketForProviderFormRow } from "./staff-scope";

export const PROVIDER_SIGNOFF_SETTING = "provider_signoff_required_for";
export const PROVIDER_SIGNOFF_VALUES = ["all_staff", "regional_only", "none"] as const;
export type ProviderSignoffValue = (typeof PROVIDER_SIGNOFF_VALUES)[number];

export function isProviderSignoffValue(v: unknown): v is ProviderSignoffValue {
  return typeof v === "string" && (PROVIDER_SIGNOFF_VALUES as readonly string[]).includes(v);
}

/** The setting, read live. A missing or unreadable value reads as the seeded `all_staff` — the safe answer. */
export async function readProviderSignoffSetting(): Promise<ProviderSignoffValue> {
  try {
    const [row] = await db
      .select({ v: platformSettingsTable.settingValue })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.settingKey, PROVIDER_SIGNOFF_SETTING))
      .limit(1);
    return isProviderSignoffValue(row?.v) ? row!.v as ProviderSignoffValue : "all_staff";
  } catch {
    return "all_staff";
  }
}

/** Pure: does an approval by `role` wait for the owner under `setting`? The owner never waits on itself. */
export function approvalWaitsForOwner(role: string | null | undefined, setting: ProviderSignoffValue): boolean {
  if (isOwnerRole(role)) return false;
  if (setting === "none") return false;
  if (setting === "regional_only") return role === "regional_manager";
  return role === "platform_admin" || role === "admin" || role === "regional_manager";
}

export type StampResult = { stamped: true } | { stamped: false; reason: "not_waiting" };

/** Stamp a submitted listing's staff approval. Atomic on `approval_status = 'submitted'` and not yet stamped. */
export async function stampListingStaffApproval(serviceId: string, actorId: string, now: Date = new Date()): Promise<StampResult> {
  const rows = await db
    .update(providerServices)
    .set({ staffApprovedAt: now, staffApprovedBy: actorId } as any)
    .where(and(eq(providerServices.id, serviceId), eq(providerServices.approvalStatus, "submitted"), isNull(providerServices.staffApprovedAt)))
    .returning({ id: providerServices.id });
  return rows.length === 1 ? { stamped: true } : { stamped: false, reason: "not_waiting" };
}

/** Stamp a provider application's staff approval. Atomic on the form not decided and not yet stamped. */
export async function stampProviderFormStaffApproval(formId: string, actorId: string, now: Date = new Date()): Promise<StampResult> {
  const rows = await db
    .update(serviceProviderForms)
    .set({ staffApprovedAt: now, staffApprovedBy: actorId } as any)
    .where(
      and(
        eq(serviceProviderForms.id, formId),
        notInArray(serviceProviderForms.status, ["approved", "rejected"]),
        isNull(serviceProviderForms.staffApprovedAt),
      ),
    )
    .returning({ id: serviceProviderForms.id });
  return rows.length === 1 ? { stamped: true } : { stamped: false, reason: "not_waiting" };
}

/** LD 23: an identity edit before the owner's sign-off clears the listing's staff stamp (the approval was of the old row). */
export async function clearListingStaffApproval(serviceId: string): Promise<boolean> {
  const rows = await db
    .update(providerServices)
    .set({ staffApprovedAt: null, staffApprovedBy: null } as any)
    .where(and(eq(providerServices.id, serviceId), eq(providerServices.approvalStatus, "submitted"), isNotNull(providerServices.staffApprovedAt)))
    .returning({ id: providerServices.id });
  return rows.length === 1;
}

export interface SignoffQueueRow {
  kind: "listing" | "provider_application";
  id: string;
  name: string | null;
  market: string | null;
  staffApprovedAt: Date | null;
  staffApprovedBy: string | null;
}

/** The owner sign-off queue: stamped by staff and still waiting. Derived, whatever the setting's value. */
export async function listOwnerSignoffQueue(): Promise<SignoffQueueRow[]> {
  const listings = await db
    .select({ id: providerServices.id, name: providerServices.serviceName, at: providerServices.staffApprovedAt, by: providerServices.staffApprovedBy })
    .from(providerServices)
    .where(and(isNotNull(providerServices.staffApprovedAt), eq(providerServices.approvalStatus, "submitted")))
    .orderBy(asc(providerServices.staffApprovedAt))
    .limit(200);
  const forms = await db
    .select({
      id: serviceProviderForms.id,
      name: serviceProviderForms.businessName,
      city: serviceProviderForms.city,
      at: serviceProviderForms.staffApprovedAt,
      by: serviceProviderForms.staffApprovedBy,
    })
    .from(serviceProviderForms)
    .where(and(isNotNull(serviceProviderForms.staffApprovedAt), notInArray(serviceProviderForms.status, ["approved", "rejected"])))
    .orderBy(asc(serviceProviderForms.staffApprovedAt))
    .limit(200);
  const out: SignoffQueueRow[] = [];
  for (const l of listings) {
    out.push({ kind: "listing", id: l.id, name: l.name ?? null, market: await marketForListing(l.id), staffApprovedAt: l.at, staffApprovedBy: l.by });
  }
  for (const f of forms) {
    out.push({ kind: "provider_application", id: f.id, name: f.name ?? null, market: marketForProviderFormRow(f), staffApprovedAt: f.at, staffApprovedBy: f.by });
  }
  return out;
}

/** Owner-only write of the setting, through the platform-settings route (which audits it). */
export function validateProviderSignoffValue(value: unknown): value is ProviderSignoffValue {
  return isProviderSignoffValue(value);
}

