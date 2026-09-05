#!/usr/bin/env node
/**
 * check-query-userid-reads.cjs — a user-scoped route derives its owner from the SESSION.
 *
 * Ledger `2026-09-05-custom-venues-owner-scope`; CLAUDE.md §14 (the acting user comes from the
 * session, never from the request) applied to READS. Node built-ins only — no npm ci, no DB, so it
 * runs as a fast standalone CI job.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `GET /api/custom-venues` had no `isAuthenticated` and read `userId` off `req.query`, straight
 * into a storage reader that treated it as one OPTIONAL filter among three. No `userId` therefore
 * meant no WHERE clause: the response was every custom venue on the table — rows travelers had
 * saved with private addresses in them — to any caller at all, and a caller who did send a `userId`
 * could name anybody. It was found on a production walkthrough, not by a test: nothing 500s, nothing
 * looks wrong in a log, and the page that calls it renders perfectly either way.
 *
 * §14's existing guard (`check-money-endpoints.cjs`) covers BODY-sourced ids on MONEY routes. This
 * is the same class arriving through the query string on a plain read, which no guard watched.
 *
 * THE RULE — two predicates, both narrow
 * ──────────────────────────────────────
 *   (1) QUERY: no route handler under `server/routes.ts` or `server/routes/**` may read an
 *       OWNERSHIP identifier — `userId`, `user_id`, `ownerId`, `owner_id`, `travelerId`,
 *       `traveler_id`, `createdById`, `created_by_id`, `creatorId`, `creator_id` — from
 *       `req.query`, whether or not the route is authenticated. An authenticated route that
 *       filters by a client-chosen `userId` is still client-chosen identity; the session already
 *       says who is asking.
 *   (2) PARAMS: a route with NO `isAuthenticated` may not read one of those names from
 *       `req.params` either — the `/:userId` path shape is the same lookup wearing a different
 *       hat.
 *
 * Both predicates read DESTRUCTURED forms as well as member access, because the real defect was
 * written as `const { userId, tripId } = req.query`.
 *
 * ALLOWLISTS, and what they cost
 * ──────────────────────────────
 *   • `/api/admin/*` routes are EXEMPT: they live under the §2 blanket `requireAdmin` guard, where
 *     filtering the whole table by an arbitrary owner is the job (the content registry's `ownerId`,
 *     the audit log's `targetUserId`). The exemption is keyed on the ROUTE PATH, not the file.
 *   • Anything else needs a line in ALLOWED_PARAM_ROUTES with a reason. One entry today: the
 *     public provider-verification badge, which is a deliberately public per-user surface.
 *   • There is deliberately NO allowlist for predicate (1). Ledger `2026-09-05-vendors-read-scope`
 *     considered adding one for `GET /api/vendors`'s admin creator filter and rejected it: an
 *     allowlisted route is invisible to its predicate FOREVER, including for a later regression on
 *     that same route, so exempting the very route a lane exists to fix buys silence, not safety.
 *     The filter moved to `GET /api/admin/vendors` instead — where it is exempt by ROUTE PATH,
 *     because §2's blanket `adminApiGuard` is a real gate rather than a note in a script.
 *
 * NEGATIVE SPACE — what this guard does NOT cover (§18d: green means green-within-stated-bounds)
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *   • BODY-sourced ids are entirely outside it. `req.body.userId` on a money or ownership route is
 *     `check-money-endpoints.cjs`'s job (§14/§19), and on a non-money route nothing watches it.
 *   • It is a NAME check. A user-scoped filter called something else — `authorId`, `expertId`,
 *     `providerId`, `memberId`, `handle`, an email — is invisible, and deliberately so: those names
 *     are also how a legitimately PUBLIC feed filters by its public author (`GET /api/ready-made?
 *     authorId=`, `GET /api/booking-fee-config?expertId=`), and flagging them would train people to
 *     grow the allowlist instead of reading the route. `createdById` was in exactly that bucket
 *     when this guard landed and was named as a known unfixed site; ledger
 *     `2026-09-05-vendors-read-scope` fixed the route and moved the name IN. The four names still
 *     listed above have not moved and remain out of predicate.
 *   • It says nothing about what a route RETURNS. `GET /api/vendors` was flagged for its query
 *     read, but the worse half — a storage reader that joined `users` and published the creating
 *     account's email on every row — is not a shape any grep over route files can see. The
 *     response projection (`projectVendorForDirectory`) and the two-reader split in `storage.ts`
 *     are that layer, not this.
 *   • It says nothing about whether a flagged read is actually EXPLOITABLE, nor whether an
 *     unflagged route is safe: a route that takes no id at all and returns another user's rows
 *     because its storage reader has no owner filter is not something a text scan can see. The
 *     storage-side refusal (`getCustomVenues*` throwing on an empty owner) is that layer, not this.
 *   • It checks for the `isAuthenticated` TOKEN in the route registration, not that the middleware
 *     is mounted, correct, or that authorization follows authentication. An `isAuthenticated` route
 *     that then trusts a param is out of predicate (2) by construction — predicate (1) is the one
 *     that covers the authenticated case, and only for the query string.
 *   • Route files only: `server/services/**`, jobs, and the client are out of scope.
 *   • It catches READS of an id, not WRITES. A route that stamps `req.query.userId` onto a row is
 *     caught only because it must read it first.
 *
 * Run standalone:  node scripts/check-query-userid-reads.cjs
 * Run self-tests:  node scripts/check-query-userid-reads.cjs --self-test
 * Exits 0 when no violations are found; exits 1 otherwise.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ROUTES_DIR = path.join(ROOT, "server", "routes");
const MONOLITH = path.join(ROOT, "server", "routes.ts");

/** Ownership identifier names. Deliberately short — see NEGATIVE SPACE. */
const OWNER_NAMES = [
  "userId",
  "user_id",
  "ownerId",
  "owner_id",
  "travelerId",
  "traveler_id",
  // Added by ledger `2026-09-05-vendors-read-scope`. `GET /api/vendors` was this guard's own
  // stated blind spot: unauthenticated, `createdById` off the query string, a storage reader whose
  // "no conditions ⇒ every row" ternary made the filter optional, and a `users` JOIN that put the
  // creating account's EMAIL on every row. The name was deliberately left out when this guard
  // landed so that it would not ship RED; now that the route is fixed, the name is in.
  "createdById",
  "created_by_id",
  "creatorId",
  "creator_id",
];

