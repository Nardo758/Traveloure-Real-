import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { recordAdminAudit } from "../services/admin-query.service";
import {
  answerCurrent,
  bankAdminView,
  currentQuestion,
  expertHome,
  grantRetake,
  saveBank,
  signOffBank,
  startAttempt,
  submitPartB,
} from "../services/city-knowledge/attempt.service";

const router = Router();

const answerBody = z.object({
  itemId: z.string().min(1),
  selectedOptionIds: z.array(z.string()).max(8).optional(),
  shortAnswer: z.string().max(500).optional(),
}).strict();

const stopBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stopName: z.string().min(1).max(200),
  plannedArrival: z.string().regex(/^\d{2}:\d{2}$/),
  plannedDeparture: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  mode: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
  reservationTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
}).strict();

const partBBody = z.object({
  briefs: z.array(z.object({
    id: z.enum(["b1", "b2"]),
    stops: z.array(stopBody).max(20),
    locationNotes: z.string().max(1000).optional(),
    avoid: z.string().max(1000).optional(),
    backup: z.string().max(1000).optional(),
  }).strict()).max(2),
}).strict();

function userId(req: { user?: unknown }): string | null {
  return getUserId(req as any) ?? null;
}

router.get("/api/expert/city-knowledge", isAuthenticated, async (req, res) => {
  const id = userId(req);
  if (!id) return res.status(401).json({ message: "Authentication required" });
  res.json(await expertHome(id));
});

router.post("/api/expert/city-knowledge/start", isAuthenticated, async (req, res) => {
  const id = userId(req);
  if (!id) return res.status(401).json({ message: "Authentication required" });
  const out = await startAttempt(id);
  if (out.status !== 200) return res.status(out.status).json({ message: out.message });
  res.json({ attemptId: out.attemptId });
});

router.get("/api/expert/city-knowledge/attempt", isAuthenticated, async (req, res) => {
  const id = userId(req);
  if (!id) return res.status(401).json({ message: "Authentication required" });
  const out = await currentQuestion(id);
  if (out.status !== 200) return res.status(out.status).json({ message: out.message });
  res.json(out);
});

router.post("/api/expert/city-knowledge/answer", isAuthenticated, async (req, res) => {
  const id = userId(req);
  if (!id) return res.status(401).json({ message: "Authentication required" });
  const parsed = answerBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "That answer is not in the expected shape." });
  const out = await answerCurrent(id, parsed.data);
  if (out.status !== 200) return res.status(out.status).json({ message: out.message });
  res.json({ phase: out.phase });
});

router.post("/api/expert/city-knowledge/part-b", isAuthenticated, async (req, res) => {
  const id = userId(req);
  if (!id) return res.status(401).json({ message: "Authentication required" });
  const parsed = partBBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "The plans are not in the expected shape." });
  const out = await submitPartB(id, parsed.data.briefs);
  if (out.status !== 200) return res.status(out.status).json({ message: out.message });
  res.json(out.result);
});

router.get("/api/admin/city-knowledge/:cityKey", isAuthenticated, async (req, res) => {
  const view = await bankAdminView(req.params.cityKey);
  if (!view) return res.status(404).json({ message: "No city-knowledge bank for that city." });
  res.json(view);
});

router.post("/api/admin/city-knowledge/:cityKey/sign-off", isAuthenticated, async (req, res) => {
  const id = userId(req);
  if (!id) return res.status(401).json({ message: "Authentication required" });
  const out = await signOffBank(req.params.cityKey, id);
  if (out.status !== 200) return res.status(out.status).json({ message: out.message });
  await recordAdminAudit({
    actorId: id,
    actorRole: "admin",
    action: "city_knowledge_sign_off",
    resourceType: "city_knowledge_bank",
    resourceId: req.params.cityKey,
    metadata: { contentHash: out.contentHash },
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });
  res.json({ signedOff: true });
});

router.put("/api/admin/city-knowledge/:cityKey", isAuthenticated, async (req, res) => {
  const id = userId(req);
  if (!id) return res.status(401).json({ message: "Authentication required" });
  const out = await saveBank(req.params.cityKey, id, req.body);
  if (out.status !== 200) return res.status(out.status).json({ message: out.message });
  await recordAdminAudit({
    actorId: id,
    actorRole: "admin",
    action: "city_knowledge_bank_save",
    resourceType: "city_knowledge_bank",
    resourceId: req.params.cityKey,
    metadata: { signedOffCleared: true },
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });
  res.json({ signedOff: false });
});

router.post("/api/admin/expert-applications/:id/city-knowledge/retake", isAuthenticated, async (req, res) => {
  const id = userId(req);
  if (!id) return res.status(401).json({ message: "Authentication required" });
  const out = await grantRetake(req.params.id, id);
  if (out.status !== 200) return res.status(out.status).json({ message: out.message });
  await recordAdminAudit({
    actorId: id,
    actorRole: "admin",
    action: "city_knowledge_retake_grant",
    resourceType: "local_expert_form",
    resourceId: req.params.id,
    metadata: { eligibleAt: out.eligibleAt },
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });
  res.json({ message: out.message, eligibleAt: out.eligibleAt });
});

export default router;
