/**
 * NEIGHBORHOOD CLAIMS — expert field knowledge v2, Phase 1 (claims + typed evidence).
 *
 * ONE service owns every transition of `expert_neighborhood_claims.status`
 * (draft → submitted → scored → verified | declined; declined → submitted on resubmit) and is
 * the ONLY writer of `expert_neighborhoods` (ruling 2026-08-29-neighborhood-claims; Phase 0 D1).
 * Route files are thin callers. Every transition is a §15-style ATOMIC CONDITIONAL — the
 * UPDATE's WHERE is the guard, never a pre-check — and every flip logs to the claim diary in the
 * SAME transaction (neighborhood-claim-transitions.service.ts).
 *
 * Evidence is TYPED ROWS, never prose (ruling 2026-08-29-evidence-is-the-test): at SUBMIT the
 * validated capture is materialized into local_knowledge_nuggets (P1 — the gem-candidate host),
 * mini_slip_templates (P2), claim_contingencies (P3) and access_claims (P4, HELD). Rows carry
 * claim_id + claim_version; a resubmission writes a NEW version's rows and deletes nothing.
 *
 * Ops manual entry (email backfill replies) calls the SAME functions with actorType 'ops' — it is
 * not a bypass; the rows it produces are indistinguishable from console entry except the diary's
 * actor_type.
 *
 * Numbers: none live here. The resubmit cooldown and every pass threshold are read from
 * evidence_thresholds (evidence-thresholds.service.ts); a missing row blocks with
 * `thresholds_missing` (D3 — Ratify included).
 *
 * The scorer (Phase 2) calls markClaimScored / markClaimScorerFailed and NEVER touches
 * expert_neighborhoods — the migration-272 trigger makes that structural, not a convention.
 */
import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  accessClaims,
  cityNeighborhoods,
  claimContingencies,
  expertNeighborhoodClaims,
  expertNeighborhoods,
  localExpertForms,
  localKnowledgeNuggets,
  miniSlipTemplates,
  nuggetPhotos,
  users,
  type ExpertNeighborhoodClaim,
  type NuggetPhoto,
} from "@shared/schema";
import {
  CLAIM_DRAFT_MAX_BYTES,
  DAYPARTS,
  DEFAULT_DAYPART,
  EVIDENCE_DIMENSIONS,
  RETURN_TEMPLATES,
  claimCaptureDraftSchema,
  claimCaptureSubmitSchema,
  normalizeVenueName,
  publicClaimStatus,
  type ClaimActorType,
  type ClaimCaptureSubmit,
  type ClaimStatus,
  type Daypart,
  type EvidenceDimension,
} from "@shared/neighborhood-claims";
import { logClaimTransition } from "./neighborhood-claim-transitions.service";
import { EvidenceThresholdsMissingError, loadEvidenceThresholds } from "./evidence-thresholds.service";

/** The transaction-local GUC the migration-272 trigger requires on expert_neighborhoods INSERTs. */
export const EXPERT_NEIGHBORHOODS_WRITER_SETTING = "traveloure.expert_neighborhoods_writer";

export type ClaimResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 403 | 404 | 409 | 503; code: string; message: string };

const fail = (status: 400 | 403 | 404 | 409 | 503, code: string, message: string): ClaimResult<never> => ({
  ok: false,
  status,
  code,
  message,
});

function isDaypart(v: unknown): v is Daypart {
  return typeof v === "string" && (DAYPARTS as readonly string[]).includes(v);
}

// ── Picker source ─────────────────────────────────────────────────────────────────────────────

export interface NeighborhoodOption {
  id: string;
  name: string;
  slug: string;
  city: string;
  country: string;
  daypart: Daypart;
}

