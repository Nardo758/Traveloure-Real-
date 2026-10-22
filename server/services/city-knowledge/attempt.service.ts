/**
 * One city-knowledge sitting: draw, answer, score, retake, and the approval read.
 * The pass rule lives in shared/city-knowledge.ts. This file only stores and reads it.
 */
import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  PART_A_ITEM_COUNT,
  PART_A_LIMIT_MINUTES,
  PART_B_LIMIT_MINUTES,
  addDays,
  authorizesApproval,
  calendarDateInZone,
  choiceMatches,
  cityKeyForName,
  countBacktracks,
  drawItemIds,
  evaluateTiming,
  hashSeed,
  localExpertApprovalDecision,
  mayGrantRetake,
  mayStartAttempt,
  mulberry32,
  numericPass,
  overallPercent,
  partAPercent,
  partBPercent,
  publicTopicBadges,
  retakeDecision,
  routingScore,
  shortAnswerMatches,
  shuffle,
  topicScores,
  uniformAnswerPace,
  zoneForStop,
  briefPercent,
  type CycleAttempt,
  type MetricId,
  type PartPercents,
  type RetakeState,
} from "@shared/city-knowledge";
import { cityKnowledgeAttempts, cityKnowledgeBanks, cityKnowledgeRetakeGrants, localExpertForms } from "@shared/schema";
import { db } from "../../db";
import {
  activeClaims,
  activeTimingFacts,
  cityKnowledgeBankSchema,
  hashCanonical,
  loadCityKnowledgeBank,
  publicItem,
  publishedCityKeys,
  type CityKnowledgeBank,
  type CityKnowledgeItem,
  type LoadedBank,
} from "./bank";
import { reviewPlan, type ReviewComplete } from "./reviewer";

type FormRow = typeof localExpertForms.$inferSelect;
type AttemptRow = typeof cityKnowledgeAttempts.$inferSelect;

export interface SubmittedStop {
  date: string;
  stopName: string;
  plannedArrival: string;
  plannedDeparture?: string;
  mode?: string;
  notes?: string;
  reservationTime?: string | null;
}

export interface SubmittedBrief {
  id: "b1" | "b2";
  stops: SubmittedStop[];
  locationNotes?: string;
  avoid?: string;
  backup?: string;
  /** Injected by a test. Production leaves both null, and metric (a) stays unverifiable. */
  applicantMinutes?: number | null;
  referenceMinutes?: number | null;
}

interface Progress {
  bankContentHash: string;
  cursor: number;
  optionOrders: Record<string, string[]>;
  answers: { itemId: string; selectedOptionIds?: string[]; shortAnswer?: string; at: string }[];
  answerSeconds: number[];
}

interface ScoreResult {
  bankContentHash: string;
  scoresComplete: boolean;
  numericPass: boolean;
  percents: PartPercents | null;
  partB: number | null;
  overall: number | null;
  topics: ReturnType<typeof topicScores>;
  attentionReasons: string[];
  partA: { correct: number; drawn: number };
  briefs: {
    id: "b1" | "b2";
    percent: number | null;
    metrics: Record<MetricId, { score: number | null; rationale: string; sourcesChecked: string[]; confidence: string; unverifiable: boolean }>;
    autoFindings: string[];
  }[];
  answers: Progress["answers"];
}

const COUNTED = new Set(["pass", "fail", "recorded"]);
const OPEN = new Set(["in_progress", "part_b"]);

function progressOf(row: AttemptRow): Progress {
  const raw = (row.result ?? {}) as Partial<Progress>;
  return {
    bankContentHash: typeof raw.bankContentHash === "string" ? raw.bankContentHash : "",
    cursor: typeof raw.cursor === "number" ? raw.cursor : 0,
    optionOrders: raw.optionOrders && typeof raw.optionOrders === "object" ? raw.optionOrders : {},
    answers: Array.isArray(raw.answers) ? raw.answers : [],
    answerSeconds: Array.isArray(raw.answerSeconds) ? raw.answerSeconds.filter((n) => typeof n === "number") : [],
  };
}

function scoreOf(row: AttemptRow): ScoreResult | null {
  if (!COUNTED.has(row.outcome ?? "") && row.outcome !== "held") return null;
  const raw = row.result as ScoreResult | null;
  if (!raw || typeof raw !== "object" || !("scoresComplete" in raw)) return null;
  return raw;
}

