#!/usr/bin/env node
/**
 * Env-allowlist enforcement guard (journey-suite Wave 1; DECISIONS.md rulings 27, 33).
 *
 * The journey suite runs against dev/CI databases ONLY (brief §5 "Mechanics",
 * §9 "What NOT to do"). Three enforcement points keep test accounts and test
 * Stripe keys off production. This guard asserts the POSTURE still holds at
 * grep-level (it does not re-run the server); a drift here means the P0 boot
 * purge (PR #319) or the prod-strict Stripe policy has been weakened.
 *
 *   (a) isProdStrictEnv is DEFINED in server/utils/stripe-key-policy.ts and
 *       REFERENCED by server/validate-env.ts (single prod-detection source).
 *   (b) server/index.ts gates seedE2EAccounts() on ALLOW_TEST_ACCOUNTS (with the
 *       NODE_ENV fail-safe) and PURGES via the prod-purge path otherwise.
 *   (c) No .github/workflows/*.yml SETS ALLOW_TEST_ACCOUNTS=1 in a file that also
 *       targets a real deployment (deploy base URL / production-named job).
 *       Setting it for a throwaway-DB CI boot (NODE_ENV=production bundle on
 *       localhost) is fine; setting it for a deployed target is the leak.
 *
 * Node built-ins only — no npm ci needed. Self-test: --self-test
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STRIPE_POLICY = path.join(ROOT, "server", "utils", "stripe-key-policy.ts");
const VALIDATE_ENV = path.join(ROOT, "server", "validate-env.ts");
const SERVER_INDEX = path.join(ROOT, "server", "index.ts");
const WORKFLOW_DIR = path.join(ROOT, ".github", "workflows");

function readOrEmpty(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

// Strip `#`-prefixed comment lines and inline `#` comments so prose mentions of
// a token never count as an actual YAML assignment. Keeps `#` inside quotes
// conservatively by only stripping from the first unquoted `#`.
function stripYamlComments(yamlText) {
  return yamlText
    .split("\n")
    .map((line) => {
      let inSingle = false;
      let inDouble = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "'" && !inDouble) inSingle = !inSingle;
        else if (c === '"' && !inSingle) inDouble = !inDouble;
        else if (c === "#" && !inSingle && !inDouble) return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

/**
 * True iff the workflow SETS ALLOW_TEST_ACCOUNTS to 1 as a real assignment —
 * either a YAML `env:` mapping (`ALLOW_TEST_ACCOUNTS: '1'`) or a shell
 * assignment/export in a run step (`ALLOW_TEST_ACCOUNTS=1`). Comment-only
 * mentions (prose) do NOT count.
 */
