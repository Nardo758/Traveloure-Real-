/**
 * Neighborhood claims — expert field knowledge v2, Phase 1 (thin callers only).
 *
 * Expert side (any authenticated user — a claim is made during onboarding, before the account
 * holds the local_expert role): picker source, own claims, create, save-and-finish-later, submit.
 * Ops side (rides the blanket /api/admin guard §2 + an explicit per-handler admin check): the
 * manual-entry form for email backfill replies, which writes through the IDENTICAL service
 * functions with actorType 'ops' — never a bypass; plus the evidence_thresholds read/write with
 * an allowlist body (`value` only).
 *
 * Expert-facing vocabulary is `claimed | verified` and the §5 copy only; nothing here returns a
 * score, a dimension, or an internal status to a non-admin.
 */
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { getAdminRole, insertAccessAuditLog } from "../services/admin-query.service";
import { insertExpertNeighborhoodClaimSchema } from "@shared/schema";
import { updateEvidenceThresholdSchema } from "@shared/neighborhood-claims";
import {
  createClaim,
  declineClaim,
  getClaimDetailForAdmin,
  listClaimsForAdmin,
  listClaimsForExpert,
  listNeighborhoodOptions,
  ratifyClaim,
  requestRescore,
  saveDraftCapture,
  searchExpertsForManualEntry,
  submitClaim,
} from "../services/neighborhood-claims.service";
import { EvidenceThresholdsMissingError, isEvidenceThresholdKey, listEvidenceThresholds, loadEvidenceThresholds, updateEvidenceThreshold } from "../services/evidence-thresholds.service";
import { CLAIM_STATUSES, EVIDENCE_DIMENSIONS, type ClaimStatus } from "@shared/neighborhood-claims";
import { scoreClaim } from "../services/evidence-scorer.service";

const router = Router();

/** The consent text version stamped on a claim at submit (COUNSEL-1 will bump this). */
const CONSENT_VERSION = "tos-11.2-2026-09";

async function requireAdmin(req: any, res: any, next: any) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });
  const u = await getAdminRole(userId);
  if (!u || u.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  (req as any).adminId = userId;
  next();
}

function sendFailure(res: any, r: { status: number; code: string; message: string }) {
  return res.status(r.status).json({ message: r.message, code: r.code });
}

// ── Expert side ───────────────────────────────────────────────────────────────────────────────

// GET /api/expert/neighborhood-options?city=Kyoto[&country=Japan] — the picker source.
// `available:false` is the honest D5 state: nothing to claim here yet, the step is skippable.
router.get("/api/expert/neighborhood-options", isAuthenticated, async (req, res) => {
  try {
    const city = typeof req.query.city === "string" ? req.query.city : "";
    const country = typeof req.query.country === "string" ? req.query.country : null;
    if (!city.trim()) return res.status(400).json({ message: "city is required" });
    const options = await listNeighborhoodOptions(city, country);
    res.json({ options, available: options.length > 0 });
  } catch (err) {
    console.error("[neighborhood-claims] options error:", err);
    res.status(500).json({ message: "Failed to load neighborhoods" });
  }
});

router.get("/api/expert/neighborhood-claims", isAuthenticated, async (req, res) => {
  try {
    res.json({ claims: await listClaimsForExpert(getUserId(req)!) });
  } catch (err) {
    console.error("[neighborhood-claims] list error:", err);
    res.status(500).json({ message: "Failed to load your neighborhoods" });
  }
});

// POST /api/expert/neighborhood-claims { neighborhoodId } — the claim itself (= "claimed").
router.post("/api/expert/neighborhood-claims", isAuthenticated, async (req, res) => {
  try {
    const parsed = insertExpertNeighborhoodClaimSchema.safeParse(req.body ?? {});
    if (!parsed.success || !parsed.data.neighborhoodId) {
      return res.status(400).json({ message: "neighborhoodId is required" });
    }
    const userId = getUserId(req)!;
    const r = await createClaim({ expertId: userId, neighborhoodId: parsed.data.neighborhoodId, actorType: "expert", actorId: userId });
    if (!r.ok) return sendFailure(res, r);
    const claims = await listClaimsForExpert(userId);
    res.status(r.value.created ? 201 : 200).json({ claim: claims.find((c) => c.id === r.value.claim.id) ?? null, created: r.value.created });
  } catch (err) {
    console.error("[neighborhood-claims] create error:", err);
    res.status(500).json({ message: "Failed to claim that neighborhood" });
  }
});

// PUT /api/expert/neighborhood-claims/:id/capture — save-and-finish-later (draft buffer).
router.put("/api/expert/neighborhood-claims/:id/capture", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const r = await saveDraftCapture({ claimId: req.params.id, expertId: userId, payload: req.body?.capture ?? req.body });
    if (!r.ok) return sendFailure(res, r);
    res.json({ saved: true });
  } catch (err) {
    console.error("[neighborhood-claims] save error:", err);
    res.status(500).json({ message: "Failed to save" });
  }
});