/** city_neighborhoods rows for a city (case-insensitive; country narrows when given). */
export async function listNeighborhoodOptions(city: string, country?: string | null): Promise<NeighborhoodOption[]> {
  const c = city.trim();
  if (!c) return [];
  const rows = await db
    .select({
      id: cityNeighborhoods.id,
      name: cityNeighborhoods.name,
      slug: cityNeighborhoods.slug,
      city: cityNeighborhoods.city,
      country: cityNeighborhoods.country,
      defaultDaypart: cityNeighborhoods.defaultDaypart,
    })
    .from(cityNeighborhoods)
    .where(
      country && country.trim()
        ? and(ilike(cityNeighborhoods.city, c), ilike(cityNeighborhoods.country, country.trim()))
        : ilike(cityNeighborhoods.city, c),
    )
    .orderBy(asc(cityNeighborhoods.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    city: r.city,
    country: r.country,
    daypart: isDaypart(r.defaultDaypart) ? r.defaultDaypart : DEFAULT_DAYPART,
  }));
}

// ── Expert-facing read ────────────────────────────────────────────────────────────────────────

/**
 * What an expert may see about their own claim. NO scores, dimensions, or internal statuses:
 * `status` is the public word (claimed|verified); a returned claim carries the §5 one-sentence
 * message derived from the admin-picked dimension — never a number.
 */
export interface ExpertClaimView {
  id: string;
  neighborhoodId: string;
  neighborhoodName: string;
  city: string;
  daypart: Daypart;
  status: "claimed" | "verified";
  version: number;
  /** true while the expert can still edit (never submitted, or returned for edits). */
  canEdit: boolean;
  /** true when this claim has been sent in and is with us (submitted/scored). */
  awaitingReview: boolean;
  /** §5 message when the claim was returned for edits; null otherwise. */
  returnMessage: string | null;
  draftCapture: unknown | null;
  submittedAt: Date | null;
  verifiedAt: Date | null;
}

function toExpertView(row: ExpertNeighborhoodClaim, neighborhoodName: string, city: string): ExpertClaimView {
  const status = row.status as ClaimStatus;
  const dim = row.declinedDimension as EvidenceDimension | null;
  const returnMessage =
    status === "declined" && dim && (EVIDENCE_DIMENSIONS as readonly string[]).includes(dim)
      ? RETURN_TEMPLATES[dim](neighborhoodName)
      : status === "declined"
        ? RETURN_TEMPLATES.specificity(neighborhoodName)
        : null;
  return {
    id: row.id,
    neighborhoodId: row.neighborhoodId,
    neighborhoodName,
    city,
    daypart: isDaypart(row.daypart) ? row.daypart : DEFAULT_DAYPART,
    status: publicClaimStatus(status),
    version: row.version,
    canEdit: status === "draft" || status === "declined",
    awaitingReview: status === "submitted" || status === "scored",
    returnMessage,
    draftCapture: row.draftCapture ?? null,
    submittedAt: row.submittedAt ?? null,
    verifiedAt: row.ratifiedAt ?? null,
  };
}

export async function listClaimsForExpert(expertId: string): Promise<ExpertClaimView[]> {
  const rows = await db
    .select({ claim: expertNeighborhoodClaims, name: cityNeighborhoods.name, city: cityNeighborhoods.city })
    .from(expertNeighborhoodClaims)
    .innerJoin(cityNeighborhoods, eq(cityNeighborhoods.id, expertNeighborhoodClaims.neighborhoodId))
    .where(eq(expertNeighborhoodClaims.expertId, expertId))
    .orderBy(asc(cityNeighborhoods.name));
  return rows.map((r) => toExpertView(r.claim, r.name, r.city));
}

// ── Create (claim = the expert's word; unclaimed stays dark) ──────────────────────────────────

