/**
 * demand-onepager.admin.ts — the Phase 4 admin control for the recruitment one-pager (R32).
 *
 * Persists ONLY the approval decision (`demand_onepager_approvals`) — the PDF is regenerated
 * deterministically on demand (generateOnepagerDraft), so no blob is stored. Approval is KEPT only
 * while the keep-rule holds: (a) the stamped template version matches the current
 * ONEPAGER_TEMPLATE_VERSION AND (b) the market still clears the public floor for the APPROVED variant.
 * The re-validation job withdraws (deletes) a row that fails either — the artifact ends honestly when
 * its market drops below floor or the layout changes.
 *
 * Distribution is OUT OF SCOPE (R32): this ends at "an approved PDF exists, retrievable by an admin".
 * External use stays locked behind Leon's artifact-one review.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { demandOnepagerApprovals, type DemandOnepagerApproval } from "@workspace/db";
import { readAdminDemandRollup } from "./demand-rollup.service";
import { buildOnepagerModel, isApprovalKept, type OnepagerModel } from "./demand-onepager.compute";
import { ONEPAGER_TEMPLATE_VERSION } from "./demand-onepager.render";

// Re-export so route/consumer imports of the keep-rule stay stable (the pure impl lives in compute).
export { isApprovalKept };
import { getMarketByKey } from "./trend-engine/operating-markets";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { insertAccessAuditLog } from "./admin-query.service";
import { logger } from "../infrastructure/logger";

/** Build the BASE model for one market from a single admin-rollup read — enough to know qualifies +
 *  variant (the control needs no events/history/geo, which only affect the optional blocks). */
async function baseModelFor(marketSlug: string): Promise<OnepagerModel | null> {
  const read = await readAdminDemandRollup();
  return baseModelFrom(marketSlug, read);
}

function baseModelFrom(
  marketSlug: string,
  read: Awaited<ReturnType<typeof readAdminDemandRollup>>,
): OnepagerModel | null {
  const summary = read.summary.find((s) => s.marketSlug === marketSlug);
  const rows = read.rows.filter((r) => r.marketSlug === marketSlug);
  const marketName = getMarketByKey(marketSlug)?.cityName ?? marketSlug;
  return buildOnepagerModel({ marketSlug, marketName, summary, rows, window: read.window });
}

export async function getOnepagerApproval(marketSlug: string): Promise<DemandOnepagerApproval | null> {
  const [row] = await db
    .select()
    .from(demandOnepagerApprovals)
    .where(eq(demandOnepagerApprovals.marketSlug, marketSlug));
  return row ?? null;
}

export interface OnepagerControlRow {
  slug: string;
  name: string;
  qualifies: boolean;
  variant: OnepagerModel["variant"] | null;
  approved: boolean;
  /** approved AND the keep-rule still holds (template current + still clears floor for the variant). */
  approvalKept: boolean;
  approvedAt: string | null;
}

/**
 * The admin control's list: every operating market with its qualification + approval state. A single
 * admin-rollup read powers all markets. Non-qualifying markets are returned with `qualifies:false` so
 * the UI shows the honest "no figure clears the public floor yet" line, never a disabled mystery button.
 */
export async function listOnepagerControl(): Promise<OnepagerControlRow[]> {
  const [read, approvals] = await Promise.all([
    readAdminDemandRollup(),
    db.select().from(demandOnepagerApprovals),
  ]);
  const approvalBy = new Map(approvals.map((a) => [a.marketSlug, a]));
  return OPERATING_MARKETS.map((m) => {
    const model = baseModelFrom(m.marketKey, read);
    const approval = approvalBy.get(m.marketKey) ?? null;
    return {
      slug: m.marketKey,
      name: m.cityName,
      qualifies: model != null,
      variant: model?.variant ?? null,
      approved: !!approval,
      approvalKept: model != null && isApprovalKept(approval, model, ONEPAGER_TEMPLATE_VERSION),
      approvedAt: approval ? approval.approvedAt.toISOString() : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Approve a market's one-pager (R32). Verifies the market still qualifies (a page that argues against
 * joining is worse than no page — never approve an unqualified market), stamps the current template
 * version + the approving admin, and audit-logs. Upsert: re-approving refreshes the stamp.
 */
export async function approveOnepager(
  marketSlug: string,
  admin: { userId: string; role: string },
): Promise<DemandOnepagerApproval> {
  const model = await baseModelFor(marketSlug);
  if (!model) {
    throw new Error(`market ${marketSlug} does not clear the public floor — cannot approve`);
  }
  await db
    .insert(demandOnepagerApprovals)
    .values({
      marketSlug,
      variant: model.variant,
      approvedBy: admin.userId,
      templateVersion: ONEPAGER_TEMPLATE_VERSION,
    })
    .onConflictDoUpdate({
      target: demandOnepagerApprovals.marketSlug,
      set: {
        variant: model.variant,
        approvedBy: admin.userId,
        approvedAt: new Date(),
        templateVersion: ONEPAGER_TEMPLATE_VERSION,
        updatedAt: new Date(),
      },
    });
  await insertAccessAuditLog({
    actorId: admin.userId,
    actorRole: admin.role,
    action: "onepager.approve",
    resourceType: "demand_onepager",
    resourceId: marketSlug,
    metadata: { variant: model.variant, templateVersion: ONEPAGER_TEMPLATE_VERSION },
  });
  const row = await getOnepagerApproval(marketSlug);
  return row!;
}

/** Withdraw an approval (admin-initiated). Audit-logged. Deleting the row ends the approved artifact. */
export async function withdrawOnepager(marketSlug: string, admin: { userId: string; role: string }): Promise<void> {
  await db.delete(demandOnepagerApprovals).where(eq(demandOnepagerApprovals.marketSlug, marketSlug));
  await insertAccessAuditLog({
    actorId: admin.userId,
    actorRole: admin.role,
    action: "onepager.withdraw",
    resourceType: "demand_onepager",
    resourceId: marketSlug,
    metadata: { reason: "admin" },
  });
}

/**
 * R32 re-validation (the monthly-regeneration job's keep/withdraw arm). For each approval, re-evaluate
 * the keep-rule against fresh figures and the current template; withdraw (delete) any that no longer
 * hold — a market that dropped below floor, or an approval stamped on a superseded template. The served
 * PDF is always regenerated fresh, so this job's job is purely the honest withdraw. System-initiated, so
 * it logs to the app logger (access_audit_logs requires a real actor id).
 */
export async function revalidateOnepagerApprovals(): Promise<{ checked: number; withdrawn: string[] }> {
  const [read, approvals] = await Promise.all([
    readAdminDemandRollup(),
    db.select().from(demandOnepagerApprovals),
  ]);
  const withdrawn: string[] = [];
  for (const a of approvals) {
    const model = baseModelFrom(a.marketSlug, read);
    if (!isApprovalKept(a, model, ONEPAGER_TEMPLATE_VERSION)) {
      await db.delete(demandOnepagerApprovals).where(eq(demandOnepagerApprovals.marketSlug, a.marketSlug));
      withdrawn.push(a.marketSlug);
      logger.info(
        `[onepager] withdrew approval for ${a.marketSlug} — ` +
          (model == null
            ? "dropped below public floor"
            : model.variant !== a.variant
              ? `variant flipped ${a.variant}→${model.variant}`
              : `template ${a.templateVersion}→${ONEPAGER_TEMPLATE_VERSION}`),
      );
    }
  }
  return { checked: approvals.length, withdrawn };
}
