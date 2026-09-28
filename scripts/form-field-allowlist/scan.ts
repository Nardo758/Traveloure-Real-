/**
 * Form-field ⊆ route-admission scanner (ledger `2026-09-27-form-fields-admitted`).
 *
 * RULE: every field a client form submits is either ADMITTED by the route it is sent to
 * (named by the route's body schema or read by its handler) or EXPLICITLY REJECTED (the
 * route's schema is `.strict()`, so an unknown key is a 400). A plain `z.object` STRIPS an
 * unknown key without a word — the provider "set" a cancellation tier the row was born
 * without (#1134), a slip pushed an occasion the endpoint was never meant to take
 * (`2026-09-26-occasion-read-only`). This scanner finds that class statically.
 *
 * HOW: the TypeScript checker, never text. A client call's submitted keys are the
 * properties of its body argument's TYPE; a route's admitted keys are the properties of
 * its body schema's `_output` TYPE (so `.pick`/`.omit`/`.extend`/`createInsertSchema` all
 * resolve exactly), plus every `req.body.<key>` / destructured key the handler reads.
 *
 * NEGATIVE SPACE (§18d — green is green-within-these-bounds):
 *   - client calls: only `apiRequest(<METHOD>, <url>, <body>)` with a literal method and a
 *     string/template url. `fetch(...)` bodies, FormData uploads and computed urls are
 *     COUNTED as unchecked, never silently passed.
 *   - a body typed `any`/`unknown` has no knowable keys: unchecked, counted.
 *   - a handler that hands `req.body` wholesale to another function, spreads it, or reads it
 *     in a way this scanner does not model is OPEN: unchecked, counted. The scanner does not
 *     follow the body into called functions.
 *   - a route resolved by more than one registration (shadowing) passes a key admitted by
 *     ANY of them; which registration Express serves is not modelled.
 *   - "strict" is read from the schema's declaration text (`.strict()`), not its type.
 *   - optional-in-type keys the form may never send are still checked: a key the TYPE says a
 *     form can submit is a key it can submit.
 */
import path from "node:path";
import ts from "typescript";
import { extractMountedMutations } from "../mutation-auth/extractor";

export type RouteAdmission = {
  key: string; // "PATCH /api/trips/:id"
  source: string;
  admitted: Set<string>;
  strict: boolean;
  open: string | null; // why the handler's body reads cannot be enumerated
  schemaFound: boolean;
};
export type ClientCall = {
  source: string;
  line: number;
  method: string;
  url: string | null;
  keys: string[] | null;
  why?: string;
};
export type Finding = { call: ClientCall; route: string; missing: string[] };
export type ScanResult = {
  findings: Finding[];
  checked: number;
  unchecked: { call: ClientCall; reason: string }[];
  unmatched: ClientCall[];
  routes: RouteAdmission[];
};

const PARSE_METHODS = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);

export function loadProgram(root: string, rootNames?: string[]): ts.Program {
  if (rootNames) {
    return ts.createProgram(rootNames, {
      strict: true, noEmit: true, skipLibCheck: true, esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.Preserve, baseUrl: root,
      paths: { "@/*": ["./client/src/*"], "@shared/*": ["./shared/*"] }, resolveJsonModule: true,
      allowImportingTsExtensions: true, types: [],
    });
  }
  const cfgPath = path.join(root, "tsconfig.json");
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root);
  return ts.createProgram(parsed.fileNames, { ...parsed.options, incremental: false, tsBuildInfoFile: undefined, noEmit: true });
}

function unwrap(e: ts.Expression): ts.Expression {
  let x = e;
  for (;;) {
    if (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x) || ts.isSatisfiesExpression(x)) x = x.expression;
    else if (ts.isBinaryExpression(x) && (x.operatorToken.kind === ts.SyntaxKind.BarBarToken || x.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) x = x.left;
    else return x;
  }
}

