import pino from "pino";
import pinoHttp from "pino-http";
import crypto from "crypto";

const isDevelopment = process.env.NODE_ENV !== "production";

/**
 * REQUEST LOGS CARRY AN ALLOWLIST OF HEADERS, NEVER A DENYLIST (security fix, Sep 24, 2026).
 * The redaction below named only `authorization` and `cookie`, so every other credential-bearing
 * header was logged in full — the internal job secret (`x-internal-secret`), Stripe's
 * `stripe-signature`, any `x-api-key`. A denylist cannot know about the next such header; this
 * keeps only the headers named here and drops the rest (the §19 posture, applied to logs).
 * Query values under credential-looking keys are masked, since a URL can carry a token too.
 */
export const LOGGED_REQUEST_HEADERS = [
  "host",
  "user-agent",
  "content-type",
  "content-length",
  "accept",
  "accept-language",
  "referer",
  "origin",
  "x-request-id",
  "x-forwarded-for",
] as const;

// PX-1b (ledger `2026-10-18-partner-token-redaction`): `affiliate_id` joins the list — DiscoverCars' API
// takes the Travelpayouts token under that name, so the name alone must be enough to mask it.
const CREDENTIAL_QUERY_KEY = /(token|secret|key|signature|password|passwd|auth|code|session|jwt|otp|affiliate_id)/i;

/** Env names that hold a credential (the same shape the PX-1 link test reads from the source). */
const SECRET_ENV_NAME = /(TOKEN|SECRET|PASSWORD|API_KEY|_KEY)$/;
/** Shorter values are not masked by value: too likely to match ordinary text. Names still mask them. */
const MIN_MASKED_SECRET_LENGTH = 8;

function configuredSecretValues(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (value && SECRET_ENV_NAME.test(name) && value.length >= MIN_MASKED_SECRET_LENGTH) out.push(value);
  }
  return out.sort((x, y) => y.length - x.length);
}

const PAYOUT_HANDLE_LOG_KEYS = new Set(["payoutHandle", "payout_handle"]);

/** Drop payout-handle values from structured logs. A handle must not carry a bank or routing number into a log line. */
export function censorPayoutHandleKeys(arg: unknown): unknown {
  if (Array.isArray(arg)) {
    let changed = false;
    const next = arg.map((item) => {
      const redacted = censorPayoutHandleKeys(item);
      if (redacted !== item) changed = true;
      return redacted;
    });
    return changed ? next : arg;
  }
  if (arg && typeof arg === "object" && !(arg instanceof Error) && Object.getPrototypeOf(arg) === Object.prototype) {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(arg as Record<string, unknown>)) {
      if (PAYOUT_HANDLE_LOG_KEYS.has(key)) {
        out[key] = "[REDACTED]";
        changed = true;
        continue;
      }
      const redacted = censorPayoutHandleKeys(value);
      if (redacted !== value) changed = true;
      out[key] = redacted;
    }
    return changed ? out : arg;
  }
  return arg;
}

