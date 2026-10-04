/**
 * The expert inbox's Ask-a-local questions (work plan L1-13; ruling R-bj).
 *
 * A QUESTION is what "Ask a local about this" already records: a `funnel_events` row of type
 * `expert_interest` carrying `properties.itemId` (and, optionally, `properties.question`), written by
 * `recordExpertDoorEvent`. Nothing new is stored for the question itself. An ANSWER is an
 * `expert_question_answers` row (migration 349), and it is also posted onto the item's existing thread
 * (`trip_item_comments`) so the traveler reads it where they already read comments on that item.
 *
 * WHO SEES A QUESTION — ONE predicate, `expertMaySeeQuestion`, read by the feed and by the answer rail
 * (§18 rule 1):
 *   · a question on a buyer's copy of a Ready Made Trip goes to that listing's AUTHOR and to nobody
 *     else (R-bj: "on an RMT copy, the author is the default local"; no hand-off window is ruled, so
 *     no other expert sees it);
 *   · any other question goes to an expert whose byline gate passes for the plan's market
 *     (`checkBylineEligibility` — the same gate the expert door's picker uses: approved, a handle, a
 *     live storefront, a VERIFIED neighbourhood in that market). A plan with no market reaches no one;
 *   · never the asker themself, and never once it is answered.
 *
 * WHAT AN EXPERT SEES: the question text (or null), the item's title and day, the plan's city, and
 * when it was asked. Never the traveler's identity or any id but the question's own (LD 40).
 *
 * MONEY: none. The question was recorded with nothing charged, and answering charges nothing. R-q's
 * "authorize at Ask, capture on accept" has no rail to attach to here (work plan: unverified), so it is
 * NOT built and nothing claims it is.
 */
import crypto from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  expertQuestionAnswers,
  funnelEvents,
  itineraryItems,
  notifications,
  readyMadePurchases,
  readyMadeTrips,
  tripItemComments,
  trips,
} from "@shared/schema";
import { checkBylineEligibility } from "./blog-byline-gate.service";
import { getMarketByKey, resolveMarketSlug } from "./trend-engine/operating-markets";

export const INBOX_ANSWER_MAX_CHARS = 2000;

export class InboxQuestionError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
const notFound = () => new InboxQuestionError(404, "not_found", "No such question");

export interface InboxQuestionRow {
  id: string;
  askerId: string | null;
  tripId: string;
  itemId: string;
  itemTitle: string;
  dayNumber: number;
  question: string | null;
  askedAt: Date;
  marketKey: string | null;
  cityName: string | null;
  /** The listing author when the plan is a buyer's ready-made copy, else null. */
  readyMadeAuthorId: string | null;
}

export interface InboxQuestionView {
  id: string;
  question: string | null;
  itemTitle: string;
  dayNumber: number;
  city: string | null;
  askedAt: string;
  fromYourReadyMadeTrip: boolean;
}

/**
 * ONE decision, pure: may `expertId` see (and answer) this open question? `bylineEligible` is the
 * expert's gate result for the question's market, asked only when it matters.
 */
export async function expertMaySeeQuestion(
  expertId: string,
  q: Pick<InboxQuestionRow, "askerId" | "marketKey" | "readyMadeAuthorId">,
  bylineEligible: (marketKey: string) => Promise<boolean>,
): Promise<boolean> {
  if (q.askerId && q.askerId === expertId) return false;
  if (q.readyMadeAuthorId) return q.readyMadeAuthorId === expertId;
  if (!q.marketKey) return false;
  return bylineEligible(q.marketKey);
}

/**
 * Every OPEN question: an `expert_interest` row naming an item that is still on its plan, the latest
 * row per (plan, asker, item) — a re-ask supersedes the earlier one, exactly as the traveler's own
 * read-back (`savedItemQuestions`) treats it — with no answer recorded.
 */
async function loadOpenQuestions(onlyId?: string): Promise<InboxQuestionRow[]> {
  const rows = await db
    .select({
      id: funnelEvents.id,
      askerId: funnelEvents.userId,
      tripId: funnelEvents.tripId,
      properties: funnelEvents.properties,
      createdAt: funnelEvents.createdAt,
    })
    .from(funnelEvents)
    .where(
      and(
        eq(funnelEvents.eventType, "expert_interest"),
        sql`${funnelEvents.properties}->>'itemId' IS NOT NULL`,
        sql`${funnelEvents.tripId} IS NOT NULL`,
      ),
    )
    .orderBy(desc(funnelEvents.createdAt));

  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const itemId = (r.properties as any)?.itemId;
    if (typeof itemId !== "string") continue;
    const key = `${r.tripId}|${r.askerId ?? ""}|${itemId}`;
    if (!latest.has(key)) latest.set(key, r);
  }
  let candidates = Array.from(latest.values());
  if (onlyId) candidates = candidates.filter((r) => r.id === onlyId);
  if (candidates.length === 0) return [];

  const answered = new Set(
    (
      await db
        .select({ q: expertQuestionAnswers.questionEventId })
        .from(expertQuestionAnswers)
        .where(inArray(expertQuestionAnswers.questionEventId, candidates.map((c) => c.id)))
    ).map((a) => a.q),
  );
  candidates = candidates.filter((c) => !answered.has(c.id));
  if (candidates.length === 0) return [];

  const itemIds = candidates.map((c) => String((c.properties as any).itemId));
  const tripIds = Array.from(new Set(candidates.map((c) => c.tripId as string)));
  const items = await db
    .select({ id: itineraryItems.id, tripId: itineraryItems.tripId, title: itineraryItems.title, dayNumber: itineraryItems.dayNumber })
    .from(itineraryItems)
    .where(inArray(itineraryItems.id, itemIds));
  const plans = await db
    .select({ id: trips.id, marketSlug: trips.marketSlug, destination: trips.destination })
    .from(trips)
    .where(inArray(trips.id, tripIds));
  const copies = await db
    .select({ cloneTripId: readyMadePurchases.cloneTripId, authorId: readyMadeTrips.authorId })
    .from(readyMadePurchases)
    .innerJoin(readyMadeTrips, eq(readyMadeTrips.id, readyMadePurchases.readyMadeTripId))
    .where(inArray(readyMadePurchases.cloneTripId, tripIds));

  const out: InboxQuestionRow[] = [];
  for (const c of candidates) {
    const props = c.properties as { itemId: string; question?: unknown };
    const item = items.find((i) => i.id === props.itemId && i.tripId === c.tripId);
    const plan = plans.find((p) => p.id === c.tripId);
    if (!item || !plan) continue; // the item or the plan is gone: nothing left to answer about
    const key = plan.marketSlug ?? resolveMarketSlug(plan.destination ?? null);
    const market = key ? getMarketByKey(key) : undefined;
    out.push({
      id: c.id,
      askerId: c.askerId ?? null,
      tripId: c.tripId as string,
      itemId: item.id,
      itemTitle: item.title,
      dayNumber: item.dayNumber,
      question: typeof props.question === "string" ? props.question : null,
      askedAt: new Date(c.createdAt as any),
      marketKey: market ? market.marketKey : null,
      cityName: market?.cityName ?? null,
      readyMadeAuthorId: copies.find((x) => x.cloneTripId === c.tripId)?.authorId ?? null,
    });
  }
  return out;
}

