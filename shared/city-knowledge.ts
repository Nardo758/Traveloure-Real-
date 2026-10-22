/**
 * City-knowledge test rules. Kyoto is the first bank; the rules are the same for every city.
 *
 * The question text and the answer key live in a data file the server reads
 * (`data/city-knowledge/<city>.json`), not here, so an edit to an item is not a code change.
 * This module is safe for the client: it has no answers.
 *
 * Leon, 21 Oct 2026: overall 80% and at least 70% on Part A and on Part B. A fail is not
 * overridden. A retake is granted, at most twice, after 14 days and then 60 days.
 * Measurable Part B metrics are scored here. Judgement metrics are scored by the reviewer
 * service. Low confidence or an unverifiable claim flags the attempt and does not authorize
 * approval. The bank stays unverified until it is signed off.
 */

export const CITY_KNOWLEDGE_TOPICS = ["HRS", "CRD", "TRN", "RES", "ETQ", "SEA", "EVT"] as const;
export type CityKnowledgeTopic = (typeof CITY_KNOWLEDGE_TOPICS)[number];

export const TOPIC_LABEL: Record<CityKnowledgeTopic, string> = {
  HRS: "Hours and closures",
  CRD: "Crowds and timing",
  TRN: "Transit and routing",
  RES: "Reservations",
  ETQ: "Etiquette and permits",
  SEA: "Seasonal events",
  EVT: "Proposal logistics",
};

export const METRIC_IDS = ["a", "b", "c", "d", "e", "f"] as const;
export type MetricId = (typeof METRIC_IDS)[number];

export const PART_A_WEIGHT = 0.5;
export const B1_WEIGHT = 0.3;
export const B2_WEIGHT = 0.2;
export const PASS_OVERALL_PERCENT = 80;
export const PASS_PART_PERCENT = 70;
export const TOPIC_FLAG_BELOW_PERCENT = 60;
export const TOPIC_BADGE_AT_PERCENT = 85;
export const PART_A_ITEM_COUNT = 20;
export const PART_A_HOLD_BACK = 0.3;
export const PART_A_LIMIT_MINUTES = 30;
export const PART_B_LIMIT_MINUTES = 90;
export const MAX_RETAKES = 2;
export const FIRST_RETAKE_WAIT_DAYS = 14;
export const SECOND_RETAKE_WAIT_DAYS = 60;
export const REAPPLY_AFTER_THIRD_FAIL_MONTHS = 12;
export const METRIC_MAX = 4;
export const FIXED_SLOT_BUFFER_MINUTES = 15;
/** The spec's uniform-pace flag. Every recorded item at this many seconds is flagged. */
export const UNIFORM_ANSWER_SECONDS = 85;

const DAY_MS = 24 * 60 * 60 * 1000;

export const TOPIC_METRIC_FEEDS: Record<CityKnowledgeTopic, readonly MetricId[]> = {
  HRS: ["b"],
  CRD: ["b", "e"],
  TRN: ["a", "e"],
  RES: ["b"],
  ETQ: ["d", "e"],
  SEA: ["b", "c"],
  EVT: [],
};

export function topicBadgeLabel(topic: CityKnowledgeTopic, cityName: string): string {
  return `${TOPIC_LABEL[topic]}: ${cityName}`;
}

export interface PartPercents {
  partA: number;
  b1: number;
  b2: number;
}

export function partBPercent(b1: number, b2: number): number {
  return (b1 * B1_WEIGHT + b2 * B2_WEIGHT) / (B1_WEIGHT + B2_WEIGHT);
}

export function overallPercent(p: PartPercents): number {
  return p.partA * PART_A_WEIGHT + p.b1 * B1_WEIGHT + p.b2 * B2_WEIGHT;
}

/** True only when every floor holds. No rounding up into a pass. */
export function numericPass(p: PartPercents): boolean {
  return (
    overallPercent(p) >= PASS_OVERALL_PERCENT &&
    p.partA >= PASS_PART_PERCENT &&
    partBPercent(p.b1, p.b2) >= PASS_PART_PERCENT
  );
}

export function authorizesApproval(input: {
  percents: PartPercents | null;
  attention: boolean;
  scoresComplete: boolean;
  bankSignedOff: boolean;
  bankContentHash: string;
  attemptBankContentHash: string | null;
}): boolean {
  if (!input.bankSignedOff) return false;
  if (!input.attemptBankContentHash || input.attemptBankContentHash !== input.bankContentHash) return false;
  if (!input.scoresComplete || input.attention || !input.percents) return false;
  return numericPass(input.percents);
}

