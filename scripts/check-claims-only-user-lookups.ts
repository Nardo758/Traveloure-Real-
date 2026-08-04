/**
 * CI gate: blocks claims-only session-user extraction under server/.
 *
 * Background: email-login sessions carry the user id at `claims.sub`, while
 * Replit OAuth carries `id` (plus claims) and Facebook OAuth carries only `id`.
 * Reading `req.user.claims?.sub` without an `?? ...id` / `|| ...id` fallback
 * silently yields undefined for OAuth users (false 403s). ~120 routes were
 * fixed for this; this script stops the pattern from coming back.
 *
 * Rule: any non-comment line under server/ that reads `claims?.sub`,
 * `claims.sub`, or `claims["sub"]` must EITHER
 *   - also contain an `.id` fallback via `??` or `||` on the same statement, OR
 *   - live in an allowlisted file (the shared helper, or the OIDC handshake
 *     code that operates on raw token claims rather than a session user).
 *
 * Preferred fix: use getUserId()/requireUserId() from server/utils/auth.ts.
 *
 * Run standalone:  npx tsx scripts/check-claims-only-user-lookups.ts
 * Exits 0 when no violations are found; exits 1 otherwise.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const SERVER_DIR = join(process.cwd(), "server");

/** Files where a bare claims.sub read is legitimate. */
const ALLOWLIST = new Set<string>([
  // The shared helper itself implements the fallback.
  "server/utils/auth.ts",
  // OIDC handshake: operates on raw token claims (not a session user object),
  // where `sub` is the only possible id.
  "server/replit_integrations/auth/replitAuth.ts",
]);

const CLAIMS_SUB = /claims\s*(\?\.|\.|\[\s*["']sub["']\s*\])\s*(sub)?/;
// Matches claims?.sub / claims.sub / claims["sub"]
const CLAIMS_SUB_READ = /claims(\?\.|\.)sub\b|claims\s*\[\s*["']sub["']\s*\]/;
// A fallback to an id on the same statement: `?? x.id`, `|| x.id`,
// possibly with optional chaining / casts in between.
const ID_FALLBACK = /(\?\?|\|\|)[^;\n]*\bid\b/;

function walk(dir: string, out: string[] = []): string[] {
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

function stripComments(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
    return "";
  }
  // Strip trailing line comments (rough, but adequate for this check).
  return line.replace(/\/\/.*$/, "");
}

function main(): void {
  const files = walk(SERVER_DIR);
  const violations: { file: string; line: number; text: string }[] = [];

  for (const file of files) {
    const rel = relative(process.cwd(), file).replace(/\\/g, "/");
    if (ALLOWLIST.has(rel)) continue;

    const lines = readFileSync(file, "utf-8").split("\n");
    lines.forEach((raw, i) => {
      const code = stripComments(raw);
      if (!CLAIMS_SUB_READ.test(code)) return;
      // The fallback may continue on the next line (long expressions get
      // wrapped) — join up to 2 continuation lines before testing.
      const joined = [code, lines[i + 1] ?? "", lines[i + 2] ?? ""]
        .map(stripComments)
        .join(" ");
      // Isolate the statement containing the claims read.
      const idx = joined.search(CLAIMS_SUB_READ);
      const stmtStart = joined.lastIndexOf(";", idx) + 1;
      const stmtEnd = joined.indexOf(";", idx);
      const stmt = joined.slice(stmtStart, stmtEnd === -1 ? undefined : stmtEnd);
      // OK if there is an `.id` fallback after the claims read…
      const afterClaims = stmt.slice(stmt.search(CLAIMS_SUB_READ));
      if (ID_FALLBACK.test(afterClaims)) return;
      // …or the reverse order: `.id || / ?? claims.sub` (id read comes first).
      if (/\bid\b[^;\n]*(\?\?|\|\|)[^;\n]*claims/.test(stmt)) return;
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
      "explicit fallback: `user.claims?.sub ?? user.id`.\n" +
      "If a bare claims.sub read is truly legitimate (raw OIDC token claims, not a\n" +
      "session user), add the file to ALLOWLIST in scripts/check-claims-only-user-lookups.ts\n" +
      "with a justification comment.",
  );
  process.exit(1);
}

main();
