/**
 * D9 — ONBOARDING ATTESTATIONS (docs/DECISIONS.md ruling 62's D9 clause, executed by ruling 67;
 * migration 197). Owner-gated read + append-only affirm for a provider service.
 *
 * MOUNTED in server/routes.ts via `app.use(serviceAttestationsRoutes)` — deliberately BEFORE the
 * inline `app.get("/api/provider/services/:id", …)` registration, the same slot rule
 * provider-listing-health.routes.ts documents. (These paths carry an extra segment so `:id` could
 * not swallow them, but keeping the ordering consistent means the next router added here does not
 * have to rediscover the rule.)
 *
 * ── THE INVARIANT THIS FILE EXISTS TO HOLD ───────────────────────────────────────────────────
 * **The applicable SET is SERVER-DERIVED. A client never decides which attestations apply to
 * itself.** Applicability is re-resolved from the LIVE row (its delivery method, product shape and
 * its category's key/slug) by `shared/service-attestations.ts` on EVERY read and again on EVERY
 * write — never read from a stored snapshot, never taken from the body. This is §14's
 * "derive it server-side" posture generalized from the amount to the APPLICABILITY: a body that
 * names an attestation the row does not qualify for is a 400 with a stated reason, not a row.
 *
 * ── §19 ALLOWLIST BODY ───────────────────────────────────────────────────────────────────────
 * The body schema is a hand-written zod object with exactly one field (`affirm: string[]`) — NOT
 * a `createInsertSchema(...).omit()` over `service_attestations` (which would be the denylist
 * shape ruling 46 named, over a table whose every other column is server-stamped). `affirmedAt`
 * and `affirmedBy` are stamped in storage from the session user; a client-sent `affirmedAt`,
 * `affirmedBy`, `userId` or `serviceId` cannot reach a row because no code path reads them.
 *
 * ── §13 HONESTY ──────────────────────────────────────────────────────────────────────────────
 * A key we cannot decide about (no category, no delivery method) is reported in `omitted` WITH A
 * REASON and is NOT affirmable — affirming it is a 400, because the platform would be recording a
 * statement about a condition it cannot say applies. A key we know does not apply never appears at
 * all (the `delivery_asset` precedent in provider-listing-health.routes.ts). Affirmations already
 * on record whose key has since stopped applying are surfaced separately in `affirmedOther` — a
 * record is a fact and does not vanish because the listing changed.
 *
 * ── NEGATIVE SPACE (ruling 67 — do not add these here without a ruling) ──────────────────────
 * A publish GATE now exists (ruling 69 disposition 3) but does NOT live here — it sits beside the
 * F2 verification gate at the three activation choke points in `server/routes.ts`, and it reuses
 * this module's resolver through the shared `attestation-publish-gate.service.ts`. Nothing in this
 * file blocks anything. No traveler-facing surface or trust
 * badge. No licence-document upload or verification. No admin review queue. No scanning of listing
 * text for violating phrases. No un-affirm/DELETE path — the record is append-only.
 */
import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";
import { providerServices } from "@shared/schema";
import { resolveAttestationShape } from "../services/attestation-publish-gate.service";
import {
  ATTESTATION_CATALOG,
  isAttestationKey,
  resolveApplicableAttestations,
  type AttestationKey,
  type AttestationResolution,
  type AttestationShape,
} from "@shared/service-attestations";

const router = Router();

/**
 * Loads the owner-scoped row and resolves its attestation shape from the DB — the ONE place the
 * shape is assembled, so the read and the write can never key off different inputs.
 * Returns null when the service does not exist OR is not the caller's (undifferentiated, so a
 * non-owner cannot enumerate ids — the same 404 posture as the sibling owner routes).
 */
async function loadOwnedShape(
  serviceId: string,
  userId: string,
): Promise<{ shape: AttestationShape } | null> {
  const [row] = await db
    .select({ id: providerServices.id, userId: providerServices.userId })
    .from(providerServices)
    .where(eq(providerServices.id, serviceId));
  if (!row || row.userId !== userId) return null;

  // ONE shape assembler, shared with the SS-5a publish gate (ruling 69 disposition 3). The gate
  // and these endpoints must key off identical inputs or a listing could pass one and fail the
  // other — the same "second local list" hazard the shared predicate module was created to close.
  return { shape: await resolveAttestationShape({ serviceId }) };
}