async function attemptsForUser(userId: string, cityKey: string): Promise<AttemptRow[]> {
  return db
    .select()
    .from(cityKnowledgeAttempts)
    .where(and(eq(cityKnowledgeAttempts.userId, userId), eq(cityKnowledgeAttempts.cityKey, cityKey)))
    .orderBy(desc(cityKnowledgeAttempts.attemptNumber));
}

function cycleFrom(rows: AttemptRow[], bank: LoadedBank | null): CycleAttempt[] {
  return rows
    .filter((row) => COUNTED.has(row.outcome ?? ""))
    .slice()
    .reverse()
    .map((row) => {
      const score = scoreOf(row);
      const percents = score?.percents ?? null;
      const passed = score?.numericPass === true;
      const authorizes = bank
        ? authorizesApproval({
            percents,
            attention: row.attentionFlag === true,
            scoresComplete: score?.scoresComplete === true,
            bankSignedOff: bank.signedOff,
            bankContentHash: bank.contentHash,
            attemptBankContentHash: score?.bankContentHash ?? null,
          })
        : false;
      return {
        completedAt: (row.scoredAt ?? row.submittedAt ?? row.startedAt ?? new Date()).toISOString(),
        numericPass: passed,
        authorizesApproval: authorizes,
      };
    });
}

async function unusedGrant(userId: string, cityKey: string, rows: AttemptRow[]): Promise<boolean> {
  const grants = await db
    .select()
    .from(cityKnowledgeRetakeGrants)
    .where(and(eq(cityKnowledgeRetakeGrants.userId, userId), eq(cityKnowledgeRetakeGrants.cityKey, cityKey)));
  const counted = rows.filter((row) => COUNTED.has(row.outcome ?? ""));
  return grants.some((grant) => !counted.some((row) => (row.attemptNumber ?? 0) >= grant.forAttemptNumber));
}

export async function retakeFor(userId: string, cityKey: string, bank: LoadedBank | null): Promise<RetakeState> {
  const rows = await attemptsForUser(userId, cityKey);
  const grant = await unusedGrant(userId, cityKey, rows);
  return retakeDecision(cycleFrom(rows, bank), new Date(), grant);
}

function profileReady(form: FormRow): boolean {
  const city = (form.city ?? "").trim().length > 0;
  const proof = Array.isArray(form.knowledgeProofAnswers) && form.knowledgeProofAnswers.length > 0;
  const local = Array.isArray(form.localSpecialties) && form.localSpecialties.length > 0;
  return city && (proof || local);
}

export async function timelineFactsForForm(form: FormRow) {
  if (form.expertType !== "local_expert") return {};
  const keys = await publishedCityKeys();
  const cityKey = cityKeyForName(form.city, keys);
  const ready = profileReady(form);
  if (!cityKey) {
    return {
      requiresCityKnowledge: true as const,
      profileReady: ready,
      cityKnowledge: "open" as const,
      cityKnowledgeNote: "No city-knowledge test is published for this city.",
    };
  }
  const bank = await loadCityKnowledgeBank(cityKey);
  const rows = await attemptsForUser(form.userId, cityKey);
  const open = rows.find((row) => OPEN.has(row.status ?? ""));
  const decision = retakeDecision(cycleFrom(rows, bank), new Date(), await unusedGrant(form.userId, cityKey, rows));
  let cityKnowledge: "open" | "done" = "open";
  let cityKnowledgeNote: string | undefined;
  if (decision.state === "passed") cityKnowledge = "done";
  else if (open) cityKnowledgeNote = "Your test is in progress.";
  else if (decision.state === "recorded") {
    cityKnowledgeNote = "Your result is recorded. Review has not started, because this result cannot authorize approval yet.";
  } else if (decision.state === "reapply") {
    cityKnowledgeNote = `After three results that did not pass, you can apply again after ${new Date(decision.eligibleAt).toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" })}.`;
  } else if (decision.state === "wait") {
    cityKnowledgeNote = `You can take this test again after ${new Date(decision.eligibleAt).toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" })}.`;
  } else if (decision.state === "needs_grant") {
    cityKnowledgeNote = "The wait is over. An admin has to grant the retake before you can start.";
  } else if (!bank?.signedOff) {
    cityKnowledgeNote = "The question bank is still being checked. A result is saved. It cannot approve your application until the bank is signed off.";
  }
  return { requiresCityKnowledge: true as const, profileReady: ready, cityKnowledge, cityKnowledgeNote };
}