export async function createClaim(opts: {
  expertId: string;
  neighborhoodId: string;
  actorType: ClaimActorType;
  actorId: string | null;
}): Promise<ClaimResult<{ claim: ExpertNeighborhoodClaim; created: boolean }>> {
  const [nb] = await db
    .select({ id: cityNeighborhoods.id, defaultDaypart: cityNeighborhoods.defaultDaypart })
    .from(cityNeighborhoods)
    .where(eq(cityNeighborhoods.id, opts.neighborhoodId))
    .limit(1);
  if (!nb) return fail(404, "neighborhood_not_found", "That neighborhood is not in our catalog yet");
  const daypart: Daypart = isDaypart(nb.defaultDaypart) ? nb.defaultDaypart : DEFAULT_DAYPART;

  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(expertNeighborhoodClaims)
      .values({ expertId: opts.expertId, neighborhoodId: opts.neighborhoodId, status: "draft", daypart, version: 1 })
      .onConflictDoNothing({ target: [expertNeighborhoodClaims.expertId, expertNeighborhoodClaims.neighborhoodId] })
      .returning();
    if (inserted) {
      await logClaimTransition(tx, {
        claimId: inserted.id,
        claimVersion: 1,
        fromStatus: null,
        toStatus: "draft",
        actorType: opts.actorType,
        actorId: opts.actorId,
      });
      return { ok: true as const, value: { claim: inserted, created: true } };
    }
    const [existing] = await tx
      .select()
      .from(expertNeighborhoodClaims)
      .where(and(eq(expertNeighborhoodClaims.expertId, opts.expertId), eq(expertNeighborhoodClaims.neighborhoodId, opts.neighborhoodId)))
      .limit(1);
    return { ok: true as const, value: { claim: existing!, created: false } };
  });
}

// ── Save-and-finish-later ─────────────────────────────────────────────────────────────────────

export async function saveDraftCapture(opts: {
  claimId: string;
  /** Owner check when the caller is the expert; null for ops (who may edit any unsubmitted claim). */
  expertId: string | null;
  payload: unknown;
}): Promise<ClaimResult<ExpertNeighborhoodClaim>> {
  const parsed = claimCaptureDraftSchema.safeParse(opts.payload);
  if (!parsed.success) return fail(400, "invalid_capture", parsed.error.errors[0]?.message ?? "Invalid capture");
  if (Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > CLAIM_DRAFT_MAX_BYTES) {
    return fail(400, "capture_too_large", "That draft is too large to save");
  }
  const [row] = await db
    .update(expertNeighborhoodClaims)
    .set({ draftCapture: parsed.data, updatedAt: new Date() })
    .where(
      and(
        eq(expertNeighborhoodClaims.id, opts.claimId),
        inArray(expertNeighborhoodClaims.status, ["draft", "declined"]),
        ...(opts.expertId ? [eq(expertNeighborhoodClaims.expertId, opts.expertId)] : []),
      ),
    )
    .returning();
  if (!row) return fail(409, "not_editable", "This claim is with us for review and can't be edited right now");
  return { ok: true, value: row };
}

// ── Submit: validate → materialize typed rows → flip, all in one transaction ─────────────────

function firstZodMessage(err: z.ZodError): string {
  const i = err.errors[0];
  if (!i) return "Please complete every required answer";
  const path = i.path.join(".");
  return path ? `${path}: ${i.message}` : i.message;
}