export function localExpertApprovalDecision(input: {
  expertType: string | null | undefined;
  cityKey: string | null;
  bankPublished: boolean;
  bankSignedOff: boolean;
  qualifyingPass: boolean;
}): { allowed: true } | { allowed: false; message: string } {
  if (input.expertType !== "local_expert") return { allowed: true };
  if (!input.cityKey || !input.bankPublished) {
    return {
      allowed: false,
      message: "No city-knowledge test is published for this city, so this application cannot be approved.",
    };
  }
  if (!input.bankSignedOff) {
    return {
      allowed: false,
      message: "The city-knowledge bank for this city is not signed off, so a result cannot authorize approval.",
    };
  }
  if (!input.qualifyingPass) {
    return {
      allowed: false,
      message: "This applicant has not passed the city-knowledge test. A fail cannot be overridden. You can grant a retake when one is allowed.",
    };
  }
  return { allowed: true };
}

export function cityKeyForName(city: string | null | undefined, published: readonly string[]): string | null {
  const n = (city ?? "").trim().toLowerCase();
  if (!n) return null;
  for (const key of published) {
    const k = key.toLowerCase();
    if (n === k || n.startsWith(`${k} `) || n.startsWith(`${k},`)) return k;
  }
  return null;
}

export function briefPercent(scores: Partial<Record<MetricId, number | null>>): number | null {
  const vals = METRIC_IDS.map((id) => scores[id]);
  if (vals.some((v) => v == null || Number.isNaN(v))) return null;
  const sum = vals.reduce<number>((s, v) => s + (v as number), 0);
  return (sum / (METRIC_IDS.length * METRIC_MAX)) * 100;
}

/** A closed day or an arrival after last admission caps metric (b). Two violations score 0. */
export function capTimingScore(raw: number | null, violations: number): number | null {
  if (violations >= 2) return 0;
  if (violations === 1) {
    if (raw == null) return 1;
    return Math.min(1, clampMetric(raw));
  }
  if (raw == null) return null;
  return clampMetric(raw);
}

export function clampMetric(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(METRIC_MAX, Math.round(n)));
}

export function routingScore(input: {
  applicantMinutes: number | null;
  referenceMinutes: number | null;
  backtracks: number;
  infeasible: boolean;
}): { score: number | null; unverifiable: boolean } {
  if (input.infeasible) return { score: 0, unverifiable: false };
  if (input.applicantMinutes == null || input.referenceMinutes == null || input.referenceMinutes <= 0) {
    return { score: null, unverifiable: true };
  }
  const over = input.applicantMinutes / input.referenceMinutes - 1;
  let score = 4;
  if (over > 0.4 || input.backtracks >= 2) score = 1;
  else if (over > 0.25) score = 2;
  else if (over > 0.15 || input.backtracks === 1) score = 3;
  return { score, unverifiable: false };
}

/** Re-entering a zone already left that day. An unzoned stop makes the count incomplete. */
export function countBacktracks(zones: readonly (string | null)[]): { backtracks: number; incomplete: boolean } {
  if (zones.some((z) => !z)) return { backtracks: 0, incomplete: true };
  let backtracks = 0;
  const left = new Set<string>();
  let current: string | null = null;
  for (const zone of zones) {
    if (zone === current) continue;
    if (current && zone && left.has(zone)) backtracks += 1;
    if (current) left.add(current);
    current = zone;
  }
  return { backtracks, incomplete: false };
}

export function zoneForStop(name: string, zones: readonly { zone: string; match: readonly string[] }[]): string | null {
  const n = name.toLowerCase();
  let best: { zone: string; len: number } | null = null;
  for (const row of zones) {
    for (const token of row.match) {
      if (token && n.includes(token.toLowerCase()) && (!best || token.length > best.len)) {
        best = { zone: row.zone, len: token.length };
      }
    }
  }
  return best?.zone ?? null;
}

export interface TimingWindow {
  fromDate?: string;
  toDate?: string;
  from?: string;
  to?: string;
  weekdays?: "weekday" | "weekend" | "any";
  lastEntry: string;
}