/** Mask a payoutHandle / payout_handle assignment inside a logged string. */
export function redactPayoutHandleText(text: string): string {
  if (!text) return text;
  return text.replace(
    /(["']?)(?:payoutHandle|payout_handle)\1\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+)/gi,
    (match) => {
      const sep = match.match(/[:=]/);
      const key = match.slice(0, sep?.index ?? match.length).trimEnd();
      const quoted = /["']$/.test(key) || match.includes(":\"");
      return quoted ? `${key}${sep?.[0] ?? ":"}"[REDACTED]"` : `${key}${sep?.[0] ?? "="}[REDACTED]`;
    },
  );
}

/**
 * Text with every credential-looking query value masked AND every configured secret's value masked,
 * wherever it appears (a URL quoted in an error message, a partner's echoed request). Never throws.
 */
export function redactSecretsInText(text: string, env: NodeJS.ProcessEnv = process.env): string {
  if (typeof text !== "string" || text.length === 0) return text;
  let out = text.replace(/([?&])([^=&\s"'<>]+)=([^&\s"'<>]*)/g, (m, sep: string, k: string) => {
    let name = k;
    try {
      name = decodeURIComponent(k);
    } catch {
      /* keep the raw key */
    }
    return CREDENTIAL_QUERY_KEY.test(name) ? `${sep}${k}=[REDACTED]` : m;
  });
  for (const v of configuredSecretValues(env)) {
    if (out.includes(v)) out = out.split(v).join("[REDACTED]");
  }
  return out;
}

/** One log argument with secrets masked: strings, Error messages/stacks, and plain objects (one level). */
export function redactLogArg(arg: unknown): unknown {
  if (typeof arg === "string") return redactPayoutHandleText(redactSecretsInText(arg));
  // An argument with nothing to mask is passed through untouched (an Error keeps its cause and code).
  if (arg instanceof Error) {
    const message = redactPayoutHandleText(redactSecretsInText(arg.message));
    const stack = arg.stack ? redactPayoutHandleText(redactSecretsInText(arg.stack)) : arg.stack;
    if (message === arg.message && stack === arg.stack) return arg;
    const copy = new Error(message);
    copy.name = arg.name;
    copy.stack = stack;
    return copy;
  }
  const censored = censorPayoutHandleKeys(arg);
  if (censored && typeof censored === "object" && !Array.isArray(censored) && Object.getPrototypeOf(censored) === Object.prototype) {
    let changed = censored !== arg;
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(censored as Record<string, unknown>)) {
      const r = typeof v === "string" || v instanceof Error ? redactLogArg(v) : v;
      if (r !== v) changed = true;
      o[k] = r;
    }
    return changed ? o : censored;
  }
  return censored;
}

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;
let consoleRedactionInstalled = false;

/**
 * Wrap `console.*` so a token in a logged URL or error never reaches the process output. Idempotent;
 * installed once at boot (`server/index.ts`). pino output is redacted by `hooks.logMethod` below.
 */
export function installConsoleRedaction(target: Console = console): void {
  if (target === console && consoleRedactionInstalled) return;
  for (const m of CONSOLE_METHODS) {
    const original = target[m].bind(target);
    (target as any)[m] = (...args: unknown[]) => original(...args.map(redactLogArg));
  }
  if (target === console) consoleRedactionInstalled = true;
}

/** The URL with credential-looking query values replaced by [REDACTED]. Never throws. */
export function redactUrlForLog(url: string | undefined): string | undefined {
  if (!url || !url.includes("?")) return url;
  const q = url.indexOf("?");
  const params = url.slice(q + 1).split("&").map((pair) => {
    const eq = pair.indexOf("=");
    const k = eq === -1 ? pair : pair.slice(0, eq);
    let name = k;
    try {
      name = decodeURIComponent(k);
    } catch {
      /* keep the raw key */
    }
    return eq !== -1 && CREDENTIAL_QUERY_KEY.test(name) ? `${k}=[REDACTED]` : pair;
  });
  return `${url.slice(0, q)}?${params.join("&")}`;
}

/** pino's request serializer, narrowed to the allowlisted headers and a redacted URL. */
export function safeRequestSerializer(req: any) {
  const base = pino.stdSerializers.req(req) as any;
  const headers: Record<string, unknown> = {};
  const raw = (base?.headers ?? {}) as Record<string, unknown>;
  for (const name of LOGGED_REQUEST_HEADERS) {
    if (raw[name] !== undefined) headers[name] = raw[name];
  }
  return { ...base, url: redactUrlForLog(base?.url), headers };
}

/** PX-1b: every string, Error and plain-object argument of a pino call is passed through `redactLogArg`. */
export const loggerHooks = {
  logMethod(this: unknown, inputArgs: unknown[], method: (...args: unknown[]) => void) {
    return method.apply(this, inputArgs.map(redactLogArg) as any);
  },
};

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  hooks: loggerHooks,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.token",
      "req.body.apiKey",
      "req.body.payoutHandle",
      "req.body.payout_handle",
      "*.password",
      "*.token",
      "*.secret",
      "*.payoutHandle",
      "*.payout_handle",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    req: safeRequestSerializer,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
});

export const httpLogger = pinoHttp({
  logger,
  serializers: {
    req: safeRequestSerializer,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
  genReqId: (req) => {
    return (req.headers["x-request-id"] as string) || crypto.randomUUID();
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${redactUrlForLog(req.url)} completed with ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${redactUrlForLog(req.url)} failed with ${res.statusCode}: ${err.message}`;
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  autoLogging: {
    ignore: (req) => {
      const path = req.url || "";
      return (
        path === "/health" ||
        path === "/health/ready" ||
        path === "/metrics" ||
        path.startsWith("/assets") ||
        path.endsWith(".js") ||
        path.endsWith(".css") ||
        path.endsWith(".ico")
      );
    },
  },
});

export function createChildLogger(name: string) {
  return logger.child({ service: name });
}

export const aiLogger = createChildLogger("ai-service");
export const cacheLogger = createChildLogger("cache-service");
export const apiLogger = createChildLogger("external-api");
export const dbLogger = createChildLogger("database");