function setsAllowTestAccounts(yamlNoComments) {
  // YAML mapping: `ALLOW_TEST_ACCOUNTS: '1'` | "1" | 1
  if (/^\s*ALLOW_TEST_ACCOUNTS\s*:\s*['"]?1['"]?\s*$/m.test(yamlNoComments)) return true;
  // Shell assignment inside a run block: `ALLOW_TEST_ACCOUNTS=1` (optionally
  // export), anchored to statement position — start of a trimmed line or right
  // after `export `. This deliberately EXCLUDES `ALLOW_TEST_ACCOUNTS=1` embedded
  // inside a quoted echo/notice string (prose), which never begins a statement.
  if (/^\s*(?:export\s+)?ALLOW_TEST_ACCOUNTS=1\b/m.test(yamlNoComments)) return true;
  return false;
}

/**
 * True iff the workflow targets a REAL deployment (as opposed to a throwaway CI
 * DB boot). Signals: a deploy base-URL secret (E2E_BASE_URL / *_BASE_URL bound
 * to a secret / an https URL secret), an `environment:` gate, or a job key /
 * workflow name literally named for production or deploy.
 *
 * NOTE: `NODE_ENV: production` alone is NOT a deploy signal — the route gates
 * boot the *production bundle* against localhost with a throwaway DB.
 */
function targetsDeployment(yamlNoComments) {
  if (/\bE2E_BASE_URL\b/.test(yamlNoComments)) return true;
  if (/^\s*environment\s*:/m.test(yamlNoComments)) return true;
  // A job key named for production/deploy (two-space indent under jobs:).
  if (/^\s{2}[a-z0-9_-]*(?:deploy|production)[a-z0-9_-]*\s*:\s*$/im.test(yamlNoComments)) return true;
  return false;
}

function lint({ stripePolicy, validateEnv, serverIndex, workflows }) {
  const failures = [];

  // (a) isProdStrictEnv defined + referenced.
  if (!/export\s+function\s+isProdStrictEnv\b/.test(stripePolicy)) {
    failures.push(
      "(a) server/utils/stripe-key-policy.ts no longer defines `export function isProdStrictEnv` — the single prod-detection source is gone.",
    );
  }
  if (!/\bisProdStrictEnv\b/.test(validateEnv)) {
    failures.push(
      "(a) server/validate-env.ts no longer references isProdStrictEnv — env validation is not using the shared prod-strict rule.",
    );
  }

  // (b) seedE2EAccounts gated on ALLOW_TEST_ACCOUNTS, purge on the else branch.
  if (!/\bseedE2EAccounts\b/.test(serverIndex)) {
    failures.push("(b) server/index.ts no longer calls seedE2EAccounts — the seed gate is gone.");
  }
  if (!/\bALLOW_TEST_ACCOUNTS\b/.test(serverIndex)) {
    failures.push(
      "(b) server/index.ts no longer references ALLOW_TEST_ACCOUNTS — the seed branch is not gated on the allowlist.",
    );
  }
  // The seed must be gated: ALLOW_TEST_ACCOUNTS and seedE2EAccounts must co-occur
  // inside a conditional guard, and the prod-purge path must exist as the else.
  if (!/purgeE2EAccountsFromProd/.test(serverIndex)) {
    failures.push(
      "(b) server/index.ts no longer calls purgeE2EAccountsFromProd — production no longer purges seeded test accounts (P0 posture broken).",
    );
  } else {
    // Ensure the gate wraps the seed: ALLOW_TEST_ACCOUNTS appears before the
    // seedE2EAccounts() call and the purge appears after (guard/else shape).
    const allowIdx = serverIndex.search(/ALLOW_TEST_ACCOUNTS/);
    const seedIdx = serverIndex.search(/await\s+seedE2EAccounts\s*\(/);
    const purgeIdx = serverIndex.search(/await\s+purgeE2EAccountsFromProd\s*\(/);
    if (!(allowIdx >= 0 && seedIdx > allowIdx)) {
      failures.push(
        "(b) server/index.ts: ALLOW_TEST_ACCOUNTS gate does not precede the seedE2EAccounts() call — the seed may run ungated.",
      );
    }
    if (!(purgeIdx > seedIdx)) {
      failures.push(
        "(b) server/index.ts: purgeE2EAccountsFromProd() is not on the non-allowed branch (should follow the seed guard as the else path).",
      );
    }
  }

  // (c) No workflow SETS ALLOW_TEST_ACCOUNTS=1 while targeting a deployment.
  for (const { name, text } of workflows) {
    const noComments = stripYamlComments(text);
    if (setsAllowTestAccounts(noComments) && targetsDeployment(noComments)) {
      failures.push(
        `(c) .github/workflows/${name} SETS ALLOW_TEST_ACCOUNTS=1 AND targets a real deployment (deploy base URL / production-named job / environment gate). Test accounts must never be seeded against a deployed target (P0 purge, PR #319).`,
      );
    }
  }

  return failures;
}

function collectWorkflows(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(dir, f), "utf8") }));
}

