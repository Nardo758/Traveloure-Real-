/**
 * THE ASK BODY — a pick-shaped `.strict()` allowlist of exactly one field.
 *
 * (decision-maker ruling 2026-09-16, punchlist **D-45** and **D-46**; ledger
 *  `2026-09-16-l16-rulings-d45-d50`. CLAUDE.md Locked Decision 45 (3), §13, §14, §19.)
 *
 * The L16 brief's §4.1 states the contract in as many words: *"`{ question: string }` — a
 * .strict() PICK-based allowlist (§19). NOTHING ELSE. Not a model, not a tier, not a proposal, not
 * a conversation id, not a trip id (it is the path's), not an item id list, not a price."*
 *
 * ── WHY `.strict()` AND NOT A SILENT STRIP ──────────────────────────────────────────────────
 * §19's whole point is that a privileged field is client-settable BY DEFAULT under a denylist, and
 * that nobody edits an omit list for a field that did not exist when it was written. An allowlist
 * that SILENTLY DROPS unknown keys is safe but tells nobody; one that REFUSES them surfaces a
 * client sending something it believes matters. On an ask that costs the platform a model call,
 * the second is the one to have.
 *
 * ── WHAT IS DELIBERATELY ABSENT, EACH FOR A NAMED REASON ────────────────────────────────────
 *   · **`tripId`** — it is the path's. A body-supplied plan id is an identity the caller chose
 *     (§14), and the route's gate is run against the path parameter.
 *   · **`model` / `tier`** — D-47: the tier is a COST decision the platform makes for itself, from
 *     `AI_TASK_MODEL`, and no client selects it in either direction (LD 41 (c)).
 *   · **`conversationId`** — D-45 ruled the drawer STATELESS; `plan_proposals.conversation_id`
 *     stays NULL and no client may set it.
 *   · **`proposal` / `additions` / `replaces`** — the change set is the SERVER's, sanitised from
 *     the model's output. A client-supplied one would be a write into the plan wearing an AI's
 *     attribution (LD 42 D4/D23).
 *   · **any price, amount, rate, band or entitlement** — §14/§18: the AI task's price is the
 *     `concierge:ai_task` band and nothing about money arrives in a body.
 *
 * `question` is capped as a SHAPE check, not a claim: it bounds what can be stored and sent, and
 * asserts nothing about whether the question is answerable — a question the plan cannot answer is
 * answered with that fact (brief §6), never refused at the door.
 */
import { z } from "zod";

/** The one field. Trimmed by the schema so a whitespace-only ask is refused rather than stored. */
export const aiAskBodySchema = z
  .object({
    question: z.string().trim().min(1).max(2000),
  })
  .strict();

export type AiAskBody = z.infer<typeof aiAskBodySchema>;
