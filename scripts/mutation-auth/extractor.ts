import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export type RiskCategory = "payments" | "admin" | "user-data" | "other";
export type Boundary = "admin-role" | "session-self" | "resource-owner" | "signature" | "public-or-system" | "unknown";
export type Mutation = {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Literal/declaration spelling before Express-compatible slash normalization. */
  rawPath: string;
  path: string;
  /** The path Express receives after a mount prefix and normalization. */
  effectivePath: string;
  source: string;
  line: number;
  risk: RiskCategory;
  expectedAuth: "required" | "public" | "unknown";
  expectedRoles: string[];
  expectedOwnership: "verified" | "self" | "unknown";
  expectedBoundary: Boundary;
  ownershipApplies: boolean;
  fixtureStatus: "unknown";
  testStatus: "unknown";
  diagnostics: string[];
};
export type Extraction = { mutations: Mutation[]; diagnostics: string[] };

const methods = new Set(["post", "put", "patch", "delete"]);
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx"];
const reExportCache = new Map<string, string | undefined>();
// #1675 payment audit scope. These are deliberately exact METHOD+path overrides:
// payment movement is semantic, so names such as `confirm-completion` are unsafe
// to classify from keywords alone. Admin wins over this list in classify().
const paymentBoundaryOverrides: Record<string, Boundary> = {
  "POST /api/checkout": "session-self",
  "POST /api/bookings/:id/pay-balance": "resource-owner",
  "POST /api/bookings/process-cart": "session-self",
  "POST /api/bookings/confirm-payment": "resource-owner",
  "POST /api/bookings/refund": "resource-owner",
  "POST /api/bookings/:id/confirm-completion": "resource-owner",
  "POST /api/bookings/:id/dispute": "resource-owner",
  "POST /api/me/payment-methods/setup-intent": "session-self",
  "POST /api/me/payment-methods/default": "session-self",
  "DELETE /api/me/payment-methods/:id": "session-self",
  "POST /api/optimization-payments": "resource-owner",
  "POST /api/optimization-payments/confirm": "resource-owner",
  "POST /api/expert-requests/payment-intent": "resource-owner",
  "POST /api/contracts/:id/payment": "resource-owner",
  "POST /api/contracts/:id/milestone": "resource-owner",
  "POST /api/participants/:id/payment": "resource-owner",
  "POST /api/coordination-states/:id/pay": "resource-owner",
  "POST /api/coordination-states/:id/pay/confirm": "resource-owner",
  "POST /api/coordination-states/:id/refund": "resource-owner",
  "POST /api/ready-made/:id/purchase": "session-self",
  "POST /api/ready-made/:id/purchase/confirm": "resource-owner",
  "POST /api/ready-made/purchases/:id/concern": "resource-owner",
  "POST /api/ready-made/purchases/:id/request-revision": "resource-owner",
  "POST /api/wallet/add-credits": "session-self",
  "POST /api/credits/purchase": "session-self",
  "POST /api/stripe/connect/onboard": "session-self",
  "POST /api/payouts/request": "session-self",
  // These two are money-movement mutations covered by the audit policy even
  // though their names do not contain the generic payment keywords.
  "POST /api/expert/:expertId/tip": "resource-owner",
  "PUT /api/provider/services/:id/surcharge-tiers": "resource-owner",
  "POST /api/admin/payouts": "admin-role",
  "PATCH /api/admin/payouts/:id": "admin-role",
  "POST /api/admin/ready-made/disputes/:purchaseId/refund": "admin-role",
  "POST /api/webhooks/stripe": "signature",
  "POST /api/bookings/webhooks/stripe": "signature",
};
// Guest trip creation is intentionally public: the production handler mints a
// share token for the new record. It must not inherit the generic trip-owner
// classification used by existing-trip mutations.
const publicSystemOverrides = new Set(["POST /api/trips"]);

