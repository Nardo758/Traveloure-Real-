/**
 * The expert inbox's Ask-a-local questions (work plan L1-13; ruling R-bj).
 *
 *   GET  /api/expert/inbox/questions               the open questions this expert may answer
 *   POST /api/expert/inbox/questions/:id/answer    answer one; `.strict()` `{ answer }` (§19)
 *
 * `/api/expert/inbox` is under the expert role backstop (`EXPERT_SELF_SERVICE_PREFIXES`,
 * `server/routes.ts`), so a non-expert never reaches these handlers. Who sees which question is
 * `expertMaySeeQuestion` (the service); a question the caller may not see is ONE 404 (LD 40). The
 * answering expert is the session user (§14).
 */
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import {
  INBOX_ANSWER_MAX_CHARS,
  InboxQuestionError,
  answerInboxQuestion,
  listInboxQuestions,
} from "../services/expert-inbox-questions.service";

const router = Router();

const answerBody = z.object({ answer: z.string().trim().min(1).max(INBOX_ANSWER_MAX_CHARS) }).strict();

function fail(res: any, err: unknown, what: string) {
  if (err instanceof InboxQuestionError) return res.status(err.status).json({ code: err.code, message: err.message });
  console.error(`[inbox-questions] ${what} failed:`, err);
  return res.status(500).json({ message: "Something went wrong with the questions inbox" });
}

router.get("/api/expert/inbox/questions", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    res.json({ questions: await listInboxQuestions(userId) });
  } catch (err) {
    fail(res, err, "list");
  }
});

router.post("/api/expert/inbox/questions/:id/answer", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const parsed = answerBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "invalid_body", message: `An answer is 1–${INBOX_ANSWER_MAX_CHARS} characters` });
    }
    res.status(201).json(await answerInboxQuestion(userId, req.params.id, parsed.data.answer));
  } catch (err) {
    fail(res, err, "answer");
  }
});

export default router;
