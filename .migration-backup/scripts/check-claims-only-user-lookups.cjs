/**
 * CI gate: blocks claims-only session-user extraction under server/.
 *
 * Background: email-login sessions carry the user id at `claims.sub`, while
 * Replit OAuth carries `id` (plus claims) and Facebook OAuth carries only `id`.
 * Reading `req.user.claims?.sub` without an `?? <same user>.id` / `|| <same
 * user>.id` fallback silently yields undefined for OAuth users (false 403s).
 * ~120 routes were fixed for this; this script stops the pattern from coming
 * back.
 *
 * Rule: any non-comment claims-sub read under server/ — `claims.sub`,
 * `claims?.sub`, `claims["sub"]`, `claims?.["sub"]`, single or double quotes —
 * must EITHER
 *   - have an `.id` fallback ON THE SAME RECEIVER via `??` or `||`
 *     (either order: `u.claims?.sub ?? u.id` or `u.id || u.claims?.sub`), OR
 *   - live in an allowlisted file (the shared helper, or OIDC handshake code
 *     that operates on raw token claims rather than a session user).
 *
 * Preferred fix: use getUserId()/requireUserId() from server/utils/auth.ts.
 *
 * Run standalone:   node scripts/check-claims-only-user-lookups.cjs
 * Run self-tests:   node scripts/check-claims-only-user-lookups.cjs --self-test
 * Exits 0 when no violations are found; exits 1 otherwise.
 */

const { readdirSync, readFileSync, statSync } = require("fs");
const { join, relative } = require("path");

const SERVER_DIR = join(process.cwd(), "server");

/** Files where a bare claims.sub read is legitimate. */
const ALLOWLIST = new Set([
  // The shared helper itself implements the fallback.
  "server/utils/auth.ts",
  // OIDC handshake: operates on raw token claims (not a session user object),
  // where `sub` is the only possible id.
  "server/replit_integrations/auth/replitAuth.ts",
]);

