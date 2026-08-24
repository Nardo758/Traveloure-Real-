/**
 * dmo-registry-sync.service.ts — registers DMO/scraped research content into the central
 * content_registry as the 'sourced' origin (approach A, migration 132).
 *
 * DMO content lives in `dmo_raw_content` (its working store + the Expert Workspace read path). This
 * service mirrors each DMO row into `content_registry` so the platform has ONE content system with a
 * complete origin taxonomy (platform / affiliate / sourced) for admin visibility, reporting, and
 * tracking-number lineage.
 *
 * HARD INVARIANT (§10 DMO model, ratified): 'sourced' content is EXPERT-WORKSPACE-ONLY. It must NEVER
 * surface to travelers — the traveler resolver (`content-query.service.ts`) hard-excludes sourced
 * origin, and no SURFACE_DEFAULT_CONTENT_TYPES lists 'dmo_content'. Registering it centrally does NOT
 * make it traveler-visible; it becomes a Discover surface only after an expert transforms it into a
 * platform-origin trip / Ready Made Trip (which then rides the §10 approval queue).
 *
 * Idempotent: a DMO row already registered (by contentId) is not duplicated; its central status is
 * kept in sync with `expert_workspace_visible`.
 */
import { db } from "../db";
import { dmoRawContent } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { storage } from "../storage";

/** Register (or refresh) one DMO row into content_registry as 'dmo_content'. Returns 'created' | 'updated' | 'skipped'. */
async function registerOne(row: typeof dmoRawContent.$inferSelect): Promise<"created" | "updated"> {
  // Central status mirrors expert visibility: visible-in-library → 'published' (to experts, gated by
  // origin), else 'draft'. This is NEVER a traveler-published state (sourced is excluded downstream).
  const status = row.expertWorkspaceVisible ? ("published" as const) : ("draft" as const);
  const existing = await storage.getContentByContentId(row.id, "dmo_content");
  if (existing) {
    // Keep title/status in sync with the DMO row (targeted registry update — storage has no generic one).
    await db.execute(
      sql`UPDATE content_registry
        SET title = ${row.name}, status = ${status}, updated_at = NOW()
        WHERE content_id = ${row.id} AND content_type = 'dmo_content'`,
    );
    return "updated";
  }
  await storage.registerContent({
    contentType: "dmo_content",
    contentId: row.id,
    title: row.name,
    description: row.shortDescription || row.description || undefined,
    status,
    metadata: {
      origin: "sourced",
      city: row.city,
      country: row.country,
      neighborhood: row.neighborhood ?? null,
      dmoContentType: row.contentType,
      dmoStatus: row.status,
      expertWorkspaceVisible: row.expertWorkspaceVisible,
    },
  } as any);
  return "created";
}

/** Backfill/sync ALL dmo_raw_content into the registry. Idempotent. Best-effort per row. */
export async function syncDmoContentToRegistry(): Promise<{ created: number; updated: number; scanned: number }> {
  const rows = await db.select().from(dmoRawContent);
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    try {
      const r = await registerOne(row);
      if (r === "created") created++;
      else updated++;
    } catch (err) {
      // Best-effort — a single row's failure must not abort the sweep.
      console.warn("[dmo-registry-sync] failed to register", row.id, (err as any)?.message);
    }
  }
  return { created, updated, scanned: rows.length };
}

/** Register a single DMO row by id (used when an admin approves it into the expert library). */
export async function registerDmoContentById(dmoId: string): Promise<void> {
  const [row] = await db.select().from(dmoRawContent).where(eq(dmoRawContent.id, dmoId)).limit(1);
  if (!row) return;
  try {
    await registerOne(row);
  } catch (err) {
    console.warn("[dmo-registry-sync] register-on-approve failed", dmoId, (err as any)?.message);
  }
}
