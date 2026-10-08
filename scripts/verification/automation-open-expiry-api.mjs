// Actual expiry time only. Native API proof is not browser proof.
import fs from "node:fs";
import { loadOwner, saveOwner } from "./automation-open-fixtures.mjs";
const owner = loadOwner(), base = `http://127.0.0.1:${owner.port}`;
const messages = JSON.parse(fs.readFileSync(owner.mailPath, "utf8"));
for (const clock of owner.clocks.filter(c => ["verification_expiry", "reset_expiry"].includes(c.kind))) {
  if (Date.now() < Date.parse(clock.dueAt) || clock.apiExpiredRejected === true) continue;
  const path = clock.kind === "reset_expiry" ? "/reset-password" : "/verify-email";
  const href = messages.filter(m => m.accountKind === "clock").flatMap(m =>
    [...m.html.matchAll(/href=["']([^"']+)["']/g)].map(x => x[1].replaceAll("&amp;", "&")))
    .find(h => { const u = new URL(h); return u.origin === base && u.pathname === path && u.searchParams.has("token"); });
  if (!href) throw new Error("Actual issued clock token unavailable");
  const url = new URL(href);
  const response = await fetch(`${base}/api/auth/${clock.kind === "reset_expiry" ? "reset-password" : "verify-email"}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: url.searchParams.get("token"), newPassword: owner.accounts.clock.clock.password }) });
  const result = await response.json();
  clock.checkedAt = new Date().toISOString();
  clock.apiExpiredStatus = response.status;
  clock.apiExpiredRejected = response.status === 400 && /expired|invalid/i.test(String(result.error ?? result.message ?? ""));
  clock.status = clock.apiExpiredRejected ? "WAITING_BROWSER" : "OPEN";
  clock.scope = "Native expired-token API observed after actual deadline; browser still unverified";
}
saveOwner(owner);
fs.writeFileSync("reports/automation-part1-evidence/real-clock-check.json",
  JSON.stringify({ checkedAt: new Date().toISOString(), schema: owner.schema, rows: owner.clocks }, null, 2));
console.log(JSON.stringify({ actualClockOnly: true, expiries: owner.clocks.filter(c => c.kind.endsWith("_expiry"))
  .map(c => ({ kind: c.kind, dueAt: c.dueAt, status: c.status, apiExpiredStatus: c.apiExpiredStatus, apiExpiredRejected: c.apiExpiredRejected })) }));