export interface TimingFact {
  id: string;
  match: string[];
  factCheck: "ok" | "unverified";
  status: "active" | "inactive";
  alwaysOpen?: boolean;
  closedDates?: string[];
  closedMonthDays?: string[];
  windows?: TimingWindow[];
  fixedReservation?: boolean;
}

export interface PlanStopInput {
  date: string;
  stopName: string;
  plannedArrival: string;
  reservationTime?: string | null;
}

export interface TimingEvaluation {
  violations: number;
  unverifiable: boolean;
  reasons: string[];
}

function monthDay(date: string): string {
  return date.slice(5, 10);
}

function inMonthDayRange(md: string, from: string, to: string): boolean {
  if (from <= to) return md >= from && md <= to;
  return md >= from || md <= to;
}

function civilWeekday(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function clockMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function windowMatches(date: string, w: TimingWindow): boolean {
  if (w.fromDate && date < w.fromDate) return false;
  if (w.toDate && date > w.toDate) return false;
  if (w.from && w.to && !inMonthDayRange(monthDay(date), w.from, w.to)) return false;
  if (w.weekdays === "weekday" || w.weekdays === "weekend") {
    const day = civilWeekday(date);
    const weekend = day === 0 || day === 6;
    if (w.weekdays === "weekday" && weekend) return false;
    if (w.weekdays === "weekend" && !weekend) return false;
  }
  return true;
}

function matchFact(name: string, facts: readonly TimingFact[]): TimingFact | null {
  const n = name.toLowerCase();
  let best: { fact: TimingFact; len: number } | null = null;
  for (const fact of facts) {
    if (fact.status !== "active" || fact.factCheck !== "ok") continue;
    for (const token of fact.match) {
      if (token && n.includes(token.toLowerCase()) && (!best || token.length > best.len)) {
        best = { fact, len: token.length };
      }
    }
  }
  return best?.fact ?? null;
}

/** Closed days, last entry, and the 15-minute buffer on a stated fixed slot. Unknown stops are unverifiable, never assumed open. */
export function evaluateTiming(stops: readonly PlanStopInput[], facts: readonly TimingFact[]): TimingEvaluation {
  let violations = 0;
  let unverifiable = false;
  const reasons: string[] = [];
  for (const stop of stops) {
    const fact = matchFact(stop.stopName, facts);
    if (!fact) {
      unverifiable = true;
      reasons.push(`${stop.stopName} on ${stop.date} is not in the signed facts, so it was not treated as open.`);
      continue;
    }
    if (fact.alwaysOpen) continue;
    if (fact.closedDates?.includes(stop.date) || fact.closedMonthDays?.includes(monthDay(stop.date))) {
      violations += 1;
      reasons.push(`${stop.stopName} is closed on ${stop.date}.`);
      continue;
    }
    const arrival = clockMinutes(stop.plannedArrival);
    if (arrival == null) {
      unverifiable = true;
      reasons.push(`${stop.stopName} has no usable arrival time.`);
      continue;
    }
    const windows = (fact.windows ?? []).filter((w) => windowMatches(stop.date, w));
    if ((fact.windows?.length ?? 0) > 0 && windows.length === 0) {
      unverifiable = true;
      reasons.push(`${stop.stopName} on ${stop.date} has no matching hours window.`);
    } else if (windows.length > 0) {
      const last = clockMinutes(windows[0].lastEntry);
      if (last == null) {
        unverifiable = true;
      } else if (arrival > last) {
        violations += 1;
        reasons.push(`${stop.stopName} arrival ${stop.plannedArrival} is after last entry ${windows[0].lastEntry}.`);
      }
    }
    if (fact.fixedReservation) {
      if (!stop.reservationTime) {
        unverifiable = true;
        reasons.push(`${stop.stopName} is a fixed reservation and no slot time was stated, so the 15-minute buffer was not checked.`);
      } else {
        const slot = clockMinutes(stop.reservationTime);
        if (slot == null || arrival > slot - FIXED_SLOT_BUFFER_MINUTES) {
          violations += 1;
          reasons.push(`${stop.stopName} does not leave a 15-minute buffer before the stated slot.`);
        }
      }
    }
  }
  return { violations, unverifiable, reasons };
}

export function normalizeAnswer(s: string): string {
  return s.toLowerCase().replace(/[¥,]/g, "").replace(/\s+/g, " ").trim();
}

export function shortAnswerMatches(answer: string, groups: readonly (readonly string[])[]): boolean {
  const n = normalizeAnswer(answer);
  return groups.every((group) => group.some((opt) => n.includes(normalizeAnswer(opt))));
}

export function choiceMatches(selected: readonly string[], correct: readonly string[]): boolean {
  if (selected.length !== correct.length) return false;
  const a = [...selected].sort();
  const b = [...correct].sort();
  return a.every((v, i) => v === b[i]);
}

export function partAPercent(correct: number, drawn: number): number | null {
  if (drawn <= 0) return null;
  return (correct / drawn) * 100;
}

export interface DrawableItem {
  id: string;
  status: "active" | "inactive";
  factCheck: "ok" | "unverified";
  expiresAfter?: string | null;
}

export function isDrawable(item: DrawableItem, today: string): boolean {
  if (item.status !== "active") return false;
  if (item.factCheck === "unverified") return false;
  if (item.expiresAfter && today > item.expiresAfter) return false;
  return true;
}

export function maxDrawCount(eligible: number, want = PART_A_ITEM_COUNT, holdBack = PART_A_HOLD_BACK): number {
  const cap = Math.floor(eligible * (1 - holdBack));
  return Math.min(want, Math.max(0, cap));
}

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Draws `want` items when the hold-back still leaves that many. Otherwise returns null. */
export function drawItemIds(items: readonly DrawableItem[], today: string, seed: string, want = PART_A_ITEM_COUNT): string[] | null {
  const eligible = items.filter((item) => isDrawable(item, today));
  const n = maxDrawCount(eligible.length, want);
  if (n < want) return null;
  const rng = mulberry32(hashSeed(seed));
  return shuffle(eligible, rng).slice(0, n).map((item) => item.id);
}

export function uniformAnswerPace(seconds: readonly number[]): boolean {
  return seconds.length >= 2 && seconds.every((s) => s === UNIFORM_ANSWER_SECONDS);
}

export interface TopicScore {
  topic: CityKnowledgeTopic;
  label: string;
  percent: number;
  items: number;
  flagged: boolean;
}

export function topicScores(input: {
  partA: readonly { topic: CityKnowledgeTopic; correct: boolean }[];
  briefs: readonly { id: "b1" | "b2"; metrics: Partial<Record<MetricId, number | null>>; percent: number | null }[];
}): TopicScore[] {
  const acc = new Map<CityKnowledgeTopic, { earned: number; items: number }>();
  const add = (topic: CityKnowledgeTopic, earned: number) => {
    const row = acc.get(topic) ?? { earned: 0, items: 0 };
    row.earned += earned;
    row.items += 1;
    acc.set(topic, row);
  };
  for (const item of input.partA) add(item.topic, item.correct ? 1 : 0);
  for (const brief of input.briefs) {
    for (const topic of CITY_KNOWLEDGE_TOPICS) {
      for (const metric of TOPIC_METRIC_FEEDS[topic]) {
        const score = brief.metrics[metric];
        if (score == null) continue;
        add(topic, score / METRIC_MAX);
      }
    }
    if (brief.id === "b2" && brief.percent != null) add("EVT", brief.percent / 100);
  }
  return CITY_KNOWLEDGE_TOPICS.flatMap((topic) => {
    const row = acc.get(topic);
    if (!row || row.items === 0) return [];
    const percent = (row.earned / row.items) * 100;
    return [{
      topic,
      label: TOPIC_LABEL[topic],
      percent,
      items: row.items,
      flagged: percent < TOPIC_FLAG_BELOW_PERCENT,
    }];
  });
}

export function publicTopicBadges(
  topics: readonly TopicScore[],
  cityName: string,
  bankSignedOff: boolean,
): { topic: CityKnowledgeTopic; label: string }[] {
  if (!bankSignedOff) return [];
  return topics
    .filter((t) => t.percent >= TOPIC_BADGE_AT_PERCENT)
    .map((t) => ({ topic: t.topic, label: topicBadgeLabel(t.topic, cityName) }));
}

export interface CycleAttempt {
  completedAt: string;
  numericPass: boolean;
  authorizesApproval: boolean;
}

export type RetakeState =
  | { state: "not_started" }
  | { state: "passed" }
  | { state: "recorded" }
  | { state: "eligible" }
  | { state: "needs_grant"; eligibleAt: string }
  | { state: "wait"; eligibleAt: string; needsGrant: boolean }
  | { state: "reapply"; eligibleAt: string };

export function addDays(iso: string, days: number): Date {
  return new Date(new Date(iso).getTime() + days * DAY_MS);
}

export function addCalendarMonths(iso: string, months: number): Date {
  const d = new Date(iso);
  const utcDay = d.getUTCDate();
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const seconds = d.getUTCSeconds();
  const ms = d.getUTCMilliseconds();
  const shifted = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, hours, minutes, seconds, ms));
  const last = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(utcDay, last));
  return shifted;
}

