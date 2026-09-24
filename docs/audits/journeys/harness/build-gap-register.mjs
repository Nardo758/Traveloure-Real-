// Renders the generated half of docs/audits/GAP_REGISTER.md from action-effect.json.
import fs from "node:fs";
const { rows, baseSha } = JSON.parse(fs.readFileSync("docs/audits/action-effect.json", "utf8"));
const header = fs.readFileSync("docs/audits/journeys/harness/gap-register-header.md", "utf8");
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const items = [];
for (const r of rows) for (const g of r.verdict?.gaps || []) items.push({ r, g });
const rank = { P1: 1, P2: 2, P3: 3 };
items.sort((a, b) => rank[a.g.severity] - rank[b.g.severity] || a.g.class.localeCompare(b.g.class) || a.r.id.localeCompare(b.r.id));
const counts = {};
for (const { g } of items) if (g.uiCheck !== "REFUTED") counts[g.severity] = (counts[g.severity] || 0) + 1;
let md = header.replaceAll("{{BASE}}", baseSha).replace("{{TOTAL}}", items.filter(({ g }) => g.uiCheck !== "REFUTED").length)
  .replace("{{ROWS}}", rows.length).replace("{{P1}}", counts.P1 || 0).replace("{{P2}}", counts.P2 || 0).replace("{{P3}}", counts.P3 || 0);
const refuted = items.filter(({ g }) => g.uiCheck === "REFUTED").length;
md += `\n## B. Every gap, by severity (generated from \`action-effect.json\`)\n\n**UI check** (Addendum 2, U2): every P1/P2 gap in a UI class was re-run in the browser with before/after screenshots under \`docs/audits/ui/<row-id>/\`: CONFIRMED, REFUTED (${refuted} — kept in the list, struck through, not counted as open), or BLOCKED (environment; the reason is in the row's \`result.json\`).\n\n| Sev | Class | Row id | Surface | Element | Evidence | UI check | Note |\n|---|---|---|---|---|---|---|---|\n`;
for (const { r, g } of items) {
  const strike = g.uiCheck === "REFUTED" ? "~~" : "";
  const ui = g.uiCheck ? `[${g.uiCheck}](${g.uiEvidence.replace("docs/audits/", "")})` : "";
  md += `| ${g.severity} | ${strike}${g.class}${strike} | \`${esc(r.id)}\` | ${esc(r.route)} | ${esc((r.label?.text || "").slice(0, 50))} | ${r.verdict.evidence === "behavioral" ? `**${esc(r.verdict.evidenceRef)}**` : `static \`${esc(r.trigger?.loc)}\``} | ${ui} | ${strike}${g.rootCause && !String(g.note || "").includes(g.rootCause) ? `[${g.rootCause}] ` : ""}${esc(g.note || "")}${strike}${g.uiObserved ? ` — _U2: ${esc(g.uiObserved.slice(0, 160))}_` : ""} |\n`;
}
fs.writeFileSync("docs/audits/GAP_REGISTER.md", md);
console.log(items.length, counts);
