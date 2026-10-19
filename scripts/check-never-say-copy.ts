/**
 * check-never-say-copy — SH-1 item 1 (ledger `2026-10-19-sh1-banned-copy`): traveler-facing copy never carries a
 * phrase on the SITE never-say list (`SITE_NEVER_SAY`, shared/banned-copy.ts — the third export, read here and
 * nowhere else).
 *
 * WHAT IT READS
 *   · seed copy: server/data/*.json (string VALUES, never keys), server/seeds/**, server/seed-*.ts
 *   · UI and i18n strings: client/src/** (.ts/.tsx) and its locale JSON files
 *   · email templates: server/services/*email*.ts
 * In code it reads ONLY string literals, template-string pieces and JSX text — never identifiers (`clientSecret`,
 * `isVerified`), import paths, type-level literals, object keys, comparison operands, `case` labels, or the values of
 * `data-testid`, `className`, `key`, `id` and `href` attributes, nor log lines (console.* / logger.*) and `sql`
 * tagged templates. A literal that is a single lower-case token with no space (`"verified"`, `"hidden-gems"`) is a
 * status value or a key, not copy, and is skipped. In JSON, keys starting with "_" hold metadata and are skipped.
 *
 * EXCEPTIONS (ruled): "licensed" on the legal pages (LEGAL_PAGES) and in operator licence fields (an enclosing
 * property or attribute whose name contains "licen"); two gems whose proper names carry "Secret" (GEM_EXEMPTIONS, by
 * gem id, each with its source URL). The banned-copy module and its tests are never scanned.
 *
 * RATCHET: `scripts/never-say-baseline.json` records, per file and phrase, the hits that remain (admin and provider
 * tools, to shrink later). A count above the baseline, or a hit in a file/phrase the baseline does not carry, fails.
 * The baseline only shrinks: `--update-baseline` refuses to raise any count. `--self-test` runs the committed fixtures.
 *
 * CANNOT DETECT: copy assembled at runtime from parts that are each clean, copy in a database row no seed writes, and
 * copy outside the paths above (server route strings other than email templates, share images). It reads the source,
 * not the rendered page.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { SITE_NEVER_SAY } from "../shared/banned-copy";

const ROOT = path.resolve(process.cwd());
const BASELINE_PATH = path.join(ROOT, "scripts/never-say-baseline.json");
const FIXTURE_DIR = path.join(ROOT, "scripts/fixtures/never-say");

export const LEGAL_PAGES: readonly string[] = [
  "client/src/pages/terms.tsx",
  "client/src/pages/privacy.tsx",
  "client/src/pages/cookie-policy.tsx",
];

/**
 * Gems whose proper names carry "Secret" (ruled exempt by gem id; Research Bot supplies each source URL — an entry with
 * no URL yet is printed on every run so it is not forgotten).
 */
export const GEM_EXEMPTIONS: ReadonlyArray<{ id: string; name: string; words: string; sourceUrl: string | null }> = [
  { id: "b4b43f3f-bf3c-4da5-b61e-ef40d01a8b2d", name: "Wendy's Secret Garden (Sydney)", words: "secret", sourceUrl: null },
  { id: "df40d0b0-5afd-4656-a109-e93f32354db6", name: "Wendy's Secret Garden (Sydney, second row)", words: "secret", sourceUrl: null },
  { id: "1418d8b0-1c17-476e-bc33-9380c2a963aa", name: "Le Jardin Secret (Marrakech)", words: "secret", sourceUrl: null },
];

const NEVER_SCANNED = [/^shared\/banned-copy\.ts$/, /(^|\/)__tests__\//, /\.test\.tsx?$/, /^scripts\//];
const SKIP_ATTRIBUTES = new Set(["data-testid", "className", "key", "id", "href", "to", "src", "name", "type", "role", "aria-hidden"]);
const LOWER_TOKEN = /^[a-z0-9_.\-:/#?=&]+$/;

export interface Hit {
  file: string;
  line: number;
  words: string;
  text: string;
}

function rel(abs: string): string {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

function hitsIn(text: string): string[] {
  return SITE_NEVER_SAY.filter((e) => e.re.test(text)).map((e) => e.words);
}

function nameOf(node: ts.Node | undefined): string {
  if (!node) return "";
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isPrivateIdentifier(node)) return node.text;
  return "";
}

/** The name of the nearest enclosing property, variable or JSX attribute — used for the licence-field exception. */
function enclosingFieldName(node: ts.Node): string {
  let cur: ts.Node | undefined = node.parent;
  for (let depth = 0; cur && depth < 4; depth++, cur = cur.parent) {
    if (ts.isPropertyAssignment(cur) || ts.isVariableDeclaration(cur) || ts.isPropertyDeclaration(cur)) return nameOf(cur.name);
    if (ts.isJsxAttribute(cur)) return nameOf(cur.name as ts.Node);
  }
  return "";
}

function skippedLiteral(node: ts.Node): boolean {
  const p = node.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isLiteralTypeNode(p)) return true;
  if (ts.isImportTypeNode(p.parent ?? p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isEnumMember(p)) && p.name === node) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isCaseClause(p)) return true;
  if (ts.isBinaryExpression(p)) {
    const k = p.operatorToken.kind;
    if (k === ts.SyntaxKind.EqualsEqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsEqualsToken || k === ts.SyntaxKind.EqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsToken) return true;
  }
  if (ts.isJsxAttribute(p) && SKIP_ATTRIBUTES.has(nameOf(p.name as ts.Node))) return true;
  // Log lines and SQL are not copy: an argument of console.* / logger.* / log(), or any piece of a `sql` tagged template.
  for (let cur: ts.Node | undefined = p, depth = 0; cur && depth < 6; cur = cur.parent, depth++) {
    if (ts.isTaggedTemplateExpression(cur) && /(^|\.)sql$/.test(cur.tag.getText())) return true;
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression.getText();
      if (/^(console|logger|log)\b|\.(log|info|warn|error|debug)$/.test(callee)) return true;
      break;
    }
  }
  if (ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent) && SKIP_ATTRIBUTES.has(nameOf(p.parent.name as ts.Node))) return true;
  return false;
}

