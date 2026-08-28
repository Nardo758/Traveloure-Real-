/**
 * internal.routes.ts — mount: app.use(internalRoutes). Declares POST /internal/run-occasion-drafts.
 *
 * The AUTHORITATIVE runner for the Plus occasion-drafts scheduler (ledger 2026-08-27-plus-is-delivery).
 * On Autoscale there is no reliable in-process cron (the instance scales to zero), so a daily
 * external trigger — the repository's GitHub Actions cron or another cron service — fires this endpoint, which
 * runs one idempotent pass. Authenticated by a shared secret (INTERNAL_JOB_SECRET), NOT a user
 * session: it is machine-to-machine. Endpoint disabled (503) until the secret is configured.
 *
 * Idempotent by the occasion_drafts ledger, so it is safe to call hourly and safe to run alongside
 * the in-process defense-in-depth timer — the pair produce exactly one draft per occasion cycle.
 */
import { Router } from "express";
import crypto from "crypto";
import { runOccasionDrafts } from "../services/occasion-drafts.service";

const router = Router();

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

router.post("/internal/run-occasion-drafts", async (req, res) => {
  const secret = process.env.INTERNAL_JOB_SECRET;
  if (!secret) {
    return res.status(503).json({ message: "Internal job endpoint disabled (INTERNAL_JOB_SECRET unset)" });
  }

  const headerSecret = req.get("x-internal-secret");
  const bearer = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = headerSecret || bearer || "";
  if (!provided || !safeEqual(provided, secret)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const limit = typeof req.body?.limit === "number" && req.body.limit > 0 ? Math.floor(req.body.limit) : undefined;
    const result = await runOccasionDrafts({ limit });
    return res.status(200).json({ ok: true, result });
  } catch (err: any) {
    console.error("[internal] run-occasion-drafts failed:", err);
    return res.status(500).json({ ok: false, message: "run failed" });
  }
});

export default router;