export async function approvalForForm(form: { expertType: string | null; city: string | null; userId: string }) {
  const keys = await publishedCityKeys();
  const cityKey = cityKeyForName(form.city, keys);
  const bank = cityKey ? await loadCityKnowledgeBank(cityKey) : null;
  const decision = cityKey && bank ? await retakeFor(form.userId, cityKey, bank) : null;
  const gate = localExpertApprovalDecision({
    expertType: form.expertType,
    cityKey,
    bankPublished: !!bank,
    bankSignedOff: bank?.signedOff === true,
    qualifyingPass: decision?.state === "passed",
  });
  return { ...gate, cityKey, bankSignedOff: bank?.signedOff === true };
}

export function passingScoreResult(bankContentHash: string): ScoreResult {
  const percents = { partA: 100, b1: 100, b2: 100 };
  const topics = topicScores({ partA: [], briefs: [] });
  const empty = { score: 4, rationale: "Fixture pass.", sourcesChecked: [] as string[], confidence: "high", unverifiable: false };
  return {
    bankContentHash,
    scoresComplete: true,
    numericPass: true,
    percents,
    partB: 100,
    overall: 100,
    topics,
    attentionReasons: [],
    partA: { correct: PART_A_ITEM_COUNT, drawn: PART_A_ITEM_COUNT },
    briefs: (["b1", "b2"] as const).map((id) => ({
      id,
      percent: 100,
      metrics: { a: empty, b: empty, c: empty, d: empty, e: empty, f: empty },
      autoFindings: [],
    })),
    answers: [],
  };
}

async function expireIfNeeded(row: AttemptRow): Promise<AttemptRow> {
  const now = Date.now();
  const partAOver = row.status === "in_progress" && row.startedAt && now > row.startedAt.getTime() + PART_A_LIMIT_MINUTES * 60_000;
  const partBOver = row.status === "part_b" && row.partASubmittedAt && now > row.partASubmittedAt.getTime() + PART_B_LIMIT_MINUTES * 60_000;
  if (!partAOver && !partBOver) return row;
  const reason = partAOver
    ? "Part A time ran out. This sitting was not scored."
    : "Part B time ran out. This sitting was not scored.";
  const [updated] = await db
    .update(cityKnowledgeAttempts)
    .set({
      status: "expired",
      outcome: "held",
      attentionFlag: true,
      scoredAt: new Date(),
      result: { scoresComplete: false, numericPass: false, attentionReasons: [reason], bankContentHash: progressOf(row).bankContentHash },
    })
    .where(eq(cityKnowledgeAttempts.id, row.id))
    .returning();
  return updated ?? row;
}

export async function expertHome(userId: string) {
  const [form] = await db.select().from(localExpertForms).where(eq(localExpertForms.userId, userId)).limit(1);
  if (!form || form.expertType !== "local_expert") {
    return { available: false as const, message: "This test is for a local-expert application." };
  }
  const keys = await publishedCityKeys();
  const cityKey = cityKeyForName(form.city, keys);
  if (!cityKey) {
    return { available: false as const, message: "No city-knowledge test is published for this city." };
  }
  const bank = await loadCityKnowledgeBank(cityKey);
  if (!bank) return { available: false as const, message: "No city-knowledge test is published for this city." };
  const rows = await attemptsForUser(userId, cityKey);
  const open = rows.find((row) => OPEN.has(row.status ?? ""));
  const fresh = open ? await expireIfNeeded(open) : null;
  const decision = await retakeFor(userId, cityKey, bank);
  const latestScored = rows.map(scoreOf).find((score) => score) ?? null;
  const latestRow = rows.find((row) => COUNTED.has(row.outcome ?? "") || row.outcome === "held") ?? null;
  return {
    available: true as const,
    cityKey: bank.bank.cityKey,
    cityName: bank.bank.cityName,
    bankSignedOff: bank.signedOff,
    identityVerified: form.identityVerificationStatus === "verified",
    retake: decision,
    canStart: form.identityVerificationStatus === "verified" && mayStartAttempt(decision, fresh ? OPEN.has(fresh.status ?? "") : false),
    inProgress: fresh && OPEN.has(fresh.status ?? "") ? fresh.status : null,
    result: latestRow && latestScored ? publicResult(latestRow, latestScored, bank) : null,
  };
}