export async function submitClaim(opts: {
  claimId: string;
  expertId: string | null;
  actorType: ClaimActorType;
  actorId: string | null;
  /** Expert consent tick (console) or ops attestation that the reply carried it (manual entry). */
  consent: boolean;
  consentVersion: string;
  /** When omitted, the stored draft_capture is what gets validated and materialized. */
  capture?: unknown;
}): Promise<ClaimResult<ExpertNeighborhoodClaim>> {
  if (!opts.consent) return fail(400, "consent_required", "Please confirm you're happy for us to use what you share");

  try {
    return await db.transaction(async (tx) => {
      const [claim] = await tx
        .select()
        .from(expertNeighborhoodClaims)
        .where(
          and(
            eq(expertNeighborhoodClaims.id, opts.claimId),
            ...(opts.expertId ? [eq(expertNeighborhoodClaims.expertId, opts.expertId)] : []),
          ),
        )
        .for("update")
        .limit(1);
      if (!claim) return fail(404, "claim_not_found", "Claim not found");
      const from = claim.status as ClaimStatus;
      if (from !== "draft" && from !== "declined") {
        return fail(409, "not_editable", "This claim has already been sent in");
      }

      const parsed = claimCaptureSubmitSchema.safeParse(opts.capture ?? claim.draftCapture ?? {});
      if (!parsed.success) return fail(400, "incomplete_capture", firstZodMessage(parsed.error));
      const capture: ClaimCaptureSubmit = parsed.data;

      let version = claim.version;
      if (from === "declined") {
        // Resubmission: once per `resubmit_cooldown_days` (companion §5) — the number lives ONLY in
        // evidence_thresholds; a missing row blocks rather than defaulting.
        const thresholds = await loadEvidenceThresholds(tx);
        const declinedAt = claim.declinedAt ? new Date(claim.declinedAt).getTime() : 0;
        const notBefore = declinedAt + thresholds.resubmit_cooldown_days * 24 * 60 * 60 * 1000;
        if (Date.now() < notBefore) {
          return fail(409, "resubmit_cooldown", `Edits can be sent again from ${new Date(notBefore).toISOString().slice(0, 10)}`);
        }
        version = claim.version + 1;
      }

      const [nb] = await tx
        .select({ name: cityNeighborhoods.name, city: cityNeighborhoods.city })
        .from(cityNeighborhoods)
        .where(eq(cityNeighborhoods.id, claim.neighborhoodId))
        .limit(1);
      if (!nb) return fail(404, "neighborhood_not_found", "That neighborhood is not in our catalog yet");
      const daypart: Daypart = isDaypart(claim.daypart) ? claim.daypart : DEFAULT_DAYPART;

      // P1 → local_knowledge_nuggets (the gem-candidate host) + depth columns.
      for (const entry of capture.p1) {
        await tx.insert(localKnowledgeNuggets).values({
          expertUserId: claim.expertId,
          nuggetType: "recommendation",
          city: nb.city,
          linkedPoi: entry.name,
          linkedNeighbourhood: nb.name,
          insight: entry.doThis,
          seasonality: entry.when.season ? [entry.when.season] : [],
          claimId: claim.id,
          claimVersion: version,
          neighborhoodId: claim.neighborhoodId,
          placeCategory: entry.category || null,
          whenJson: entry.when,
          watchOut: entry.watchOut,
          priceBand: entry.priceBand ?? null,
          expertConfidence: entry.expertConfidence ?? null,
          normalizedName: normalizeVenueName(entry.name),
        });
      }

      // P2 → mini_slip_templates (item-shaped, no trip).
      const [template] = await tx
        .insert(miniSlipTemplates)
        .values({
          claimId: claim.id,
          claimVersion: version,
          expertId: claim.expertId,
          neighborhoodId: claim.neighborhoodId,
          daypart,
          items: capture.p2.items.map((it, i) => ({
            position: i + 1,
            name: it.name,
            normalizedName: normalizeVenueName(it.name),
            durationMin: it.durationMin,
            transition: i === 0 ? null : (it.transition ?? null),
          })),
          orderReason: capture.p2.orderReason,
          hardConstraints: capture.p2.hardConstraints,
        })
        .returning();

      // P3 → claim_contingencies keyed to the P2 row.
      await tx.insert(claimContingencies).values({
        miniSlipTemplateId: template.id,
        claimId: claim.id,
        claimVersion: version,
        expertId: claim.expertId,
        trigger: capture.p3.trigger,
        replacesPosition: capture.p3.replacesPosition,
        alternate: {
          name: capture.p3.alternate.name,
          normalizedName: normalizeVenueName(capture.p3.alternate.name),
          durationMin: capture.p3.alternate.durationMin,
          transition: capture.p3.alternate.transition ?? null,
        },
        reason: capture.p3.reason,
      });

      // P4 → access_claims (HELD — ruling 2026-09-01-access-claims-held).
      for (const a of capture.p4) {
        await tx.insert(accessClaims).values({
          claimId: claim.id,
          claimVersion: version,
          expertId: claim.expertId,
          venue: a.venue,
          normalizedName: normalizeVenueName(a.venue),
          accessType: a.accessType,
          relationshipBasis: a.relationshipBasis || null,
          verificationStatus: "held",
        });
      }

      const now = new Date();
      const [flipped] = await tx
        .update(expertNeighborhoodClaims)
        .set({
          status: "submitted",
          version,
          draftCapture: capture, // the last-submitted answers, so a returned claim edits in place
          submittedAt: now,
          consentAt: now,
          consentVersion: opts.consentVersion.slice(0, 40),
          scorerJson: null,
          scorerFailed: false,
          scorerFailedReason: null,
          scoredAt: null,
          updatedAt: now,
        })
        .where(and(eq(expertNeighborhoodClaims.id, claim.id), eq(expertNeighborhoodClaims.status, from)))
        .returning();
      if (!flipped) {
        // A concurrent submit won the row lock race — roll back our evidence rows with the tx.
        throw new ConcurrentClaimWrite();
      }
      await logClaimTransition(tx, {
        claimId: claim.id,
        claimVersion: version,
        fromStatus: from,
        toStatus: "submitted",
        actorType: opts.actorType,
        actorId: opts.actorId,
      });
      return { ok: true as const, value: flipped };
    });
  } catch (err) {
    if (err instanceof EvidenceThresholdsMissingError) {
      return fail(503, err.code, "Review settings are not configured — ops has been notified");
    }
    if (err instanceof ConcurrentClaimWrite) return fail(409, "not_editable", "This claim was just sent in");
    throw err;
  }
}

