/**
 * concierge-task-kinds.routes.ts — mount: app.use(conciergeTaskKindRoutes).
 *
 * GET /api/concierge-task-kinds is public (active kinds and the listing labels).
 * /api/admin/concierge-task-kinds* relies on the §2 blanket requireAdmin
 * (server/routes.ts adminApiGuard). No per-endpoint guard is added here.
 */
import { Router } from "express";
import { CN1_COPY } from "@shared/cn1-copy";
import {
  createConciergeTaskKind,
  listAdminConciergeTaskKinds,
  listPublicConciergeTaskKinds,
  updateConciergeTaskKind,
} from "../services/concierge-listing.service";

const router = Router();

function publicPayload(kinds: Awaited<ReturnType<typeof listPublicConciergeTaskKinds>>) {
  return {
    filterLabel: CN1_COPY.filter,
    sectionLabel: CN1_COPY.profileSection,
    typeLabel: CN1_COPY.listingTypeConcierge,
    planningLabel: CN1_COPY.listingTypePlanning,
    pricePerTrip: CN1_COPY.pricePerTrip,
    responseHours: CN1_COPY.responseHours,
    linkOnly: CN1_COPY.taskLinkOnly,
    kinds: kinds.map((kind) => ({
      id: kind.id,
      label: kind.label,
      domain: kind.domain,
      linkOnly: kind.linkOnly,
      sortOrder: kind.sortOrder,
    })),
  };
}

router.get("/api/concierge-task-kinds", async (_req, res) => {
  try {
    res.json(publicPayload(await listPublicConciergeTaskKinds()));
  } catch (err) {
    console.error("Error listing concierge task kinds:", err);
    res.status(500).json({ message: "Failed to list concierge tasks" });
  }
});

router.get("/api/admin/concierge-task-kinds", async (_req, res) => {
  try {
    const kinds = await listAdminConciergeTaskKinds();
    res.json({ kinds });
  } catch (err) {
    console.error("Error loading admin concierge task kinds:", err);
    res.status(500).json({ message: "Failed to load concierge tasks" });
  }
});

router.post("/api/admin/concierge-task-kinds", async (req, res) => {
  try {
    const created = await createConciergeTaskKind(req.body);
    if (!created.ok) return res.status(created.status).json(created.body);
    res.status(201).json({ kind: created.kind });
  } catch (err) {
    console.error("Error creating concierge task kind:", err);
    res.status(500).json({ message: "Failed to create concierge task" });
  }
});

router.patch("/api/admin/concierge-task-kinds/:id", async (req, res) => {
  try {
    const updated = await updateConciergeTaskKind(req.params.id, req.body);
    if (!updated.ok) return res.status(updated.status).json(updated.body);
    res.json({ kind: updated.kind });
  } catch (err) {
    console.error("Error updating concierge task kind:", err);
    res.status(500).json({ message: "Failed to update concierge task" });
  }
});

export default router;
