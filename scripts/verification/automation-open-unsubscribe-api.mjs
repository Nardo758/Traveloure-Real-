// Cheap native HTTP checks after the browser worker could not settle.
// Does not substitute for G10 browser proof.
import fs from "node:fs";
import crypto from "node:crypto";
import { loadOwner } from "./automation-open-fixtures.mjs";
const owner = loadOwner(), base = `http://127.0.0.1:${owner.port}`;
const captures = JSON.parse(fs.readFileSync(owner.mailPath, "utf8")), results = [];
const prefs = async account => {
  const response = await fetch(`${base}/api/auth/user`, { headers: { cookie: account.cookie } });
  if (!response.ok) throw new Error("Native QA session unavailable");
  return (await response.json()).preferences;
};
const digest = data => crypto.createHash("sha256").update(JSON.stringify(data ?? null)).digest("hex");
for (const loop of [1, 2]) for (const kind of ["itinerary_nudge_2h", "itinerary_followup_24h", "itinerary_reengagement_5d"]) {
  const actor = owner.accounts[loop][kind], wrong = owner.accounts[loop].wrong;
  const candidates = captures.filter(m => m.loop === loop && m.accountKind === kind);
  const hrefs = candidates.flatMap(m => [...m.html.matchAll(/href=["']([^"']+)["']/g)].map(x => x[1].replaceAll("&amp;", "&")));
  const href = hrefs.find(h => h.includes("unsubscribe"));
  if (!href) { results.push({ loop, kind, status: "OPEN", reason: "No authored unsubscribe link" }); continue; }
  const url = new URL(href);
  if (url.origin !== base) throw new Error("Refuse non-isolated unsubscribe target");
  const beforeOwner = await prefs(actor), beforeWrong = digest(await prefs(wrong));
  const response = await fetch(url, { headers: { cookie: wrong.cookie } });
  await response.text();
  const afterGetOwner = await prefs(actor);
  const confirmed = await fetch(url, { method: "POST", headers: { cookie: wrong.cookie } });
  await confirmed.text();
  const afterOwner = await prefs(actor), afterWrong = digest(await prefs(wrong));
  const repeat = await fetch(url, { method: "POST" }); await repeat.text();
  const key = [...url.searchParams.keys()].find(k => /token|sig/i.test(k));
  let tamperStatus = null;
  if (key) {
    const value = url.searchParams.get(key); url.searchParams.set(key, (value[0] === "a" ? "b" : "a") + value.slice(1));
    const tamper = await fetch(url); tamperStatus = tamper.status; await tamper.text();
  } else {
    const segments = url.pathname.split("/"), value = segments.pop();
    segments.push((value[0] === "a" ? "b" : "a") + value.slice(1));
    url.pathname = segments.join("/");
    const tamper = await fetch(url, { method: "POST" }); tamperStatus = tamper.status; await tamper.text();
  }
  results.push({ loop, kind, scenarioId: crypto.randomUUID(), checkedAt: new Date().toISOString(),
    nativeGetStatus: response.status, nativePostStatus: confirmed.status,
    getDoesNotUnsubscribe: afterGetOwner?.itineraryMarketing?.enabled === beforeOwner?.itineraryMarketing?.enabled,
    enabledBefore: beforeOwner?.itineraryMarketing?.enabled,
    enabledAfter: afterOwner?.itineraryMarketing?.enabled, wrongAccountPreferencesUnchanged: beforeWrong === afterWrong,
    repeatStatus: repeat.status, tamperStatus,
    passed: beforeOwner?.itineraryMarketing?.enabled === true && afterOwner?.itineraryMarketing?.enabled === false &&
      beforeWrong === afterWrong && confirmed.status === 200 && [200, 410].includes(repeat.status) &&
      [400, 403, 404, 410].includes(tamperStatus),
    browserClaimed: false, scope: "Valid bearer unsubscribe changes its target only; not session-bound wrong-person rejection" });
}
fs.writeFileSync("reports/automation-part1-evidence/unsubscribe-api.json", JSON.stringify({ results }, null, 2));
console.log(JSON.stringify({ cases: results.length, passes: results.filter(r => r.passed).length, browserClaimed: false }));