// POST /api/expert/neighborhood-claims/:id/submit { consent: true, capture? } — send it in.
router.post("/api/expert/neighborhood-claims/:id/submit", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const r = await submitClaim({
      claimId: req.params.id,
      expertId: userId,
      actorType: "expert",
      actorId: userId,
      consent: req.body?.consent === true,
      consentVersion: CONSENT_VERSION,
      capture: req.body?.capture,
    });
    if (!r.ok) return sendFailure(res, r);
    const claims = await listClaimsForExpert(userId);
    res.json({ claim: claims.find((c) => c.id === r.value.id) ?? null });
  } catch (err) {
    console.error("[neighborhood-claims] submit error:", err);
    res.status(500).json({ message: "Failed to send your answers" });
  }
});

// ── Ops side ──────────────────────────────────────────────────────────────────────────────────

router.get("/api/admin/neighborhood-claims/experts", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    res.json({ experts: await searchExpertsForManualEntry(q) });
  } catch (err) {
    console.error("[neighborhood-claims] expert search error:", err);
    res.status(500).json({ message: "Failed to search experts" });
  }
});

const manualEntrySchema = z
  .object({
    expertId: z.string().min(1),
    neighborhoodId: z.string().min(1),
    capture: z.unknown(),
    /** Ops attests the reply carried the expert's consent (backfill email includes the line). */
    consentAttested: z.literal(true),
  })
  .strict();

// POST /api/admin/neighborhood-claims/manual-entry — ops types an email reply as typed rows.
// Same createClaim + submitClaim as the console; only the diary's actor_type differs.
router.post("/api/admin/neighborhood-claims/manual-entry", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const parsed = manualEntrySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid body" });
    const adminId = (req as any).adminId as string;
    const created = await createClaim({ expertId: parsed.data.expertId, neighborhoodId: parsed.data.neighborhoodId, actorType: "ops", actorId: adminId });
    if (!created.ok) return sendFailure(res, created);
    const submitted = await submitClaim({
      claimId: created.value.claim.id,
      expertId: null,
      actorType: "ops",
      actorId: adminId,
      consent: true,
      consentVersion: CONSENT_VERSION,
      capture: parsed.data.capture,
    });
    if (!submitted.ok) return sendFailure(res, submitted);
    await insertAccessAuditLog({
      actorId: adminId,
      actorRole: "admin",
      action: "neighborhood_claim_manual_entry",
      resourceType: "expert_neighborhood_claim",
      resourceId: submitted.value.id,
      metadata: { expertId: parsed.data.expertId, neighborhoodId: parsed.data.neighborhoodId, version: submitted.value.version },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch((err: any) => console.error("[neighborhood-claims] audit log failed (non-fatal):", err));
    res.status(201).json({ claimId: submitted.value.id, version: submitted.value.version, status: submitted.value.status });
  } catch (err) {
    console.error("[neighborhood-claims] manual entry error:", err);
    res.status(500).json({ message: "Failed to record the reply" });
  }
});

// ── Admin queue (Phase 2) — Ratify / Return are the ONLY two decisions ─────────────────────

/** D3: the queue tells the admin when thresholds are missing — a blocking banner, never a silent disable. */
async function thresholdsState(): Promise<{ ok: boolean; missing: string[] }> {
  try {
    await loadEvidenceThresholds();
    return { ok: true, missing: [] };
  } catch (err) {
    if (err instanceof EvidenceThresholdsMissingError) return { ok: false, missing: err.missing };
    throw err;
  }
}

// GET /api/admin/neighborhood-claims?status=submitted,scored (default) — the queue.
router.get("/api/admin/neighborhood-claims", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const raw = typeof req.query.status === "string" ? req.query.status : "";
    const statuses = raw
      .split(",")
      .map((x) => x.trim())
      .filter((x): x is ClaimStatus => (CLAIM_STATUSES as readonly string[]).includes(x));
    const [claims, thresholds] = await Promise.all([listClaimsForAdmin({ statuses }), thresholdsState()]);
    res.json({ claims, thresholds });
  } catch (err) {
    console.error("[neighborhood-claims] admin list error:", err);
    res.status(500).json({ message: "Failed to load the queue" });
  }
});

// GET /api/admin/neighborhood-claims/:id — claim + typed rows + scorer JSON + web-gap + diary.
router.get("/api/admin/neighborhood-claims/:id", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const detail = await getClaimDetailForAdmin(req.params.id);
    if (!detail) return res.status(404).json({ message: "Claim not found" });
    res.json({ ...detail, thresholds: await thresholdsState() });
  } catch (err) {
    console.error("[neighborhood-claims] admin detail error:", err);
    res.status(500).json({ message: "Failed to load the claim" });
  }
});

