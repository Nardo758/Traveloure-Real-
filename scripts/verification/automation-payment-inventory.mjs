// Read-only TypeScript AST inventory; no DB/provider operations.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import crypto from "node:crypto";
const financial = /^(bookings|bookingRequests|serviceBookings|expertRequests|paymentIntents|paymentTransactions|paymentMethods|optimizationPayments|tripPassPurchases|tripPasses|tripCredits|creditTransactions|userCredits|walletTransactions|providerEarnings|platformRevenue|expertPayouts|providerPayouts|coordinationBookings|affiliateBookingRequests|readyMadePurchases|bundleBookings|bundleComponents|serviceQuotes|expertPlanProposals)$/i;
const rawFinancial = /booking|payment_intent|payment_transaction|credit|trip_pass|earnings|platform_revenue|payout|expert_request|ready_made_purchase|service_quote|expert_plan_proposal/i;
export function scanSource(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), rows = [], aliases = new Map();
  for (const n of source.statements) if (ts.isImportDeclaration(n) && n.importClause?.namedBindings &&
    ts.isNamedImports(n.importClause.namedBindings)) for (const e of n.importClause.namedBindings.elements)
      aliases.set(e.name.text, e.propertyName?.text ?? e.name.text);
  function owner(n) {
    let p = n, frame = source, label = "module", route = null, transaction = false;
    while (p.parent) {
      p = p.parent;
      if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression)) {
        const method = p.expression.name.text;
        if (method === "transaction") transaction = true;
        if (/^(post|put|patch|delete|get)$/.test(method) && p.arguments[0] && ts.isStringLiteral(p.arguments[0])) {
          route = `${method.toUpperCase()} ${p.arguments[0].text}`;
          if (label === "module") { label = route; frame = p; }
        }
      }
      if ((ts.isMethodDeclaration(p) || ts.isFunctionDeclaration(p)) && label === "module") {
        label = p.name?.getText(source) ?? "anonymous"; frame = p;
      }
    }
    return { label, frame, route, transaction };
  }
  function emit(n, kind, model) {
    const own = owner(n), body = own.frame.getText(source);
    const emails = [...new Set([...body.matchAll(/\b(enqueue\w*Email|send\w*Email|deliverQueuedEmail)\s*\(/g)].map(m => m[1]))];
    const rails = [/stripe|paymentIntent|payment_intent|chargeSaved/i.test(body) ? "Stripe" : "",
      /creditBalance|credit_balance|deductCredits|creditTransaction|\\.credits|creditsUsed/i.test(body) ? "credits" : "",
      /tripPass|trip_pass/i.test(body) ? "Trip Pass" : ""].filter(Boolean);
    const legacyCore = file === "server/services/booking.service.ts" && own.label === "confirmBookingPayment";
    const fields = [...new Set([...n.getText(source).matchAll(/(?:\bSET\b|,)\s*([a-z_]+)\s*=/gi)].map(m => m[1]))];
    rows.push({ file, line: source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1,
      kind, model, writer: own.label, route: own.route, rails: rails.length ? rails : ["UNKNOWN: trace callers"],
      transactionLexicallyPresent: own.transaction, stateFieldsFromRawSql: fields,
      emailBehavior: emails.length ? emails.join(", ") : "No mail call in enclosing writer; downstream/caller trace required",
      retainedLedgerCoverage: legacyCore ? "COVERED: retained sequential/concurrent legacy ledger tests" : "NOT COVERED by the two retained suites",
      retainedConfirmationEmailCoverage: "NOT COVERED",
      retainedTest: legacyCore ? "server/__tests__/booking-confirm-payment-idempotency.test.ts" : null,
      coverageLimit: legacyCore ? "Ledger idempotency only; does not prove traveler confirmation mail" : "Static inventory is not execution proof" });
  }
  function visit(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.text, arg = n.arguments[0]?.getText(source) ?? "", model = aliases.get(arg) ?? arg;
      if (["insert", "update", "delete"].includes(method) && financial.test(model)) emit(n, `database ${method}`, model);
      else if (method === "update" && model === "users") {
        const chain = n.parent?.parent?.getText(source) ?? "";
        if (/credit|balance|tripPass/i.test(chain)) emit(n, "account credit/pass update", "users");
      } else if (/^(create|update|delete|cancel|complete|confirm)\w*Booking$|^(deduct|refund|consume|grant)\w*Credit/i.test(method)) {
        emit(n, "writer wrapper", method);
      } else if (["capture", "cancel", "confirm", "create", "update"].includes(method) &&
        /\b(paymentIntents|refunds|charges|transfers|payouts)$/.test(n.expression.expression.getText(source))) {
        emit(n, `provider ${method}`, n.expression.expression.getText(source));
      }
    }
    if (ts.isTaggedTemplateExpression(n) && /^(sql|drizzleSql)$/.test(n.tag.getText(source))) {
      const query = n.template.getText(source), write = query.match(/\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+([a-z_]+)/i);
      if (write && rawFinancial.test(write[2])) emit(n, `raw SQL ${write[1].toUpperCase()}`, write[2]);
    }
    ts.forEachChild(n, visit);
  }
  visit(source);
  return rows;
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? (/^(__tests__|fixtures|seeds|migrations)$/.test(e.name) ? [] : walk(p)) :
      e.name.endsWith(".ts") && !/\.(test|spec)\./.test(e.name) ? [p] : [];
  });
}
export function inventory() {
  const files = walk("server"), rows = files.flatMap(file => scanSource(file, fs.readFileSync(file, "utf8")));
  return { checkedAt: new Date().toISOString(), filesScanned: files.length,
    sourceDigest: crypto.createHash("sha256").update(files.map(file => fs.readFileSync(file)).join("\n")).digest("hex"),
    completeness: "OPEN: indirect/dynamic SQL, aliases outside named imports and caller-only emails require manual resolution",
    retainedSuites: {
      ledger: "server/__tests__/booking-confirm-payment-idempotency.test.ts",
      alerts: "server/__tests__/booking-alert-outbox.db.test.ts",
      note: "Alert suite invokes enqueueBookingAlertEmail, not a payment-state writer or traveler confirmation" },
    rows };
}
if (process.argv[1]?.endsWith("automation-payment-inventory.mjs")) {
  const result = inventory();
  fs.mkdirSync("reports/automation-part1-evidence", { recursive: true });
  fs.writeFileSync("reports/automation-part1-evidence/payment-writers.json", JSON.stringify(result, null, 2));
  const lines = ["# Payment-writer coverage — read-only", "", `Checked ${result.checkedAt}.`,
    `Scanned ${result.filesScanned} source files; ${result.rows.length} candidate financial write/call sites.`,
    "**OPEN, not an exhaustiveness certification.** " + result.completeness, "",
    "COVERED below refers only to retained ledger assertions. Neither retained suite proves confirmation-email duplication for all rails.",
    "Provider-alert retry is not traveler booking confirmation. Static sender presence is not runtime delivery proof.",
    "No payment, refund, capture, production or application change was made by this scanner.", "",
    "| Source | Writer / entry | Model / operation | Rails (source hints) | Current email behavior | Retained ledger test | Confirmation mail |",
    "|---|---|---|---|---|---|---|"];
  for (const r of result.rows) lines.push(`| ${r.file}:${r.line} | ${r.writer}${r.route && r.route !== r.writer ? "; " + r.route : ""} | ${r.model} / ${r.kind} | ${r.rails.join(", ")} | ${r.emailBehavior} | ${r.retainedLedgerCoverage} | ${r.retainedConfirmationEmailCoverage} |`);
  lines.push("", "## Remaining inventory obligations",
    "- Resolve UNKNOWN rails through mounted routes and callers, including credits and Trip Pass entitlement writes.",
    "- Classify dynamic SQL and wrapper implementations; candidate call sites are not distinct end-to-end writer paths.",
    "- Distinguish webhook verification, success-page/core promotion, sweeps, admin and legacy entrypoints.",
    "- Add native-writer DB scenarios where possible. Any required application/payment correction is deferred to a later Part.",
    "- Configuration/cache/seed writes are excluded from this operational list; seeds remain a separate fixture provenance class.");
  fs.writeFileSync("reports/payment-writer-coverage.md", lines.join("\n") + "\n");
  console.log(JSON.stringify({ sites: result.rows.length, files: result.filesScanned, status: "OPEN", runtimeWrites: 0 }));
}
