/**
 * CONTENT SOURCE REGISTRY — the ONE writer of `content_sources` (content sourcing brief §5; A6
 * decisions 1B + 2A; ledger `2026-10-01-a6-registry-surface`). A source is added by an admin
 * through a surface, never by a deploy or a seed script.
 *
 *   create      any admin; born `active = false` with NO terms check; `added_by` = the session.
 *   edit        any admin; a general edit STRIPS `terms_checked_at`, `terms_checked_by`, `active`,
 *               `added_by` and `id` (zod's default strip — §19 posture, the fields are simply not in
 *               the pick). An edit that changes WHAT the terms check covered — `homepage`,
 *               `terms_url`, `license_class` or `adapter` — clears the check and deactivates the row
 *               in the same statement, so a stale check never vouches for new terms.
 *   activate    ONE allowlisted user (config); stamps `terms_checked_at = now()`,
 *               `terms_checked_by = session` and `active = true` in ONE atomic conditional that also
 *               requires a license class and a non-empty `covers` (`canActivateSource`'s rule, in SQL).
 *   deactivate  any admin; the safe direction. The terms check stays on the row as history.
 *   public_ok   ruling R-p (ledger `2026-10-03-official-facts-public-ok`, migration 341): the SAME
 *               allowlisted activator answers "may this source's facts appear on public pages", in
 *               ONE atomic conditional that requires `license_class = 'official'` AND a terms check
 *               on the row, and stamps `public_ok_checked_at = now()` / `_by = session`. A general
 *               edit never sets it (not in the pick), and an edit that clears the terms check clears
 *               the answer with it — a stale answer never vouches for new terms.
 *
 * `covers` / `does_not_cover` admit only needs and named sub-needs (`admitNeedList`); free text is
 * refused by name. `does_not_cover` is mandatory (brief §5: gaps are data) — an empty list is an
 * answer, an absent one is not.
 */
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { contentSources } from "@shared/schema";
import { LICENSE_CLASSES, SOURCE_ADAPTERS, admitNeedList, canActivateSource } from "@shared/content-facts";
import { mayActivateContentSource } from "../config/content-sources.config";

export class ContentSourceError extends Error {
  constructor(public readonly code: string, public readonly status: number, public readonly details?: Record<string, unknown>) {
    super(code);
  }
}

const needList = z.array(z.string().max(80)).max(30);
const urlish = z.string().trim().url().max(2000);

const editable = {
  name: z.string().trim().min(1).max(200),
  homepage: urlish.nullable(),
  market: z.string().trim().toLowerCase().min(1).max(64).nullable(),
  adapter: z.enum(SOURCE_ADAPTERS),
  covers: needList,
  doesNotCover: needList,
  licenseClass: z.enum(LICENSE_CLASSES),
  termsUrl: urlish.nullable(),
  robotsOk: z.boolean().nullable(),
  refreshIntervalDays: z.number().int().min(1).max(3650).nullable(),
  costCeilingCentsPerDay: z.number().int().min(0).max(10_000_000).nullable(),
  notes: z.string().max(4000).nullable(),
};

/** Create: `.strict()` — a create naming a terms or activation field is refused, not trimmed. */
export const createContentSourceBody = z.object({
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9_]{1,63}$/, "lower-case letters, digits and underscores"),
  name: editable.name,
  homepage: editable.homepage.optional(),
  market: editable.market.optional(),
  adapter: editable.adapter,
  covers: editable.covers.min(1),
  doesNotCover: editable.doesNotCover,
  licenseClass: editable.licenseClass,
  termsUrl: editable.termsUrl.optional(),
  robotsOk: editable.robotsOk.optional(),
  refreshIntervalDays: editable.refreshIntervalDays.optional(),
  costCeilingCentsPerDay: editable.costCeilingCentsPerDay.optional(),
  notes: editable.notes.optional(),
}).strict();

/** Edit: zod's default STRIP — terms/activation/identity fields are dropped, never written. */
export const editContentSourceBody = z.object({
  name: editable.name.optional(),
  homepage: editable.homepage.optional(),
  market: editable.market.optional(),
  adapter: editable.adapter.optional(),
  covers: editable.covers.min(1).optional(),
  doesNotCover: editable.doesNotCover.optional(),
  licenseClass: editable.licenseClass.optional(),
  termsUrl: editable.termsUrl.optional(),
  robotsOk: editable.robotsOk.optional(),
  refreshIntervalDays: editable.refreshIntervalDays.optional(),
  costCeilingCentsPerDay: editable.costCeilingCentsPerDay.optional(),
  notes: editable.notes.optional(),
});

/** The fields a terms check vouches for: changing one clears the check and deactivates. */
export const TERMS_BOUND_FIELDS = ["homepage", "termsUrl", "licenseClass", "adapter"] as const;

function admitNeeds(field: "covers" | "doesNotCover", v: string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  const r = admitNeedList(v);
  if (!r.ok) throw new ContentSourceError("unknown_need", 400, { field, refused: r.refused });
  return r.needs;
}

