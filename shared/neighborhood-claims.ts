/**
 * Expert field knowledge — neighborhood claims vocabulary + capture contract.
 *
 * Rulings: 2026-08-29-neighborhood-claims, 2026-08-29-evidence-is-the-test,
 * 2026-09-01-evidence-thresholds-config, 2026-09-01-access-claims-held.
 * Content (prompt copy, rubric, thresholds, expert-facing copy) is the companion file
 * docs/expert-field-knowledge/evidence-test.md — this module carries it as constants and
 * never paraphrases it. Expert-facing vocabulary is `claimed → verified`; the internal status
 * machine below is admin/server-only and MUST NOT be rendered to an expert.
 */
import { z } from "zod";

// ── Status machine (server-side; app-enforced, no DB CHECK — migration-181 posture) ──────────
export const CLAIM_STATUSES = ["draft", "submitted", "scored", "verified", "declined"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** The ONLY two words an expert or the public ever sees for a claim. */
export type PublicClaimStatus = "claimed" | "verified";
export function publicClaimStatus(status: string | null | undefined): PublicClaimStatus {
  return status === "verified" ? "verified" : "claimed";
}

export const CLAIM_ACTOR_TYPES = ["expert", "ops", "scorer", "admin", "seed"] as const;
export type ClaimActorType = (typeof CLAIM_ACTOR_TYPES)[number];

// ── Dayparts (companion §1: a per-neighborhood parameter, default evening) ───────────────────
export const DAYPARTS = ["morning", "midday", "afternoon", "late_afternoon", "evening", "night"] as const;
export type Daypart = (typeof DAYPARTS)[number];
export const DEFAULT_DAYPART: Daypart = "evening";
export const DAYPART_LABELS: Record<Daypart, string> = {
  morning: "morning",
  midday: "midday",
  afternoon: "afternoon",
  late_afternoon: "late afternoon",
  evening: "evening",
  night: "night",
};

// ── Typed-field enums (companion §1) ────────────────────────────────────────────────────────
export const CONTINGENCY_TRIGGERS = ["rain", "closed", "child", "late_start"] as const;
export type ContingencyTrigger = (typeof CONTINGENCY_TRIGGERS)[number];
export const CONTINGENCY_TRIGGER_LABELS: Record<ContingencyTrigger, string> = {
  rain: "it's raining hard",
  closed: "the second stop is closed",
  child: "they've got a nine-year-old with them",
  late_start: "they got a late start and only have two hours",
};

export const ACCESS_TYPES = ["reservation", "timing", "introduction", "entry"] as const;
export type AccessType = (typeof ACCESS_TYPES)[number];

export const HARD_CONSTRAINT_KINDS = ["last_entry", "reservation_window", "closure_day", "last_train"] as const;
export type HardConstraintKind = (typeof HARD_CONSTRAINT_KINDS)[number];
export const HARD_CONSTRAINT_LABELS: Record<HardConstraintKind, string> = {
  last_entry: "last entry",
  reservation_window: "reservation window",
  closure_day: "closure day",
  last_train: "last train",
};

export const TRANSITION_MODES = ["walk", "taxi", "bus", "train", "subway", "tram", "bike", "other"] as const;
export type TransitionMode = (typeof TRANSITION_MODES)[number];

export const PRICE_BANDS = ["$", "$$", "$$$", "$$$$"] as const;
export const EXPERT_CONFIDENCE = ["certain", "usually_right", "changes_often"] as const;
export const EXPERT_CONFIDENCE_LABELS: Record<(typeof EXPERT_CONFIDENCE)[number], string> = {
  certain: "I'm certain",
  usually_right: "Usually right",
  changes_often: "This changes often",
};

// ── Rubric dimensions (companion §2) — ADMIN-ONLY vocabulary, never expert-facing ───────────
export const EVIDENCE_DIMENSIONS = ["specificity", "verifiability", "localness", "practicality"] as const;
export type EvidenceDimension = (typeof EVIDENCE_DIMENSIONS)[number];
export const WEB_GAP_RESULTS = ["found", "partial", "absent"] as const;

/**
 * Prompt SHAPE from companion §1 ("two or three places", "three stops in order"). These are the
 * form's completeness rules, NOT pass thresholds — pass thresholds live only in the
 * `evidence_thresholds` table (ruling 2026-09-01-evidence-thresholds-config).
 */
export const CAPTURE_SHAPE = { p1Min: 2, p1Max: 3, p2Items: 3, p4Max: 10 } as const;

/** Every key the scorer/ratify path reads. A missing row blocks; there is no code fallback. */
export const EVIDENCE_THRESHOLD_KEYS = [
  "p1_min_entries",
  "p1_entry_min_total",
  "p1_entry_min_localness",
  "p1_entry_min_verifiability",
  "p2_min_total",
  "p2_min_practicality",
  "p3_min_total",
  "p3_alternate_min_specificity",
  "web_gap_found_localness_cap",
  "dimension_max",
  "resubmit_cooldown_days",
] as const;
export type EvidenceThresholdKey = (typeof EVIDENCE_THRESHOLD_KEYS)[number];

// ── Copy (companion §1 / §5, verbatim with the two parameters interpolated) ─────────────────
export const CLAIM_PROMPTS = {
  heading: (neighborhood: string) => `Show us ${neighborhood}.`,
  p1: (neighborhood: string) =>
    `Two or three places in ${neighborhood} you'd send a friend. For each: what they should actually do there, when it's right (hour, day, season), and the one thing that goes wrong if they don't know it.`,
  p2: (neighborhood: string, daypart: Daypart) =>
    `Put together one ${DAYPART_LABELS[daypart]} in ${neighborhood} for someone with about four hours. Three stops in order, how long at each, how you'd get between them, and why that order and not another.`,
  p3: (daypart: Daypart) =>
    `It's the ${DAYPART_LABELS[daypart]} above, and one of these happens — pick one: it's raining hard / the second stop is closed / they've got a nine-year-old with them / they got a late start and only have two hours. What changes, and why?`,
  p4: (neighborhood: string) =>
    `Anywhere in ${neighborhood} where you can get something a walk-in can't — a table, a time, an introduction, a door that's usually closed? One line is enough.`,
} as const;

/** §5 — on ratification. */
export const VERIFIED_COPY = (neighborhood: string) => `${neighborhood} — verified.`;

/** §5 — on non-ratification: one sentence naming the weakest dimension in plain language, never a number. */
export const RETURN_TEMPLATES: Record<EvidenceDimension, (place: string) => string> = {
  localness: (place) => `We'd love one thing about ${place} a visitor couldn't get from a search.`,
  specificity: (place) => `Which ${place}, and what exactly should they do there?`,
  verifiability: () => `When, specifically — an hour or a day makes this usable.`,
  practicality: () => `What goes wrong if they don't know this?`,
};

/** Venue join key (Phase 4 independence check): lowercase, diacritics stripped, punctuation out. */
export function normalizeVenueName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
}