/** Keys of a schema's parsed output, via its `_output` type. null = not a zod object we can read. */
function schemaOutputKeys(checker: ts.TypeChecker, schemaExpr: ts.Expression): Set<string> | null {
  const t = checker.getTypeAtLocation(schemaExpr);
  const out = t.getProperty("_output");
  if (!out) return null;
  const outType = checker.getTypeOfSymbolAtLocation(out, schemaExpr);
  if (outType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return null;
  const keys = new Set<string>();
  const members = outType.isUnion() ? outType.types : [outType];
  for (const m of members) for (const p of checker.getPropertiesOfType(m)) keys.add(p.getName());
  return keys.size ? keys : null;
}

function declarationText(checker: ts.TypeChecker, e: ts.Expression): string {
  let text = e.getText();
  let cur: ts.Expression = e;
  for (let depth = 0; depth < 4; depth++) {
    const base = ts.isPropertyAccessExpression(cur) || ts.isCallExpression(cur) ? leftmost(cur) : cur;
    if (!ts.isIdentifier(base)) break;
    let sym = checker.getSymbolAtLocation(base);
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    const decl = sym?.valueDeclaration;
    if (!decl || !ts.isVariableDeclaration(decl) || !decl.initializer) break;
    text += "\n" + decl.initializer.getText();
    cur = decl.initializer;
  }
  return text;
}
function leftmost(e: ts.Expression): ts.Expression {
  let x = e;
  while (ts.isPropertyAccessExpression(x) || ts.isCallExpression(x)) x = x.expression;
  return x;
}

function analyzeHandler(checker: ts.TypeChecker, fn: ts.FunctionLikeDeclaration, acc: RouteAdmission) {
  const reqParam = fn.parameters[0];
  if (!reqParam || !ts.isIdentifier(reqParam.name) || !fn.body) return;
  const reqName = reqParam.name.text;
  const aliases = new Set<string>();

  const isReqBody = (n: ts.Node): boolean =>
    ts.isPropertyAccessExpression(n) && n.name.text === "body" && ts.isIdentifier(n.expression) && n.expression.text === reqName;

  const classify = (use: ts.Node) => {
    // climb through wrappers that do not change what is read
    let node: ts.Node = use;
    while (node.parent && (ts.isParenthesizedExpression(node.parent) || ts.isAsExpression(node.parent) || ts.isNonNullExpression(node.parent)
      || (ts.isBinaryExpression(node.parent) && node.parent.left === node && (node.parent.operatorToken.kind === ts.SyntaxKind.BarBarToken || node.parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)))) node = node.parent;
    const p = node.parent;
    if (!p) return;
    if (ts.isPropertyAccessExpression(p) && p.expression === node) { acc.admitted.add(p.name.text); return; }
    if (ts.isElementAccessExpression(p) && p.expression === node) {
      if (ts.isStringLiteralLike(p.argumentExpression)) { acc.admitted.add(p.argumentExpression.text); return; }
      acc.open ??= "computed element access on the body"; return;
    }
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.InKeyword && p.right === node && ts.isStringLiteralLike(p.left)) { acc.admitted.add(p.left.text); return; }
    if (ts.isCallExpression(p) && p.arguments.includes(node as ts.Expression) && ts.isPropertyAccessExpression(p.expression) && PARSE_METHODS.has(p.expression.name.text)) {
      const schema = p.expression.expression;
      const keys = schemaOutputKeys(checker, schema);
      if (!keys) { acc.open ??= `body schema \`${schema.getText().slice(0, 60)}\` has no readable output type`; return; }
      acc.schemaFound = true;
      keys.forEach((k) => acc.admitted.add(k));
      if (/\.strict\(\)/.test(declarationText(checker, schema))) acc.strict = true;
      return;
    }
    if (ts.isVariableDeclaration(p) && p.initializer === node) {
      if (ts.isIdentifier(p.name)) { aliases.add(p.name.text); return; }
      if (ts.isObjectBindingPattern(p.name)) {
        for (const el of p.name.elements) {
          if (el.dotDotDotToken) { acc.open ??= "rest element in a body destructure"; continue; }
          const k = el.propertyName ?? el.name;
          if (ts.isIdentifier(k) || ts.isStringLiteralLike(k)) acc.admitted.add(k.text);
          else acc.open ??= "computed key in a body destructure";
        }
        return;
      }
    }
    // `if (!req.body)`, `typeof req.body` etc. read nothing field-wise
    if (ts.isPrefixUnaryExpression(p) || ts.isTypeOfExpression(p) || ts.isIfStatement(p) || (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(p.operatorToken.kind))) return;
    acc.open ??= `body used as \`${p.getText().slice(0, 80).replace(/\s+/g, " ")}\``;
  };

  const walk = (n: ts.Node) => {
    // `req` handed whole to another function: that function may read any body key.
    // Only a callee whose own source reads `.body` counts (getUserId(req) reads the session, not
    // the body). A callee the checker cannot resolve to source is NOT counted — negative space.
    if (ts.isIdentifier(n) && n.text === reqName && n.parent && (ts.isCallExpression(n.parent) || ts.isNewExpression(n.parent))
      && (n.parent.arguments ?? []).includes(n) && calleeReadsBody(checker, n.parent.expression)) acc.open ??= `req passed to \`${n.parent.expression.getText().slice(0, 60)}\``;
    if (isReqBody(n)) classify(n);
    else if (ts.isIdentifier(n) && aliases.has(n.text) && !(ts.isVariableDeclaration(n.parent) && n.parent.name === n)
      && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) classify(n);
    ts.forEachChild(n, walk);
  };
  // aliases are discovered in source order, so one pass suffices for `const b = req.body; b.x`
  walk(fn.body);
}

