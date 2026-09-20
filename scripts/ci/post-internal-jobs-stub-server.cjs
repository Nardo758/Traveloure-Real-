#!/usr/bin/env node
"use strict";
/**
 * post-internal-jobs-stub-server.cjs — a tiny local stub (node built-in http, no deps) standing
 * in for the production `/api/ready` + `/internal/jobs/*` surface, so
 * scripts/ci/post-internal-jobs.test.sh can prove the cold-start warm-up + bounded retry logic in
 * scripts/ci/post-internal-jobs.sh without touching production or the real 5s/10s/20s backoff.
 *
 * Configured entirely by env vars (no CLI args, so the test driver can `env VAR=x node this.cjs`):
 *
 *   STUB_READY_MODE      "ok"    (default) — GET /api/ready always answers 200 {ready:true}.
 *                         "never"          — GET /api/ready always answers 503 {ready:false},
 *                                            emulating an instance/outage that never comes up.
 *
 *   STUB_ROUTE_SEQUENCE   Comma-separated HTTP status codes returned by successive POSTs to
 *                         /internal/jobs/:route, e.g. "404,404,200" — first call gets 404, second
 *                         gets 404, third (and every call after) gets 200. A single value (e.g.
 *                         "401") answers that code on every call. Recognized codes: 200 (JSON
 *                         {ok:true}, the healthy shape), 401 (JSON {message}, the wrong-secret
 *                         shape), 500 (JSON {ok:false,error}, the job-ran-and-failed shape), 503
 *                         (JSON {message}, the secret-not-yet-settled shape), 404 (PLAIN TEXT body
 *                         — this deliberately matches production's boot-window shape, where
 *                         Express's own default 404 handler answers before /internal is mounted,
 *                         NOT the JSON 404 the real notFoundHandler produces once routes exist;
 *                         the client-side script must treat both as "retryable 404" without caring
 *                         which one it got).
 *
 * Prints the bound port, and nothing else, to stdout on its own line once listening, so the driver
 * can pick it up.
 */
const http = require("http");

const readyMode = process.env.STUB_READY_MODE || "ok";
const routeSequence = (process.env.STUB_ROUTE_SEQUENCE || "200")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let routeCallCount = 0;

function sendJson(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json" });
  res.end(text);
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/ready") {
    if (readyMode === "never") {
      sendJson(res, 503, { ready: false, status: "fail", message: "Database seeding in progress" });
    } else {
      sendJson(res, 200, { ready: true, status: "ok" });
    }
    return;
  }

  if (req.method === "POST" && req.url.startsWith("/internal/jobs/")) {
    const idx = Math.min(routeCallCount, routeSequence.length - 1);
    const code = parseInt(routeSequence[idx], 10);
    routeCallCount += 1;

    // Drain the request body (the real script always sends one) so the socket doesn't hang.
    req.on("data", () => {});
    req.on("end", () => {
      switch (code) {
        case 200:
          sendJson(res, 200, { ok: true, drained: 3 });
          return;
        case 401:
          sendJson(res, 401, { message: "Unauthorized" });
          return;
        case 500:
          sendJson(res, 500, { ok: false, error: "boom (stub-induced failure)" });
          return;
        case 503:
          sendJson(res, 503, { message: "Internal job endpoint disabled (INTERNAL_JOB_SECRET unset)" });
          return;
        case 404:
        default:
          // Plain text, on purpose — see the header comment. This is the boot-window shape.
          res.writeHead(404, { "content-type": "text/plain" });
          res.end(`Cannot POST ${req.url}`);
          return;
      }
    });
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(0, "127.0.0.1", () => {
  console.log(server.address().port);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
