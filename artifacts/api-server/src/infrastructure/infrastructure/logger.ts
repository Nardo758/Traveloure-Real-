import pino from "pino";
import pinoHttp from "pino-http";
import crypto from "crypto";

const isDevelopment = process.env.NODE_ENV !== "production";

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
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => {
    return (req.headers["x-request-id"] as string) || crypto.randomUUID();
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} completed with ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} failed with ${res.statusCode}: ${err.message}`;
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