function calleeReadsBody(checker: ts.TypeChecker, callee: ts.Expression): boolean {
  let sym = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(callee) ? callee.name : callee);
  if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
  const d = sym?.valueDeclaration ?? sym?.declarations?.[0];
  if (!d || d.getSourceFile().isDeclarationFile) return false;
  return /\.body\b/.test(d.getText());
}

function findRegistration(sf: ts.SourceFile, line: number, method: string): ts.CallExpression | undefined {
  let found: ts.CallExpression | undefined;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === method.toLowerCase()
      && sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 === line) { found = n; return; }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function resolveFunction(checker: ts.TypeChecker, e: ts.Expression): ts.FunctionLikeDeclaration | undefined {
  const x = unwrap(e);
  if (ts.isArrowFunction(x) || ts.isFunctionExpression(x)) return x;
  if (ts.isIdentifier(x)) {
    let sym = checker.getSymbolAtLocation(x);
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    const d = sym?.valueDeclaration;
    if (d && ts.isFunctionDeclaration(d)) return d;
    if (d && ts.isVariableDeclaration(d) && d.initializer) {
      const i = unwrap(d.initializer);
      if (ts.isArrowFunction(i) || ts.isFunctionExpression(i)) return i;
    }
  }
  return undefined;
}

/** `asyncHandler(async (req, res) => …)` and similar single-function wrappers. */
function resolveHandler(checker: ts.TypeChecker, e: ts.Expression): ts.FunctionLikeDeclaration | undefined {
  const direct = resolveFunction(checker, e);
  if (direct) return direct;
  const x = unwrap(e);
  if (ts.isCallExpression(x)) {
    const fns = x.arguments.map((a) => resolveFunction(checker, a)).filter(Boolean) as ts.FunctionLikeDeclaration[];
    if (fns.length === 1) return fns[0];
  }
  return undefined;
}

/**
 * A handler that never touches `req` and answers only 4xx/5xx refuses every request — so every
 * key a form sends it is refused, not silently dropped (e.g. a 501 "not available yet" rail).
 */
function refusesEverything(fn: ts.FunctionLikeDeclaration): boolean {
  const p = fn.parameters[0];
  const body = fn.body?.getText() ?? "";
  if (p && ts.isIdentifier(p.name) && new RegExp(`\\b${p.name.text}\\b`).test(body)) return false;
  return /\.status\(\s*[45]\d\d\s*\)/.test(body) && !/\.status\(\s*2\d\d\s*\)/.test(body);
}

export function collectRoutes(program: ts.Program, root: string, entry = "server/routes.ts"): RouteAdmission[] {
  const checker = program.getTypeChecker();
  const { mutations } = extractMountedMutations(path.join(root, entry), root);
  const out: RouteAdmission[] = [];
  for (const m of mutations) {
    if (!WRITE_METHODS.has(m.method)) continue;
    const sf = program.getSourceFile(path.join(root, m.source));
    const acc: RouteAdmission = { key: `${m.method} ${m.effectivePath}`, source: `${m.source}:${m.line}`, admitted: new Set(), strict: false, open: null, schemaFound: false };
    const call = sf && findRegistration(sf, m.line, m.method);
    if (!call) { acc.open = "registration not found in the program"; out.push(acc); continue; }
    // Express convention: the LAST argument is the handler; earlier ones are middleware and are
    // not read (a middleware that reads the body is not modelled — negative space).
    const last = call.arguments[call.arguments.length - 1];
    const fn = last && resolveHandler(checker, last);
    if (!fn) { acc.open = `handler \`${last?.getText().slice(0, 40)}\` not resolvable`; out.push(acc); continue; }
    analyzeHandler(checker, fn, acc);
    if (!acc.open && !acc.schemaFound && acc.admitted.size === 0 && refusesEverything(fn)) acc.strict = true;
    out.push(acc);
  }
  return out;
}

