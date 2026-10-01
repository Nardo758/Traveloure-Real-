/**
 * ai-upstream-errors.ts — THE ONE classification of an upstream AI (Anthropic) failure
 * (ledger `2026-10-01-ai-upstream-error-classes`).
 *
 * The 2026-09-30 incident: the Anthropic account ran out of credit, every call answered
 * 400 invalid_request_error "Your credit balance is too low", and every surface handed the
 * traveler the 503 "Our AI is experiencing high demand. Please try again in a moment." — a retry
 * prompt for a failure no retry could fix — while nothing told anyone it was happening.
 *
 * Two classes, decided ONCE here (§18 rule 1) and read by `claudeService` and every route that
 * turns an AI failure into a response:
 *  - RETRYABLE: 429, 529, 5xx, 408, connection resets and timeouts. The existing 503 + retry copy
 *    stays exactly as it was.
 *  - NON-RETRYABLE: 400/401/403/404/413 and anything naming credit or billing. Logged at error with
 *    the tag `ai_upstream_nonretryable`, answered with a DISTINCT 502 "Planning is temporarily
 *    unavailable." (no retry prompt, `retryable: false`), never followed by a fallback or
 *    alternatives generation, and the first one per hour sends ONE alert.
 *
 * Every classified failure (both classes) is recorded in `ai_usage_logs` — the table the admin
 * AI-costs page already reads — as a zero-cost row with `success = false`, so an outage shows as
 * "N failed calls" instead of as silence. No migration: the row shape already exists.
 *
 * WHAT NEVER LEAVES THE SERVER: the API key, the prompt and the provider's message text. The log
 * line, the usage row and the alert carry the error TYPE, the HTTP status, the route and the
 * provider's request id — nothing a reader could use to call the API or reconstruct a traveler's
 * request (§13: the type is a fact we derived; the raw text is the provider's, and it stays in the
 * server log only through the caller's own existing console.error).
 *
 * §13 — STATED LIMIT: the "first per hour" gate is per PROCESS. Autoscale may run more than one
 * instance, so a fleet-wide outage can send one alert per instance per hour. That is an over-alert,
 * never an under-alert, and it is said here rather than hidden behind a guess.
 */
import { logger } from "../infrastructure/logger";

export type AiUpstreamErrorClass = "retryable" | "non_retryable";

export type AiUpstreamErrorType =
  | "credit_balance"
  | "authentication"
  | "permission"
  | "invalid_model"
  | "invalid_request"
  | "request_too_large"
  | "rate_limited"
  | "overloaded"
  | "server_error"
  | "timeout"
  | "connection";

export interface AiUpstreamClassification {
  errorClass: AiUpstreamErrorClass;
  errorType: AiUpstreamErrorType;
  /** The provider's HTTP status, or null for a connection failure that never got one. */
  status: number | null;
  /** The provider's request id (Anthropic `request_id`), never our own data. */
  requestId: string | null;
}

/** The log tag a non-retryable failure is written under — searchable, stated once. */
export const AI_UPSTREAM_NONRETRYABLE_TAG = "ai_upstream_nonretryable";
export const AI_UPSTREAM_RETRYABLE_TAG = "ai_upstream_retryable";

/** The DISTINCT status a non-retryable upstream failure is answered with (the retryable one stays 503). */
export const AI_NONRETRYABLE_STATUS = 502;
export const AI_NONRETRYABLE_MESSAGE = "Planning is temporarily unavailable.";

/** One alert per this window, per process (see the stated limit above). */
export const AI_ALERT_WINDOW_MS = 60 * 60 * 1000;

/** Default recipient; overridable by `AI_ALERT_EMAIL`. */
export const AI_ALERT_DEFAULT_EMAIL = "Admin@traveloure.com";

const MAX_CAUSE_DEPTH = 6;

/** The provider error is often wrapped (`new Error(msg, { cause })`) — read through the chain. */
function causeChain(err: unknown): any[] {
  const out: any[] = [];
  let cur: any = err;
  for (let i = 0; i < MAX_CAUSE_DEPTH && cur && typeof cur === "object"; i++) {
    out.push(cur);
    cur = cur.cause;
  }
  return out;
}

/** An Anthropic SDK `APIError` (duck-typed so tests need no SDK instance): a numeric status plus the SDK's body or request id. */
function isProviderHttpError(e: any): boolean {
  return (
    typeof e?.status === "number" &&
    e.status >= 400 &&
    e.status <= 599 && // fee-literal-ok: HTTP status-code range (5xx ceiling), not a fee
    ("error" in e || "request_id" in e || "headers" in e)
  );
}

function providerBodyType(e: any): string {
  const t = e?.error?.error?.type ?? e?.error?.type;
  return typeof t === "string" ? t : "";
}

function providerText(e: any): string {
  const m = e?.error?.error?.message ?? e?.error?.message ?? e?.message;
  return typeof m === "string" ? m : "";
}

function requestIdOf(e: any): string | null {
  const id = e?.request_id ?? e?.requestID ?? e?.headers?.["request-id"];
  return typeof id === "string" && id ? id : null;
}

