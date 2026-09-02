/**
 * Expert field-knowledge claims — Phase 1 (ledger 2026-08-29-neighborhood-claims).
 *
 * Experts CLAIM neighborhoods ("I know Gion"); evidence capture (Phase 2) doubles as
 * inventory; a scorer grades admin-only; admin ratifies; ratification births a row in the
 * EXISTING expert_neighborhoods join table. Public vocabulary is claimed -> verified — the
 * word "test" appears nowhere in this file's public-facing strings. Multiple experts may
 * claim/verify the same neighborhood; unclaimed stays dark; no auto-approval anywhere.
 *
 * Follows gem-promotion.service.ts's structure: every status transition is a §15-style
 * ATOMIC CONDITIONAL — the UPDATE's WHERE is the guard, never a pre-check — so a double
 * submit/verify/decline loses cleanly. The acting user is always a function PARAMETER
 * threaded from the session by the caller (routes/*.ts), never read from a request body here.
 *
 * SCORES ARE ADMIN-ONLY (§ ratified shape): score_specificity/verifiability/localness/
 * practicality, scored_at, score_model are never selected by getExpertClaims or any other
 * function a non-admin route calls — enforced by explicit column selection below, not by
 * omission at the schema layer (the columns must still exist for the Phase 2 scorer).
 */

import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  expertNeighborhoodClaims,
  cityNeighborhoods,
  expertNeighborhoods,
  users,
} from "@shared/schema";

const CONSENT_VERSION_MAX = 50;
const REVIEW_NOTE_MAX = 2000;

/**
 * Expert-side: start (or resume) a claim on a neighborhood. Validates the neighborhood
 * exists; stamps consent NOW (never client-supplied); expert id is always a caller-supplied
 * parameter sourced from the session, never the request body. A pre-existing claim on the
 * same (expert, neighborhood) pair — of ANY status — is returned as-is rather than erroring
 * or double-inserting (the UNIQUE(expert_id, neighborhood_id) constraint is the backstop).
 */
export async function createDraftClaim(
  expertId: string,
  neighborhoodId: string,
  consentVersion?: string | null,
): Promise<{ ok: true; claim: any; created: boolean } | { ok: false; status: 400 | 404; message: string }> {
  if (!neighborhoodId || typeof neighborhoodId !== "string") {
    return { ok: false, status: 400, message: "neighborhoodId is required" };
  }

  const [neighborhood] = await db
    .select({ id: cityNeighborhoods.id })
    .from(cityNeighborhoods)
    .where(eq(cityNeighborhoods.id, neighborhoodId))
    .limit(1);
  if (!neighborhood) {
    return { ok: false, status: 404, message: "Neighborhood not found" };
  }

  const [existing] = await db
    .select()
    .from(expertNeighborhoodClaims)
    .where(and(
      eq(expertNeighborhoodClaims.expertId, expertId),
      eq(expertNeighborhoodClaims.neighborhoodId, neighborhoodId),
    ))
    .limit(1);
  if (existing) {
    return { ok: true, claim: existing, created: false };
  }

  const cleanVersion = typeof consentVersion === "string" ? consentVersion.trim().slice(0, CONSENT_VERSION_MAX) || null : null;

  try {
    const [claim] = await db
      .insert(expertNeighborhoodClaims)
      .values({
        expertId,
        neighborhoodId,
        status: "draft",
        consentAt: new Date(),
        consentVersion: cleanVersion,
      })
      .returning();
    return { ok: true, claim, created: true };
  } catch (err: any) {
    // A race on the UNIQUE(expert_id, neighborhood_id) constraint — fetch and return the
    // winner rather than surfacing a 500 for what is, from the caller's view, a success.
    if (err?.code === "23505") {
      const [row] = await db
        .select()
        .from(expertNeighborhoodClaims)
        .where(and(
          eq(expertNeighborhoodClaims.expertId, expertId),
          eq(expertNeighborhoodClaims.neighborhoodId, neighborhoodId),
        ))
        .limit(1);
      if (row) return { ok: true, claim: row, created: false };
    }
    throw err;
  }
}

/**
 * Expert-side: submit an owned draft claim for review. Atomic draft -> submitted; a claim
 * not owned by this expert, or not currently a draft, matches 0 rows and returns null.
 */
export async function submitClaim(claimId: string, expertId: string): Promise<any | null> {
  const [row] = await db
    .update(expertNeighborhoodClaims)
    .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(expertNeighborhoodClaims.id, claimId),
      eq(expertNeighborhoodClaims.expertId, expertId),
      eq(expertNeighborhoodClaims.status, "draft"),
    ))
    .returning();
  return row ?? null;
}

/**
 * Expert-side: this expert's own claims, joined to neighborhood identity. SCORE COLUMNS ARE
 * NEVER SELECTED HERE — admin-only, per the ratified shape.
 */
export async function listMyClaims(expertId: string): Promise<any[]> {
  return db
    .select({
      id: expertNeighborhoodClaims.id,
      neighborhoodId: expertNeighborhoodClaims.neighborhoodId,
      neighborhoodName: cityNeighborhoods.name,
      neighborhoodSlug: cityNeighborhoods.slug,
      city: cityNeighborhoods.city,
      country: cityNeighborhoods.country,
      status: expertNeighborhoodClaims.status,
      consentAt: expertNeighborhoodClaims.consentAt,
      submittedAt: expertNeighborhoodClaims.submittedAt,
      reviewedAt: expertNeighborhoodClaims.reviewedAt,
      reviewNote: expertNeighborhoodClaims.reviewNote,
      createdAt: expertNeighborhoodClaims.createdAt,
    })
    .from(expertNeighborhoodClaims)
    .innerJoin(cityNeighborhoods, eq(cityNeighborhoods.id, expertNeighborhoodClaims.neighborhoodId))
    .where(eq(expertNeighborhoodClaims.expertId, expertId))
    .orderBy(asc(cityNeighborhoods.name));
}

