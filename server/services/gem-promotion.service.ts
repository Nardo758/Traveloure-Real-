/**
 * Nugget → gem promotion rail (2026-08-29-replit-gem-audit ruling 4).
 *
 * ONE service owns every transition of local_knowledge_nuggets.promotion_status
 * (§10 shared-queue vocabulary, app-enforced: NULL | 'submitted' | 'approved' |
 * 'rejected'); the expert-console and admin routes are thin callers. Every
 * transition is a §15-style ATOMIC CONDITIONAL — the UPDATE's WHERE is the
 * guard, never a pre-check — so a double submit/approve/reject loses cleanly.
 *
 * PROVENANCE (rulings 1+4): approval births the travel_pulse_hidden_gems row
 * with curated_by_expert_id = the nugget's expert_user_id, resolved from the
 * ROW — the attribution comes from the rail, never from a request body.
 */

import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { localKnowledgeNuggets, travelPulseHiddenGems, users } from "@shared/schema";

/**
 * Expert-side: propose an owned nugget as a gem candidate. Only a row never
 * proposed, or previously rejected, can move to 'submitted'; a re-proposal
 * clears the previous review verdict. Returns the updated row, or null when
 * the transition lost (wrong owner, already submitted/approved, missing row).
 */
export async function proposeNuggetAsGem(id: string, expertId: string): Promise<any | null> {
  const [row] = await db.update(localKnowledgeNuggets)
    .set({
      promotionStatus: "submitted",
      promotionSubmittedAt: new Date(),
      promotionReviewedBy: null,
      promotionReviewedAt: null,
      promotionReviewNote: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(localKnowledgeNuggets.id, id),
      eq(localKnowledgeNuggets.expertUserId, expertId),
      or(
        isNull(localKnowledgeNuggets.promotionStatus),
        eq(localKnowledgeNuggets.promotionStatus, "rejected"),
      ),
    ))
    .returning();
  return row ?? null;
}

/** Admin-side: the submitted candidates + author identity, oldest first. */
export async function listGemCandidates(): Promise<any[]> {
  return db
    .select({
      id: localKnowledgeNuggets.id,
      nuggetType: localKnowledgeNuggets.nuggetType,
      city: localKnowledgeNuggets.city,
      linkedPoi: localKnowledgeNuggets.linkedPoi,
      linkedNeighbourhood: localKnowledgeNuggets.linkedNeighbourhood,
      insight: localKnowledgeNuggets.insight,
      targetAudience: localKnowledgeNuggets.targetAudience,
      notFor: localKnowledgeNuggets.notFor,
      promotionSubmittedAt: localKnowledgeNuggets.promotionSubmittedAt,
      expertUserId: localKnowledgeNuggets.expertUserId,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
    })
    .from(localKnowledgeNuggets)
    .innerJoin(users, eq(users.id, localKnowledgeNuggets.expertUserId))
    .where(eq(localKnowledgeNuggets.promotionStatus, "submitted"))
    .orderBy(asc(localKnowledgeNuggets.promotionSubmittedAt));
}

export type ApproveGemCandidateResult =
  | { ok: true; gem: any }
  | { ok: false; status: 400 | 404 | 409; message: string };

/**
 * Admin-side approval + SCORING. gemScore is the reviewing admin's assignment
 * (1–100 integer, validated here so every caller is covered). The place name
 * defaults to the nugget's linked POI; with neither, the approve is refused
 * rather than a gem born nameless (§13 — never guess a place).
 *
 * §15 posture: CLAIM the candidate first (atomic conditional — a concurrent
 * approve/reject matches 0 rows and loses), then birth the gem, then stamp
 * promoted_gem_id. A crash between claim and birth leaves an approved
 * candidate with a NULL promoted_gem_id — visible and re-linkable, never a
 * double gem.
 */
export async function approveGemCandidate(opts: {
  id: string;
  adminId: string;
  gemScore: number;
  placeName?: string | null;
  placeType?: string | null;
  country?: string | null;
}): Promise<ApproveGemCandidateResult> {
  const gemScore = Number(opts.gemScore);
  if (!Number.isInteger(gemScore) || gemScore < 1 || gemScore > 100) {
    return { ok: false, status: 400, message: "gemScore must be an integer between 1 and 100" };
  }

  const [nugget] = await db
    .select()
    .from(localKnowledgeNuggets)
    .where(eq(localKnowledgeNuggets.id, opts.id))
    .limit(1);
  if (!nugget) return { ok: false, status: 404, message: "Candidate not found" };
  if (nugget.promotionStatus !== "submitted") {
    return { ok: false, status: 409, message: "Candidate is not awaiting review" };
  }
  const placeName = ((opts.placeName ?? "").trim() || nugget.linkedPoi || "").trim().slice(0, 200);
  if (!placeName) {
    return { ok: false, status: 400, message: "The nugget has no linked POI — provide placeName to approve" };
  }

  const [claimed] = await db
    .update(localKnowledgeNuggets)
    .set({
      promotionStatus: "approved",
      promotionReviewedBy: opts.adminId,
      promotionReviewedAt: new Date(),
      promotionReviewNote: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(localKnowledgeNuggets.id, opts.id),
      eq(localKnowledgeNuggets.promotionStatus, "submitted"),
    ))
    .returning();
  if (!claimed) return { ok: false, status: 409, message: "Candidate is not awaiting review" };

  const [gem] = await db
    .insert(travelPulseHiddenGems)
    .values({
      city: nugget.city,
      country: (opts.country ?? "").trim().slice(0, 100) || null,
      placeName,
      placeType: (opts.placeType ?? "").trim().slice(0, 50) || null,
      description: nugget.insight,
      neighborhood: nugget.linkedNeighbourhood,
      gemScore,
      // PROVENANCE: the rail's — the nugget's author, from the row, never a body.
      curatedByExpertId: nugget.expertUserId,
      aiGenerated: false,
    })
    .returning();

  await db
    .update(localKnowledgeNuggets)
    .set({ promotedGemId: gem.id, updatedAt: new Date() })
    .where(eq(localKnowledgeNuggets.id, opts.id));

  return { ok: true, gem };
}

export type RejectGemCandidateResult =
  | { ok: true; candidate: any }
  | { ok: false; status: 400 | 409; message: string };

/** Admin-side rejection — reason required (the expert sees it verbatim). */
export async function rejectGemCandidate(opts: {
  id: string;
  adminId: string;
  reason: string;
}): Promise<RejectGemCandidateResult> {
  const reason = String(opts.reason ?? "").trim();
  if (!reason) return { ok: false, status: 400, message: "A rejection reason is required" };
  const [updated] = await db
    .update(localKnowledgeNuggets)
    .set({
      promotionStatus: "rejected",
      promotionReviewNote: reason.slice(0, 2000),
      promotionReviewedBy: opts.adminId,
      promotionReviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(localKnowledgeNuggets.id, opts.id),
      eq(localKnowledgeNuggets.promotionStatus, "submitted"),
    ))
    .returning();
  if (!updated) return { ok: false, status: 409, message: "Candidate is not awaiting review" };
  return { ok: true, candidate: updated };
}
