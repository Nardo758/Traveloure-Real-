/**
 * site-map — a generated, read-only map of every client route (ledger `2026-11-28-audit-site-map`).
 *
 *   npx tsx scripts/audit/site-map.ts
 *
 * Writes docs/audit/site-map.generated.md. NEVER edit that file by hand: it is a census, and the only
 * way to change it is to change the app (or one of the tables below) and regenerate.
 *
 * WHAT IT READS, and nothing else:
 *   · `shared/client-routes.generated.ts` — the route universe. That file is itself generated from
 *     `client/src/App.tsx` by `scripts/generate-client-routes.cjs` and CI fails when it is stale, so this
 *     map inherits its guarantee: one row per declared `<Route path="...">`.
 *   · `client/src/App.tsx` — the element inside each route, used for the layout shell and the R3 test.
 *   · `scripts/never-say-baseline.json` — recorded never-say debt, summed over the route's own page
 *     module plus its DIRECT imports (one level; see the note printed in the report).
 *   · `playwright/tests/**` and `e2e/**` — the route string, for "CI capture present".
 *   · the tables below — role, R3 board coverage, and image sources. These are AUDIT JUDGEMENTS, not
 *     facts read from the code, and each carries the ruling it comes from. Treat a board name as "the
 *     board that draws this surface", and "none" as "no Revision 3 board draws it".
 *
 * NEGATIVE SPACE (§18d): a route with no literal `path=` in App.tsx is not listed (that is the
 * generator's own limit). A route reached by a redirect has a row but no page module. "CI capture"
 * means a spec NAMES the route, not that a screenshot is committed. Never-say hits are the recorded
 * baseline, not the live total: a hit above the baseline fails the guard instead of appearing here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ── the route universe ────────────────────────────────────────────────────────────────────────────────
const ROUTES: string[] = [...read("shared/client-routes.generated.ts").matchAll(/^\s*"([^"]+)",$/gm)].map((m) => m[1]);

// ── App.tsx: the element body of each route (for the shell and the R3 test) ──────────────────────────
const appSrc = read("client/src/App.tsx");
const routeBody = new Map<string, string>();
{
  const opens = [...appSrc.matchAll(/<Route\b[^>]*?\bpath="([^"]+)"/g)];
  for (let i = 0; i < opens.length; i++) {
    const start = opens[i].index! + opens[i][0].length;
    const end = i + 1 < opens.length ? opens[i + 1].index! : Math.min(appSrc.length, start + 800);
    if (!routeBody.has(opens[i][1])) routeBody.set(opens[i][1], appSrc.slice(start, end).slice(0, 800));
  }
}

// Component name -> module file, from `lazy(() => import("@/pages/x"))` and plain imports.
const moduleOf = new Map<string, string>();
for (const m of appSrc.matchAll(/const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\("@\/([^"]+)"\)/g)) moduleOf.set(m[1], m[2]);
for (const m of appSrc.matchAll(/import\s+\{?\s*(\w+)[^}]*\}?\s+from\s+"@\/([^"]+)"/g)) if (!moduleOf.has(m[1])) moduleOf.set(m[1], m[2]);

const SHELLS: Array<[RegExp, string]> = [
  [/<DashboardLayout/, "dashboard shell"],
  [/<ExpertLayout/, "expert console shell"],
  [/<ProviderLayout/, "provider console shell"],
  [/<EALayout/, "EA shell"],
  [/<BrowseShell/, "browse shell"],
  [/<PlanPageShell/, "plan shell"],
  [/<ConsoleAwareLayout/, "console-aware shell"],
  [/<Layout>/, "app shell (sidebar + banner)"],
];
const pageOf = (body: string): string | null => {
  // A console route passes its page as a prop: `{() => <ProtectedRoute component={AdminDashboard} .../>}`.
  const viaProp = body.match(/component=\{\s*([A-Z]\w+)/);
  if (viaProp) return viaProp[1];
  const m = body.match(/<([A-Z]\w+)\s*\/?>/g) ?? [];
  const wrappers = /^(Layout|DashboardLayout|ExpertLayout|ProviderLayout|EALayout|BrowseShell|PlanPageShell|ConsoleAwareLayout|R3NoPlanSwitch|Redirect|Suspense|PageErrorBoundary|ProtectedRoute|PageLoader)$/;
  for (const tag of m) {
    const name = tag.replace(/[<>/\s]/g, "");
    if (!wrappers.test(name)) return name;
  }
  return null;
};
/**
 * The shell a route sits in. App.tsx is authoritative where it names one; a bare
 * `<ProtectedRoute component={X}>` leaves the chrome to the page, so the role's console shell is
 * named instead. "redirect" is a route with no page of its own.
 */
