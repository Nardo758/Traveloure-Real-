/**
 * S4 — client `process.env` access (ledger `2026-10-21-admin-qa-alerting`).
 *
 * The previous check listed every file under `client/` that mentioned
 * `process.env` except `App.tsx`. That flagged `__tests__` fixtures (TZ and
 * test-only env names) and the QA checklist's own prose, which quotes the
 * grep. Those are not secrets.
 *
 * This still fails any other identifier, including `DATABASE_URL` and dynamic
 * `process.env[expr]`. `NODE_ENV` stays allowed. `__tests__` directories are
 * fixtures. A bare `process.env` with no property (the checklist sentence) is
 * not an access. The report is file names only — never a value, never the
 * identifier.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const SAFE_ENV_IDENTS = new Set(["NODE_ENV"]);

export function isClientSecretsScanExcluded(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, "/");
  return norm.includes("/__tests__/");
}

/** Identifiers that are not the allowed NODE_ENV access. "(dynamic)" is not a value. */
export function unsafeClientEnvIdents(text: string): string[] {
  const found = new Set<string>();
  const re = /process\.env\??(?:\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)|\s*\[([\s\S]*?)\])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match[1]) {
      if (!SAFE_ENV_IDENTS.has(match[1])) found.add(match[1]);
      continue;
    }
    const inside = (match[2] ?? "").trim();
    const literal = inside.match(/^(['"])([A-Za-z_$][A-Za-z0-9_$]*)\1$/);
    if (!literal) {
      found.add("(dynamic)");
      continue;
    }
    if (!SAFE_ENV_IDENTS.has(literal[2])) found.add(literal[2]);
  }
  return [...found];
}

export function clientFileHasSecretsRisk(filePath: string, text: string): boolean {
  if (isClientSecretsScanExcluded(filePath)) return false;
  return unsafeClientEnvIdents(text).length > 0;
}

/** Relative `./client/...` paths that fail S4. Names only. */
export function listClientSecretsRiskFiles(root = "client"): string[] {
  const hits: string[] = [];
  walk(root, hits);
  return hits.sort();
}

function walk(dir: string, hits: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (name === "node_modules" || name === "dist") continue;
    const full = path.join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "__tests__") continue;
      walk(full, hits);
      continue;
    }
    if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
    let text: string;
    try {
      text = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const rel = full.split(path.sep).join("/");
    const display = rel.startsWith("./") ? rel : `./${rel}`;
    if (clientFileHasSecretsRisk(display, text)) hits.push(display);
  }
}