class ConcurrentClaimWrite extends Error {}

// ── Scorer hooks (Phase 2 calls these; they never touch expert_neighborhoods) ────────────────

export async function markClaimScored(opts: {
  claimId: string;
  version: number;
  scorerJson: Record<string, unknown>;
}): Promise<ClaimResult<ExpertNeighborhoodClaim>> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(expertNeighborhoodClaims)
      .set({ status: "scored", scorerJson: opts.scorerJson, scorerFailed: false, scorerFailedReason: null, scoredAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(expertNeighborhoodClaims.id, opts.claimId),
          eq(expertNeighborhoodClaims.status, "submitted"),
          eq(expertNeighborhoodClaims.version, opts.version),
        ),
      )
      .returning();
    if (!row) return fail(409, "not_scorable", "Claim is not awaiting scoring at this version");
    await logClaimTransition(tx, { claimId: row.id, claimVersion: row.version, fromStatus: "submitted", toStatus: "scored", actorType: "scorer", actorId: null });
    return { ok: true as const, value: row };
  });
}

/** Malformed scorer output: the claim STAYS submitted, flagged — never silently zeroed. */
export async function markClaimScorerFailed(opts: { claimId: string; version: number; reason: string }): Promise<boolean> {
  const [row] = await db
    .update(expertNeighborhoodClaims)
    .set({ scorerFailed: true, scorerFailedReason: opts.reason.slice(0, 60), updatedAt: new Date() })
    .where(
      and(
        eq(expertNeighborhoodClaims.id, opts.claimId),
        eq(expertNeighborhoodClaims.status, "submitted"),
        eq(expertNeighborhoodClaims.version, opts.version),
      ),
    )
    .returning({ id: expertNeighborhoodClaims.id });
  return !!row;
}

// ── Admin: the two actions. Ratify is THE writer of expert_neighborhoods. ───────────────────

