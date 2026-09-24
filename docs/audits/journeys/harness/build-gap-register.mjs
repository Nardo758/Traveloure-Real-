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
for (const { g } of items) counts[g.severity] = (counts[g.severity] || 0) + 1;
let md = header.replace("{{BASE}}", baseSha).replace("{{TOTAL}}", items.length)
  .replace("{{P1}}", counts.P1 || 0).replace("{{P2}}", counts.P2 || 0).replace("{{P3}}", counts.P3 || 0);
md += `\n## B. Every gap, by severity (generated from \`action-effect.json\`)\n\n| Sev | Class | Row id | Surface | Element | Evidence | Note |\n|---|---|---|---|---|---|---|\n`;
for (const { r, g } of items) {
  md += `| ${g.severity} | ${g.class} | \`${esc(r.id)}\` | ${esc(r.route)} | ${esc((r.label?.text || "").slice(0, 50))} | ${r.verdict.evidence === "behavioral" ? `**${esc(r.verdict.evidenceRef)}**` : `static \`${esc(r.trigger?.loc)}\``} | ${esc(g.note || "")} |\n`;
}
fs.writeFileSync("docs/audits/GAP_REGISTER.md", md);
console.log(items.length, counts);
