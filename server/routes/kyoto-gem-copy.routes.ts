/**
 * GET /api/admin/kyoto-gem-copy — Kyoto gem rows whose description or why-text still
 * matches a banned phrase with no approved swap. Read-only. The §2 blanket
 * `app.use("/api/admin", adminApiGuard)` is the admin check.
 */
import { Router } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { listKyotoUnswappedGemCopy } from "../services/kyoto-gem-copy-report";

const router = Router();

router.get("/api/admin/kyoto-gem-copy", isAuthenticated, async (_req, res) => {
  try {
    const rows = await listKyotoUnswappedGemCopy();
    res.json({ rows });
  } catch (err) {
    console.error("[kyoto-gem-copy]", err);
    res.status(500).json({ message: "Failed to list Kyoto gem copy" });
  }
});

export default router;