// POST /api/admin/neighborhood-claims/:id/ratify — no body. THE writer of expert_neighborhoods.
router.post("/api/admin/neighborhood-claims/:id/ratify", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const adminId = (req as any).adminId as string;
    const r = await ratifyClaim({ claimId: req.params.id, adminId });
    if (!r.ok) return sendFailure(res, r);
    await insertAccessAuditLog({
      actorId: adminId,
      actorRole: "admin",
      action: "neighborhood_claim_ratify",
      resourceType: "expert_neighborhood_claim",
      resourceId: req.params.id,
      metadata: { expertId: r.value.claim.expertId, neighborhoodId: r.value.claim.neighborhoodId, version: r.value.claim.version, neighborhoodRowId: r.value.neighborhoodRowId },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch((err: any) => console.error("[neighborhood-claims] audit log failed (non-fatal):", err));
    res.json({ claimId: r.value.claim.id, status: r.value.claim.status, neighborhoodRowId: r.value.neighborhoodRowId });
  } catch (err) {
    console.error("[neighborhood-claims] ratify error:", err);
    res.status(500).json({ message: "Failed to ratify" });
  }
});

const returnBodySchema = z.object({ dimension: z.enum(EVIDENCE_DIMENSIONS) }).strict();

// POST /api/admin/neighborhood-claims/:id/return { dimension } — allowlisted body; the §5 sentence is
// derived from the dimension server-side, the admin never types a message or a number.
router.post("/api/admin/neighborhood-claims/:id/return", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const parsed = returnBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "dimension must be one of the rubric dimensions" });
    const adminId = (req as any).adminId as string;
    const r = await declineClaim({ claimId: req.params.id, adminId, dimension: parsed.data.dimension });
    if (!r.ok) return sendFailure(res, r);
    await insertAccessAuditLog({
      actorId: adminId,
      actorRole: "admin",
      action: "neighborhood_claim_return",
      resourceType: "expert_neighborhood_claim",
      resourceId: req.params.id,
      metadata: { dimension: parsed.data.dimension, version: r.value.version },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch((err: any) => console.error("[neighborhood-claims] audit log failed (non-fatal):", err));
    res.json({ claimId: r.value.id, status: r.value.status, dimension: parsed.data.dimension });
  } catch (err) {
    console.error("[neighborhood-claims] return error:", err);
    res.status(500).json({ message: "Failed to return the claim" });
  }
});

// POST /api/admin/neighborhood-claims/:id/rescore — clears a scorer_failed flag and runs the scorer now.
router.post("/api/admin/neighborhood-claims/:id/rescore", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const adminId = (req as any).adminId as string;
    const r = await requestRescore({ claimId: req.params.id, adminId });
    if (!r.ok) return sendFailure(res, r);
    const result = await scoreClaim({ claimId: r.value.id, version: r.value.version });
    res.json({ claimId: r.value.id, result });
  } catch (err) {
    console.error("[neighborhood-claims] rescore error:", err);
    res.status(500).json({ message: "Failed to re-run the scorer" });
  }
});

router.get("/api/admin/evidence-thresholds", isAuthenticated, requireAdmin, async (_req, res) => {
  try {
    res.json({ thresholds: await listEvidenceThresholds() });
  } catch (err) {
    console.error("[evidence-thresholds] list error:", err);
    res.status(500).json({ message: "Failed to load thresholds" });
  }
});

// PATCH /api/admin/evidence-thresholds/:key { value } — allowlist body, key must be seeded.
router.patch("/api/admin/evidence-thresholds/:key", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const key = String(req.params.key || "");
    if (!isEvidenceThresholdKey(key)) return res.status(404).json({ message: "Unknown threshold" });
    const parsed = updateEvidenceThresholdSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "value must be a non-negative integer" });
    const adminId = (req as any).adminId as string;
    const row = await updateEvidenceThreshold(key, parsed.data.value, adminId);
    if (!row) return res.status(404).json({ message: "Threshold row is missing — run migrations" });
    await insertAccessAuditLog({
      actorId: adminId,
      actorRole: "admin",
      action: "evidence_threshold_update",
      resourceType: "evidence_threshold",
      resourceId: key,
      metadata: { value: parsed.data.value },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch((err: any) => console.error("[evidence-thresholds] audit log failed (non-fatal):", err));
    res.json({ threshold: row });
  } catch (err) {
    console.error("[evidence-thresholds] update error:", err);
    res.status(500).json({ message: "Failed to update threshold" });
  }
});

export default router;