// ── Capture contract (zod) ─────────────────────────────────────────────────────────────────
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

export const p1EntrySchema = z.object({
  name: text(200),
  category: optionalText(50),
  doThis: text(2000),
  when: z.object({ hours: optionalText(200), days: optionalText(200), season: optionalText(200) }),
  watchOut: text(2000),
  priceBand: z.enum(PRICE_BANDS).nullable().optional(),
  expertConfidence: z.enum(EXPERT_CONFIDENCE).nullable().optional(),
});
export type P1Entry = z.infer<typeof p1EntrySchema>;

export const transitionSchema = z.object({
  mode: z.enum(TRANSITION_MODES),
  minutes: z.number().int().min(0).max(300),
});
export const p2ItemSchema = z.object({
  name: text(200),
  durationMin: z.number().int().min(5).max(600),
  /** How you get here from the previous stop; null/absent on the first stop. */
  transition: transitionSchema.nullable().optional(),
});
export type P2Item = z.infer<typeof p2ItemSchema>;
export const hardConstraintSchema = z.object({ kind: z.enum(HARD_CONSTRAINT_KINDS), detail: text(300) });
export const p2Schema = z.object({
  items: z.array(p2ItemSchema).length(CAPTURE_SHAPE.p2Items),
  orderReason: text(2000),
  hardConstraints: z.array(hardConstraintSchema).min(1).max(6),
});
export type P2Capture = z.infer<typeof p2Schema>;

export const p3Schema = z.object({
  trigger: z.enum(CONTINGENCY_TRIGGERS),
  /** Which P2 stop the alternate replaces (1-based); null = the whole outing changes. */
  replacesPosition: z.number().int().min(1).max(CAPTURE_SHAPE.p2Items).nullable(),
  alternate: p2ItemSchema,
  reason: text(2000),
});
export type P3Capture = z.infer<typeof p3Schema>;

export const p4EntrySchema = z.object({
  venue: text(200),
  accessType: z.enum(ACCESS_TYPES),
  relationshipBasis: optionalText(500),
});
export type P4Entry = z.infer<typeof p4EntrySchema>;

/** What a SUBMIT must satisfy — the prompt shape, every required prompt present. */
export const claimCaptureSubmitSchema = z.object({
  p1: z.array(p1EntrySchema).min(CAPTURE_SHAPE.p1Min).max(CAPTURE_SHAPE.p1Max),
  p2: p2Schema,
  p3: p3Schema,
  p4: z.array(p4EntrySchema).max(CAPTURE_SHAPE.p4Max).optional().default([]),
});
export type ClaimCaptureSubmit = z.infer<typeof claimCaptureSubmitSchema>;

/**
 * What a DRAFT save accepts — the same keys, any completeness, bounded in count. Content is
 * validated only at submit; a half-typed evening is a legitimate save-and-finish-later state.
 */
const looseRecord = z.record(z.string(), z.unknown());
export const claimCaptureDraftSchema = z
  .object({
    p1: z.array(looseRecord).max(CAPTURE_SHAPE.p1Max).optional().default([]),
    p2: looseRecord.nullable().optional().default(null),
    p3: looseRecord.nullable().optional().default(null),
    p4: z.array(looseRecord).max(CAPTURE_SHAPE.p4Max).optional().default([]),
  })
  .strict();
export type ClaimCaptureDraft = z.infer<typeof claimCaptureDraftSchema>;
/** Upper bound on a stored draft (bytes of JSON) — a buffer, not a document store. */
export const CLAIM_DRAFT_MAX_BYTES = 60_000;

/** Admin threshold edit body — the ONE client-settable field, allowlisted by construction. */
export const updateEvidenceThresholdSchema = z.object({ value: z.number().int().min(0).max(1000) }).strict();