/**
 * Classify an error thrown by (or wrapping) an Anthropic call. Returns null when the error is NOT
 * an upstream provider failure — a JSON parse failure, a truncated answer, our own circuit breaker
 * — so callers keep their existing behaviour for those and nothing is recorded as an outage.
 */
export function classifyAiUpstreamError(err: unknown): AiUpstreamClassification | null {
  for (const e of causeChain(err)) {
    if (isProviderHttpError(e)) {
      const status: number = e.status;
      const requestId = requestIdOf(e);
      const bodyType = providerBodyType(e);
      const text = providerText(e);
      const nonRetryable = (errorType: AiUpstreamErrorType): AiUpstreamClassification =>
        ({ errorClass: "non_retryable", errorType, status, requestId });
      const retryable = (errorType: AiUpstreamErrorType): AiUpstreamClassification =>
        ({ errorClass: "retryable", errorType, status, requestId });

      // Credit/billing first: the incident's shape is a 400 invalid_request_error whose only
      // distinguishing mark is the text, and it must never read as a generic retryable failure.
      if (/credit balance|billing|insufficient (credit|funds|quota)/i.test(text) || bodyType === "billing_error") {
        return nonRetryable("credit_balance");
      }
      if (status === 429) return retryable("rate_limited");
      if (status === 529 || bodyType === "overloaded_error") return retryable("overloaded");
      if (status === 408) return retryable("timeout");
      if (status >= 500) return retryable("server_error");
      if (status === 401) return nonRetryable("authentication");
      if (status === 403) return nonRetryable("permission");
      if (status === 413) return nonRetryable("request_too_large");
      if (status === 404 || (status === 400 && /\bmodel\b/i.test(text) && bodyType !== "")) {
        return nonRetryable("invalid_model");
      }
      return nonRetryable("invalid_request");
    }
    const name = typeof e?.name === "string" ? e.name : "";
    if (name === "APIConnectionTimeoutError") {
      return { errorClass: "retryable", errorType: "timeout", status: null, requestId: null };
    }
    if (name === "APIConnectionError") {
      return { errorClass: "retryable", errorType: "connection", status: null, requestId: null };
    }
  }
  return null;
}

// ── Reporting ────────────────────────────────────────────────────────────────

export interface AiUpstreamReportContext {
  /** The surface that saw it, e.g. "POST /api/ai/generate-itinerary" or a completeJson label. */
  route: string;
  /** The cost/usage source type of the call, when the caller has one. */
  sourceType?: string | null;
  /** The acting user, when there is one (kept in metadata — see `recordFailure`). */
  userId?: string | null;
  model?: string | null;
}

export interface AiUpstreamAlert {
  errorType: AiUpstreamErrorType;
  status: number | null;
  route: string;
  requestId: string | null;
  at: string;
}

export interface AiUpstreamFailureRecord extends AiUpstreamClassification {
  route: string;
  sourceType: string | null;
  userId: string | null;
  model: string | null;
}

export interface AiUpstreamReportDeps {
  recordFailure(row: AiUpstreamFailureRecord): Promise<void>;
  sendAlert(alert: AiUpstreamAlert): Promise<void>;
  now(): number;
}

/** Errors already reported once (by `claudeService.completeJson`), so a route catching them again does not double-count. */
const reported = new WeakSet<object>();
let lastAlertAt: number | null = null;

/** Test hook: forget the hourly gate. */
export function _resetAiUpstreamAlertGate(): void {
  lastAlertAt = null;
}

function markReported(err: unknown): void {
  for (const e of causeChain(err)) reported.add(e);
}

function alreadyReported(err: unknown): boolean {
  return causeChain(err).some((e) => reported.has(e));
}

function alertHtml(a: AiUpstreamAlert): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  return `<p>A non-retryable error came back from the AI provider. Planning surfaces are answering
"${esc(AI_NONRETRYABLE_MESSAGE)}" until it is fixed.</p>
<ul>
<li>Error type: ${esc(a.errorType)}</li>
<li>HTTP status: ${a.status ?? "none"}</li>
<li>Route: ${esc(a.route)}</li>
<li>Request id: ${esc(a.requestId ?? "not supplied")}</li>
<li>First seen: ${esc(a.at)}</li>
</ul>
<p>Further non-retryable errors in the next hour send no more alerts from this server instance. Every one is
counted as a failed call on the admin AI-costs page.</p>`;
}

