/**
 * ai-task-model-client.ts — THE ONE model call the paid Ask-AI task makes.
 *
 * (decision-maker ruling 2026-09-16, punchlist **D-47**; ledger `2026-09-16-l16-rulings-d45-d50`,
 *  built by `2026-09-16-l16-lane1b-model-call`. Design of record:
 *  `docs/lane-reports/2026-09-16-l16-lane1-create-rail.md` §4.3/§4.4. CLAUDE.md Locked Decision
 *  41 (c), Locked Decision 45 (3), §13, §18 rule 1.)
 *
 * It does exactly three things and deliberately nothing else: build the Anthropic client, make the
 * call, and hand back the text plus WHATEVER USAGE THE SDK SURFACED. It writes no cost row, parses
 * no JSON, reads no database and knows nothing about proposals — those belong to
 * `proposal-create.service.ts`, which is the one caller. Splitting it out is what makes the whole
 * rail provable in CI with **no real model call ever made** (see the transport seam below).
 *
 * ── THE MODEL ID COMES FROM `resolveAiTaskModel` AND NOWHERE ELSE ───────────────────────────
 * `server/config/ai-task-model.ts` is the knob (D-47). **`resolveAiDraftModel` is NEVER imported
 * here** — its own header forbids it and the traveler pays for this one (Locked Decision 41 (c)).
 * The tier is a COST record; no surface may describe a proposal by the engine that produced it, in
 * either direction — no badge and no degraded-quality disclaimer.
 *
 * ── USAGE IS REPORTED, NEVER FABRICATED (§13, §4.4's failure table) ─────────────────────────
 * `trackAnthropicResponse` returns early when `response.usage` is absent, so a call that throws
 * before returning a response has NO usage to report. This module therefore carries usage as an
 * OPTIONAL field on both the success and the error path, and invents none: where the SDK surfaces
 * none, the honest record is no cost row and a log line saying why — a fabricated token count is
 * worse than a missing row.
 */
import Anthropic from "@anthropic-ai/sdk";
import { resolveAiTaskModel } from "../config/ai-task-model";

/** Token usage exactly as the SDK reported it. ABSENT = the SDK reported none (§13). */
export interface AiTaskModelUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface AiTaskModelRequest {
  system: string;
  user: string;
}

export interface AiTaskModelResult {
  /** The model's raw answer text. Parsing is the CALLER's job — this module judges nothing. */
  text: string;
  /** The id the call actually ran on, for the cost row. */
  model: string;
  usage?: AiTaskModelUsage;
  /** True when the answer was cut off at `max_tokens` — truncated JSON is unparseable, and the
   *  caller reports THAT as the reason rather than a generic parse failure (the optimizer's own
   *  posture at `server/itinerary-optimizer.ts`). */
  truncated: boolean;
}

/**
 * A model call that did not produce an answer. It carries whatever usage the SDK surfaced so the
 * caller can still write an ATTRIBUTABLE cost row (D-46 (i): a failed ask that burned tokens is
 * attributable), and `undefined` when it surfaced none.
 */
export class AiTaskModelError extends Error {
  readonly usage?: AiTaskModelUsage;
  readonly model?: string;
  /** Machine-readable, for the route's refusal body. Never the provider's raw message. */
  readonly code: "model_unavailable" | "model_call_failed" | "model_returned_no_text";

  constructor(
    code: AiTaskModelError["code"],
    message: string,
    opts?: { usage?: AiTaskModelUsage; model?: string },
  ) {
    super(message);
    this.name = "AiTaskModelError";
    this.code = code;
    this.usage = opts?.usage;
    this.model = opts?.model;
  }
}

/**
 * A change set is a handful of additions and a few sentences. 4096 is generous for that and small
 * enough that a runaway answer is cut off rather than billed for. A truncation is REPORTED, never
 * silently parsed from half a JSON object.
 */
const AI_TASK_MAX_TOKENS = 4096;

/** The transport a call goes down. Exported as a type so the test seam below is honestly typed. */
export type AiTaskModelTransport = (
  req: AiTaskModelRequest & { model: string; maxTokens: number },
) => Promise<AiTaskModelResult>;

let testTransport: AiTaskModelTransport | null = null;

/**
 * TEST-ONLY SEAM. Replaces the transport so a suite can drive every branch of the create rail —
 * happy path, unparseable answer, error with usage, error without usage — with **no real model
 * call ever made**.
 *
 * It REFUSES in production. A process that could have its model transport swapped from inside the
 * process is a process whose answers cannot be attributed, and the guard is here rather than in a
 * convention because a convention is not a guard (§14's posture: the check is at the rail).
 */
export function __setAiTaskModelTransport(transport: AiTaskModelTransport | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[ai-task-model] the transport seam is test-only and is refused in production");
  }
  testTransport = transport;
}

const realTransport: AiTaskModelTransport = async (req) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // §13: an unconfigured deployment says it is unconfigured. It does not answer with a proposal
    // nobody made, and it does not fall back to another product's client.
    throw new AiTaskModelError(
      "model_unavailable",
      "ANTHROPIC_API_KEY is not configured, so the AI task cannot run.",
    );
  }
  const anthropic = new Anthropic({ apiKey });
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    });
  } catch (err: any) {
    // The SDK's error objects may carry usage on some paths and not others; take it where it is
    // real and report none where it is not (§13 — never a fabricated token count).
    const usage = readUsage(err?.usage ?? err?.error?.usage);
    throw new AiTaskModelError("model_call_failed", err?.message ?? "the model call failed", {
      usage,
      model: req.model,
    });
  }
  const usage = readUsage(response.usage);
  const textBlock = response.content.find((b) => b.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
  if (text.trim() === "") {
    throw new AiTaskModelError("model_returned_no_text", "the model returned no text block", {
      usage,
      model: response.model ?? req.model,
    });
  }
  return {
    text,
    model: response.model ?? req.model,
    ...(usage ? { usage } : {}),
    truncated: response.stop_reason === "max_tokens",
  };
};

function readUsage(raw: unknown): AiTaskModelUsage | undefined {
  const u = raw as { input_tokens?: unknown; output_tokens?: unknown } | null | undefined;
  if (!u) return undefined;
  const input = typeof u.input_tokens === "number" ? u.input_tokens : null;
  const output = typeof u.output_tokens === "number" ? u.output_tokens : null;
  // A HALF usage is not usage: reporting one leg and zero for the other would be a fabricated
  // token count wearing a real number's clothes (§13).
  if (input === null || output === null) return undefined;
  return { input_tokens: input, output_tokens: output };
}

/**
 * Make the one call. The model id is resolved PER CALL (the `resolveAiDraftModel` posture), so a
 * deployment can change `AI_TASK_MODEL` without a code change.
 */
export async function callAiTaskModel(req: AiTaskModelRequest): Promise<AiTaskModelResult> {
  const model = resolveAiTaskModel();
  const transport = testTransport ?? realTransport;
  return transport({ ...req, model, maxTokens: AI_TASK_MAX_TOKENS });
}