/**
 * Admin-side: submitted claims awaiting review, joined to the claiming expert + the
 * neighborhood. SCORE COLUMNS ARE NEVER SELECTED HERE either — Phase 1's admin verify/decline
 * take no scoring input; the Phase 2 scorer is a separate admin-only surface.
 */
export async function listClaimCandidates(): Promise<any[]> {
  return db
    .select({
      id: expertNeighborhoodClaims.id,
      expertId: expertNeighborhoodClaims.expertId,
      expertFirstName: users.firstName,
      expertLastName: users.lastName,
      neighborhoodId: expertNeighborhoodClaims.neighborhoodId,
      neighborhoodName: cityNeighborhoods.name,
      city: cityNeighborhoods.city,
      country: cityNeighborhoods.country,
      consentAt: expertNeighborhoodClaims.consentAt,
      consentVersion: expertNeighborhoodClaims.consentVersion,
      accessNote: expertNeighborhoodClaims.accessNote,
      submittedAt: expertNeighborhoodClaims.submittedAt,
    })
    .from(expertNeighborhoodClaims)
    .innerJoin(users, eq(users.id, expertNeighborhoodClaims.expertId))
    .innerJoin(cityNeighborhoods, eq(cityNeighborhoods.id, expertNeighborhoodClaims.neighborhoodId))
    .where(eq(expertNeighborhoodClaims.status, "submitted"))
    .orderBy(asc(expertNeighborhoodClaims.submittedAt));
}

export type VerifyClaimResult =
  | { ok: true; claim: any; neighborhoodJoined: boolean }
  | { ok: false; status: 404 | 409; message: string };

/**
 * Admin-side ratification. §15 posture: CLAIM the row first (atomic conditional —
 * submitted -> verified; a concurrent verify/decline matches 0 rows and loses), THEN insert
 * into expert_neighborhoods with onConflictDoNothing — the pre-existing UNIQUE(expert,
 * neighborhood) + one-lead partial index arbitrate. is_lead is NEVER set here (a separate
 * admin/curation concern, matching captureExpertNeighborhoods' posture).
 */
export async function verifyClaim(opts: { claimId: string; adminId: string }): Promise<VerifyClaimResult> {
  const [claimed] = await db
    .update(expertNeighborhoodClaims)
    .set({
      status: "verified",
      reviewedBy: opts.adminId,
      reviewedAt: new Date(),
      reviewNote: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(expertNeighborhoodClaims.id, opts.claimId),
      eq(expertNeighborhoodClaims.status, "submitted"),
    ))
    .returning();
  if (!claimed) {
    const [row] = await db
      .select({ id: expertNeighborhoodClaims.id })
      .from(expertNeighborhoodClaims)
      .where(eq(expertNeighborhoodClaims.id, opts.claimId))
      .limit(1);
    if (!row) return { ok: false, status: 404, message: "Claim not found" };
    return { ok: false, status: 409, message: "Claim is not awaiting review" };
  }

  const inserted = await db
    .insert(expertNeighborhoods)
    .values({
      expertId: claimed.expertId,
      neighborhoodId: claimed.neighborhoodId,
      isLead: false, // lead is a separate admin/curation concern; never set by ratification
      sortOrder: 0,
      // PROVENANCE MARKER (decision-maker ratified): stamp the claim that produced this row —
      // legacy/backfill rows stay NULL forever, so origin is mechanically answerable.
      claimId: claimed.id,
    })
    .onConflictDoNothing()
    .returning({ id: expertNeighborhoods.id });

  return { ok: true, claim: claimed, neighborhoodJoined: inserted.length > 0 };
}

export type DeclineClaimResult =
  | { ok: true; claim: any }
  | { ok: false; status: 400 | 404 | 409; message: string };

/** Admin-side decline — reason required (the expert sees it verbatim). */
export async function declineClaim(opts: {
  claimId: string;
  adminId: string;
  reason: string;
}): Promise<DeclineClaimResult> {
  const reason = String(opts.reason ?? "").trim();
  if (!reason) return { ok: false, status: 400, message: "A decline reason is required" };

  const [updated] = await db
    .update(expertNeighborhoodClaims)
    .set({
      status: "declined",
      reviewNote: reason.slice(0, REVIEW_NOTE_MAX),
      reviewedBy: opts.adminId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(expertNeighborhoodClaims.id, opts.claimId),
      eq(expertNeighborhoodClaims.status, "submitted"),
    ))
    .returning();
  if (!updated) {
    const [row] = await db
      .select({ id: expertNeighborhoodClaims.id })
      .from(expertNeighborhoodClaims)
      .where(eq(expertNeighborhoodClaims.id, opts.claimId))
      .limit(1);
    if (!row) return { ok: false, status: 404, message: "Claim not found" };
    return { ok: false, status: 409, message: "Claim is not awaiting review" };
  }
  return { ok: true, claim: updated };
}