const defaultDeps: AiUpstreamReportDeps = {
  async recordFailure(row) {
    // Lazy import: keeps this module importable (and the classifier testable) without a database.
    const { aiUsageService } = await import("./ai-usage.service");
    await aiUsageService.logUsage({
      provider: "anthropic",
      model: (row.model ?? "unknown").slice(0, 50),
      operation: (row.sourceType ?? row.route).slice(0, 50),
      // `ai_usage_logs.user_id` is an FK to users; a stale or non-user id would make the insert
      // fail and the failed call would vanish (the shape migration 310 fixed for ai_cost_tracking).
      // The actor rides in metadata instead, so the row always lands.
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0, costCents: 0 } as any,
      success: false,
      errorMessage: row.errorType,
      metadata: {
        errorClass: row.errorClass,
        status: row.status,
        route: row.route,
        requestId: row.requestId,
        actorId: row.userId,
      },
    });
  },
  async sendAlert(alert) {
    const to = process.env.AI_ALERT_EMAIL || AI_ALERT_DEFAULT_EMAIL;
    // The outbox's own public function — it never throws and retries delivery itself.
    const { enqueueEmail } = await import("./email-outbox.service");
    await enqueueEmail({
      to,
      subject: `[Traveloure] AI provider failing: ${alert.errorType}`,
      html: alertHtml(alert),
      text: `Non-retryable AI provider error. Type: ${alert.errorType}. Status: ${alert.status ?? "none"}. Route: ${alert.route}. Request id: ${alert.requestId ?? "not supplied"}. First seen: ${alert.at}.`,
      emailType: "ai_upstream_alert",
      metadata: { ...alert },
    });
    const webhook = process.env.AI_ALERT_WEBHOOK_URL;
    if (webhook) {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `AI provider failing: ${alert.errorType} (${alert.status ?? "no status"}) on ${alert.route}, request ${alert.requestId ?? "n/a"}`, ...alert }),
      });
    }
  },
  now: () => Date.now(),
};

/**
 * Classify, log, record and (first non-retryable per hour) alert. Never throws — reporting an
 * outage must never become a second failure on the request that saw it (§15b). Returns the
 * classification so the caller can choose the response, or null for a non-upstream error.
 */
export async function reportAiUpstreamError(
  err: unknown,
  ctx: AiUpstreamReportContext,
  deps: AiUpstreamReportDeps = defaultDeps,
): Promise<AiUpstreamClassification | null> {
  const c = classifyAiUpstreamError(err);
  if (!c) return null;
  if (alreadyReported(err)) return c;
  markReported(err);

  const logFields = {
    tag: c.errorClass === "non_retryable" ? AI_UPSTREAM_NONRETRYABLE_TAG : AI_UPSTREAM_RETRYABLE_TAG,
    errorType: c.errorType,
    status: c.status,
    route: ctx.route,
    requestId: c.requestId,
  };
  if (c.errorClass === "non_retryable") {
    logger.error(logFields, `[${AI_UPSTREAM_NONRETRYABLE_TAG}] AI provider refused the call (${c.errorType})`);
  } else {
    logger.warn(logFields, `[${AI_UPSTREAM_RETRYABLE_TAG}] AI provider call failed (${c.errorType})`);
  }

  try {
    await deps.recordFailure({
      ...c,
      route: ctx.route,
      sourceType: ctx.sourceType ?? null,
      userId: ctx.userId ?? null,
      model: ctx.model ?? null,
    });
  } catch (recordErr) {
    logger.error({ err: recordErr, route: ctx.route }, "[ai-upstream] failed to record the failed call");
  }

  if (c.errorClass === "non_retryable") {
    const now = deps.now();
    if (lastAlertAt === null || now - lastAlertAt >= AI_ALERT_WINDOW_MS) {
      // Take the gate BEFORE the send, so concurrent failures in this process send one alert.
      lastAlertAt = now;
      try {
        await deps.sendAlert({
          errorType: c.errorType,
          status: c.status,
          route: ctx.route,
          requestId: c.requestId,
          at: new Date(now).toISOString(),
        });
      } catch (alertErr) {
        logger.error({ err: alertErr, route: ctx.route }, "[ai-upstream] failed to send the alert");
      }
    }
  }
  return c;
}

/** The distinct body a non-retryable failure is answered with — no retry prompt, no retry-after. */
export function nonRetryableAiFailureBody(): { message: string; retryable: false; code: "ai_unavailable" } {
  return { message: AI_NONRETRYABLE_MESSAGE, retryable: false, code: "ai_unavailable" };
}

/** True when `err` is a classified non-retryable upstream failure (used to skip fallbacks/alternatives). */
export function isNonRetryableAiError(err: unknown): boolean {
  return classifyAiUpstreamError(err)?.errorClass === "non_retryable";
}

/**
 * The ONE route-side answer to an AI failure (§18 rule 1): report it, then a NON-RETRYABLE upstream
 * failure gets the distinct 502 body, and everything else keeps the existing sanitized 503 with the
 * circuit breaker's retry-after — byte-for-byte what these routes answered before this lane.
 */
export async function aiFailureResponse(
  err: unknown,
  ctx: AiUpstreamReportContext,
  deps?: AiUpstreamReportDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const c = await reportAiUpstreamError(err, ctx, deps);
  if (c?.errorClass === "non_retryable") {
    return { status: AI_NONRETRYABLE_STATUS, body: nonRetryableAiFailureBody() };
  }
  const { sanitizeAiProviderFailure, retryAfterSecondsFromError } = await import("../utils/ai-error-sanitizer");
  return { status: 503, body: { ...sanitizeAiProviderFailure(retryAfterSecondsFromError(err)) } };
}