const ROLE_SHELL: Record<string, string> = {
  admin: "admin console shell",
  expert: "expert console shell",
  provider: "provider console shell",
  traveler: "traveler app shell (sidebar)",
  "signed-out": "app shell (sidebar + banner)",
};
/** The shell a page renders FOR ITSELF when App.tsx names none (a bare `PageErrorBoundary > Page`). */
const MODULE_SHELLS: Array<[RegExp, string]> = [
  [/components\/dashboard-layout/, "dashboard shell (in page)"],
  [/components\/expert\/expert-layout/, "expert console shell (in page)"],
  [/components\/provider\/provider-layout/, "provider console shell (in page)"],
  [/components\/ea-layout/, "EA shell (in page)"],
  [/components\/browse-shell/, "browse shell (in page)"],
  [/components\/plan-page-shell/, "plan shell (in page)"],
  [/components\/console-aware-layout/, "console-aware shell (in page)"],
  [/components\/layout"/, "app shell (sidebar + banner, in page)"],
];
const moduleSource = (module: string | null): string => {
  if (!module) return "";
  for (const ext of [".tsx", ".ts"]) {
    const p = path.join(ROOT, "client/src", module + ext);
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  return "";
};
const shellOf = (body: string, role: string, module: string | null): string => {
  if (!body) return "redirect";
  if (/<Redirect/.test(body) && !pageOf(body)) return "redirect";
  const named = SHELLS.find(([re]) => re.test(body))?.[1];
  if (named) return named;
  if (/<ProtectedRoute/.test(body)) return ROLE_SHELL[role] ?? "bare";
  const inPage = MODULE_SHELLS.find(([re]) => re.test(moduleSource(module)))?.[1];
  return inPage ?? "bare";
};

// ── role ─────────────────────────────────────────────────────────────────────────────────────────────
/** Prefixes whose console belongs to one earning role. Longest first so /experts never matches /expert. */
const ROLE_PREFIXES: Array<[string, string]> = [
  ["/admin", "admin"],
  ["/expert/", "expert"],
  ["/expert", "expert"],
  ["/become-expert", "expert"],
  ["/provider", "provider"],
  ["/become-provider", "provider"],
  ["/ea/", "provider"],
];
/**
 * Routes a signed-out visitor can read. Everything not listed here and not role-scoped is a traveler
 * row: the app's default posture is a traveler surface that asks for sign-in at the action, not at the
 * door. This list is deliberately explicit — a new public route shows up as "traveler" until added.
 */
const SIGNED_OUT = [
  "/", "/about", "/how-it-works", "/pricing", "/earn", "/architecture", "/landing-mockups",
  "/waitlist", "/kyoto", "/destinations", "/search", "/places", "/discover", "/events",
  "/services", "/ready-made", "/experts", "/blog", "/terms", "/privacy", "/cookie-policy",
  "/login", "/signup", "/register", "/forgot-password", "/reset-password", "/verify-email",
  "/accept-terms", "/help", "/faq", "/contact", "/support", "/press", "/careers", "/sitemap",
];
const roleOf = (p: string): string => {
  for (const [prefix, role] of ROLE_PREFIXES) if (prefix.endsWith("/") ? p.startsWith(prefix) : p === prefix || p.startsWith(prefix + "/")) return role;
  if (p.startsWith("/t/") || p.startsWith("/s/") || p.startsWith("/share/")) return "signed-out";
  if (SIGNED_OUT.includes(p)) return "signed-out";
  return "traveler";
};

// ── Revision 3 board coverage ────────────────────────────────────────────────────────────────────────
/**
 * The board that draws a surface, from `r3-view-map-v7.md` (the R3 view map) and `r3-pipeline-map.md`
 * (the Phase-2 index). Ordered: the first match wins. A route absent from this table has NO Revision 3
 * board — that is the "without a board" column in the summary, and it is the point of the census.
 */
const BOARDS: Array<[RegExp, string]> = [
  [/^\/plans\/:tripId$/, "V1 V2 V5 V6 V7 V8 V8a V15 V23 V24 V27 V28 V29 V32"],
  [/^\/plans\/:tripId\/(compare|versions)/, "V8"],
  [/^\/plans\/new$/, "V23"],
  [/^\/plans$/, "V24"],
  [/^\/services\/:id$/, "V31 V27"],
  [/^\/services$/, "V26 V27"],
  [/^\/experts\/:id$/, "V12 V13 V14"],
  [/^\/experts$/, "V12 V14"],
  [/^\/places\//, "V10 V26 V27"],
  [/^\/discover\/location\//, "V10 V26 V27"],
  [/^\/events/, "V9 V10 V26"],
  [/^\/ready-made/, "V30"],
  [/^\/$/, "V27"],
];
const boardOf = (p: string): string => BOARDS.find(([re]) => re.test(p))?.[1] ?? "none";

// ── layout: old surface, R3 bento behind R3_SURFACE, or both ─────────────────────────────────────────
/**
 * R3 is a RUNTIME flag (`R3_SURFACE=1`, `server/routes/launch-public.routes.ts`) plus `?surface=r3`
 * (`client/src/lib/r3-surface.ts`), so a route is "both" when one route serves the old page and the R3
 * bento, and "R3 only" when the page exists only behind the flag.
 */
const R3_BOTH = [/^\/plans\/:tripId$/, /^\/$/];
const R3_ONLY_MODULES = new Set(["pages/r3-settings", "pages/r3-payment-methods"]);
const R3_ONLY_PATHS = [/^\/settings$/, /^\/payment-methods$/];
const layoutOf = (p: string, module: string | null): string => {
  if (module && R3_ONLY_MODULES.has(module)) return "R3 only";
  if (R3_ONLY_PATHS.some((re) => re.test(p))) return "R3 only";
  if (R3_BOTH.some((re) => re.test(p))) return "both";
  return "old only";
};

// ── image sources (from the 2026-11-28 photo audit, `photo-audit.md`) ───────────────────────────────
/**
 * What the surface can draw, and whether any of it is outside the photo rule (own/host, official with
 * credit, Wikimedia CC/PD). The audit's per-surface citations are kept in its report; this column names
 * the source classes only.
 */
const IMAGES: Array<[RegExp, string, boolean]> = [
  [/^\/plans\/:tripId/, "host (ours), Wikimedia CC/PD, Google Places live — all attributed", true],
  [/^\/plans/, "none (empty plan shows destination art)", false],
  [/^\/$/, "gem photos (Wikimedia + Unsplash), curated Unsplash cover", true],
  [/^\/services\/:id$/, "host uploads (gallery)", false],
  [/^\/services$/, "gem photos: Wikimedia, plus 2 Unsplash in Kyoto with no credit", true],
  [/^\/places\/|^\/discover\//, "gem photos: Wikimedia + Unsplash (2 uncredited in Kyoto)", true],
  [/^\/experts/, "host avatar uploads; ready-made heroes are Unsplash", true],
  [/^\/events/, "event imageUrl (Unsplash seeds)", true],
  [/^\/ready-made/, "Unsplash hero, credit required by R936", true],
  [/^\/cart$/, "content-line imageUrl (supplier or Unsplash seed)", true],
  [/^\/admin\/template-approvals/, "seller hero (Unsplash, R936)", true],
  [/^\/admin\//, "mixed: host uploads, partner logos; no photo surface", false],
];
const imageOf = (p: string): { text: string; offRule: boolean } => {
  const hit = IMAGES.find(([re]) => re.test(p));
  return hit ? { text: hit[1], offRule: hit[2] } : { text: "none", offRule: false };
};

// ── never-say recorded debt, per route module + its direct imports ───────────────────────────────────
const baseline: Record<string, Record<string, number>> = JSON.parse(read("scripts/never-say-baseline.json"));
const importsOf = (module: string): string[] => {
  const abs = path.join(ROOT, "client/src", module + ".tsx");
  const absTs = path.join(ROOT, "client/src", module + ".ts");
  const file = fs.existsSync(abs) ? abs : fs.existsSync(absTs) ? absTs : null;
  if (!file) return [];
  const src = fs.readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(/from\s+"@\/([^"]+)"/g)) out.push(m[1]);
  return out;
};
const neverSayOf = (module: string | null): number => {
  if (!module) return 0;
  const mods = new Set([module, ...importsOf(module)]);
  let n = 0;
  for (const [file, byWord] of Object.entries(baseline)) {
    const rel = file.replace(/^client\/src\//, "").replace(/\.tsx?$/, "");
    if (mods.has(rel)) for (const c of Object.values(byWord)) n += c;
  }
  return n;
};

// ── CI capture: does a spec NAME the route? ──────────────────────────────────────────────────────────
const specFiles: string[] = [];
for (const dir of ["playwright/tests", "playwright", "e2e"]) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  const walk = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) { if (ent.name !== "node_modules") walk(p); }
      else if (/\.(ts|tsx|mjs)$/.test(ent.name) && !/site-map/.test(ent.name)) specFiles.push(p);
    }
  };
  walk(abs);
}
const specText = specFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
const captured = (p: string): boolean => {
  if (p === "/") return /goto\(\s*["'`]\/["'`]/.test(specText) || /to=["']\/["']/.test(specText);
  // :params become "any segment"; the literal path must appear with that shape.
  const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\:[\w]+/g, '[^"\'`\\s/?]+').replace(/^\\\//, "\\/"));
  return re.test(specText);
};

// ── build ────────────────────────────────────────────────────────────────────────────────────────────
interface Row {
  path: string;
  role: string;
  layout: string;
  board: string;
  images: string;
  offRule: boolean;
  neverSay: number;
  capture: boolean;
  shell: string;
}
const rows: Row[] = ROUTES.map((p) => {
  const body = routeBody.get(p) ?? "";
  const page = pageOf(body);
  const module = page ? moduleOf.get(page) ?? null : null;
  const img = imageOf(p);
  return {
    path: p,
    role: roleOf(p),
    layout: layoutOf(p, module),
    board: boardOf(p),
    images: img.text,
    offRule: img.offRule,
    neverSay: neverSayOf(module),
    capture: captured(p),
    shell: shellOf(body, roleOf(p), module),
  };
});

const count = (f: (r: Row) => boolean) => rows.filter(f).length;
const summary = {
  total: rows.length,
  noBoard: count((r) => r.board === "none"),
  oldOnly: count((r) => r.layout === "old only"),
  neverCaptured: count((r) => !r.capture),
  offRule: count((r) => r.offRule),
};
const byRole = ["signed-out", "traveler", "expert", "provider", "admin"].map((role) => `${role} ${count((r) => r.role === role)}`).join(" · ");

const esc = (s: string) => s.replace(/\|/g, "\\|");
const md = [
  "# Site map — every client route",
  "",
  "<!-- GENERATED by scripts/audit/site-map.ts. Do not edit by hand; regenerate with `npx tsx scripts/audit/site-map.ts`. -->",
  "",
  `Generated from \`shared/client-routes.generated.ts\` (itself generated from \`client/src/App.tsx\`, CI-checked for staleness) at the commit that regenerated it.`,
  "Role, Revision 3 board coverage and image sources are audit judgements from the tables in the script; each cites the ruling it comes from. Everything else is read from the code.",
  "",
  "## Summary",
  "",
  "| | |",
  "|---|---:|",
  `| routes total | **${summary.total}** |`,
  `| without a Revision 3 board | **${summary.noBoard}** |`,
  `| old surface only (R3 off for this route) | **${summary.oldOnly}** |`,
  `| never captured by a spec | **${summary.neverCaptured}** |`,
  `| off the photo rule | **${summary.offRule}** |`,
  "",
  `By role: ${byRole}.`,
  "",
  "## Routes",
  "",
  "| path | role | layout | R3 board | image sources | never-say | CI capture | shell |",
  "|---|---|---|---|---|---:|---|---|",
  ...rows.map(
    (r) =>
      `| \`${esc(r.path)}\` | ${r.role} | ${r.layout} | ${r.board} | ${esc(r.images)}${r.offRule ? " **(off-rule)**" : ""} | ${r.neverSay} | ${r.capture ? "y" : "n"} | ${r.shell} |`,
  ),
  "",
  "## How to read a column",
  "",
  "- **layout** — `both` means one route serves the old page and the R3 bento behind `R3_SURFACE` + `?surface=r3`; `R3 only` means the page exists only behind the flag.",
  "- **R3 board** — the board that draws the surface, from `r3-view-map-v7.md` and `r3-pipeline-map.md`. `none` means no Revision 3 board draws it.",
  "- **image sources** — source classes only, from the photo audit. `(off-rule)` means at least one class is outside own/host, official-with-credit or Wikimedia CC/PD.",
  "- **never-say** — recorded baseline hits summed over the route's page module and its DIRECT imports (one level). A hit above the baseline fails `check-never-say-copy` instead of appearing here.",
  "- **CI capture** — a spec in `playwright/` or `e2e/` NAMES the route. It is not a committed screenshot.",
  "- **shell** — the layout wrapper the route's element sits in.",
  "",
];
const outPath = path.join(ROOT, "docs/audit/site-map.generated.md");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md.join("\n"));
console.log(`wrote docs/audit/site-map.generated.md — ${summary.total} routes`);
console.log(JSON.stringify(summary));






