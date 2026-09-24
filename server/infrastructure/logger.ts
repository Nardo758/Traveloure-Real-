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

const CREDENTIAL_QUERY_KEY = /(token|secret|key|signature|password|passwd|auth|code|session|jwt|otp)/i;

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
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.token",
      "req.body.apiKey",
      "*.password",
      "*.token",
      "*.secret",
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
