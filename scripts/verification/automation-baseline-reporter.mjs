import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

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
      if (config) {
        if (!["vitest.itinerary-outcomes.config.ts", "vitest.itinerary-followups.config.ts"].includes(config)) {
          throw new Error("Unapproved Vitest configuration");
        }
        const cli = args.findIndex(arg => /node_modules\/tsx\/dist\/cli\.mjs$/.test(arg));
        if (cli < 0) throw new Error("Retained test child layout changed");
        args = [...args.slice(0, cli), "node_modules/vitest/vitest.mjs", "run", "--config", config, "--reporter=json"];
      }
      options = { ...options, env };
    }
    return originalSpawn.call(this, command, args, options);
  };
  syncBuiltinESMExports();
}
