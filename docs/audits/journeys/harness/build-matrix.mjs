// Merges the per-group row files into docs/audits/action-effect.json (schema v1) and renders
// docs/audits/ACTION_EFFECT_MATRIX.md + docs/audits/INTENT_COMPONENT_MAP.md.
// Usage: node build-matrix.mjs <rowsDir> <patches.json> <baseSha>
import fs from "node:fs";
import path from "node:path";

const [rowsDir, patchFile, baseSha] = process.argv.slice(2);
const GROUPS = ["shell", "marketplace", "entry", "console"];
let rows = [];
for (const g of GROUPS) {
  const f = path.join(rowsDir, `${g}.json`);
  if (!fs.existsSync(f)) { console.error("missing", f); continue; }
  const arr = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const r of arr) rows.push({ ...r, group: g });
}

// De-duplicate ids across groups (shared components counted per mounting surface keep their surface prefix).
const seen = new Map();
for (const r of rows) {
  const n = (seen.get(r.id) || 0) + 1;
  seen.set(r.id, n);
  if (n > 1) r.id = `${r.id}#${n}`;
}

// Intent normalisation — the four tracing passes named some identical user goals differently.
// Only unambiguous synonyms are merged; anything that could be a different product stays separate.
const INTENT_SYNONYMS = {
  open_sign_in: "sign_in", dismiss_sign_in: "dismiss", dismiss_menu: "dismiss", dismiss_prompt: "dismiss",
  claim_guest_work: "claim_guest_state", restore_guest_state: "claim_guest_state",
  ask_expert: "message_expert", send_message: "message_expert",
  share_plan_with_expert: "request_expert", share: "share_plan",
  filter_results: "filter", filter_plans: "filter",
  report_user: "report", report_review: "report",
  sync_planning_pen: "bind_planning_pen", quote_concierge: "request_concierge",
  resume_after_sign_in: "resume_after_auth", start_ai_planning: "open_ai_planner",
};
for (const r of rows) if (r.intent && INTENT_SYNONYMS[r.intent]) r.intent = INTENT_SYNONYMS[r.intent];

// Apply patches: { match: {idPrefix|id}, set: {...}, addGaps: [...], evidence, evidenceRef }
const patches = patchFile && fs.existsSync(patchFile) ? JSON.parse(fs.readFileSync(patchFile, "utf8")) : [];
const unmatched = [];
for (const p of patches) {
  const hits = rows.filter((r) => (p.id ? r.id === p.id : r.id.startsWith(p.idPrefix)));
  if (!hits.length) unmatched.push(p.id || p.idPrefix);
  for (const r of hits) {
    r.verdict = r.verdict || { evidence: "static", gaps: [] };
    if (p.addGaps) {
      const have = new Set(r.verdict.gaps.map((g) => g.class + g.note));
      for (const g of p.addGaps) if (!have.has(g.class + g.note)) r.verdict.gaps.push(g);
    }
    if (p.evidence) r.verdict.evidence = p.evidence;
    if (p.evidenceRef) r.verdict.evidenceRef = p.evidenceRef;
    if (p.actual) r.verdict.actual = p.actual;
  }
}

