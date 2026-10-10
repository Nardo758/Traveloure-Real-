import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";

export function isolatedHttpTarget(target, schema) {
  if (!/^automation_msg_[a-f0-9]{16}$/.test(schema ?? "")) throw new Error("HTTP bridge requires an isolated fixture schema");
  const url = new URL(target);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port ||
      Number(url.port) < 1024 || url.username || url.password || url.pathname !== "/" || url.search) {
    throw new Error("Only the retained private HTTP harness is allowed");
  }
  return url;
}

// Transport-only bridge for retained tests that hardcode https://REPLIT_DEV_DOMAIN.
// Requests still hit the existing real handlers and isolated database, never preview.
if (process.env.AUTOMATION_BASELINE_HTTP_TARGET) {
  if (process.env.NODE_ENV === "production") throw new Error("Fixture HTTP bridge is forbidden in production");
  const target = isolatedHttpTarget(process.env.AUTOMATION_BASELINE_HTTP_TARGET,
    process.env.MESSAGING_VERIFICATION_SCHEMA);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    if (input instanceof Request) throw new Error("Unexpected fixture request representation");
    const url = new URL(input);
    if (url.origin === "https://automation-part1.invalid") {
      return originalFetch(new URL(url.pathname + url.search + url.hash, target), init);
    }
    if (url.origin !== target.origin) throw new Error("Fixture HTTP request must stay in its isolated harness");
    return originalFetch(input, init);
  };
}

/** Never persist raw child output: even existing test writers can log recipients. */
export function redact(value) {
  return String(value)
    .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[address-redacted]")
    .replace(/\b(?:sk_live_|sk_test_|pk_live_|pk_test_|whsec_|re_)[a-z0-9_-]{12,}/gi, "[key-redacted]")
    .replace(/(Bearer\s+)\S+/gi, "$1[redacted]")
    .replace(/([a-z][a-z+]*:\/\/)[^/\s@]+@/gi, "$1[credentials-redacted]@")
    .replace(/([?&](?:token|code|password|secret)=)[^&\s"'<>]+/gi, "$1[redacted]")
    .replace(/("(?:password|token|secret|apiKey)"\s*:\s*")[^"]+"/gi, '$1[redacted]"');
}

export function parseTap(output) {
  const lines = redact(output).split(/\r?\n/);
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*(not ok|ok)\s+\d+\s+-\s+(.+)$/);
    if (!match) continue;
    const skipped = /#\s*(?:SKIP|TODO)\b/i.test(match[2]);
    const duration = lines.slice(i + 1, i + 7).join("\n").match(/duration_ms:\s*([\d.]+)/);
    results.push({
      name: match[2], status: match[1] === "ok" && !skipped ? "PASS" : "FAIL",
      durationMs: duration ? Number(duration[1]) : 0,
      reason: skipped ? "SKIPPED_REQUIRED_TEST" : match[1] === "ok" ? null : "TEST_FAILURE",
    });
  }
  return results;
}

export function parseVitest(output) {
  const start = output.indexOf('{"numTotalTestSuites"');
  if (start < 0) return [];
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let index = start; index < output.length; index++) {
    const char = output[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) { end = index + 1; break; }
  }
  if (end < 0) return [];
  let document;
  try { document = JSON.parse(output.slice(start, end)); } catch { return []; }
  return (document.testResults ?? []).flatMap(file =>
    (file.assertionResults ?? []).map(test => ({
      name: redact(test.fullName || test.title), status: test.status === "passed" ? "PASS" : "FAIL",
      durationMs: Number(test.duration ?? 0),
      reason: test.status === "passed" ? null : `VITEST_${test.status.toUpperCase()}`,
    })));
}

/**
 * Adapter for the RETAINED schema-isolation runner, not a second DB harness.
 * Only its test child is adapted; its fingerprint guard, clone, constraints,
 * HTTP harness, time budget and cleanup are unchanged. Never imported by app.
 */
