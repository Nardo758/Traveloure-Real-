#!/usr/bin/env node
/**
 * Trip Slip product map §J generator — the per-experience specification, derived, never hand-written
 * (decision-maker, Sep 26, 2026; ledger `2026-09-26-slip-map-ratification-gate`, R135).
 *
 * DESIGN TOOLING, NOT PRODUCT CODE. It reads the two sources of truth as TEXT and resolves every
 * occasion the way `docs/planning/trip-slip-product-map.md` §B (group rule) and §D (group defaults)
 * say, then applies the occasion's own switches (LD 28) and the §J override record:
 *   · server/seeds/experience-template-tabs.seed.ts — the 28 occasions, their six switches, roles_needed
 *   · server/migrations/035_phase1_seed_template_matrix.sql — the seven family keys' REQ/REC/OPT rows
 * The REQ categories use the PROPOSED phase-0 slug keys (brief §F phase 0 0c): family rows, the
 * occasion's own roles raised to at least REC, and the listed reconciliations. They are what the map
 * would read after phase 0, not what the engine reads today.
 *
 * Usage (from the repo root):
 *   node docs/planning/tools/trip-slip-spec.mjs            rewrite §J in the map + the JSON beside it
 *   node docs/planning/tools/trip-slip-spec.mjs --check    exit 1 if either is stale (the proposed CI step)
 *
 * Sync (proposed, wired at map step 1 — not before ratification): the `--check` run joins CI, so a
 * seed change that moves a switch, a role or an occasion fails until §J is regenerated. At step 1 the
 * resolution below moves into `shared/experience-spec.ts` (the one resolver the slip itself uses) and
 * this script imports it instead of restating it.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SEED = "server/seeds/experience-template-tabs.seed.ts";
const MATRIX = "server/migrations/035_phase1_seed_template_matrix.sql";
const MAP = "docs/planning/trip-slip-product-map.md";
const JSON_OUT = "docs/planning/tools/trip-slip-spec.json";
const BEGIN = "<!-- BEGIN GENERATED §J TABLE (docs/planning/tools/trip-slip-spec.mjs) -->";
const END = "<!-- END GENERATED §J TABLE -->";

// ── Sources ─────────────────────────────────────────────────────────────────────────────────────
function readOccasions() {
  const seed = readFileSync(resolve(ROOT, SEED), "utf8");
  const re =
    /\{ slug: "([^"]+)", name: "([^"]+)"[\s\S]*?switches: \{ stops: "(\w+)", duration: "(\w+)", schedule: (\w+), guests: (\w+), vocabulary: "(\w+)", visibility: "(\w+)" \},[\s\S]*?rolesNeeded: \[([^\]]*)\]/g;
  const out = [];
  for (const m of seed.matchAll(re)) {
    out.push({
      slug: m[1], name: m[2], stops: m[3], duration: m[4], schedule: m[5] === "true", guests: m[6] === "true",
      vocabulary: m[7], visibility: m[8], roles: [...m[9].matchAll(/"(\w+)"/g)].map((x) => x[1]),
    });
  }
  if (out.length === 0) throw new Error(`no occasions parsed from ${SEED} — the seed's shape changed; update the parser`);
  return out;
}
function readMatrix() {
  const sql = readFileSync(resolve(ROOT, MATRIX), "utf8");
  const mat = {};
  for (const m of sql.matchAll(/\('(\w+)',\s*'(\w+)',\s*'(REQ|REC|OPT)'\)/g)) (mat[m[1]] ??= {})[m[2]] = m[3];
  return mat; // `custom` is programmatic (every category OPT) and carries no REQ/REC, so it parses as empty.
}

// ── §A2 proposed family key, §B group rule ──────────────────────────────────────────────────────
const FAMILY = {
  travel: "travel", "anniversary-trip": "travel", honeymoon: "travel", romance: "travel", "golf-trip": "travel",
  "sports-event": "travel", show: "travel", "date-night": "date_night", proposal: "proposal", birthday: "birthday",
  "milestone-birthday": "birthday", "corporate-events": "corporate", wedding: "wedding", corporate: "corporate",
  "bachelor-bachelorette": "travel", "boys-trip": "travel", "girls-trip": "travel", retreats: "travel",
};
function groupFor(o) {
  if (!o) return "Plain plan";
  if (o.duration === "day") return o.guests ? "Celebrations" : "Moments";
  if (!o.guests) return "Trips";
  return o.roles.includes("venue") ? "Hosted events" : "Group travel";
}

// ── §D group defaults ('on' | 'opt' | 'off' | 'cond') ──────────────────────────────────────────
const MODULES = [
  ["B1", "Plan header"], ["B2", "Days & items"], ["B3", "Map"], ["B4", "Completeness"], ["B5", "First draft"],
  ["B6", "Share & export"], ["B7", "Finish"],
  ["S1", "Compare options"], ["S2", "Anchor & travel time"], ["S3", "Suggestions"], ["S4", "Move / jump to day"],
  ["S5", "Bookings"], ["S6", "Expert suggestions"], ["S7", "Optimize preview"], ["S8", "Ask AI"], ["S9", "Stops"],
  ["A1", "Three versions"], ["A2", "Event schedule"], ["A3", "Party & arrivals"], ["A4", "Guests & RSVP"],
  ["A5", "Vendor coordination"], ["A6", "Temporal anchors"], ["A7", "Split activities"], ["A8", "Expert handoff"],
];
const G = ["Plain plan", "Moments", "Celebrations", "Trips", "Hosted events", "Group travel"];
const row = (...v) => Object.fromEntries(G.map((g, i) => [g, v[i]]));
const GROUP_DEFAULT = {
  B1: row("on", "on", "on", "on", "on", "on"), B2: row("on", "on", "on", "on", "on", "on"),
  B3: row("on", "on", "on", "on", "on", "on"), B4: row("on", "on", "on", "on", "on", "on"),
  B5: row("on", "on", "on", "on", "on", "on"), B6: row("on", "on", "on", "on", "on", "on"),
  B7: row("on", "on", "on", "on", "on", "on"),
  S1: row("on", "on", "on", "on", "on", "on"), S2: row("opt", "on", "on", "on", "on", "on"),
  S3: row("on", "on", "on", "on", "on", "on"), S4: row("on", "off", "off", "on", "on", "on"),
  S5: row("on", "on", "on", "on", "on", "on"), S6: row("cond", "cond", "cond", "cond", "cond", "cond"),
  S7: row("on", "opt", "opt", "on", "on", "on"), S8: row("on", "on", "on", "on", "on", "on"),
  S9: row("off", "off", "off", "on", "on", "on"),
  A1: row("opt", "off", "opt", "on", "on", "on"), A2: row("off", "on", "on", "off", "on", "on"),
  A3: row("opt", "off", "opt", "opt", "on", "on"), A4: row("off", "off", "on", "off", "on", "on"),
  A5: row("off", "opt", "opt", "off", "on", "opt"), A6: row("opt", "on", "on", "opt", "on", "opt"),
  A7: row("off", "off", "off", "opt", "opt", "on"), A8: row("on", "on", "on", "on", "on", "on"),
};

// ── The switches that decide a module (LD 28: the switch wins over the group default) ──────────
function switchValue(id, o) {
  if (!o) return undefined;
  switch (id) {
    case "A2": return o.schedule ? "on" : "off";                                   // default_schedule
    case "A4": return o.guests && o.visibility === "shown" ? "on" : "off";         // default_guests + default_visibility
    case "S9": return o.stops === "many" ? "on" : "off";                           // default_stops
    case "S4": return o.duration === "range" ? "on" : "off";                       // default_duration (one day ⇒ no day list to jump)
    case "B6": return o.visibility === "hidden" ? "opt" : undefined;               // default_visibility: hidden ⇒ share off by default
    case "A5": return o.roles.length === 0 ? "off" : undefined;                    // roles_needed empty ⇒ nothing to coordinate
    default: return undefined;
  }
}

// ── §J proposed overrides: DATA keyed by slug, never a separate surface ────────────────────────
// Each entry: module → value, with the one-line reason. Proposed, not ratified.
export const OVERRIDES = {
  // RULED Sep 27, 2026 (R147): the only adopted override. It corrects the `duration: day` switch's result, not a group default.
  "corporate-events": { A5: ["on", "A run of show with AV, catering and a coordinator; coordination is the product that the one-day switch hides."] },
};

// ── Derived columns ────────────────────────────────────────────────────────────────────────────
const LEAD = {
  "Plain plan": "Days & items, with a “Choose an occasion” prompt",
  Moments: "The one reservation (A6) and its compare set (S1)",
  Celebrations: "Completeness (B4) and the venue compare (S1)",
  Trips: "Day list with the hotel anchor (S2)",
  "Hosted events": "Completeness by vendor role (B4 + A5)",
  "Group travel": "Arrivals (A3) and the lodging compare (S1)",
};
function anchorFor(o, group) {
  if (!o) return "none until set";
  if (o.slug === "proposal") return "proposal_moment (temporal anchor)";
  if (group === "Moments") return "dinner_reservation (temporal anchor)";
  if (group === "Celebrations") return "venue (event location)"; // R138: venue is every Celebration's REQ; a single custom venue anchors automatically (map §K5)
  if (group === "Trips") return "hotel (hotel_checkin)";
  if (group === "Hosted events") return o.slug === "wedding" ? "venue (ceremony_time)" : "venue";
  return "shared lodging (hotel_checkin)";
}
// REQ rules (brief §F phase 0 0c, as RULED Sep 27, 2026 — R137, R138, R141):
//   R138: every Celebrations occasion has exactly ONE REQ, `venue`; nothing else is REQ in that group.
//   R137: every multi-day (`range`) occasion with no `venue` role has `accommodation` REQ.
//   R141: `proposal` keeps `dining_venue` REQ.
//   Hosted events keep their family REQ with `venue` first and `dining_venue` at REC (0c).
function reqFor(o, mat) {
  if (!o) return [];
  const group = groupFor(o);
  if (group === "Celebrations") return ["venue"];
  const fam = { ...(mat[FAMILY[o.slug] ?? "custom"] ?? {}) };
  for (const r of o.roles) if (!fam[r] || fam[r] === "OPT") fam[r] = "REC";
  if (o.roles.includes("venue")) { fam.venue = "REQ"; if (fam.dining_venue === "REQ") fam.dining_venue = "REC"; }
  if (o.duration === "range" && !o.roles.includes("venue")) fam.accommodation = "REQ";
  if (o.slug === "proposal") fam.dining_venue = "REQ";
  const order = (k) => { const i = o.roles.indexOf(k); return i < 0 ? 1000 : i; }; // roles_needed order first ("venue first")
  return Object.entries(fam).filter(([k, s]) => s === "REQ" && !k.startsWith("aff_")).map(([k]) => k).sort((a, b) => order(a) - order(b));
}
function compareDefault(o, group, req) {
  if (!o) return "none (no occasion)";
  for (const k of ["venue", "accommodation", "dining_venue"]) if (req.includes(k)) return k; // the anchor's category, from REQ
  if (group === "Moments") return "dining_venue";
  return o.roles[0] ?? "none";
}

function resolve1(o, mat) {
  const group = groupFor(o);
  const modules = {};
  for (const [id] of MODULES) {
    const base = GROUP_DEFAULT[id][group];
    const sw = switchValue(id, o);
    const ov = o ? OVERRIDES[o.slug]?.[id] : undefined; // `compare` is not a module id, so never matched here
    let value = base, by = null;
    if (sw !== undefined && sw !== base) { value = sw; by = "switch"; }
    if (ov) { value = ov[0]; by = "override"; }
    modules[id] = { value, by };
  }
  return {
    slug: o?.slug ?? "(plain plan)", name: o?.name ?? "Plain plan (occasion unresolved — LD 28 NULL fallback)", group,
    switches: o ? { duration: o.duration, guests: o.guests, stops: o.stops, schedule: o.schedule, visibility: o.visibility, vocabulary: o.vocabulary } : null,
    roles: o?.roles ?? [], lead: LEAD[group], anchor: anchorFor(o, group), req: reqFor(o, mat),
    compare: (o && OVERRIDES[o.slug]?.compare?.[0]) ?? compareDefault(o, group, reqFor(o, mat)),
    compareOverridden: !!(o && OVERRIDES[o.slug]?.compare), a1: modules.A1.value === "off" ? "not available" : modules.A1.value === "on" ? "on" : "available (optional)",
    modules,
  };
}

// ── Render ─────────────────────────────────────────────────────────────────────────────────────
const SYM = { on: "●", opt: "○", off: "—", cond: "◐" };
function cell(m) { return SYM[m.value] + (m.by === "switch" ? "ˢ" : m.by === "override" ? "ᵒ" : ""); }
function render(rows) {
  const ids = MODULES.map(([id]) => id);
  const head = `| Occasion | Group | ${ids.join(" | ")} | Lead zone | Anchor | REQ (phase-0 slug key) | Compare default | A1 |`;
  const sep = `|${"---|".repeat(ids.length + 7)}`;
  const body = rows.map((r) =>
    `| \`${r.slug}\` | ${r.group} | ${ids.map((id) => cell(r.modules[id])).join(" | ")} | ${r.lead} | ${r.anchor} | ${r.req.length ? r.req.map((x) => `\`${x}\``).join(", ") : "— none"} | \`${r.compare}\`${r.compareOverridden ? "ᵒ" : ""} | ${r.a1} |`);
  const ov = Object.entries(OVERRIDES).flatMap(([slug, mods]) => Object.entries(mods).map(([id, [v, why]]) =>
    `| \`${slug}\` | ${id === "compare" ? "Compare default" : id} | ${id === "compare" ? `\`${v}\`` : SYM[v]} | ${why} |`));
  return [
    BEGIN,
    "",
    "Key: ● on · ○ optional (off by default, one tap to add) · — off · ◐ only when an expert is assigned. A superscript **ˢ** marks a cell a switch changed from the group default (LD 28); **ᵒ** marks a proposed override (below).",
    "",
    head, sep, ...body,
    "",
    "**Overrides (data: one record keyed by slug, applied after the switches; never a separate surface). Confirmed Sep 27, 2026 (R147).**",
    "",
    "| Occasion | Module | Value | Reason |", "|---|---|---|---|", ...ov,
    "",
    END,
  ].join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────────
const occasions = readOccasions();
const mat = readMatrix();
const rows = [...occasions.map((o) => resolve1(o, mat)), resolve1(null, mat)];
const table = render(rows);
const json = JSON.stringify({ generatedFrom: [SEED, MATRIX], groups: G, modules: MODULES, overrides: OVERRIDES, rows }, null, 1) + "\n";

const mapPath = resolve(ROOT, MAP);
const doc = readFileSync(mapPath, "utf8");
const i = doc.indexOf(BEGIN), j = doc.indexOf(END);
if (i < 0 || j < 0) throw new Error(`markers not found in ${MAP}`);
const next = doc.slice(0, i) + table + doc.slice(j + END.length);
const jsonPath = resolve(ROOT, JSON_OUT);

if (process.argv.includes("--check")) {
  const stale = [];
  if (next !== doc) stale.push(MAP);
  if (!existsSync(jsonPath) || readFileSync(jsonPath, "utf8") !== json) stale.push(JSON_OUT);
  if (stale.length) { console.error(`§J is stale — regenerate with: node docs/planning/tools/trip-slip-spec.mjs\n  ${stale.join("\n  ")}`); process.exit(1); }
  console.log(`§J is current (${rows.length} rows).`);
} else {
  writeFileSync(mapPath, next);
  writeFileSync(jsonPath, json);
  console.log(`§J written: ${rows.length} rows.`);
}