function publicResult(row: AttemptRow, score: ScoreResult, bank: LoadedBank) {
  const authorizes = authorizesApproval({
    percents: score.percents,
    attention: row.attentionFlag === true,
    scoresComplete: score.scoresComplete,
    bankSignedOff: bank.signedOff,
    bankContentHash: bank.contentHash,
    attemptBankContentHash: score.bankContentHash,
  });
  const attentionReasons = [...(score.attentionReasons ?? [])];
  if (!bank.signedOff) {
    attentionReasons.push("The question bank is not signed off, so this result cannot approve the application.");
  }
  return {
    outcome: authorizes ? "pass" : row.outcome,
    overallPercent: score.overall ?? null,
    partAPercent: score.percents?.partA ?? (score.partA && score.partA.drawn > 0 ? (score.partA.correct / score.partA.drawn) * 100 : null),
    partBPercent: score.partB ?? null,
    topics: (score.topics ?? []).map((topic) => ({
      topic: topic.topic,
      label: topic.label,
      percent: topic.percent,
      flagged: topic.flagged,
    })),
    attention: row.attentionFlag === true || !bank.signedOff,
    attentionReasons,
  };
}

export async function startAttempt(userId: string) {
  const home = await expertHome(userId);
  if (!home.available) return { status: 409 as const, message: home.message };
  if (!home.identityVerified) {
    return { status: 403 as const, message: "Identity verification has to be finished before this test." };
  }
  if (home.inProgress) return { status: 409 as const, message: "You already have a test in progress." };
  if (!home.canStart) return { status: 409 as const, message: startRefusal(home.retake) };
  const [form] = await db.select().from(localExpertForms).where(eq(localExpertForms.userId, userId)).limit(1);
  if (!form) return { status: 409 as const, message: "Submit a local-expert application before this test." };
  const loaded = await loadCityKnowledgeBank(home.cityKey);
  if (!loaded) return { status: 409 as const, message: "No city-knowledge test is published for this city." };
  const today = calendarDateInZone(new Date(), loaded.bank.timeZone);
  if (!today) return { status: 500 as const, message: "The test clock for this city could not be read." };
  const seed = randomUUID();
  const drawn = drawItemIds(loaded.bank.items, today, seed, PART_A_ITEM_COUNT);
  if (!drawn) {
    return { status: 409 as const, message: "Not enough checked questions are available to start this test." };
  }
  const byId = new Map(loaded.bank.items.map((item) => [item.id, item]));
  const optionOrders: Record<string, string[]> = {};
  const sourceHashes: Record<string, string> = {};
  const rng = mulberry32(hashSeed(`${seed}:options`));
  for (const id of drawn) {
    const item = byId.get(id);
    if (!item) continue;
    sourceHashes[id] = hashCanonical(item);
    if (item.options && item.options.length > 0) {
      optionOrders[id] = shuffle(item.options.map((option) => option.id), rng);
    }
  }
  const prior = await attemptsForUser(userId, home.cityKey);
  const nextNumber = (prior[0]?.attemptNumber ?? 0) + 1;
  const id = randomUUID();
  await db.insert(cityKnowledgeAttempts).values({
    id,
    userId,
    applicationId: form.id,
    cityKey: home.cityKey,
    attemptNumber: nextNumber,
    status: "in_progress",
    drawSeed: seed,
    itemIds: drawn,
    sourceHashes,
    attentionFlag: false,
    startedAt: new Date(),
    result: { bankContentHash: loaded.contentHash, cursor: 0, optionOrders, answers: [], answerSeconds: [] },
  });
  return { status: 200 as const, attemptId: id };
}

function startRefusal(decision: RetakeState): string {
  if (decision.state === "passed") return "You already have a result that can approve this application.";
  if (decision.state === "recorded") return "Your last result is recorded. It is not a fail. An admin can grant another sitting.";
  if (decision.state === "reapply") return `After three results that did not pass, you can apply again after ${decision.eligibleAt}.`;
  if (decision.state === "wait") return `You can take this test again after ${decision.eligibleAt}. An admin still has to grant the retake.`;
  if (decision.state === "needs_grant") return "The wait is over. An admin has to grant the retake before you can start.";
  return "You cannot start this test right now.";
}