function textPath(node: ts.Expression): string | undefined {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}
function join(base: string, child: string): string {
  const result = `${base || ""}/${child || ""}`.replace(/\/+/g, "/");
  return (result === "/" ? result : result.replace(/\/$/, "")) || "/";
}
function sourcePath(root: string, file: string) {
  return path.relative(root, file).split(path.sep).join("/");
}
function resolveImport(from: string, specifier: string): string | undefined {
  if (specifier.startsWith("@shared/")) {
    return resolveImport(path.join(process.cwd(), "server", "_resolver.ts"), `../shared/${specifier.slice("@shared/".length)}`);
  }
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return undefined;
  const stem = path.resolve(path.dirname(from), specifier);
  for (const candidate of [stem, ...sourceExtensions.map((ext) => stem + ext), ...sourceExtensions.map((ext) => path.join(stem, `index${ext}`))]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}
function exportedTarget(file: string, name: string, visited = new Set<string>()): string | undefined {
  const key = `${file}\0${name}`;
  if (reExportCache.has(key)) return reExportCache.get(key);
  if (visited.has(key)) return undefined;
  visited.add(key);
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  let result: string | undefined;
  sf.forEachChild((node) => {
    if (result || !ts.isExportDeclaration(node) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return;
    const target = resolveImport(file, node.moduleSpecifier.text);
    if (!target) return;
    if (!node.exportClause) { result = exportedTarget(target, name, visited) || target; return; }
    if (ts.isNamedExports(node.exportClause) && node.exportClause.elements.some((el) => el.name.text === name)) {
      result = exportedTarget(target, name, visited) || target;
    }
  });
  reExportCache.set(key, result);
  return result;
}
function propertyChain(node: ts.Expression): string[] | undefined {
  const parts: string[] = [];
  let cursor: ts.Expression = node;
  while (ts.isPropertyAccessExpression(cursor)) { parts.unshift(cursor.name.text); cursor = cursor.expression; }
  if (!ts.isIdentifier(cursor)) return undefined;
  parts.unshift(cursor.text);
  return parts;
}
function objectProperty(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && property.name.getText().replace(/['"]/g, "") === name) return property.initializer;
  }
}
/** Resolve object-literal exported constants such as shared/routes.ts's api.trips.create.path. */
function resolveDeclaredPath(file: string, chain: string[]): string | undefined {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  let expression: ts.Expression | undefined;
  sf.forEachChild((node) => {
    if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === chain[0]) expression = declaration.initializer;
    }
  });
  for (const part of chain.slice(1)) {
    if (!expression || !ts.isObjectLiteralExpression(expression)) return undefined;
    expression = objectProperty(expression, part);
  }
  return expression ? textPath(expression) : undefined;
}
function classify(method: string, route: string, handler: string): RiskCategory {
  if (/\/api\/(?:admin|ea)(?:\/|$)/.test(route) || /\brequireAdmin\b/.test(handler)) return "admin";
  // Payment classification is a whitelist. Generic keyword matching caused
  // state-only checkout callbacks and identity webhooks to be over-classified.
  if (paymentBoundaryOverrides[`${method} ${route}`]) return "payments";
  if (/(\/api\/(?:me|trips|bookings|cart|conversations|messages|reviews|contracts|participants|provider|expert|traveler|identity|profile|notifications|saved-items)(?:\/|$)|\/(?:profile|account|user|preferences|privacy)(?:\/|$))/i.test(route)) return "user-data";
  return "other";
}
function expectations(method: string, route: string, handler: string): Pick<Mutation, "expectedAuth" | "expectedRoles" | "expectedOwnership" | "expectedBoundary" | "ownershipApplies"> {
  const admin = /\/api\/(?:admin|ea)(?:\/|$)/.test(route) || /\brequireAdmin\b/.test(handler);
  const auditedBoundary = paymentBoundaryOverrides[`${method} ${route}`];
  if (auditedBoundary) {
    return {
      expectedAuth: auditedBoundary === "signature" ? "unknown" : "required",
      expectedRoles: auditedBoundary === "admin-role" ? ["admin"] : [],
      expectedOwnership: auditedBoundary === "resource-owner" ? "verified" : auditedBoundary === "session-self" ? "self" : "unknown",
      expectedBoundary: auditedBoundary,
      ownershipApplies: auditedBoundary === "resource-owner",
    };
  }
  if (publicSystemOverrides.has(`${method} ${route}`)) {
    return {
      expectedAuth: "public",
      expectedRoles: [],
      expectedOwnership: "unknown",
      expectedBoundary: "public-or-system",
      ownershipApplies: false,
    };
  }
  const signature = /\b(signature|webhook|stripe-signature|verifySignature)\b/i.test(handler) || /\/webhooks?(?:\/|$)/i.test(route);
  const auth = admin || /\b(requireAuth|isAuthenticated|requireUser|isAdmin|isExpert|isProvider|isEarner|getUserId)\b/.test(handler);
  const roles = admin || /\brequireAdmin\b/.test(handler) ? ["admin"] : /\bisExpert\b/.test(handler) ? ["expert"] : /\bisProvider\b/.test(handler) ? ["provider"] : [];
  const ownershipApplies = /\/(?:trips|bookings|cart|conversations|messages|reviews|contracts|participants|provider|expert|traveler|saved-items)(?:\/|$)/i.test(route);
  const ownership = /\b(owner|ownership|owns|belongsTo|userId\s*[!=]==?|getTripRole)\b/i.test(handler)
    ? "verified" : /\/api\/me(?:\/|$)/.test(route) ? "self" : "unknown";
  const expectedBoundary: Boundary = signature ? "signature" : admin ? "admin-role" :
    ownership === "verified" ? "resource-owner" : ownership === "self" ? "session-self" :
    auth ? "session-self" : "public-or-system";
  return { expectedAuth: auth ? "required" : "unknown", expectedRoles: roles, expectedOwnership: ownership, expectedBoundary, ownershipApplies };
}

/**
 * Statically follows imports reachable through `app.use`/`router.use` and collects
 * mutation registrations.  It deliberately never executes application code.
 */
export function extractMountedMutations(entryFile: string, root = process.cwd()): Extraction {
  const entry = path.resolve(entryFile);
  const seen = new Set<string>();
  const mutations: Mutation[] = [];
  const diagnostics: string[] = [];

  const visit = (file: string, base: string, reason: string) => {
    const key = `${file}\0${base}`;
    if (seen.has(key)) return;
    seen.add(key);
    let content: string;
    try { content = fs.readFileSync(file, "utf8"); } catch { diagnostics.push(`Unable to read ${sourcePath(root, file)} (${reason})`); return; }
    const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const imports = new Map<string, string>();
    sf.forEachChild((node) => {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
      const target = resolveImport(file, node.moduleSpecifier.text);
      if (!target || !node.importClause) return;
      const clause = node.importClause;
      if (clause.name) imports.set(clause.name.text, target);
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) imports.set(bindings.name.text, target);
      if (bindings && ts.isNamedImports(bindings)) bindings.elements.forEach((el) => {
        const isBarrel = /^index\.[jt]sx?$/.test(path.basename(target));
        imports.set(el.name.text, (isBarrel && exportedTarget(target, el.propertyName?.text || el.name.text)) || target);
      });
    });
    const walk = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const property = node.expression.name.text;
        const args = node.arguments;
        const chain = args.length ? propertyChain(args[0]) : undefined;
        const local = args.length ? (textPath(args[0]) || (chain && imports.get(chain[0]) ? resolveDeclaredPath(imports.get(chain[0])!, chain) : undefined)) : undefined;
        if (methods.has(property) && args.length && local) {
          const fullPath = join(base, local);
          const start = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          const handler = args.slice(1).map((a) => a.getText(sf)).join(" ");
          mutations.push({
            method: property.toUpperCase() as Mutation["method"], rawPath: local, path: fullPath, effectivePath: fullPath,
            source: sourcePath(root, file), line: start.line + 1, risk: classify(property.toUpperCase(), fullPath, handler),
            ...expectations(property.toUpperCase(), fullPath, handler), fixtureStatus: "unknown", testStatus: "unknown", diagnostics: [],
          });
        }
        if (property === "use" && args.length) {
          const prefix = textPath(args[0]);
          const targetNode = prefix ? args[1] : args[0];
          if (!targetNode || !ts.isIdentifier(targetNode)) {
            if (prefix && targetNode) diagnostics.push(`Unresolved mounted router at ${sourcePath(root, file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`);
          } else {
            const target = imports.get(targetNode.text);
            if (target) visit(target, join(base, prefix || ""), `${sourcePath(root, file)}:${targetNode.text}`);
            // Calls such as registerChatRoutes(app) are handled below; middleware is not a router.
          }
        }
      }
      // Registration helpers imported into routes.ts conventionally receive app and
      // declare their routes in their own module.
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^(?:register[A-Z].*Routes|setupEmailAuth)$/.test(node.expression.text)) {
        const target = imports.get(node.expression.text);
        if (target) visit(target, base, `${sourcePath(root, file)}:${node.expression.text}`);
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);
  };
  visit(entry, "", "entry");
  const unique = new Map<string, Mutation>();
  for (const mutation of mutations) {
    const key = `${mutation.method} ${mutation.path} ${mutation.source}:${mutation.line}`;
    unique.set(key, mutation);
  }
  return {
    mutations: [...unique.values()].sort((a, b) =>
      a.path.localeCompare(b.path) || a.method.localeCompare(b.method) || a.source.localeCompare(b.source) || a.line - b.line),
    diagnostics: [...new Set(diagnostics)].sort(),
  };
}