/** The wire shape both endpoints answer with — one builder, so they can never disagree. */
async function buildResponse(serviceId: string, resolution: AttestationResolution) {
  const onRecord = await storage.getServiceAttestations(serviceId);
  const byKey = new Map(onRecord.map((r) => [r.attestationKey, r]));
  const applicableSet = new Set<string>(resolution.applicable);

  return {
    serviceId,
    applicable: resolution.applicable.map((key: AttestationKey) => {
      const type = ATTESTATION_CATALOG[key];
      const hit = byKey.get(key);
      return {
        key,
        label: type.label,
        body: type.body,
        rationale: type.rationale,
        keying: type.keying,
        affirmedAt: hit?.affirmedAt ?? null,
        affirmedBy: hit?.affirmedBy ?? null,
      };
    }),
    // §13: could not decide — stated reason, never guessed, never rendered as compliant.
    omitted: resolution.omitted,
    // Affirmations on record whose key no longer applies to this listing. A record is a fact.
    affirmedOther: onRecord
      .filter((r) => !applicableSet.has(r.attestationKey))
      .map((r) => ({ key: r.attestationKey, affirmedAt: r.affirmedAt })),
  };
}

// ── READ ─────────────────────────────────────────────────────────────────────────────────────
router.get("/api/provider/services/:id/attestations", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const owned = await loadOwnedShape(req.params.id, userId);
    if (!owned) return res.status(404).json({ message: "Service not found" });
    const resolution = resolveApplicableAttestations(owned.shape);
    res.json(await buildResponse(req.params.id, resolution));
  } catch (err) {
    console.error("[attestations] read failed:", err);
    res.status(500).json({ message: "Failed to load attestations" });
  }
});

// ── AFFIRM (append-only) ─────────────────────────────────────────────────────────────────────
// §19 ALLOWLIST: exactly one field reaches the handler. Everything else on the row — the
// timestamp, the affirming user, the service id — is server-derived.
const affirmBodySchema = z.object({
  affirm: z.array(z.string().trim().min(1).max(64)).max(16),
});

router.post("/api/provider/services/:id/attestations", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const owned = await loadOwnedShape(req.params.id, userId);
    if (!owned) return res.status(404).json({ message: "Service not found" });

    const parsed = affirmBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid attestation body", errors: parsed.error.flatten() });
    }

    // Re-derive the applicable set from the LIVE row. The client's opinion is never consulted.
    const resolution = resolveApplicableAttestations(owned.shape);
    const applicable = new Set<string>(resolution.applicable);
    const omittedByKey = new Map(resolution.omitted.map((o) => [o.key as string, o]));

    const requested = Array.from(new Set(parsed.data.affirm));
    for (const key of requested) {
      if (!isAttestationKey(key)) {
        return res.status(400).json({
          message: `Unknown attestation "${key}"`,
          code: "UNKNOWN_ATTESTATION",
          key,
        });
      }
      if (!applicable.has(key)) {
        const omission = omittedByKey.get(key);
        return res.status(400).json({
          // §13: an inapplicable/undecidable key is refused WITH the reason, never quietly
          // dropped and never recorded — a stored statement about a condition the platform
          // cannot say applies is exactly the dishonest artifact D9 exists to prevent.
          message: omission
            ? `"${key}" cannot be affirmed for this listing — ${omission.reason.en}`
            : `"${key}" does not apply to this listing`,
          code: omission ? "ATTESTATION_UNDECIDABLE" : "ATTESTATION_NOT_APPLICABLE",
          key,
          // An API error message is EN (the ops/log-facing half); the localized pair travels on
          // the READ surface, which is what a provider's browser actually renders.
          ...(omission ? { reason: omission.reason.en, omissionCode: omission.code } : {}),
        });
      }
    }

    // Idempotent by construction (UNIQUE + ON CONFLICT DO NOTHING) — a re-affirm keeps the
    // FIRST affirmation's timestamp rather than re-dating the record.
    await storage.affirmServiceAttestations(req.params.id, requested, userId);
    res.json(await buildResponse(req.params.id, resolution));
  } catch (err) {
    console.error("[attestations] affirm failed:", err);
    res.status(500).json({ message: "Failed to record attestations" });
  }
});

export default router;