if (process.env.AUTOMATION_BASELINE_ADAPTER === "1") {
  const originalSpawn = cp.spawn;
  cp.spawn = function (command, args, options) {
    if (Array.isArray(args) && args.includes("--test") &&
        /^automation_msg_[a-f0-9]{16}$/.test(options?.env?.MESSAGING_VERIFICATION_SCHEMA ?? "")) {
      const env = {
        ...options.env, RUN_SIGNUP_WELCOME_DB_TESTS: "1",
        RUN_GENERATION_OUTCOME_DB_TESTS: "1", RUN_ITINERARY_FOLLOWUP_DB_TESTS: "1",
      };
      const config = process.env.AUTOMATION_BASELINE_VITEST_CONFIG;
      if (process.env.AUTOMATION_BASELINE_LIVE_CONFIG) {
        // Retained schema preload mandates test mode. This is still the
        // independently fingerprinted development DB, never production.
        env.NODE_ENV = "test";
        env.AUTOMATION_BASELINE_LIVE_CONFIG = process.env.AUTOMATION_BASELINE_LIVE_CONFIG;
        env.AUTOMATION_BASELINE_LIVE_LOOP = process.env.AUTOMATION_BASELINE_LIVE_LOOP;
        // Existing SDK consumes these; never inspect, display or persist their values.
        for (const key of ["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_FROM_NOREPLY", "EMAIL_REPLY_TO", "REPLIT_DEV_DOMAIN"]) {
          if (process.env[key]) env[key] = process.env[key];
        }
        const cli = args.indexOf("node_modules/tsx/dist/cli.mjs");
        args = [...args.slice(0, cli + 1), "scripts/verification/user-automation-baseline.ts", "--live-proof"];
      }
      if (config) {
        if (!["vitest.itinerary-outcomes.config.ts", "vitest.itinerary-followups.config.ts"].includes(config)) {
          throw new Error("Unapproved Vitest configuration");
        }
        const cli = args.findIndex(arg => /node_modules\/tsx\/dist\/cli\.mjs$/.test(arg));
        if (cli < 0) throw new Error("Retained test child layout changed");
        const prefix = args.slice(0, cli);
        if (config === "vitest.itinerary-followups.config.ts") {
          isolatedHttpTarget(env.JOURNEY_BASE_URL, env.MESSAGING_VERIFICATION_SCHEMA);
          env.AUTOMATION_BASELINE_HTTP_TARGET = env.JOURNEY_BASE_URL;
          env.REPLIT_DEV_DOMAIN = "automation-part1.invalid";
          env.AUTOMATION_BASELINE_RUN_VITEST = config;
          args = [...prefix, fileURLToPath(import.meta.url)];
        } else {
          args = [...prefix, "node_modules/vitest/vitest.mjs", "run", "--config", config, "--reporter=json"];
        }
      }
      options = { ...options, env };
    }
    return originalSpawn.call(this, command, args, options);
  };
  syncBuiltinESMExports();
}

// Vitest workers create their own globals: a Node --import preload alone is
// insufficient. Merge a setup file through Vitest's installed, typed public API,
// retaining the original config and assertions (no second config/CI file).
if (process.env.AUTOMATION_BASELINE_RUN_VITEST &&
    !process.env.VITEST_WORKER_ID && !process.env.VITEST_POOL_ID &&
    process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = process.env.AUTOMATION_BASELINE_RUN_VITEST;
  if (config !== "vitest.itinerary-followups.config.ts") throw new Error("Unapproved worker setup configuration");
  isolatedHttpTarget(process.env.AUTOMATION_BASELINE_HTTP_TARGET, process.env.MESSAGING_VERIFICATION_SCHEMA);
  const { startVitest } = await import("vitest/node");
  const context = await startVitest("test", [], { config, watch: false, reporters: ["json"] },
    { test: { setupFiles: [fileURLToPath(import.meta.url)] } });
  await context.close();
}
