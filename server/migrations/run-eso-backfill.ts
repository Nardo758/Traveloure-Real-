/**
 * ESO Backfill Migration Script
 *
 * One-time, idempotent script that migrates ALL existing service catalog rows into
 * expert_service_offerings (ESO) as the canonical source of truth.
 *
 * Scope:
 *   - service_templates (all active rows) → ESO with isDefault=true, expertId=null
 *   - expert_custom_services (ALL rows, all statuses, all active states) → ESO with
 *     isDefault=false, expertId set, workflow fields preserved
 *
 * Deduplication key: externalId (source row UUID) — deterministic, not name-fragile.
 * Safe to re-run: skips rows where externalId already exists in ESO.
 *
 * Can be run standalone:
 *   npx tsx server/migrations/run-eso-backfill.ts
 *
 * Or called from startup via runEsoBackfill() export.
 */
import { db } from "../db";
import {
  expertServiceOfferings,
  expertServiceCategories,
  serviceTemplates,
  expertCustomServices,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

export async function runEsoBackfill(): Promise<{ stMigrated: number; customMigrated: number }> {
  let stMigrated = 0;
  let customMigrated = 0;

  // Resolve (or create) the fallback "Itinerary Planning" category
  let categoryRow = await db
    .select({ id: expertServiceCategories.id })
    .from(expertServiceCategories)
    .where(eq(expertServiceCategories.name, "Itinerary Planning"))
    .then((r) => r[0]);

  if (!categoryRow) {
    const [ins] = await db
      .insert(expertServiceCategories)
      .values({ name: "Itinerary Planning", isDefault: true, sortOrder: 1 })
      .returning({ id: expertServiceCategories.id });
    categoryRow = ins;
  }
  const fallbackCategoryId = categoryRow.id;

  // ── Backfill service_templates → ESO ─────────────────────────────────────
  // All active rows. isDefault=true: these are admin-managed templates.
  try {
    const stRows = await db
      .select()
      .from(serviceTemplates)
      .where(eq(serviceTemplates.isActive, true));

    if (stRows.length > 0) {
      const alreadyMigrated = new Set(
        (
          await db
            .select({ externalId: expertServiceOfferings.externalId })
            .from(expertServiceOfferings)
            .where(
              inArray(
                expertServiceOfferings.externalId,
                stRows.map((r) => r.id)
              )
            )
        ).map((r) => r.externalId)
      );

      for (const st of stRows) {
        if (alreadyMigrated.has(st.id)) continue;
        await db.insert(expertServiceOfferings).values({
          categoryId: fallbackCategoryId,
          name: st.title,
          description: st.description ?? undefined,
          price: st.suggestedPrice ?? "0",
          isDefault: true,
          sortOrder: (st.sortOrder ?? 0) + 200,
          expertId: null,
          externalId: st.id,
        });
        stMigrated++;
      }
    }

    if (stMigrated > 0) {
      console.log(
        `[ESO Backfill] Migrated ${stMigrated} service_templates row(s) → expert_service_offerings.`
      );
    }
  } catch (err) {
    console.warn("[ESO Backfill] service_templates migration failed (non-fatal):", err);
  }

  // ── Backfill ALL expert_custom_services → ESO ────────────────────────────
  // ALL rows regardless of status (draft/submitted/approved/rejected) and isActive flag.
  // Workflow fields (status, submittedAt, reviewedAt, reviewedBy, rejectionReason, etc.)
  // are preserved so ESO is the complete canonical record after migration.
  // isDefault=false: expert offerings are not template-picker starting points.
  try {
    const allCustom = await db
      .select()
      .from(expertCustomServices);

    if (allCustom.length > 0) {
      const alreadyMigrated = new Set(
        (
          await db
            .select({ externalId: expertServiceOfferings.externalId })
            .from(expertServiceOfferings)
            .where(
              inArray(
                expertServiceOfferings.externalId,
                allCustom.map((r) => r.id)
              )
            )
        ).map((r) => r.externalId)
      );

      for (const cs of allCustom) {
        if (alreadyMigrated.has(cs.id)) continue;
        const catId = cs.existingCategoryId ?? fallbackCategoryId;
        await db.insert(expertServiceOfferings).values({
          categoryId:         catId,
          name:               cs.title,
          description:        cs.description ?? null,
          price:              cs.price,
          isDefault:          false,
          sortOrder:          300,
          expertId:           cs.expertId,
          externalId:         cs.id,
          categoryName:       cs.categoryName ?? null,
          // Preserve all workflow lifecycle fields
          status:             cs.status ?? "draft",
          submittedAt:        cs.submittedAt ?? null,
          reviewedAt:         cs.reviewedAt ?? null,
          reviewedBy:         cs.reviewedBy ?? null,
          rejectionReason:    cs.rejectionReason ?? null,
          // Preserve service detail fields
          duration:           cs.duration ?? null,
          deliverables:       (cs.deliverables as any) ?? [],
          cancellationPolicy: cs.cancellationPolicy ?? null,
          leadTime:           cs.leadTime ?? null,
          imageUrl:           cs.imageUrl ?? null,
          galleryImages:      (cs.galleryImages as any) ?? [],
          experienceTypes:    (cs.experienceTypes as any) ?? [],
          isActive:           cs.isActive ?? true,
        });
        customMigrated++;
      }
    }

    if (customMigrated > 0) {
      console.log(
        `[ESO Backfill] Migrated ${customMigrated} expert_custom_services row(s) → expert_service_offerings.`
      );
    }
  } catch (err) {
    console.warn("[ESO Backfill] expert_custom_services migration failed (non-fatal):", err);
  }

  return { stMigrated, customMigrated };
}

// Allow standalone execution: npx tsx server/migrations/run-eso-backfill.ts
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runEsoBackfill()
    .then(({ stMigrated, customMigrated }) => {
      console.log(
        `[ESO Backfill] Done. service_templates: ${stMigrated}, expert_custom_services: ${customMigrated}`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("[ESO Backfill] Fatal error:", err);
      process.exit(1);
    });
}