export async function currentQuestion(userId: string) {
  const [form] = await db.select().from(localExpertForms).where(eq(localExpertForms.userId, userId)).limit(1);
  if (!form) return { status: 404 as const, message: "No application." };
  const cityKey = cityKeyForName(form.city, await publishedCityKeys());
  if (!cityKey) return { status: 404 as const, message: "No test." };
  const rows = await attemptsForUser(userId, cityKey);
  const open = rows.find((row) => OPEN.has(row.status ?? ""));
  if (!open) return { status: 404 as const, message: "No test is in progress." };
  const row = await expireIfNeeded(open);
  if (!OPEN.has(row.status ?? "")) {
    return { status: 409 as const, message: "This sitting's time ran out. It was not scored as a pass or a fail." };
  }
  const loaded = await loadCityKnowledgeBank(cityKey);
  if (!loaded) return { status: 404 as const, message: "No test." };
  const ids = Array.isArray(row.itemIds) ? (row.itemIds as string[]) : [];
  const progress = progressOf(row);
  if (row.status === "part_b") {
    const started = row.partASubmittedAt?.getTime() ?? Date.now();
    return {
      status: 200 as const,
      phase: "part_b" as const,
      briefs: loaded.bank.briefs.map((brief) => ({ id: brief.id, title: brief.title, prompt: brief.prompt })),
      secondsLeft: Math.max(0, Math.floor((started + PART_B_LIMIT_MINUTES * 60_000 - Date.now()) / 1000)),
    };
  }
  const itemId = ids[progress.cursor];
  const item = loaded.bank.items.find((candidate) => candidate.id === itemId);
  if (!item) return { status: 409 as const, message: "This question is no longer in the bank." };
  const started = row.startedAt?.getTime() ?? Date.now();
  return {
    status: 200 as const,
    phase: "part_a" as const,
    index: progress.cursor + 1,
    total: ids.length,
    secondsLeft: Math.max(0, Math.floor((started + PART_A_LIMIT_MINUTES * 60_000 - Date.now()) / 1000)),
    item: publicItem(item, progress.optionOrders[item.id] ?? null),
  };
}

export async function answerCurrent(userId: string, body: { itemId: string; selectedOptionIds?: string[]; shortAnswer?: string }) {
  const view = await currentQuestion(userId);
  if (view.status !== 200 || view.phase !== "part_a") {
    return { status: view.status === 200 ? 409 : view.status, message: "message" in view ? view.message : "Part A is not open." };
  }
  if (view.item.id !== body.itemId) return { status: 409 as const, message: "That question is not the current one." };
  const [form] = await db.select().from(localExpertForms).where(eq(localExpertForms.userId, userId)).limit(1);
  if (!form) return { status: 404 as const, message: "No application." };
  const cityKey = cityKeyForName(form.city, await publishedCityKeys())!;
  const rows = await attemptsForUser(userId, cityKey);
  const open = rows.find((row) => row.status === "in_progress");
  if (!open) return { status: 409 as const, message: "No test is in progress." };
  const progress = progressOf(open);
  const now = new Date();
  const previous = progress.answers.length > 0
    ? new Date(progress.answers[progress.answers.length - 1].at).getTime()
    : open.startedAt?.getTime() ?? now.getTime();
  progress.answerSeconds.push(Math.max(0, Math.round((now.getTime() - previous) / 1000)));
  progress.answers.push({
    itemId: body.itemId,
    selectedOptionIds: body.selectedOptionIds,
    shortAnswer: body.shortAnswer,
    at: now.toISOString(),
  });
  progress.cursor += 1;
  const ids = Array.isArray(open.itemIds) ? (open.itemIds as string[]) : [];
  const done = progress.cursor >= ids.length;
  await db.update(cityKnowledgeAttempts).set({
    result: progress,
    status: done ? "part_b" : "in_progress",
    partASubmittedAt: done ? now : null,
  }).where(eq(cityKnowledgeAttempts.id, open.id));
  return { status: 200 as const, phase: done ? "part_b" as const : "part_a" as const };
}

function gradeItem(item: CityKnowledgeItem, answer: Progress["answers"][number] | undefined): boolean {
  if (!answer) return false;
  if (item.type === "sa") return shortAnswerMatches(answer.shortAnswer ?? "", item.acceptAllOf ?? []);
  return choiceMatches(answer.selectedOptionIds ?? [], item.correctOptionIds ?? []);
}

function planText(brief: SubmittedBrief): string {
  const stops = brief.stops.map((stop) =>
    `${stop.date} ${stop.plannedArrival}–${stop.plannedDeparture ?? ""} ${stop.stopName} by ${stop.mode ?? "unspecified"}${stop.reservationTime ? ` slot ${stop.reservationTime}` : ""}. ${stop.notes ?? ""}`,
  );
  return [
    ...stops,
    brief.locationNotes ? `Location notes: ${brief.locationNotes}` : "",
    brief.avoid ? `Avoid: ${brief.avoid}` : "",
    brief.backup ? `Backup: ${brief.backup}` : "",
  ].filter(Boolean).join("\n");
}

async function reviewerComplete(): Promise<ReviewComplete | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const { claudeService } = await import("../claude.service");
  return async (user: string) => {
    const out = await claudeService.completeJson({
      system: "Score the plan. Use only the claims in the prompt.",
      user,
      maxTokens: 1200,
      sourceType: "city_knowledge_review",
      label: "city-knowledge-review",
    });
    return out.result;
  };
}