const out = { schemaVersion: 1, baseSha, generatedAt: new Date().toISOString(), rows: rows.map(({ group, ...r }) => r) };
fs.writeFileSync("docs/audits/action-effect.json", JSON.stringify(out, null, 1));

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const cut = (s, n) => { s = esc(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const sevRank = { P1: 1, P2: 2, P3: 3 };
const worst = (r) => Math.min(...(r.verdict?.gaps || []).map((g) => sevRank[g.severity] || 9), 9);

let md = `# Action → Effect Matrix (traveler surfaces)\n\n` +
  `Generated from \`docs/audits/action-effect.json\` (schema v1, \`docs/audits/action-effect.schema.json\`) at base \`${baseSha}\` by \`docs/audits/journeys/harness/build-matrix.mjs\`.\n` +
  `**${out.rows.length} triggers** (${out.rows.filter((r) => r.tier === 1).length} Tier 1 fully traced, ${out.rows.filter((r) => r.tier === 2).length} Tier 2 one-liners). ` +
  `Evidence: **${out.rows.filter((r) => r.verdict?.evidence === "behavioral").length} behavioural** (journey step cited), the rest static (file:line). ` +
  `Rows are grouped by surface; within a surface, worst severity first. Columns follow the dispatch; long cells are truncated here — the JSON carries the full chain.\n\n`;
const bySurface = new Map();
for (const r of out.rows) {
  const k = `${r.route || "global"} — ${r.surface}`;
  if (!bySurface.has(k)) bySurface.set(k, []);
  bySurface.get(k).push(r);
}
for (const [k, rs] of [...bySurface.entries()].sort()) {
  rs.sort((a, b) => worst(a) - worst(b) || a.tier - b.tier);
  md += `\n## ${esc(k)}\n\n| Tier | Element (label) | file:line | Condition | Handler | Client writes | API call | Server file:line | DB writes | Invalidates | Navigates | Downstream readers | Expected | Actual (evidence) | Gap class | Sev |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of rs) {
    const c = r.chain || {};
    const gaps = r.verdict?.gaps || [];
    const cond = (r.conditions || []).filter((x) => x.axis !== "none" || x.value).map((x) => `${x.axis}=${x.value}: ${x.outcome}`).join("; ");
    md += `| ${r.tier} | ${cut(r.label?.text, 40)}${r.label?.testId ? ` \`${cut(r.label.testId, 40)}\`` : ""} | \`${cut(r.trigger?.loc, 50)}\` | ${cut(cond, 120)} | ${cut(c.handler, 50)} | ${cut((c.clientWrites || []).join("; "), 90)} | ${c.api ? `\`${esc(c.api.method)} ${cut(c.api.route, 50)}\`` : ""} | ${cut(c.serverLoc, 50)} | ${cut((c.dbWrites || []).join("; "), 80)} | ${cut((c.invalidates || []).join("; "), 70)} | ${cut(c.navigates, 40)} | ${cut((c.downstreamReaders || []).join("; "), 70)} | ${cut(r.expected, 50)} | ${cut(r.verdict?.actual, 90)} (${r.verdict?.evidence === "behavioral" ? `**${esc(r.verdict.evidenceRef)}**` : "static"}) | ${gaps.map((g) => g.class).join(", ")} | ${gaps.map((g) => g.severity).sort()[0] || ""} |\n`;
  }
}
fs.writeFileSync("docs/audits/ACTION_EFFECT_MATRIX.md", md);

// Intent → component map (deliverable 6).
const byIntent = new Map();
for (const r of out.rows) {
  if (!r.intent || r.intent === "navigate") continue;
  if (!byIntent.has(r.intent)) byIntent.set(r.intent, new Map());
  // Group by component + FILE (a component rendering several controls for one intent is one component).
  const file = String(r.component?.loc || "").replace(/:\d+(-\d+)?$/, "");
  const comp = `${r.component?.name} (${file})`;
  const m = byIntent.get(r.intent);
  if (!m.has(comp)) m.set(comp, { labels: new Set(), surfaces: new Set() });
  m.get(comp).labels.add(r.label?.text || "");
  m.get(comp).surfaces.add(r.route || r.surface);
}
let im = `# Intent → component map\n\nGenerated with the matrix (base \`${baseSha}\`). One section per normalised \`intent\`; every component rendering it, the labels it uses and the routes it appears on. **More than one component per intent = consolidation candidate**; differing labels for one intent = INCONSISTENT_AFFORDANCE. \`navigate\` is omitted.\n\n| Intent | Components | Distinct labels | Consolidation candidate? |\n|---|---|---|---|\n`;
const intents = [...byIntent.entries()].sort((a, b) => b[1].size - a[1].size);
for (const [intent, comps] of intents) {
  const labels = new Set([...comps.values()].flatMap((v) => [...v.labels]));
  im += `| \`${intent}\` | ${comps.size} | ${labels.size} | ${comps.size > 1 ? "**yes**" : "no"} |\n`;
}
for (const [intent, comps] of intents) {
  im += `\n## \`${intent}\` — ${comps.size} component(s)\n\n| Component (file) | Labels | Routes |\n|---|---|---|\n`;
  for (const [comp, v] of comps) im += `| ${esc(comp)} | ${[...v.labels].map((l) => `"${cut(l, 40)}"`).join(", ")} | ${[...v.surfaces].map(esc).join(", ")} |\n`;
}
fs.writeFileSync("docs/audits/INTENT_COMPONENT_MAP.md", im);
console.log(JSON.stringify({ rows: out.rows.length, tier1: out.rows.filter((r) => r.tier === 1).length, intents: intents.length, unmatchedPatches: unmatched }));
