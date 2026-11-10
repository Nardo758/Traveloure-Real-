import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import os from "node:os";
import type { RequestHandler } from "express";
import type { Store } from "express-session";
import { logger } from "../../infrastructure/logger";

const ROUTES = new Map([
  ["/api/auth/register", "POST"],
  ["/api/auth/login", "POST"],
  ["/api/auth/user", "GET"],
]);
const EVENTS = new Set([
  "request_started", "response_finished", "session_loaded", "session_load_failed",
  "store_read", "store_write", "register_existing", "register_conflict",
  "register_committed", "register_failed", "login_credentials_rejected",
  "login_regenerated", "login_regenerate_failed", "login_passport_failed",
  "login_authenticated", "login_failed",
] as const);
type Event = typeof EVENTS extends Set<infer T> ? T : never;
interface Details {
  outcome?: "ok" | "error" | "found" | "missing";
  authenticated?: boolean;
  secureRequest?: boolean;
  sessionCookiePresent?: boolean;
  gateCookiePresent?: boolean;
  sessionCookieIssued?: boolean;
  status?: number;
}
interface Trace { instance: string; requestId: string; method: string; path: string }
export type StagingAuthDiagnostic = Trace & Details & { event: Event };

function hasCookie(header: string | undefined, name: string): boolean {
  return (header ?? "").split(";").some((part) => part.trim().startsWith(`${name}=`));
}

/**
 * Staging only. No account identifiers, credentials, session IDs, header values,
 * errors, or caller-supplied request IDs enter a record. Each process has a
 * random suffix: hostname:pid alone collides across Autoscale containers.
 *
 * Store callbacks are observed, never awaited differently or saved again.
 * Production keeps its original store methods and middleware path.
 */
export function createStagingAuthDiagnostics(
  env: NodeJS.ProcessEnv = process.env,
  write: (record: StagingAuthDiagnostic) => void = (record) =>
    logger.info(record, "staging auth diagnostic"),
) {
  const contexts = new AsyncLocalStorage<Trace>();
  const instance = `${os.hostname()}:${process.pid}:${randomUUID()}`;
  const observed = new WeakSet<Store>();
  const active = () => (env.ENVIRONMENT ?? "").trim().toLowerCase() === "staging";

  function emit(trace: Trace | undefined, event: Event, details: Details = {}) {
    if (!active() || !trace || !EVENTS.has(event)) return;
    // Pick and validate fields, rather than spreading input into logs.
    const record: StagingAuthDiagnostic = { ...trace, event };
    if (["ok", "error", "found", "missing"].includes(details.outcome ?? "")) record.outcome = details.outcome;
    for (const key of [
      "authenticated", "secureRequest", "sessionCookiePresent",
      "gateCookiePresent", "sessionCookieIssued",
    ] as const) {
      if (typeof details[key] === "boolean") record[key] = details[key];
    }
    if (Number.isInteger(details.status) && details.status! >= 100 && details.status! < 600) record.status = details.status; // the HTTP status range
    try { write(record); } catch { /* Diagnostics must never change an auth result. */ }
  }

  const middleware: RequestHandler = (req, res, next) => {
    if (!active() || ROUTES.get(req.path) !== req.method) return next();
    const trace: Trace = { instance, requestId: randomUUID(), method: req.method, path: req.path };
    contexts.run(trace, () => {
      emit(trace, "request_started", {
        secureRequest: req.secure,
        sessionCookiePresent: hasCookie(req.headers.cookie, "connect.sid"),
        gateCookiePresent: hasCookie(req.headers.cookie, "stg_gate"),
      });
      res.once("finish", () => {
        const setCookie = res.getHeader("set-cookie");
        const cookies = Array.isArray(setCookie) ? setCookie : typeof setCookie === "string" ? [setCookie] : [];
        emit(trace, "response_finished", {
          status: res.statusCode,
          authenticated: req.isAuthenticated?.() === true,
          sessionCookieIssued: cookies.some((cookie) => cookie.startsWith("connect.sid=")),
        });
      });
      next();
    });
  };

  function observeStore<T extends Store>(store: T): T {
    if (!active() || observed.has(store)) return store;
    observed.add(store);
    const get = store.get;
    store.get = function (sid, callback) {
      const trace = contexts.getStore();
      if (!trace) return get.call(this, sid, callback);
      return get.call(this, sid, (err, session) => {
        emit(trace, "store_read", { outcome: err ? "error" : session ? "found" : "missing" });
        callback(err, session);
      });
    };
    const set = store.set;
    store.set = function (sid, session, callback) {
      const trace = contexts.getStore();
      if (!trace || !callback) return set.call(this, sid, session, callback);
      return set.call(this, sid, session, (err) => {
        emit(trace, "store_write", { outcome: err ? "error" : "ok" });
        callback(err);
      });
    };
    return store;
  }

  return {
    instance,
    middleware,
    observeStore,
    record: (event: Event, details?: Details) => emit(contexts.getStore(), event, details),
  };
}

export const stagingAuthDiagnostics = createStagingAuthDiagnostics();