const NAME_ALT = OWNER_NAMES.join("|");

/** `req.query.userId`, `req.query["userId"]`, `(req.query as any).userId`, `req.query?.userId`. */
const QUERY_MEMBER = new RegExp(
  `req\\s*\\.\\s*query\\s*(?:\\?\\.|\\.)?\\s*(?:(?:${NAME_ALT})\\b|\\[\\s*["'](?:${NAME_ALT})["']\\s*\\])`,
);
/** `const { userId, tripId } = req.query` (any position in the pattern). */
const QUERY_DESTRUCTURE = new RegExp(
  `\\{[^}]*\\b(?:${NAME_ALT})\\b[^}]*\\}\\s*=\\s*req\\s*\\.\\s*query\\b`,
);
/** The same two shapes over `req.params`. */
const PARAMS_MEMBER = new RegExp(
  `req\\s*\\.\\s*params\\s*(?:\\?\\.|\\.)?\\s*(?:(?:${NAME_ALT})\\b|\\[\\s*["'](?:${NAME_ALT})["']\\s*\\])`,
);
const PARAMS_DESTRUCTURE = new RegExp(
  `\\{[^}]*\\b(?:${NAME_ALT})\\b[^}]*\\}\\s*=\\s*req\\s*\\.\\s*params\\b`,
);

/**
 * A route registration OPENER: `router.get(` / `app.get(`, with or without the path on the same
 * line — both styles are used in this codebase (`server/routes/expert-workspace.routes.ts` wraps
 * nearly every one), and a scanner that only understood the single-line form would silently skip
 * the wrapped ones.
 */