function selfTest() {
  const results = [];

  // Baseline good posture: everything present, no leaking workflow.
  const good = lint({
    stripePolicy: "export function isProdStrictEnv(env) { return true; }",
    validateEnv: 'import { isProdStrictEnv } from "./utils/stripe-key-policy";\nconst x = isProdStrictEnv();',
    serverIndex:
      "const allow = process.env.ALLOW_TEST_ACCOUNTS === '1';\nif (allow) { await seedE2EAccounts(); } else { await purgeE2EAccountsFromProd(); }",
    workflows: [
      // Throwaway-DB CI boot: sets ALLOW but NO deploy target → OK.
      { name: "route-gate.yml", text: "jobs:\n  gate:\n    env:\n      NODE_ENV: production\n      ALLOW_TEST_ACCOUNTS: '1'\n" },
      // Deploy target but ALLOW only in a comment → OK.
      {
        name: "deploy-smoke.yml",
        text: "jobs:\n  e2e-deploy-smoke:\n    env:\n      E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}\n    steps:\n      # opts in via ALLOW_TEST_ACCOUNTS=1 on a staging deploy\n      - run: echo hi\n",
      },
    ],
  });
  results.push(["good posture passes", good.length === 0, good]);

  // (a) missing definition.
  const noDef = lint({
    stripePolicy: "// nothing here",
    validateEnv: "isProdStrictEnv()",
    serverIndex: "if (process.env.ALLOW_TEST_ACCOUNTS) { await seedE2EAccounts(); } else { await purgeE2EAccountsFromProd(); }",
    workflows: [],
  });
  results.push(["missing isProdStrictEnv definition fails", noDef.some((f) => f.includes("stripe-key-policy")), noDef]);

  // (a) missing reference.
  const noRef = lint({
    stripePolicy: "export function isProdStrictEnv() {}",
    validateEnv: "// does not use it",
    serverIndex: "if (process.env.ALLOW_TEST_ACCOUNTS) { await seedE2EAccounts(); } else { await purgeE2EAccountsFromProd(); }",
    workflows: [],
  });
  results.push(["missing validate-env reference fails", noRef.some((f) => f.includes("validate-env")), noRef]);

  // (b) missing purge.
  const noPurge = lint({
    stripePolicy: "export function isProdStrictEnv() {}",
    validateEnv: "isProdStrictEnv()",
    serverIndex: "if (process.env.ALLOW_TEST_ACCOUNTS) { await seedE2EAccounts(); }",
    workflows: [],
  });
  results.push(["missing purge fails", noPurge.some((f) => f.includes("purgeE2EAccountsFromProd")), noPurge]);

  // (b) ungated seed (allow gate after seed / absent).
  const ungated = lint({
    stripePolicy: "export function isProdStrictEnv() {}",
    validateEnv: "isProdStrictEnv()",
    serverIndex: "await seedE2EAccounts();\nconst allow = process.env.ALLOW_TEST_ACCOUNTS;\nawait purgeE2EAccountsFromProd();",
    workflows: [],
  });
  results.push(["seed before the ALLOW gate fails", ungated.some((f) => f.includes("does not precede")), ungated]);

  // (c) leaking workflow: sets ALLOW=1 (env) AND has a deploy URL.
  const leakEnv = lint({
    stripePolicy: "export function isProdStrictEnv() {}",
    validateEnv: "isProdStrictEnv()",
    serverIndex: "if (process.env.ALLOW_TEST_ACCOUNTS) { await seedE2EAccounts(); } else { await purgeE2EAccountsFromProd(); }",
    workflows: [
      { name: "bad.yml", text: "jobs:\n  x:\n    env:\n      E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}\n      ALLOW_TEST_ACCOUNTS: '1'\n" },
    ],
  });
  results.push(["deploy-target workflow setting ALLOW=1 fails", leakEnv.some((f) => f.includes("bad.yml")), leakEnv]);

  // (c) leaking workflow via shell export in a production-named job.
  const leakShell = lint({
    stripePolicy: "export function isProdStrictEnv() {}",
    validateEnv: "isProdStrictEnv()",
    serverIndex: "if (process.env.ALLOW_TEST_ACCOUNTS) { await seedE2EAccounts(); } else { await purgeE2EAccountsFromProd(); }",
    workflows: [
      { name: "prod.yml", text: "jobs:\n  production-deploy:\n    steps:\n      - run: |\n          export ALLOW_TEST_ACCOUNTS=1\n          npm run deploy\n" },
    ],
  });
  results.push(["production-job shell-setting ALLOW=1 fails", leakShell.some((f) => f.includes("prod.yml")), leakShell]);

  // (c) NOT a false positive: production job that does NOT set ALLOW.
  const cleanProd = lint({
    stripePolicy: "export function isProdStrictEnv() {}",
    validateEnv: "isProdStrictEnv()",
    serverIndex: "if (process.env.ALLOW_TEST_ACCOUNTS) { await seedE2EAccounts(); } else { await purgeE2EAccountsFromProd(); }",
    workflows: [{ name: "deploy.yml", text: "jobs:\n  production-deploy:\n    env:\n      E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}\n    steps:\n      - run: echo ship\n" }],
  });
  results.push(["deploy job without ALLOW passes", cleanProd.length === 0, cleanProd]);

  const allOk = results.every(([, ok]) => ok);
  if (!allOk) {
    console.error("SELF-TEST FAILED");
    for (const [label, ok, detail] of results) if (!ok) console.error(`  ✗ ${label}`, detail);
    process.exit(1);
  }
  console.log(`self-test OK (${results.length} cases: definition/reference/purge/gate-order/deploy-leak positives + no-false-positive on throwaway-DB and clean-deploy)`);
  process.exit(0);
}

if (process.argv.includes("--self-test")) selfTest();

const failures = lint({
  stripePolicy: readOrEmpty(STRIPE_POLICY),
  validateEnv: readOrEmpty(VALIDATE_ENV),
  serverIndex: readOrEmpty(SERVER_INDEX),
  workflows: collectWorkflows(WORKFLOW_DIR),
});

if (failures.length) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  process.exit(1);
}
console.log("env-allowlist guard OK (prod-strict source intact · seed gated on ALLOW_TEST_ACCOUNTS w/ prod purge · no deploy-targeting workflow seeds test accounts)");