export function scanCode(file: string, source: string): Hit[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Hit[] = [];
  const isLegal = LEGAL_PAGES.includes(file);
  const visit = (node: ts.Node) => {
    let text: string | null = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
    else if (ts.isJsxText(node)) text = node.text;
    if (text !== null && text.trim() && !skippedLiteral(node) && !(!ts.isJsxText(node) && LOWER_TOKEN.test(text.trim()))) {
      for (const words of hitsIn(text)) {
        if (words === "licensed" && (isLegal || /licen/i.test(enclosingFieldName(node)))) continue;
        out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, words, text: text.trim().slice(0, 120) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function scanJson(file: string, source: string): Hit[] {
  const out: Hit[] = [];
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    return out;
  }
  const exemptIds = new Map(GEM_EXEMPTIONS.map((g) => [g.id, g]));
  const walk = (v: unknown, exemptWords: string | null) => {
    if (typeof v === "string") {
      if (!v.trim() || LOWER_TOKEN.test(v.trim())) return;
      for (const words of hitsIn(v)) {
        if (exemptWords === words) continue;
        out.push({ file, line: 0, words, text: v.slice(0, 120) });
      }
      return;
    }
    if (Array.isArray(v)) return v.forEach((x) => walk(x, exemptWords));
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      const ex = typeof obj.id === "string" ? exemptIds.get(obj.id) : undefined;
      // Keys starting with "_" hold metadata (attribution, notes), not copy.
      for (const [k, val] of Object.entries(obj)) if (!k.startsWith("_")) walk(val, ex ? ex.words : exemptWords);
    }
  };
  walk(data, null);
  return out;
}

function listFiles(dir: string, accept: (f: string) => boolean): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  const stack = [abs];
  while (stack.length) {
    const d = stack.pop()!;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules") continue;
        stack.push(p);
      } else if (accept(rel(p))) out.push(rel(p));
    }
  }
  return out.sort();
}

export function scopeFiles(): string[] {
  const files = new Set<string>([
    ...listFiles("server/data", (f) => /^server\/data\/[^/]+\.json$/.test(f)),
    ...listFiles("server/seeds", (f) => /\.(ts|json)$/.test(f)),
    ...listFiles("server", (f) => /^server\/seed-[^/]+\.ts$/.test(f)),
    ...listFiles("client/src", (f) => /\.(ts|tsx|json)$/.test(f)),
    ...listFiles("server/services", (f) => /^server\/services\/[^/]*email[^/]*\.ts$/.test(f)),
  ]);
  return [...files].filter((f) => !NEVER_SCANNED.some((re) => re.test(f))).sort();
}

export function scanFile(file: string, source: string): Hit[] {
  return file.endsWith(".json") ? scanJson(file, source) : scanCode(file, source);
}

type Counts = Record<string, Record<string, number>>;

export function countHits(hits: readonly Hit[]): Counts {
  const c: Counts = {};
  for (const h of hits) {
    c[h.file] ??= {};
    c[h.file][h.words] = (c[h.file][h.words] ?? 0) + 1;
  }
  return c;
}

/** Hits above the baseline: a (file, phrase) pair the baseline lacks, or a count above it. */
export function overBaseline(current: Counts, baseline: Counts): Array<{ file: string; words: string; now: number; allowed: number }> {
  const out: Array<{ file: string; words: string; now: number; allowed: number }> = [];
  for (const [file, byWord] of Object.entries(current)) {
    for (const [words, now] of Object.entries(byWord)) {
      const allowed = baseline[file]?.[words] ?? 0;
      if (now > allowed) out.push({ file, words, now, allowed });
    }
  }
  return out;
}