function urlPattern(e: ts.Expression): string | null {
  const x = unwrap(e);
  let s: string | null = null;
  if (ts.isStringLiteralLike(x)) s = x.text;
  else if (ts.isTemplateExpression(x)) s = x.head.text + x.templateSpans.map((sp) => "\u0000" + sp.literal.text).join("");
  if (s === null) return null;
  s = s.split("?")[0].split("#")[0];
  return s.startsWith("/") ? s : null;
}

export function collectClientCalls(program: ts.Program, root: string, dirs = ["client/src"]): ClientCall[] {
  const checker = program.getTypeChecker();
  const calls: ClientCall[] = [];
  for (const sf of program.getSourceFiles()) {
    const rel = path.relative(root, sf.fileName).split(path.sep).join("/");
    if (!dirs.some((d) => rel.startsWith(d + "/")) || /__tests__|\.test\.|\.spec\./.test(rel)) continue;
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "apiRequest" && n.arguments.length >= 3) {
        const [mArg, uArg, bArg] = n.arguments;
        const method = ts.isStringLiteralLike(mArg) ? mArg.text.toUpperCase() : null;
        if (method && WRITE_METHODS.has(method)) {
          const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
          const call: ClientCall = { source: rel, line, method, url: urlPattern(uArg), keys: null };
          const t = checker.getTypeAtLocation(bArg);
          if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) call.why = "body typed any/unknown";
          else if (t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) call.keys = [];
          else {
            const members = t.isUnion() ? t.types.filter((m) => !(m.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null))) : [t];
            if (members.some((m) => m.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike))
              || members.some((m) => checker.isArrayType(m) || /^(FormData|Blob|File)$/.test(m.getSymbol()?.getName() ?? ""))) call.why = "body is not a keyed object";
            else if (members.some((m) => checker.getIndexInfosOfType(m).length > 0)) call.why = "body is a record (index signature)";
            else {
              const keys = new Set<string>();
              for (const m of members) for (const p of checker.getPropertiesOfType(m)) keys.add(p.getName());
              call.keys = [...keys].sort();
            }
          }
          calls.push(call);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return calls;
}

function matches(pattern: string, routePath: string): boolean {
  const a = pattern.replace(/\/+$/, "").split("/");
  const b = routePath.replace(/\/+$/, "").split("/");
  if (a.length !== b.length) return false;
  return a.every((seg, i) => {
    const r = b[i];
    if (r.startsWith(":")) return seg.length > 0; // a param takes any one segment, literal or substituted
    if (seg.includes("\u0000")) return false; // a substituted segment cannot equal a literal route segment
    return seg === r;
  });
}

export function scan(program: ts.Program, root: string, opts: { entry?: string; clientDirs?: string[] } = {}): ScanResult {
  const routes = collectRoutes(program, root, opts.entry);
  const calls = collectClientCalls(program, root, opts.clientDirs);
  const res: ScanResult = { findings: [], checked: 0, unchecked: [], unmatched: [], routes };
  for (const call of calls) {
    if (!call.url) { res.unchecked.push({ call, reason: "url not a string/template literal" }); continue; }
    if (!call.keys) { res.unchecked.push({ call, reason: call.why ?? "body keys unknown" }); continue; }
    const hits = routes.filter((r) => r.key.split(" ")[0] === call.method && matches(call.url!, r.key.slice(r.key.indexOf(" ") + 1)));
    // Prefer routes whose literal segments match exactly over param-wildcard matches, as Express would for distinct paths.
    if (!hits.length) { res.unmatched.push(call); continue; }
    const open = hits.find((h) => h.open);
    if (open && hits.every((h) => h.open || h.strict)) { if (hits.some((h) => h.strict)) { res.checked++; continue; } res.unchecked.push({ call, reason: `route ${open.key} (${open.source}) is open: ${open.open}` }); continue; }
    res.checked++;
    if (hits.some((h) => h.strict || h.open)) continue;
    const missing = call.keys.filter((k) => !hits.some((h) => h.admitted.has(k)));
    if (missing.length) res.findings.push({ call, route: hits.map((h) => `${h.key} (${h.source})`).join(" | "), missing });
  }
  return res;
}