/** Attempts before a closed three-fail cycle are ignored once the 12 months have passed. */
export function openCycle(attempts: readonly CycleAttempt[], now: Date): { blockedUntil: string | null; cycle: CycleAttempt[] } {
  let cycle: CycleAttempt[] = [];
  for (const attempt of attempts) {
    cycle.push(attempt);
    const fails = cycle.filter((a) => !a.numericPass);
    if (fails.length >= 3) {
      const until = addCalendarMonths(fails[2].completedAt, REAPPLY_AFTER_THIRD_FAIL_MONTHS);
      if (now.getTime() >= until.getTime()) cycle = [];
      else return { blockedUntil: until.toISOString(), cycle };
    }
  }
  return { blockedUntil: null, cycle };
}

export function retakeDecision(
  attempts: readonly CycleAttempt[],
  now: Date,
  grantForNext: boolean,
): RetakeState {
  const { blockedUntil, cycle } = openCycle(attempts, now);
  if (blockedUntil) return { state: "reapply", eligibleAt: blockedUntil };
  if (cycle.length === 0) return { state: "not_started" };
  if (cycle.some((a) => a.authorizesApproval)) return { state: "passed" };
  const latest = cycle[cycle.length - 1];
  if (latest.numericPass) {
    if (grantForNext) return { state: "eligible" };
    return { state: "recorded" };
  }
  const fails = cycle.filter((a) => !a.numericPass);
  const waitDays = fails.length <= 1 ? FIRST_RETAKE_WAIT_DAYS : SECOND_RETAKE_WAIT_DAYS;
  const eligibleAtDate = addDays(fails[fails.length - 1].completedAt, waitDays);
  const eligibleAt = eligibleAtDate.toISOString();
  const waitOver = now.getTime() >= eligibleAtDate.getTime();
  if (!waitOver) return { state: "wait", eligibleAt, needsGrant: !grantForNext };
  if (!grantForNext) return { state: "needs_grant", eligibleAt };
  return { state: "eligible" };
}