export async function ratifyClaim(opts: {
  claimId: string;
  /** The admin; null only for the sanctioned dev demo seed (actorType 'seed'). */
  adminId: string | null;
  actorType?: Extract<ClaimActorType, "admin" | "seed">;
}): Promise<ClaimResult<{ claim: ExpertNeighborhoodClaim; neighborhoodRowId: string }>> {
  const actorType = opts.actorType ?? "admin";
  try {
    return await db.transaction(async (tx) => {
      // D3: an admin cannot verify against numbers that don't exist — thresholds must load.
      await loadEvidenceThresholds(tx);

      const now = new Date();
      const [claim] = await tx
        .update(expertNeighborhoodClaims)
        .set({ status: "verified", ratifiedAt: now, ratifiedBy: opts.adminId, declinedDimension: null, updatedAt: now })
        .where(and(eq(expertNeighborhoodClaims.id, opts.claimId), eq(expertNeighborhoodClaims.status, "scored")))
        .returning();
      if (!claim) return fail(409, "not_ratifiable", "Claim is not awaiting a decision");

      // The one sanctioned INSERT into expert_neighborhoods: transaction-local GUC, checked by the
      // migration-272 BEFORE INSERT trigger. `is_lead` is untouched here (admin curation, UPDATE only).
      await tx.execute(sql`SELECT set_config(${EXPERT_NEIGHBORHOODS_WRITER_SETTING}, 'ratify', true)`);
      const [nbRow] = await tx
        .insert(expertNeighborhoods)
        .values({
          expertId: claim.expertId,
          neighborhoodId: claim.neighborhoodId,
          isLead: false,
          sortOrder: 0,
          claimId: claim.id,
          verifiedAt: now,
          ratifiedBy: opts.adminId,
        })
        .onConflictDoUpdate({
          target: [expertNeighborhoods.expertId, expertNeighborhoods.neighborhoodId],
          set: { claimId: claim.id, verifiedAt: now, ratifiedBy: opts.adminId, updatedAt: now },
        })
        .returning({ id: expertNeighborhoods.id });

      await logClaimTransition(tx, { claimId: claim.id, claimVersion: claim.version, fromStatus: "scored", toStatus: "verified", actorType, actorId: opts.adminId });
      return { ok: true as const, value: { claim, neighborhoodRowId: nbRow.id } };
    });
  } catch (err) {
    if (err instanceof EvidenceThresholdsMissingError) {
      return fail(503, err.code, "Review settings are not configured — ratification is blocked until they are");
    }
    throw err;
  }
}

/** Return for edits: the admin picks the weakest dimension; the §5 message is derived, never typed. */
export async function declineClaim(opts: {
  claimId: string;
  adminId: string;
  dimension: EvidenceDimension;
}): Promise<ClaimResult<ExpertNeighborhoodClaim>> {
  if (!(EVIDENCE_DIMENSIONS as readonly string[]).includes(opts.dimension)) {
    return fail(400, "invalid_dimension", "dimension must be one of the rubric dimensions");
  }
  return db.transaction(async (tx) => {
    const now = new Date();
    const [row] = await tx
      .update(expertNeighborhoodClaims)
      .set({ status: "declined", declinedAt: now, declinedDimension: opts.dimension, updatedAt: now })
      .where(and(eq(expertNeighborhoodClaims.id, opts.claimId), eq(expertNeighborhoodClaims.status, "scored")))
      .returning();
    if (!row) return fail(409, "not_declinable", "Claim is not awaiting a decision");
    await logClaimTransition(tx, { claimId: row.id, claimVersion: row.version, fromStatus: "scored", toStatus: "declined", actorType: "admin", actorId: opts.adminId });
    return { ok: true as const, value: row };
  });
}

// ── D5 (amended): the honest skip stamp ─────────────────────────────────────────────────────

/**
 * At application submit: when the picker had NO city_neighborhoods rows for the applicant's city
 * and the applicant holds no claim, stamp `no_neighborhoods_available_at` so ops can backfill the
 * claim when that market's rows land. Server-derived; idempotent (stamps once). Returns whether
 * the stamp was written.
 */