const ROUTE_OPENER = /\b(?:router|app)\s*\.\s*(get|post|put|patch|delete|all)\s*\(/;
/** The first quoted string after the opener is the route path. */
const ROUTE_PATH = /(["'`])([^"'`]+)\1/;

/**
 * Deliberately public per-user surfaces. `"<METHOD> <path>": "<reason>"`.
 * A new entry is a decision, not a formality — say why the surface is public.
 */
const ALLOWED_PARAM_ROUTES = {
  "GET /api/providers/:userId/public-verification":
    "Public verification badge on the service-detail page: returns only the two public verification " +
    "booleans plus the storefront handle/role/display name already printed on every listing card. " +
    "No user-owned private rows, so a session would gate nothing.",
};

/** Route paths under the §2 blanket admin guard. */
function isAdminPath(routePath) {
  return routePath.startsWith("/api/admin");
}

/**
 * Removes TS casts and parentheses so `(req.query as any)?.ownerId` reads the same as
 * `req.query.ownerId`. The cast form is how most of this codebase spells a query read, so a
 * predicate that could not see through it would have been blind to the majority of real sites.
 */
function normalize(code) {
  return code.replace(/\bas\s+[A-Za-z_$][\w.$<>[\]]*/g, "").replace(/[()]/g, "");
}

function stripComments(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return "";
  return line.replace(/\/\/.*$/, "");
}

/**
 * The registration HEAD: from the opener up to and including the line that starts the handler
 * (`=>` or `function`), capped at 6 lines. This is where the path and the middleware list live in
 * both the single-line and the wrapped style, and stopping at the handler keeps a body line that
 * merely mentions `isAuthenticated` from reading as a gate.
 */
function registrationHead(lines, i) {
  const head = [];
  for (let j = i; j < Math.min(i + 6, lines.length); j++) {
    head.push(lines[j]);
    if (/=>|\bfunction\b/.test(stripComments(lines[j]))) break;
  }
  return head;
}

/**
 * Splits a file into route blocks: everything from one route registration up to (but not
 * including) the next one. Text before the first registration belongs to no route.
 */
function routeBlocks(text) {
  const lines = text.split("\n");
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const code = stripComments(lines[i]);
    const m = ROUTE_OPENER.exec(code);
    if (!m) continue;
    const head = registrationHead(lines, i);
    const pathMatch = ROUTE_PATH.exec(head.map(stripComments).join(" ").slice(m.index));
    starts.push({
      index: i,
      method: m[1].toUpperCase(),
      // No quoted path in the head means the route is registered from a variable — recorded as
      // "(unknown)", which is never an admin path and never allowlisted, so it stays IN scope.
      routePath: pathMatch ? pathMatch[2] : "(unknown)",
      head,
    });
  }
  const blocks = [];
  for (let s = 0; s < starts.length; s++) {
    const start = starts[s];
    const end = s + 1 < starts.length ? starts[s + 1].index : lines.length;
    blocks.push({
      ...start,
      lines: lines.slice(start.index, end),
      startLine: start.index + 1,
    });
  }
  return blocks;
}

/**
 * `isAuthenticated` anywhere in the registration head (single-line or wrapped middleware list).
 * A presence check on the TOKEN — see NEGATIVE SPACE.
 */
function blockIsAuthenticated(block) {
  return /\bisAuthenticated\b/.test(block.head.map(stripComments).join(" "));
}

/** Every violation inside one route block. */
function scanBlock(block, relPath) {
  const out = [];
  const authed = blockIsAuthenticated(block);
  const admin = isAdminPath(block.routePath);
  const key = `${block.method} ${block.routePath}`;
  const paramAllowed = Object.prototype.hasOwnProperty.call(ALLOWED_PARAM_ROUTES, key);

  block.lines.forEach((raw, i) => {
    const code = normalize(stripComments(raw));
    if (!code) return;
    const line = block.startLine + i;

    if (!admin && (QUERY_MEMBER.test(code) || QUERY_DESTRUCTURE.test(code))) {
      out.push({
        file: relPath,
        line,
        route: key,
        kind: "query-sourced owner id",
        text: raw.trim(),
        why: authed
          ? "authenticated, but the owner is still chosen by the caller — read it from the session"
          : "unauthenticated route filtering by a caller-supplied owner id",
      });
    }

    if (!admin && !authed && !paramAllowed && (PARAMS_MEMBER.test(code) || PARAMS_DESTRUCTURE.test(code))) {
      out.push({
        file: relPath,
        line,
        route: key,
        kind: "param-sourced owner id on an unauthenticated route",
        text: raw.trim(),
        why: "no isAuthenticated on this route — either gate it or allowlist it as deliberately public",
      });
    }
  });

  return out;
}

function routeFiles() {
  const files = [];
  if (fs.existsSync(MONOLITH)) files.push(MONOLITH);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === "__tests__") continue;
        walk(full);
      } else if (/\.ts$/.test(entry) && !/\.(test|spec)\.ts$/.test(entry)) {
        files.push(full);
      }
    }
  };
  if (fs.existsSync(ROUTES_DIR)) walk(ROUTES_DIR);
  return files;
}