export function mayStartAttempt(decision: RetakeState, hasOpenAttempt: boolean): boolean {
  if (hasOpenAttempt) return false;
  return decision.state === "not_started" || decision.state === "eligible";
}

export function mayGrantRetake(decision: RetakeState): boolean {
  return decision.state === "needs_grant" || decision.state === "recorded" || (decision.state === "wait" && decision.needsGrant);
}

export interface MetricReview {
  score: number | null;
  rationale: string;
  sourcesChecked: string[];
  confidence: "high" | "low";
  unverifiable: boolean;
}

function asReview(raw: unknown): MetricReview {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const confidence = row.confidence === "high" ? "high" : "low";
  const unverifiable = row.unverifiable === true || confidence !== "high";
  const score = typeof row.score === "number" ? clampMetric(row.score) : null;
  const sources = Array.isArray(row.sourcesChecked)
    ? row.sourcesChecked.filter((s): s is string => typeof s === "string").slice(0, 8)
    : [];
  const rationale = typeof row.rationale === "string" ? row.rationale.slice(0, 500) : "";
  return { score, rationale, sourcesChecked: sources, confidence, unverifiable };
}

/** Judgement metrics from the reviewer. A missing, low-confidence, or unverifiable metric flags the attempt. */
export function parseMetricReviews(raw: unknown): { metrics: Record<MetricId, MetricReview>; attention: boolean } {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bag = body.metrics && typeof body.metrics === "object" ? (body.metrics as Record<string, unknown>) : body;
  const metrics = {} as Record<MetricId, MetricReview>;
  let attention = false;
  for (const id of METRIC_IDS) {
    const review = asReview(bag[id]);
    if (review.score == null || review.unverifiable || review.confidence !== "high") attention = true;
    metrics[id] = review;
  }
  return { metrics, attention };
}

export function calendarDateInZone(now: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !d) return null;
    return `${y}-${m}-${d}`;
  } catch {
    return null;
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