export async function stampNoNeighborhoodsAvailable(opts: { formId: string; userId: string; city: string | null }): Promise<boolean> {
  if (!opts.city || !opts.city.trim()) return false;
  const options = await listNeighborhoodOptions(opts.city);
  if (options.length > 0) return false;
  const [anyClaim] = await db
    .select({ id: expertNeighborhoodClaims.id })
    .from(expertNeighborhoodClaims)
    .where(eq(expertNeighborhoodClaims.expertId, opts.userId))
    .limit(1);
  if (anyClaim) return false;
  const [row] = await db
    .update(localExpertForms)
    .set({ noNeighborhoodsAvailableAt: new Date() })
    .where(and(eq(localExpertForms.id, opts.formId), sql`${localExpertForms.noNeighborhoodsAvailableAt} IS NULL`))
    .returning({ id: localExpertForms.id });
  return !!row;
}

// ── Ops helpers ─────────────────────────────────────────────────────────────────────────────

/** Expert picker for the ops manual-entry form: local-expert applicants by name/email. */
export async function searchExpertsForManualEntry(q: string): Promise<Array<{ id: string; name: string; email: string | null; city: string | null }>> {
  const needle = `%${q.trim()}%`;
  if (q.trim().length < 2) return [];
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      city: localExpertForms.city,
    })
    .from(users)
    .innerJoin(localExpertForms, eq(localExpertForms.userId, users.id))
    .where(sql`(${users.email} ILIKE ${needle} OR ${users.firstName} ILIKE ${needle} OR ${users.lastName} ILIKE ${needle})`)
    .orderBy(asc(users.lastName), asc(users.firstName))
    .limit(20);
  return rows.map((r) => ({ id: r.id, name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || r.id, email: r.email ?? null, city: r.city ?? null }));
}

// ── nugget_photos: THE read path, carrying the consent invariant ────────────────────────────

/**
 * The ONE way photos leave nugget_photos for any public or non-owner surface (ported from #698;
 * ledger 2026-09-02-field-knowledge-v2-canonical). Every returned row is joined through
 *   nugget_photos → local_knowledge_nuggets.claim_id → expert_neighborhood_claims.consent_at IS NOT NULL
 * so a photo on a nugget with no claim (no consent anchor), or on a claim that never recorded
 * consent, is never returned — "we can prove we asked". Do not add a second read path that skips
 * this join; extend this one.
 */
export async function listConsentedNuggetPhotos(nuggetIds: string[]): Promise<NuggetPhoto[]> {
  if (nuggetIds.length === 0) return [];
  return db
    .select({
      id: nuggetPhotos.id,
      nuggetId: nuggetPhotos.nuggetId,
      position: nuggetPhotos.position,
      photoUrl: nuggetPhotos.photoUrl,
      createdAt: nuggetPhotos.createdAt,
    })
    .from(nuggetPhotos)
    .innerJoin(localKnowledgeNuggets, eq(localKnowledgeNuggets.id, nuggetPhotos.nuggetId))
    .innerJoin(expertNeighborhoodClaims, eq(expertNeighborhoodClaims.id, localKnowledgeNuggets.claimId))
    .where(and(inArray(nuggetPhotos.nuggetId, nuggetIds), sql`${expertNeighborhoodClaims.consentAt} IS NOT NULL`))
    .orderBy(asc(nuggetPhotos.nuggetId), asc(nuggetPhotos.position));
}

/** Boot check: the one-writer trigger must exist (drizzle push never manages it; log loudly if gone). */
export async function isRatifyOnlyTriggerPresent(): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'expert_neighborhoods' AND t.tgname = 'expert_neighborhoods_ratify_only_trg' AND NOT t.tgisinternal
    LIMIT 1
  `);
  return (r.rows?.length ?? 0) > 0;
}