/** Injectable for tests only; production always asks `checkBylineEligibility`. */
export interface InboxDeps {
  bylineEligible?: (expertId: string, marketKey: string) => Promise<boolean>;
}

function gateFor(expertId: string, deps: InboxDeps = {}) {
  const ask = deps.bylineEligible ?? ((id: string, m: string) => checkBylineEligibility(id, m).then((d) => d.eligible));
  const memo = new Map<string, Promise<boolean>>();
  return (marketKey: string) => {
    if (!memo.has(marketKey)) memo.set(marketKey, ask(expertId, marketKey));
    return memo.get(marketKey)!;
  };
}

/** `GET /api/expert/inbox/questions` — the open questions this expert may answer, newest first. */
export async function listInboxQuestions(expertId: string, deps: InboxDeps = {}): Promise<InboxQuestionView[]> {
  const gate = gateFor(expertId, deps);
  const out: InboxQuestionView[] = [];
  for (const q of await loadOpenQuestions()) {
    if (!(await expertMaySeeQuestion(expertId, q, gate))) continue;
    out.push({
      id: q.id,
      question: q.question,
      itemTitle: q.itemTitle,
      dayNumber: q.dayNumber,
      city: q.cityName,
      askedAt: q.askedAt.toISOString(),
      fromYourReadyMadeTrip: q.readyMadeAuthorId === expertId,
    });
  }
  return out;
}

/**
 * `POST /api/expert/inbox/questions/:id/answer`. One answer per question: the check and the insert
 * run in ONE transaction under a transaction-scoped advisory lock on the question id, so two experts
 * answering at once write one answer and the loser is told it was answered (409). A question the
 * caller may not see — absent, superseded, on a vanished item, outside their market — is ONE 404.
 */
export async function answerInboxQuestion(
  expertId: string,
  questionId: string,
  answer: string,
  deps: InboxDeps = {},
): Promise<{ answerId: string; commentId: string }> {
  const [q] = await loadOpenQuestions(questionId);
  if (!q) {
    const [done] = await db
      .select({ id: expertQuestionAnswers.id })
      .from(expertQuestionAnswers)
      .where(eq(expertQuestionAnswers.questionEventId, questionId))
      .limit(1);
    if (done) throw new InboxQuestionError(409, "already_answered", "This question has already been answered");
    throw notFound();
  }
  if (!(await expertMaySeeQuestion(expertId, q, gateFor(expertId, deps)))) throw notFound();

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`expert-question:${questionId}`}))`);
    const [existing] = await tx
      .select({ id: expertQuestionAnswers.id })
      .from(expertQuestionAnswers)
      .where(eq(expertQuestionAnswers.questionEventId, questionId))
      .limit(1);
    if (existing) throw new InboxQuestionError(409, "already_answered", "This question has already been answered");

    const now = new Date();
    const answerId = crypto.randomUUID();
    await tx.insert(expertQuestionAnswers).values({
      id: answerId,
      questionEventId: questionId,
      tripId: q.tripId,
      itemId: q.itemId,
      expertId,
      answer,
      status: "answered",
      createdAt: now,
    });
    // The traveler's item thread: the answer is a comment on that item, authored by the expert.
    const [comment] = await tx
      .insert(tripItemComments)
      .values({ tripId: q.tripId, itemId: q.itemId, authorId: expertId, body: answer })
      .returning({ id: tripItemComments.id });
    return { answerId, commentId: comment.id };
  });

  // Best-effort, after the commit: a notification failure never undoes an answer (§15b).
  if (q.askerId) {
    try {
      await db.insert(notifications).values({
        userId: q.askerId,
        type: "itinerary_update",
        title: "A local answered your question",
        message: `About "${q.itemTitle}": "${answer.slice(0, 140)}"`,
        relatedId: q.itemId,
        relatedType: "trip",
        data: { tripId: q.tripId, itemId: q.itemId, workspacePath: `/plans/${q.tripId}` },
      } as any);
    } catch (err) {
      console.error("[inbox-questions] notify failed (non-fatal):", err);
    }
  }
  return result;
}