export async function submitPartB(userId: string, briefs: SubmittedBrief[]) {
  const [form] = await db.select().from(localExpertForms).where(eq(localExpertForms.userId, userId)).limit(1);
  if (!form) return { status: 404 as const, message: "No application." };
  const cityKey = cityKeyForName(form.city, await publishedCityKeys());
  if (!cityKey) return { status: 404 as const, message: "No test." };
  const rows = await attemptsForUser(userId, cityKey);
  const open = rows.find((row) => row.status === "part_b");
  if (!open) return { status: 409 as const, message: "Part B is not open." };
  const row = await expireIfNeeded(open);
  if (row.status !== "part_b") {
    return { status: 409 as const, message: "Part B time ran out. This sitting was not scored as a pass or a fail." };
  }
  const loaded = await loadCityKnowledgeBank(cityKey);
  if (!loaded) return { status: 404 as const, message: "No test." };
  const progress = progressOf(row);
  const scored = await scoreSitting(loaded, row, progress, briefs, await reviewerComplete());
  const authorizes = authorizesApproval({
    percents: scored.percents,
    attention: scored.attentionReasons.length > 0,
    scoresComplete: scored.scoresComplete,
    bankSignedOff: loaded.signedOff,
    bankContentHash: loaded.contentHash,
    attemptBankContentHash: loaded.contentHash,
  });
  const outcome = !scored.scoresComplete ? "held" : !scored.numericPass ? "fail" : authorizes ? "pass" : "recorded";
  const now = new Date();
  await db.update(cityKnowledgeAttempts).set({
    status: "scored",
    outcome,
    attentionFlag: scored.attentionReasons.length > 0,
    submittedAt: now,
    scoredAt: now,
    result: { ...scored, bankContentHash: loaded.contentHash },
  }).where(eq(cityKnowledgeAttempts.id, row.id));
  const saved = { ...row, outcome, attentionFlag: scored.attentionReasons.length > 0 };
  return { status: 200 as const, result: publicResult(saved, { ...scored, bankContentHash: loaded.contentHash }, loaded) };
}

async function scoreSitting(
  loaded: LoadedBank,
  row: AttemptRow,
  progress: Progress,
  briefs: SubmittedBrief[],
  complete: ReviewComplete | null,
): Promise<ScoreResult> {
  const bank = loaded.bank;
  const ids = Array.isArray(row.itemIds) ? (row.itemIds as string[]) : [];
  const byId = new Map(bank.items.map((item) => [item.id, item]));
  const partARows = ids.flatMap((id) => {
    const item = byId.get(id);
    if (!item) return [];
    const answer = progress.answers.find((candidate) => candidate.itemId === id);
    return [{ topic: item.topic, correct: gradeItem(item, answer) }];
  });
  const correct = partARows.filter((item) => item.correct).length;
  const aPercent = partAPercent(correct, ids.length);
  const attentionReasons: string[] = [];
  if (uniformAnswerPace(progress.answerSeconds)) {
    attentionReasons.push("Every answer was recorded at the same pace.");
  }
  if (loaded.contentHash !== progress.bankContentHash) {
    attentionReasons.push("The question bank changed during this sitting.");
  }
  const briefScores: ScoreResult["briefs"] = [];
  const briefPercents: Partial<Record<"b1" | "b2", number | null>> = {};
  for (const spec of bank.briefs) {
    const submitted = briefs.find((brief) => brief.id === spec.id) ?? { id: spec.id, stops: [] };
    const timing = evaluateTiming(submitted.stops, activeTimingFacts(bank));
    const zones = submitted.stops.map((stop) => zoneForStop(stop.stopName, bank.zones));
    const back = countBacktracks(zones);
    const routed = routingScore({
      applicantMinutes: submitted.applicantMinutes ?? null,
      referenceMinutes: submitted.referenceMinutes ?? null,
      backtracks: back.incomplete ? 0 : back.backtracks,
      infeasible: false,
    });
    const autoFindings = [
      ...timing.reasons,
      routed.unverifiable ? "Routing minutes were not available." : `Routing score ${routed.score}.`,
      back.incomplete ? "At least one stop has no zone, so backtracking was not counted." : `${back.backtracks} zone backtrack(s).`,
    ];
    const reviewed = await reviewPlan({
      briefTitle: spec.title,
      briefPrompt: spec.prompt,
      claims: activeClaims(spec),
      planText: planText(submitted),
      autoFindings,
      timingViolations: timing.violations,
      timingUnverifiable: timing.unverifiable,
      routingUnverifiable: routed.unverifiable,
      routingScore: routed.score,
    }, complete);
    if (reviewed.attention) attentionReasons.push(`${spec.title} has a metric that could not be fully checked.`);
    const metricScores = Object.fromEntries(
      (Object.keys(reviewed.metrics) as MetricId[]).map((id) => [id, reviewed.metrics[id].score]),
    ) as Partial<Record<MetricId, number | null>>;
    const percent = briefPercent(metricScores);
    briefPercents[spec.id] = percent;
    briefScores.push({
      id: spec.id,
      percent,
      metrics: reviewed.metrics,
      autoFindings,
    });
  }
  const percents = aPercent != null && briefPercents.b1 != null && briefPercents.b2 != null
    ? { partA: aPercent, b1: briefPercents.b1, b2: briefPercents.b2 }
    : null;
  const scoresComplete = percents != null;
  const topics = topicScores({
    partA: partARows,
    briefs: briefScores.map((brief) => ({
      id: brief.id,
      percent: brief.percent,
      metrics: Object.fromEntries(
        (Object.keys(brief.metrics) as MetricId[]).map((id) => [id, brief.metrics[id].score]),
      ) as Partial<Record<MetricId, number | null>>,
    })),
  });
  return {
    bankContentHash: loaded.contentHash,
    scoresComplete,
    numericPass: percents != null && numericPass(percents),
    percents,
    partB: percents ? partBPercent(percents.b1, percents.b2) : null,
    overall: percents ? overallPercent(percents) : null,
    topics,
    attentionReasons,
    partA: { correct, drawn: ids.length },
    briefs: briefScores,
    answers: progress.answers,
  };
}