// Raw-text detector (pre-normalization) — used only to decide whether a line
// is worth normalizing. Covers dot, optional-dot, bracket, optional-bracket.
const RAW_CLAIMS_READ =
  /claims\s*(\?\.\s*)?(sub\b|\[\s*["']sub["']\s*\])|claims\s*\.\s*sub\b/;

/**
 * Normalizes a statement so receiver comparison is textual:
 *  - strips `as <Type>` casts, parens, whitespace
 *  - `?.` → `.`, `?.[` → `[`
 *  - `["sub"]` / `['sub']` → `.sub` (same for `id`)
 */
// Parens are replaced with a separator (not removed) so `fn(req.user…)` does
// not merge into a bogus receiver token `fnreq.user`.
const SEP = "~";
function normalize(stmt) {
  return stmt
    .replace(/\bas\s+[A-Za-z_$][\w.$<>]*/g, "") // strip TS casts
    .replace(/[()]/g, SEP)
    .replace(/\s+/g, SEP) // separator, not deletion: `return req.user` must not merge into one token
    .replace(/\?\./g, ".")
    .replace(/\.\[/g, "[")
    .replace(/\[["'](sub|id)["']\]/g, ".$1");
}

/**
 * Given a normalized statement, returns true when every claims-sub read has a
 * same-receiver `.id` fallback (in either order), false otherwise.
 */
function statementIsSafe(normStmt) {
  const S = "[" + SEP + "]*"; // optional separators (from stripped parens)
  const claimsRe = new RegExp(
    "([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)" + S + "\\.claims\\.sub\\b",
    "g",
  );
  let m;
  while ((m = claimsRe.exec(normStmt)) !== null) {
    const receiver = m[1]; // e.g. "req.user" or "user"
    const esc = receiver.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // fallback after the claims read: claims.sub ?? … receiver.id (or ||).
    // Casts like `(req as any).user` truncate the captured receiver to its
    // trailing chain (e.g. `user`), so allow intervening cast/paren tokens —
    // but the `.id` read must still be on the same (word-anchored) receiver.
    const after = new RegExp(
      esc + S + "\\.claims\\.sub" + S + "(\\?\\?|\\|\\|)[^;]*?\\b" + esc + S + "\\.id\\b",
    );
    // reverse order: receiver.id ?? / || … receiver.claims.sub
    const before = new RegExp(
      "\\b" + esc + S + "\\.id" + S + "(\\?\\?|\\|\\|)[^;]*?\\b" + esc + S + "\\.claims\\.sub",
    );
    if (!after.test(normStmt) && !before.test(normStmt)) return false;
  }
  return true;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|cjs|mjs)$/.test(entry) && !/\.test\./.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
    return "";
  }
  // Strip trailing line comments (rough, but adequate for this check).
  return line.replace(/\/\/.*$/, "");
}

/** Checks one claims read at line i (0-based); returns true when safe. */
function lineIsSafe(lines, i) {
  // The fallback may continue on following lines (wrapped expressions) —
  // join up to 2 continuation lines before testing.
  const joined = [lines[i], lines[i + 1] ?? "", lines[i + 2] ?? ""]
    .map(stripComments)
    .join(" ");
  const norm = normalize(joined);
  // Isolate the statement containing the claims read.
  const idx = norm.search(/\.claims\.sub\b/);
  if (idx === -1) return true; // normalization removed it (e.g. comment)
  const stmtStart = norm.lastIndexOf(";", idx) + 1;
  const stmtEndRaw = norm.indexOf(";", idx);
  const stmt = norm.slice(stmtStart, stmtEndRaw === -1 ? undefined : stmtEndRaw);
  return statementIsSafe(stmt);
}

function main() {
  const files = walk(SERVER_DIR);
  const violations = [];

  for (const file of files) {
    const rel = relative(process.cwd(), file).replace(/\\/g, "/");
    if (ALLOWLIST.has(rel)) continue;

    const lines = readFileSync(file, "utf-8").split("\n");
    lines.forEach((raw, i) => {
      const code = stripComments(raw);
      if (!RAW_CLAIMS_READ.test(code)) return;
      if (lineIsSafe(lines, i)) return;
      violations.push({ file: rel, line: i + 1, text: raw.trim() });
    });
  }

  if (violations.length === 0) {
    console.log(
      `[check-claims-only-user-lookups] OK — scanned ${files.length} files, no claims-only user lookups found.`,
    );
    return;
  }

  console.error(
    `[check-claims-only-user-lookups] FAIL — ${violations.length} claims-only session-user lookup(s) found:\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}\n    ${v.text}\n`);
  }
  console.error(
    "Email-login sessions only carry `claims.sub`; OAuth sessions may only carry `.id`.\n" +
      "Fix: use getUserId()/requireUserId() from server/utils/auth.ts, or add an\n" +
      "explicit same-receiver fallback: `user.claims?.sub ?? user.id`.\n" +
      "If a bare claims.sub read is truly legitimate (raw OIDC token claims, not a\n" +
      "session user), add the file to ALLOWLIST in scripts/check-claims-only-user-lookups.cjs\n" +
      "with a justification comment.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Self-tests: node scripts/check-claims-only-user-lookups.cjs --self-test
// ---------------------------------------------------------------------------
function selfTest() {
  const safe = [
    // canonical fixed forms
    "const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;",
    "const userId = user.claims?.sub ?? user.id ?? null;",
    "const id = req.user?.claims?.sub || req.user?.id;",
    // reverse order (id first)
    "return (req.user as any).id || (req.user as any).claims?.sub;",
    // bracket access with same-receiver fallback
    'const userId = user.claims?.["sub"] ?? user.id;',
    "const userId = user.claims['sub'] || user.id;",
    // comment-only mention
    "// reads claims.sub for email sessions",
  ];
  const unsafe = [
    // plain dot / optional dot
    "const userId = req.user.claims.sub;",
    "const userId = (req.user as any)?.claims?.sub;",
    // bracket + optional bracket
    'const userId = req.user?.claims?.["sub"];',
    "const userId = req.user.claims['sub'] ?? null;",
    // ?? null is not an id fallback
    "const userId = (req.user as any)?.claims?.sub ?? null;",
    // unrelated receiver's id must NOT count as a fallback
    "const userId = req.user?.claims?.sub ?? other.id;",
    "const userId = req.user?.claims?.sub ?? trip.id ?? null;",
  ];
  const unsafeMultiline = [
    ["const userId =", "  (req.user as any)?.claims?.sub ??", "  session.id;"],
  ];
  const safeMultiline = [
    ["const userId =", "  (req.user as any)?.claims?.sub ??", "  (req.user as any)?.id;"],
  ];

  let failures = 0;
  const check = (lines, expectSafe, label) => {
    // Simulate the real scan: flag if ANY line with a claims read is unsafe.
    let flagged = false;
    lines.forEach((raw, i) => {
      const code = stripComments(raw);
      if (RAW_CLAIMS_READ.test(code) && !lineIsSafe(lines, i)) flagged = true;
    });
    const isSafe = !flagged;
    if (isSafe !== expectSafe) {
      failures++;
      console.error(
        `  SELF-TEST FAIL (${label}): expected ${expectSafe ? "safe" : "violation"} — ${lines.join(" ")}`,
      );
    }
  };

  for (const s of safe) check([s], true, "safe");
  for (const s of unsafe) check([s], false, "unsafe");
  for (const s of safeMultiline) check(s, true, "safe-multiline");
  for (const s of unsafeMultiline) check(s, false, "unsafe-multiline");

  if (failures > 0) {
    console.error(`[check-claims-only-user-lookups] self-test FAILED (${failures})`);
    process.exit(1);
  }
  console.log("[check-claims-only-user-lookups] self-test OK");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  main();
}
