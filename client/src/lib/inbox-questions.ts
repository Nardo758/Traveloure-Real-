/**
 * THE EXPERT INBOX'S QUESTIONS TAB, CLIENT SIDE (work plan L2-9, enhancement 6; spec v1.3.5 §1,
 * ruling R-bj; ledger `2026-10-05-inbox-questions-tab`).
 *
 * The server's `GET /api/expert/inbox/questions` (R309) decides WHICH questions this expert may see
 * (`expertMaySeeQuestion`) and `POST …/:id/answer` takes `{ answer }`. Nothing here re-decides
 * either (§18 rule 1): this module only words what the server sent. Pure — no DOM, no network.
 */

/** One question as the server sends it (`InboxQuestionView`). No traveler identity is ever sent. */
export interface InboxQuestion {
  id: string;
  question: string | null;
  itemTitle: string;
  dayNumber: number;
  city: string | null;
  askedAt: string;
  fromYourReadyMadeTrip: boolean;
}

/**
 * The question's own words. A null question means the traveler pressed "Ask a local about this"
 * without typing one — that is what they did, so it is said as such (§13), never an invented text.
 */
export function questionText(q: Pick<InboxQuestion, "question">): { text: string; written: boolean } {
  const t = q.question?.trim();
  return t ? { text: t, written: true } : { text: "Asked about this stop without writing a question", written: false };
}

/** "Day 2 · Fushimi Inari · Kyoto" — the city omitted when the plan has none (never "Unknown"). */
export function questionContext(q: Pick<InboxQuestion, "dayNumber" | "itemTitle" | "city">): string {
  return [`Day ${q.dayNumber}`, q.itemTitle, q.city].filter((p) => p != null && String(p).trim() !== "").join(" · ");
}

/** The tab's label: a count only when there are questions — never "(0)", never a count while loading. */
export function questionsTabLabel(count: number | undefined): string {
  return typeof count === "number" && count > 0 ? `Questions (${count})` : "Questions";
}

/**
 * What to tell the expert when an answer is refused, from the server's status and code. The server
 * owns the length limit and says it in its own 400 message, so it is relayed rather than restated.
 */
export function answerRefusal(status: number, body: { code?: string; message?: string } | null | undefined): string {
  if (status === 409 || body?.code === "already_answered") return "Another local already answered this question.";
  if (status === 404) return "This question is no longer open to you.";
  if (status === 400 && body?.message) return body.message;
  return "Your answer wasn't sent. Try again.";
}