function zodFail(err: z.ZodError): ContentSourceError {
  return new ContentSourceError("invalid_body", 400, { issues: err.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`) });
}

export type ContentSourceRow = typeof contentSources.$inferSelect;

export async function listContentSources(): Promise<ContentSourceRow[]> {
  return db.select().from(contentSources).orderBy(asc(contentSources.market), asc(contentSources.id));
}

export async function createContentSource(body: unknown, actorId: string): Promise<ContentSourceRow> {
  const parsed = createContentSourceBody.safeParse(body);
  if (!parsed.success) throw zodFail(parsed.error);
  const b = parsed.data;
  const covers = admitNeeds("covers", b.covers)!;
  const doesNotCover = admitNeeds("doesNotCover", b.doesNotCover)!;
  const [row] = await db
    .insert(contentSources)
    .values({
      id: b.id,
      name: b.name,
      homepage: b.homepage ?? null,
      market: b.market ?? null,
      adapter: b.adapter,
      covers,
      doesNotCover,
      licenseClass: b.licenseClass,
      termsUrl: b.termsUrl ?? null,
      termsCheckedAt: null,
      termsCheckedBy: null,
      robotsOk: b.robotsOk ?? null,
      refreshIntervalDays: b.refreshIntervalDays ?? null,
      costCeilingCentsPerDay: b.costCeilingCentsPerDay ?? null,
      active: false,
      addedBy: actorId,
      notes: b.notes ?? null,
    })
    .onConflictDoNothing({ target: contentSources.id })
    .returning();
  if (!row) throw new ContentSourceError("id_taken", 409);
  return row;
}

export async function editContentSource(id: string, body: unknown): Promise<ContentSourceRow> {
  const parsed = editContentSourceBody.safeParse(body);
  if (!parsed.success) throw zodFail(parsed.error);
  const b = parsed.data;
  const covers = admitNeeds("covers", b.covers);
  const doesNotCover = admitNeeds("doesNotCover", b.doesNotCover);

  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(contentSources).where(eq(contentSources.id, id)).for("update");
    if (!cur) throw new ContentSourceError("not_found", 404);
    const set: Partial<typeof contentSources.$inferInsert> = {};
    for (const [k, v] of Object.entries(b)) if (v !== undefined) (set as any)[k] = v;
    if (covers) set.covers = covers;
    if (doesNotCover) set.doesNotCover = doesNotCover;
    const termsMoved = TERMS_BOUND_FIELDS.some((f) => f in set && (set as any)[f] !== (cur as any)[f]);
    if (termsMoved) {
      set.termsCheckedAt = null;
      set.termsCheckedBy = null;
      set.active = false;
      // The public answer was given against the old terms (ruling R-p): it goes with them.
      set.publicOk = null;
      set.publicOkCheckedAt = null;
      set.publicOkCheckedBy = null;
    }
    if (Object.keys(set).length === 0) return cur;
    const [row] = await tx.update(contentSources).set(set).where(eq(contentSources.id, id)).returning();
    return row;
  });
}

/**
 * Activation IS the terms check (2A). One atomic conditional: the row must carry a license class
 * and a non-empty `covers`; `terms_checked_at` is the database's own `now()`, never a body field.
 */
export async function activateContentSource(id: string, actorId: string | null): Promise<ContentSourceRow> {
  if (!mayActivateContentSource(actorId)) throw new ContentSourceError("not_activator", 403);
  const [row] = await db
    .update(contentSources)
    .set({ active: true, termsCheckedAt: sql`now()`, termsCheckedBy: actorId })
    .where(sql`${contentSources.id} = ${id}
      AND ${contentSources.licenseClass} IN (${sql.join(LICENSE_CLASSES.map((c) => sql`${c}`), sql`, `)})
      AND cardinality(${contentSources.covers}) > 0`)
    .returning();
  if (row) {
    // Belt and braces: the shared predicate agrees with the statement, or the row is reported.
    if (!canActivateSource(row)) throw new ContentSourceError("activation_inconsistent", 500);
    return row;
  }
  const [cur] = await db.select().from(contentSources).where(eq(contentSources.id, id));
  if (!cur) throw new ContentSourceError("not_found", 404);
  throw new ContentSourceError("not_activatable", 409, { reason: "needs a license class and at least one covered need" });
}

/** The body of the public_ok rail: exactly one boolean (§19 — `.strict()`, nothing else admitted). */
export const publicOkBody = z.object({ publicOk: z.boolean() }).strict();

/**
 * Ruling R-p: record whether an OFFICIAL, terms-checked source's facts may appear on public pages.
 * ONE atomic conditional (§15): the row must be `official` and carry a terms check IN THE SAME
 * STATEMENT, so a concurrent edit that clears the check cannot be overtaken. `false` is recorded
 * too, with who and when — "answered no" is a different fact from "never answered" (NULL).
 */
export async function setContentSourcePublicOk(id: string, body: unknown, actorId: string | null): Promise<ContentSourceRow> {
  if (!mayActivateContentSource(actorId)) throw new ContentSourceError("not_activator", 403);
  const parsed = publicOkBody.safeParse(body);
  if (!parsed.success) throw zodFail(parsed.error);
  const [row] = await db
    .update(contentSources)
    .set({ publicOk: parsed.data.publicOk, publicOkCheckedAt: sql`now()`, publicOkCheckedBy: actorId })
    .where(sql`${contentSources.id} = ${id}
      AND ${contentSources.licenseClass} = 'official'
      AND ${contentSources.termsCheckedAt} IS NOT NULL`)
    .returning();
  if (row) return row;
  const [cur] = await db.select().from(contentSources).where(eq(contentSources.id, id));
  if (!cur) throw new ContentSourceError("not_found", 404);
  throw new ContentSourceError("not_public_eligible", 409, {
    reason: cur.licenseClass !== "official" ? "license class is not official" : "terms not checked",
  });
}

export async function deactivateContentSource(id: string): Promise<ContentSourceRow> {
  const [row] = await db.update(contentSources).set({ active: false }).where(eq(contentSources.id, id)).returning();
  if (!row) throw new ContentSourceError("not_found", 404);
  return row;
}
