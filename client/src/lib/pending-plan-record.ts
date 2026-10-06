/**
 * THE GUEST'S PLAN, CARRIED THROUGH SIGN-IN (step 8b-2, brief D3 first half, ruling 6; ledger
 * `2026-10-06-step8b2-map-layout`).
 *
 * A guest who finishes the planning modal on `myself` or `ai` is asked to sign in, and sign-in reloads
 * the page. This ONE short-lived browser record carries their answers across that reload:
 *
 *   · sessionStorage only, with a ONE-HOUR expiry; it holds the modal's answers, the door and the
 *     branch — never a credential, and NEVER anything in the URL;
 *   · written at either gate (the modal's own finish for `myself`, the AI form's sign-in for `ai`);
 *   · read ONCE after sign-in and CLEARED BEFORE THE PLAN IS CREATED (`takePendingPlanRecord`), so a
 *     reload cannot make a second plan;
 *   · the plan is then created through the ONE existing mint, by re-running the modal's own finish —
 *     a failed mint leaves the answers on screen in that modal, to retry;
 *   · nothing is stored for a guest on the server (G2), and the pen's guest hand-off
 *     (`trip-context.ts` `handOffGuestPen`) is SKIPPED while a record exists or was taken this load,
 *     so the two cannot disagree.
 *
 * Every storage access is wrapped: an unavailable store simply means no record (the guest then signs
 * in exactly as before, answers not kept).
 */
import type { DraftAnswers } from "@/lib/plan-resume";

export const PENDING_PLAN_RECORD_KEY = "traveloure_pending_plan";
export const PENDING_PLAN_RECORD_TTL_MS = 60 * 60 * 1000;

export type PendingPlanBranch = "myself" | "ai";

export interface PendingPlanRecord {
  v: 1;
  savedAt: number;
  expiresAt: number;
  branch: PendingPlanBranch;
  door: string | null;
  answers: DraftAnswers;
  /** The door's own pre-fills, so the replayed modal opens as the door opened it. */
  source: { experienceSlug?: string | null; city?: string | null; country?: string | null; destination?: string | null };
}

let takenThisLoad = false;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function writePendingPlanRecord(
  input: Omit<PendingPlanRecord, "v" | "savedAt" | "expiresAt">,
  now: number = Date.now(),
): void {
  const record: PendingPlanRecord = { v: 1, savedAt: now, expiresAt: now + PENDING_PLAN_RECORD_TTL_MS, ...input };
  try {
    storage()?.setItem(PENDING_PLAN_RECORD_KEY, JSON.stringify(record));
  } catch {
    /* no store ⇒ no record; sign-in proceeds as before */
  }
}

function parse(raw: string | null, now: number): PendingPlanRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<PendingPlanRecord>;
    if (r?.v !== 1 || (r.branch !== "myself" && r.branch !== "ai")) return null;
    if (typeof r.expiresAt !== "number" || r.expiresAt <= now) return null;
    if (!r.answers || typeof r.answers !== "object") return null;
    return r as PendingPlanRecord;
  } catch {
    return null;
  }
}

/** Is there a live (unexpired) record? Reads without consuming. */
export function hasPendingPlanRecord(now: number = Date.now()): boolean {
  try {
    return parse(storage()?.getItem(PENDING_PLAN_RECORD_KEY) ?? null, now) != null;
  } catch {
    return false;
  }
}

/**
 * READ ONCE: returns the record and removes it in the same call, BEFORE any plan is created. An expired
 * or malformed record is removed and answers null.
 */
export function takePendingPlanRecord(now: number = Date.now()): PendingPlanRecord | null {
  const s = storage();
  if (!s) return null;
  let raw: string | null = null;
  try {
    raw = s.getItem(PENDING_PLAN_RECORD_KEY);
  } catch {
    return null;
  }
  if (raw == null) return null;
  try {
    s.removeItem(PENDING_PLAN_RECORD_KEY);
  } catch {
    /* if it cannot be removed it cannot be trusted to be read once */
    return null;
  }
  const record = parse(raw, now);
  if (record) takenThisLoad = true;
  return record;
}

/** True once a record was taken in this page load — the pen hand-off stays skipped for the load. */
export function pendingPlanRecordTakenThisLoad(): boolean {
  return takenThisLoad;
}

/** Tests only. */
export function __resetPendingPlanRecordForTests(): void {
  takenThisLoad = false;
}

/**
 * THE CONSUMER, as an ordered pure step so the ORDER is provable without a browser: take (and so clear)
 * the record FIRST, then hand it to `replay`, which re-runs the modal's own finish (the one mint).
 * Returns what happened. `replay` never sees a record that is still in storage.
 */
export function consumePendingPlanRecord(
  deps: { take: () => PendingPlanRecord | null; replay: (record: PendingPlanRecord) => void },
): "none" | "replayed" {
  const record = deps.take();
  if (!record) return "none";
  deps.replay(record);
  return "replayed";
}