function main() {
  const files = routeFiles();
  const violations = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const text = fs.readFileSync(file, "utf-8");
    for (const block of routeBlocks(text)) {
      violations.push(...scanBlock(block, rel));
    }
  }

  if (violations.length === 0) {
    console.log(
      `[check-query-userid-reads] OK — scanned ${files.length} route file(s); no query/param-sourced owner ids found.`,
    );
    return;
  }

  console.error(
    `[check-query-userid-reads] FAIL — ${violations.length} caller-supplied owner id read(s):\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.route}]\n    ${v.kind}: ${v.why}\n    ${v.text}\n`);
  }
  console.error(
    "CLAUDE.md §14 applies to READS: a list or detail route whose rows are user-owned derives the\n" +
      "owner from the SESSION (getUserId(req)) and never from req.query / req.params. Ignore any\n" +
      "owner id in the query rather than trusting it. If the surface is deliberately PUBLIC, add it\n" +
      "to ALLOWED_PARAM_ROUTES in scripts/check-query-userid-reads.cjs with a reason. If the filter\n" +
      "is genuinely an ADMIN control, move the route under /api/admin/* — where §2's blanket\n" +
      "adminApiGuard is a real gate — rather than exempting it here (ledger\n" +
      "2026-09-05-vendors-read-scope).",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Self-tests (§18d): the predicate is checked against fixtures BEFORE the guard runs in CI, because
// a wrong predicate reports PASS forever and is invisible by construction.
// ---------------------------------------------------------------------------
function selfTest() {
  let failures = 0;
  const expect = (label, source, expectedCount) => {
    const found = [];
    for (const block of routeBlocks(source)) found.push(...scanBlock(block, "fixture.ts"));
    if (found.length !== expectedCount) {
      failures++;
      console.error(
        `  SELF-TEST FAIL (${label}): expected ${expectedCount} violation(s), got ${found.length}` +
          (found.length ? ` — ${found.map((f) => f.kind).join(", ")}` : ""),
      );
    }
  };

  // THE DEFECT, verbatim in shape: unauthenticated list route destructuring userId off req.query.
  expect(
    "pre-fix custom-venues list (the reason this guard exists)",
    [
      'router.get("/api/custom-venues", async (req, res) => {',
      "  const { userId, tripId, experienceType } = req.query;",
      "  const { venues } = await storage.getCustomVenuesPage(userId, tripId, experienceType);",
      "  res.json(venues);",
      "});",
    ].join("\n"),
    1,
  );

  // THE FIX: session-derived owner, query userId gone.
  expect(
    "post-fix custom-venues list",
    [
      'router.get("/api/custom-venues", isAuthenticated, async (req, res) => {',
      "  const userId = getUserId(req);",
      "  const { tripId, experienceType } = req.query;",
      "  const { venues } = await storage.getCustomVenuesPage(userId, tripId, experienceType);",
      "});",
    ].join("\n"),
    0,
  );

  // Authenticated is NOT enough: a client-chosen owner is still client-chosen.
  expect(
    "authenticated route filtering by req.query.userId",
    [
      'router.get("/api/things", isAuthenticated, async (req, res) => {',
      "  const rows = await storage.getThings(req.query.userId as string);",
      "});",
    ].join("\n"),
    1,
  );

  // Bracket and cast spellings.
  expect(
    "bracket access",
    ['router.get("/api/things", async (req, res) => {', '  const id = req.query["user_id"];', "});"].join("\n"),
    1,
  );
  expect(
    "cast + optional access",
    ['router.get("/api/things", async (req, res) => {', "  const id = (req.query as any)?.ownerId;", "});"].join("\n"),
    1,
  );

  // Admin routes are exempt (§2 blanket guard).
  expect(
    "admin route filtering by ownerId",
    [
      'router.get("/api/admin/content/registry", isAuthenticated, async (req, res) => {',
      "  const { status, ownerId } = req.query;",
      "});",
    ].join("\n"),
    0,
  );

  // Params: unauthenticated is a violation, authenticated is out of predicate (2).
  expect(
    "unauthenticated /:userId route",
    ['router.get("/api/things/:userId", async (req, res) => {', "  const f = await storage.getThing(req.params.userId);", "});"].join("\n"),
    1,
  );
  expect(
    "authenticated /:userId route (self-gated elsewhere)",
    [
      'router.get("/api/invite-templates/user/:userId", isAuthenticated, async (req, res) => {',
      "  const requested = req.params.userId;",
      "});",
    ].join("\n"),
    0,
  );
  expect(
    "allowlisted public per-user surface",
    [
      'app.get("/api/providers/:userId/public-verification", async (req, res) => {',
      "  const form = await storage.getServiceProviderForm(req.params.userId);",
      "});",
    ].join("\n"),
    0,
  );

  // Names that are deliberately NOT owner ids (public author filters) — stated negative space.
  expect(
    "public author filter (authorId) is not flagged",
    ['router.get("/api/ready-made", async (req, res) => {', "  const authorId = req.query.authorId;", "});"].join("\n"),
    0,
  );

  // ── ledger `2026-09-05-vendors-read-scope`: `createdById` joined the ownership names ──────────

  // THE DEFECT, verbatim: the pre-fix `GET /api/vendors` as it stood on origin/main. Nothing
  // exempts this route, so the same predicate that fails here also fails the real pre-fix
  // `routes.ts` — the file-level RED proof recorded in the ledger row. This is the copy that runs
  // on every push.
  expect(
    "pre-fix vendors list (unauthenticated, createdById off the query, users JOIN behind it)",
    [
      'app.get("/api/vendors", async (req, res) => {',
      "  const { category, city, createdById } = req.query;",
      "  const vendorList = await storage.getVendors(",
      "    category as string | undefined,",
      "    city as string | undefined,",
      "    createdById as string | undefined,",
      "  );",
      "  res.json(vendorList);",
      "});",
    ].join("\n"),
    1,
  );

  // The snake and `creatorId` spellings of the same idea.
  expect(
    "created_by_id / creatorId spellings",
    [
      'router.get("/api/things", async (req, res) => {',
      '  const a = req.query["created_by_id"];',
      "  const b = (req.query as any).creatorId;",
      "  const c = req.query.creator_id;",
      "});",
    ].join("\n"),
    3,
  );

  // THE FIX: the creator filter moved to an `/api/admin/*` path, where filtering the whole table
  // by an arbitrary creator is the surface's job and the §2 blanket guard is the real gate. The
  // browse route beside it reads no creator id at all.
  expect(
    "post-fix vendors pair (browse reads no creator id; the filter lives on the admin path)",
    [
      'app.get("/api/vendors", isAuthenticated, async (req, res) => {',
      "  const { category, city } = req.query;",
      "  const vendorList = await storage.getVendorsForDirectory(category, city);",
      "});",
      'app.get("/api/admin/vendors", isAuthenticated, async (req, res) => {',
      "  const { category, city, createdById } = req.query;",
      "  const vendorList = await storage.getVendorsWithCreator(category, city, createdById);",
      "});",
    ].join("\n"),
    0,
  );

  // A comment mentioning the shape is not a read.
  expect(
    "comment-only mention",
    ['router.get("/api/things", async (req, res) => {', "  // never read req.query.userId here", "});"].join("\n"),
    0,
  );

  // A violation is attributed to the route it sits in, not the previous one.
  expect(
    "two routes, only the second offends",
    [
      'router.get("/api/safe", isAuthenticated, async (req, res) => {',
      "  const userId = getUserId(req);",
      "});",
      'router.get("/api/unsafe", async (req, res) => {',
      "  const { userId } = req.query;",
      "});",
    ].join("\n"),
    1,
  );

  // Wrapped middleware list: isAuthenticated on the following line still counts.
  expect(
    "wrapped registration",
    [
      'router.get(',
      '  "/api/things/:userId",',
      "  isAuthenticated,",
      "  async (req, res) => {",
      "    const id = req.params.userId;",
      "  },",
      ");",
    ].join("\n"),
    0,
  );

  if (failures > 0) {
    console.error(`[check-query-userid-reads] self-test FAILED (${failures})`);
    process.exit(1);
  }
  console.log("[check-query-userid-reads] self-test OK");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  main();
}