export async function adminSummaryForForms(forms: { id: string; userId: string; expertType: string | null; city: string | null }[]) {
  const local = forms.filter((form) => form.expertType === "local_expert");
  const out = new Map<string, unknown>();
  if (local.length === 0) return out;
  const ids = local.map((form) => form.id);
  const attempts = await db.select().from(cityKnowledgeAttempts).where(inArray(cityKnowledgeAttempts.applicationId, ids));
  const keys = await publishedCityKeys();
  for (const form of local) {
    const cityKey = cityKeyForName(form.city, keys);
    const bank = cityKey ? await loadCityKnowledgeBank(cityKey) : null;
    const rows = attempts.filter((row) => row.applicationId === form.id).sort((a, b) => (b.attemptNumber ?? 0) - (a.attemptNumber ?? 0));
    const decision = retakeDecision(cycleFrom(rows, bank), new Date(), await unusedGrant(form.userId, cityKey ?? "", rows));
    const gate = localExpertApprovalDecision({
      expertType: form.expertType,
      cityKey,
      bankPublished: !!bank,
      bankSignedOff: bank?.signedOff === true,
      qualifyingPass: decision.state === "passed",
    });
    const latest = rows.find((row) => row.outcome != null) ?? null;
    const score = latest ? scoreOf(latest) : null;
    out.set(form.id, {
      cityKey,
      bankSignedOff: bank?.signedOff === true,
      approvalAllowed: gate.allowed,
      approvalMessage: gate.allowed ? null : gate.message,
      retake: decision,
      mayGrantRetake: mayGrantRetake(retakeDecision(cycleFrom(rows, bank), new Date(), false)),
      latest: latest && score ? {
        outcome: latest.outcome,
        attention: latest.attentionFlag === true,
        scoredAt: latest.scoredAt,
        overallPercent: score.overall,
        partAPercent: score.percents?.partA ?? (score.partA && score.partA.drawn > 0 ? (score.partA.correct / score.partA.drawn) * 100 : null),
        partBPercent: score.partB,
        topics: score.topics,
        attentionReasons: score.attentionReasons,
        briefs: score.briefs,
        partA: score.partA,
        itemIds: latest.itemIds,
        sourceHashes: latest.sourceHashes,
      } : null,
    });
  }
  return out;
}

