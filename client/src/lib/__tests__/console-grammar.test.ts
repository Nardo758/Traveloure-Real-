/**
 * THE TRAVELER CONSOLE READS THE ONE SITE GRAMMAR, AND THE BROWSE SURFACES RENDER
 * INSIDE ITS SHELL. Ledger `2026-09-07-console-one-grammar` (CLAUDE.md Locked
 * Decision 45 ruling 7 — Console & AI Concierge brief, lane L1).
 *
 * WHY THIS EXISTS. Both halves of this lane fail silently and in the safe-looking
 * direction. A page body outside `.console-scope` still renders — every shadcn
 * primary inside it just resolves to the traveler pink (#FF385C) beside the
 * console's coral (#E85D55), two reds on one screen, and nothing throws. A route
 * wrapped in the public Layout instead of the console shell still renders — the
 * sidebar simply vanishes on that tab. Neither is visible to any type check, any
 * server test, or any gate that does not read the shipped source.
 *
 * What these hold:
 *   T1  DashboardLayout's root carries `console-scope` — the mechanism by which
 *       every shadcn semantic inside the traveler console resolves coral.
 *   T2  DashboardLayout and DashboardSidebar carry NO raw console hex literals in
 *       code — the sidebar and frame READ the tokens (var(--console-*)), so the
 *       palette has one author (`index.css`), not three.
 *   T3  `.console-scope` in index.css still defines the coral primary
 *       (3 76% 62% = #E85D55) — the token the whole grammar hangs on.
 *   T4  BrowseShell is the ONE chrome chooser (§18 rule 1): it reads the session
 *       (useAuth) and renders DashboardLayout for a signed-in traveler, the
 *       public Layout for a guest — never per-route improvisation.
 *   T5  The three ruled routes use it: App.tsx wraps `/experts` and `/cart` in
 *       BrowseShell (guests keep the public chrome — `/cart` is the ruled guest
 *       fallback, LD 45 (4)), and discover-location renders BrowseShell for its
 *       own chrome instead of importing Layout.
 *
 * Pure static pins: no DOM, no DB, no fetch — every pin reads the shipped source
 * as text with comments stripped (a removal explained in a comment must not
 * satisfy an absence pin). Stated negative space: these pins cannot see whether
 * anything RENDERS, whether Tailwind resolves the arbitrary var() values, or
 * whether the sidebar is actually visible — those are the Playwright screenshot
 * the brief names and the e2e gates' answer.
 * Run: npx tsx --test client/src/lib/__tests__/console-grammar.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = join(HERE, "..", "..");
const readClient = (rel: string) => readFileSync(join(CLIENT_SRC, rel), "utf8");

/** Absence pins read CODE, not the prose explaining the removal. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codeClient = (rel: string) => stripComments(readClient(rel));

/** The raw console literals the token conversion retired. */
const CONSOLE_HEXES = ["#E85D55", "#7A7A72", "#1A1A18", "#E8E8E2", "#F3F3EE", "#AEAEA6", "#FAFAF8"];

describe("console grammar — one scope, tokens only", () => {
  it("T1 DashboardLayout's root carries console-scope", () => {
    const layout = codeClient("components/dashboard-layout.tsx");
    assert.match(layout, /className="console-scope /, "DashboardLayout root must carry the console-scope class");
  });

  it("T2 the frame and the sidebar read tokens — no raw console hex in code", () => {
    for (const rel of ["components/dashboard-layout.tsx", "components/dashboard-sidebar.tsx"]) {
      const code = codeClient(rel);
      for (const hex of CONSOLE_HEXES) {
        assert.ok(!code.includes(hex), `${rel} still carries raw console literal ${hex} — use var(--console-*)`);
      }
      assert.ok(!code.includes("rgba(232,"), `${rel} still carries the raw coral wash rgba()`);
    }
  });

  it("T3 .console-scope still defines the coral primary", () => {
    const css = readClient("index.css");
    const scope = css.slice(css.indexOf(".console-scope {"));
    assert.match(scope, /--primary:\s*3 76% 62%/, ".console-scope must define --primary as coral (3 76% 62% = #E85D55)");
    assert.match(scope, /--console-brand:\s*#E85D55/, "the raw console-brand token must exist for inline styles");
  });

  it("T4 BrowseShell is the one chrome chooser: session in, DashboardLayout or Layout out", () => {
    const shell = codeClient("components/browse-shell.tsx");
    assert.ok(shell.includes("useAuth"), "BrowseShell must read the session");
    assert.ok(shell.includes("<DashboardLayout>"), "BrowseShell must render DashboardLayout for a signed-in traveler");
    assert.ok(shell.includes("<Layout>"), "BrowseShell must render the public Layout for a guest");
  });

  it("T5 the three ruled routes render inside the shell", () => {
    const app = codeClient("App.tsx");
    const routeBlock = (path: string) => {
      const i = app.indexOf(`<Route path="${path}">`);
      assert.ok(i !== -1, `App.tsx must route ${path}`);
      return app.slice(i, app.indexOf("</Route>", i));
    };
    for (const path of ["/experts", "/cart"]) {
      const block = routeBlock(path);
      assert.ok(block.includes("<BrowseShell>"), `${path} must render inside BrowseShell`);
      assert.ok(!block.includes("<Layout>"), `${path} must not hard-wrap the public Layout`);
    }
    const dl = codeClient("pages/discover-location.tsx");
    assert.ok(dl.includes("<BrowseShell>"), "discover-location must render its chrome through BrowseShell");
    assert.ok(!/import\s*\{[^}]*\bLayout\b[^}]*\}\s*from\s*"@\/components\/layout"/.test(dl),
      "discover-location must not import the public Layout directly");
  });
});

describe("console grammar — negative space this suite cannot see", () => {
  it("documents the render-level guard this static suite is not", () => {
    // The brief's named guard for this lane is the Playwright screenshot of /dashboard
    // and /experts inside the shell; these pins hold the source shape that screenshot
    // depends on. If this suite passes and the screenshot shows no sidebar, the bug is
    // in the DOM gate's blind spot, not here.
    assert.ok(existsSync(join(CLIENT_SRC, "components", "browse-shell.tsx")));
  });
});
