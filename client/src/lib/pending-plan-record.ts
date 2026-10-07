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
 *
 * STEP 8d (brief D3 second half, items 24–26; ledger `2026-10-07-step8d-guest-map`): version 2 adds AT
 * MOST ONE pending add — the one place a guest chose on the guest map, by its id, for Day 1. It holds
 * an id, a kind and the shown name; never a coordinate, a price or a body to post (the add is rebuilt
 * from the listing's own public read after sign-in). A second add REPLACES the first (one action). A
 * version-1 record (written before 8d) still reads, with no add.
 */
import type { DraftAnswers } from "@/lib/plan-resume";

export const PENDING_PLAN_RECORD_KEY = "traveloure_pending_plan";
export const PENDING_PLAN_RECORD_TTL_MS = 60 * 60 * 1000;

export type PendingPlanBranch = "myself" | "ai";

/** The one pending add a guest map carries through sign-in (8d). Day 1: the guest map has no days. */
export interface PendingMapAdd {
  kind: "listing" | "partner";
  id: string;
  /** The name the gate dialog says out loud; never posted (the add re-reads the listing). */
  title: string;
  dayNumber: 1;
}

export interface PendingPlanRecord {
  v: 1 | 2;
  savedAt: number;
  expiresAt: number;
  branch: PendingPlanBranch;
  door: string | null;
  answers: DraftAnswers;
  /** The door's own pre-fills, so the replayed modal opens as the door opened it. */
  source: { experienceSlug?: string | null; city?: string | null; country?: string | null; destination?: string | null };
  /** 8d: the guest map's one pending add, if the guest pressed Add (v2 only). */
  pendingAdd?: PendingMapAdd | null;
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
  const record: PendingPlanRecord = { v: 2, savedAt: now, expiresAt: now + PENDING_PLAN_RECORD_TTL_MS, ...input };
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
    if ((r?.v !== 1 && r?.v !== 2) || (r.branch !== "myself" && r.branch !== "ai")) return null;
    if (typeof r.expiresAt !== "number" || r.expiresAt <= now) return null;
    if (!r.answers || typeof r.answers !== "object") return null;
    // A v1 record has no add; a malformed add is dropped, never guessed into one (§13).
    return { ...(r as PendingPlanRecord), pendingAdd: r.v === 2 ? normalizePendingMapAdd(r.pendingAdd) : null };
  } catch {
    return null;
  }
}

/** Pure. A well-formed pending add, or null. */
export function normalizePendingMapAdd(input: unknown): PendingMapAdd | null {
  if (!input || typeof input !== "object") return null;
  const a = input as Record<string, unknown>;
  const kind = a.kind === "listing" || a.kind === "partner" ? a.kind : null;
  const id = typeof a.id === "string" ? a.id.trim().slice(0, 255) : "";
  const title = typeof a.title === "string" ? a.title.trim().slice(0, 255) : "";
  if (!kind || !id || !title) return null;
  return { kind, id, title, dayNumber: 1 };
}

/** The live record WITHOUT consuming it — the guest map reads its answers and its add from here. */
export function peekPendingPlanRecord(now: number = Date.now()): PendingPlanRecord | null {
  try {
    return parse(storage()?.getItem(PENDING_PLAN_RECORD_KEY) ?? null, now);
  } catch {
    return null;
  }
}

/**
 * 8d: put the guest's ONE pending add on the live record (replacing any earlier one — one action).
 * Answers false when there is no live record to carry it (then nothing was kept, and the caller says so).
 */
export function setPendingMapAdd(add: PendingMapAdd, now: number = Date.now()): boolean {
  const record = peekPendingPlanRecord(now);
  const clean = normalizePendingMapAdd(add);
  if (!record || !clean) return false;
  try {
    storage()?.setItem(PENDING_PLAN_RECORD_KEY, JSON.stringify({ ...record, v: 2, pendingAdd: clean }));
    return true;
  } catch {
    return false;
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