export async function grantRetake(applicationId: string, adminId: string) {
  const [form] = await db.select().from(localExpertForms).where(eq(localExpertForms.id, applicationId)).limit(1);
  if (!form) return { status: 404 as const, message: "Application not found." };
  const cityKey = cityKeyForName(form.city, await publishedCityKeys());
  if (!cityKey) return { status: 409 as const, message: "No city-knowledge test is published for this city." };
  const bank = await loadCityKnowledgeBank(cityKey);
  const rows = await attemptsForUser(form.userId, cityKey);
  const without = retakeDecision(cycleFrom(rows, bank), new Date(), false);
  if (!mayGrantRetake(without)) {
    return { status: 409 as const, message: "A retake cannot be granted for this application right now." };
  }
  if (await unusedGrant(form.userId, cityKey, rows)) {
    return { status: 409 as const, message: "A retake is already granted." };
  }
  const next = (rows[0]?.attemptNumber ?? 0) + 1;
  const eligibleAt = without.state === "wait" || without.state === "needs_grant" ? addDays(without.eligibleAt, 0) : new Date();
  await db.insert(cityKnowledgeRetakeGrants).values({
    id: randomUUID(),
    userId: form.userId,
    applicationId: form.id,
    cityKey,
    forAttemptNumber: next,
    grantedAt: new Date(),
    grantedBy: adminId,
  });
  return {
    status: 200 as const,
    message: "Retake granted. The wait still applies.",
    eligibleAt: eligibleAt.toISOString(),
  };
}

export async function signOffBank(cityKey: string, adminId: string) {
  const loaded = await loadCityKnowledgeBank(cityKey);
  if (!loaded) return { status: 404 as const, message: "No city-knowledge bank for that city." };
  await db
    .insert(cityKnowledgeBanks)
    .values({
      cityKey,
      verificationStatus: "signed_off",
      signedOffHash: loaded.contentHash,
      updatedAt: new Date(),
      updatedBy: adminId,
    })
    .onConflictDoUpdate({
      target: cityKnowledgeBanks.cityKey,
      set: {
        verificationStatus: "signed_off",
        signedOffHash: loaded.contentHash,
        updatedAt: new Date(),
        updatedBy: adminId,
      },
    });
  return { status: 200 as const, signedOff: true, contentHash: loaded.contentHash };
}

export async function saveBank(cityKey: string, adminId: string, body: unknown) {
  const parsed = cityKnowledgeBankSchema.safeParse(body);
  if (!parsed.success || parsed.data.cityKey !== cityKey) {
    return { status: 400 as const, message: "That bank does not match this city." };
  }
  await db
    .insert(cityKnowledgeBanks)
    .values({
      cityKey,
      verificationStatus: "unverified",
      signedOffHash: null,
      bankJson: parsed.data,
      updatedAt: new Date(),
      updatedBy: adminId,
    })
    .onConflictDoUpdate({
      target: cityKnowledgeBanks.cityKey,
      set: {
        verificationStatus: "unverified",
        signedOffHash: null,
        bankJson: parsed.data,
        updatedAt: new Date(),
        updatedBy: adminId,
      },
    });
  return { status: 200 as const, signedOff: false };
}

export async function bankAdminView(cityKey: string) {
  const loaded = await loadCityKnowledgeBank(cityKey);
  if (!loaded) return null;
  const active = loaded.bank.items.filter((item) => item.status === "active" && item.factCheck === "ok");
  const inactive = loaded.bank.items.filter((item) => item.status !== "active" || item.factCheck !== "ok");
  return {
    cityKey: loaded.bank.cityKey,
    cityName: loaded.bank.cityName,
    verificationStatus: loaded.bank.verificationStatus,
    signedOff: loaded.signedOff,
    source: loaded.source,
    factCheckedOn: loaded.bank.factCheckedOn ?? null,
    activeCount: active.length,
    inactiveCount: inactive.length,
    contentHash: loaded.contentHash,
  };
}

export async function badgesForUser(userId: string): Promise<{ topic: string; label: string }[]> {
  const [form] = await db.select().from(localExpertForms).where(eq(localExpertForms.userId, userId)).limit(1);
  if (!form || form.status !== "approved") return [];
  const cityKey = cityKeyForName(form.city, await publishedCityKeys());
  if (!cityKey) return [];
  const bank = await loadCityKnowledgeBank(cityKey);
  if (!bank?.signedOff) return [];
  const rows = await attemptsForUser(userId, cityKey);
  for (const row of rows) {
    const score = scoreOf(row);
    if (!score) continue;
    const ok = authorizesApproval({
      percents: score.percents,
      attention: row.attentionFlag === true,
      scoresComplete: score.scoresComplete,
      bankSignedOff: true,
      bankContentHash: bank.contentHash,
      attemptBankContentHash: score.bankContentHash,
    });
    if (!ok) continue;
    return publicTopicBadges(score.topics, bank.bank.cityName, true);
  }
  return [];
}

export function briefPrompts(bank: CityKnowledgeBank) {
  return bank.briefs.map((brief) => ({ id: brief.id, title: brief.title, prompt: brief.prompt }));
}