function selfTest(): number {
  const fx = (name: string) => fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
  const failures: string[] = [];
  const expect = (label: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  };
  const flagged = scanCode("client/src/fixture.tsx", fx("flagged.tsx.txt")).map((h) => h.words).sort();
  expect("literals and JSX text are flagged", flagged, ["geisha", "hidden gem(s)", "maiko", "secret", "trending", "verified"].sort());
  expect("identifiers, imports, testids, classNames, keys, comparisons and status tokens are not", scanCode("client/src/fixture.tsx", fx("clean.tsx.txt")), []);
  expect("licensed on a legal page passes", scanCode("client/src/pages/terms.tsx", 'const t = "Licensed under the laws of Japan";'), []);
  expect("licensed in an operator licence field passes", scanCode("client/src/x.tsx", 'const o = { licenceNote: "A licensed operator" };'), []);
  expect("licensed elsewhere fails", scanCode("client/src/x.tsx", 'const o = { note: "A licensed operator" };').map((h) => h.words), ["licensed"]);
  expect("JSON values are read, keys are not", scanJson("server/data/x.json", fx("seed.json.txt")).map((h) => h.words).sort(), ["geisha", "geisha sightings", "secret"].sort());
  expect(
    "an exempt gem id passes for its phrase only",
    scanJson("server/data/x.json", JSON.stringify([{ id: GEM_EXEMPTIONS[0].id, place_name: "Wendy's Secret Garden", description: "A verified spot" }])).map((h) => h.words),
    ["verified"],
  );
  expect("the banned-copy module and tests are never in scope", scopeFiles().filter((f) => /banned-copy|__tests__/.test(f)), []);
  expect(
    "over-baseline finds a new phrase and a higher count",
    overBaseline({ a: { secret: 2, trending: 1 } }, { a: { secret: 1 } }).map((o) => `${o.words}:${o.now}/${o.allowed}`),
    ["secret:2/1", "trending:1/0"],
  );
  if (failures.length) {
    console.error(`check-never-say-copy --self-test FAILED:\n  ${failures.join("\n  ")}`);
    return 1;
  }
  console.log("check-never-say-copy --self-test: OK (9 fixtures)");
  return 0;
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();
  const hits = scopeFiles().flatMap((f) => scanFile(f, fs.readFileSync(path.join(ROOT, f), "utf8")));
  const current = countHits(hits);
  const baseline: Counts = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) : {};
  for (const g of GEM_EXEMPTIONS.filter((x) => !x.sourceUrl)) console.log(`[check-never-say-copy] exempt gem "${g.name}" (${g.id}) still has no source URL recorded`);
  if (args.includes("--update-baseline")) {
    const raised = overBaseline(current, baseline).filter((o) => o.allowed > 0 || Object.keys(baseline).length > 0);
    if (Object.keys(baseline).length > 0 && raised.length) {
      console.error("check-never-say-copy: the baseline only shrinks — these would raise it:");
      for (const o of raised) console.error(`  ${o.file} "${o.words}": ${o.allowed} → ${o.now}`);
      return 1;
    }
    const sorted: Counts = {};
    for (const f of Object.keys(current).sort()) {
      sorted[f] = {};
      for (const w of Object.keys(current[f]).sort()) sorted[f][w] = current[f][w];
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + "\n");
    console.log(`check-never-say-copy: baseline written (${hits.length} hit(s) in ${Object.keys(current).length} file(s))`);
    return 0;
  }
  const over = overBaseline(current, baseline);
  const shrinkable = Object.entries(baseline).flatMap(([file, byWord]) =>
    Object.entries(byWord).filter(([w, n]) => (current[file]?.[w] ?? 0) < n).map(([w, n]) => `${file} "${w}" ${n} → ${current[file]?.[w] ?? 0}`),
  );
  if (shrinkable.length) console.log(`check-never-say-copy: ${shrinkable.length} baseline entr${shrinkable.length === 1 ? "y" : "ies"} can shrink — run with --update-baseline:\n  ${shrinkable.join("\n  ")}`);
  if (over.length) {
    console.error("check-never-say-copy FAILED — never-say copy above the baseline:");
    for (const o of over) {
      console.error(`  ${o.file} "${o.words}": ${o.now} (allowed ${o.allowed})`);
      for (const h of hits.filter((x) => x.file === o.file && x.words === o.words)) console.error(`    ${h.line ? `:${h.line} ` : ""}${h.text}`);
    }
    return 1;
  }
  const total = Object.values(baseline).reduce((n, byWord) => n + Object.values(byWord).reduce((a, b) => a + b, 0), 0);
  console.log(`check-never-say-copy: OK — ${hits.length} hit(s), all within the baseline (${total} recorded; the baseline only shrinks)`);
  return 0;
}

if (/check-never-say-copy\.ts$/.test(process.argv[1] ?? "")) process.exit(main());
