#!/usr/bin/env node
/**
 * check-public-user-id.cjs — a PUBLIC payload names an earner by HANDLE, never by `users.id`.
 *
 * Ledger `2026-09-05-ld40-lane2-public-ids`; CLAUDE.md Locked Decision 40 (`users.id` is INTERNAL;
 * an earner's public identity is `users.handle`) and §14's read-projection clause. Node built-ins
 * only — no npm ci, no DB, so it runs as a fast standalone CI job.
 *
 * WHY THIS EXISTS
 * ───────────────
 * LD 40 was ratified with the storefront read carrying `earner.id` and a source comment saying it
 * was fine because "user ids are already public on /experts/:id and similar surfaces". That
 * reasoning is circular, and it is also how the field spread: each surface justified itself by the
 * others. Lane 1 retracted the comment, lane 3 switched every client to handle/service/booking
 * addressing, and lane 2 (this guard's lane) removed the ids. Nothing in the codebase stops the
 * next one from being added — a published id breaks no test, logs nothing and renders identically.
 *
 * THE TWO PREDICATES
 * ──────────────────
 *   (1) PROJECTION ALLOWLISTS. A `_PUBLIC_FIELDS` / `_DIRECTORY_FIELDS`-style `as const` array in
 *       `shared/schema.ts`, `server/utils/*-read-scope.ts` or `server/utils/data-sanitizer.ts`
 *       that is USERS-SHAPED may not name `id`, `userId` or `user_id`.
 *
 *       "Users-shaped" is COMPUTED, not declared: an array is users-shaped when it names at least
 *       two DISTINCTIVE `users` column names (see USERS_DISTINCTIVE). That matters — a tag someone
 *       has to remember to add is the §19 failure one layer out, and the whole point of an
 *       allowlist guard is that a list written before the guard existed is still checked. It is
 *       what makes `EXPERT_PUBLIC_FIELDS` visible here without anyone annotating it, and what
 *       keeps `VENDOR_DIRECTORY_FIELDS` — a business listing whose `id` is a vendor id, not a
 *       person — out.
 *
 *   (2) PUBLIC ROUTE / PAYLOAD-BUILDER OBJECT LITERALS. In `server/routes.ts` and
 *       `server/routes/**`, an object-literal property that publishes a user identity is a
 *       violation when it sits in PUBLIC scope:
 *         • a key in IDENTITY_KEYS (`userId`, `authorId`, `ownerId`, `otherUserId`, …) whose value
 *           is not the literal `null`; or
 *         • the key `id` whose value reads a person-shaped row (`owner.id`, `earner.id`,
 *           `expert.id`, `u.id`, …) — the storefront's exact shape.
 *
 *       PUBLIC scope is (a) a route block whose registration head carries no `isAuthenticated` /
 *       `requireAdmin` / `adminApiGuard` / `requireRole` and whose path is not under `/api/admin`,
 *       `/api/me` or `/api/auth`; or (b) the body of a payload-builder function — one named
 *       `load*` / `build*` in a route file, the convention this codebase already follows
 *       (`loadStorefront`, `buildStorefront`, `loadProviderStorefrontDirectory`). Builders are
 *       checked regardless of the routes around them, because a builder carries no auth signal of
 *       its own and the storefront leak lived in exactly one.
 *
 *       Query-shaped regions are excluded by brace-matching, not by guesswork: the argument of
 *       `.select(`, `.values(`, `.set(`, `.where(`, `.returning(`, `.onConflictDoUpdate(` and
 *       `.groupBy(` is drizzle talking to Postgres, not a response. `id: users.id` inside a
 *       `.select({...})` is how you read the column you must not publish.
 *
 * THE ESCAPE HATCH, AND WHY IT IS NOISY ON PURPOSE
 * ───────────────────────────────────────────────
 * A line may carry `public-user-id-ok: <reason>` (the `money-derive-ok` convention). Unlike that
 * one, every exemption is PRINTED on every run, pass or fail — ruling 32's second disposition, the
 * one `phase2-fee-gate.sh` applies to `fee-literal-debt`: filed debt must not become a silent
 * baseline. LD 40's remaining lane-2 debt is exactly this shape, and it should stay loud until it
 * is paid.
 *
 * NEGATIVE SPACE — what this guard does NOT cover (§18d: green means green-within-stated-bounds)
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *   • It is TEXT over object literals. A payload built by spreading a raw row (`res.json({...row})`)
 *     publishes every column and shows this guard nothing — that is precisely the class ledger
 *     `2026-09-05-experts-public-projection` recorded as having "no grep guard", and the answer
 *     there is the named projector plus its committed test, not a scan. Predicate (1) is the part
 *     of that class a scan CAN see: the allowlist the projector reads.
 *   • It says nothing about STORAGE. A reader that joins `users` and hands a full row to a route is
 *     invisible here; `getVendorsForDirectory` / `getVendorsWithCreator` and `toPublicExpert` are
 *     that layer (§14).
 *   • Predicate (2)'s auth check is a TOKEN presence check in the registration head — the same
 *     bound `check-query-userid-reads.cjs` states. A route that carries `isAuthenticated` and then
 *     serves a stranger's id is out of predicate, and so is any authorization that is not spelled
 *     with one of those four names. An AUTHENTICATED payload carrying a counterpart's user id is
 *     deliberately out of scope: LD 40's remaining lane-2 items (`ConversationSummary.otherUserId`,
 *     `?clientId=`) live there, they are tracked in CLAUDE.md, and flagging them would ship this
 *     guard RED on work it does not own.
 *   • `users.id` values reaching a client by another name — an email, a slug, a share token, a
 *     `conversationId` built from two ids (lane 1's HMAC fixed that one) — are not name-matchable
 *     and are not covered.
 *   • The client is out of scope entirely. What a page DOES with an id it was given is lane 3's
 *     `earner-address.test.ts` S-series, not this.
 *   • It reads route files only: `server/services/**`, jobs and `shared/**` (beyond predicate 1's
 *     three files) are not scanned.
 *   • Predicate (1)'s users-shaped test is a NAME heuristic over columns unique to `users`. A
 *     public projection over a person that names NONE of them — a list of `firstName`, `lastName`
 *     and `email` alone, say — is invisible to it, and so is any allowlist living outside the
 *     three files it reads. Two hits is the threshold; one is not enough, deliberately, because
 *     `handle` and `id` together describe plenty of rows that are not people.
 *
 * Run standalone:  node scripts/check-public-user-id.cjs
 * Run self-tests:  node scripts/check-public-user-id.cjs --self-test
 * Exits 0 when no violations are found; exits 1 otherwise.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ROUTES_DIR = path.join(ROOT, "server", "routes");
const MONOLITH = path.join(ROOT, "server", "routes.ts");
const SCHEMA = path.join(ROOT, "shared", "schema.ts");
const UTILS_DIR = path.join(ROOT, "server", "utils");

/** The escape hatch. Present on the offending line, with a reason after it. */
const OK_MARKER = /public-user-id-ok\s*:?\s*(.*)$/;

// ---------------------------------------------------------------------------
// Predicate 1 — projection allowlists
// ---------------------------------------------------------------------------

/**
 * Column names that belong to `users` AND TO NO OTHER TABLE in this schema. Naming two of them
 * identifies an array as a projection over the users row of a PERSON.
 *
 * The uniqueness is what makes the discriminator work, and it is why `firstName`, `lastName`,
 * `email` and `stripeAccountId` are deliberately ABSENT: `local_expert_forms` carries all four, so
 * including them made `EXPERT_APPLICATION_PUBLIC_FIELDS` — an APPLICANT'S OWN echo of their OWN
 * application row, where `id` is a form id and `userId` is their own — read as a public users
 * projection. That is not the class this guard exists for, and exempting it with the escape hatch
 * would have filed a false debt. Same reasoning keeps `VENDOR_DIRECTORY_FIELDS` (a business
 * listing, whose `id` is a vendor id) out: it names none of these.
 */
const USERS_DISTINCTIVE = new Set([
  "profileImageUrl",
  "handle",
  "homeCity",
  "emailVerified",
  "authProvider",
  "notificationEmail",
  "stripeCustomerId",
  "preferredCurrency",
  "isSuspended",
  "vacationUntil",
  "termsAcceptedAt",
  "privacyAcceptedAt",
  "emailBookingAlerts",
]);

/** Identity keys forbidden inside a users-shaped public allowlist. */
const FORBIDDEN_IN_ALLOWLIST = new Set(["id", "userId", "user_id"]);

/** `export const NAME = [ ... ] as const;` — the shape every allowlist in this codebase takes. */
const ALLOWLIST_DECL = /export\s+const\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*\[/g;

function parseAllowlists(text) {
  const out = [];
  let m;
  ALLOWLIST_DECL.lastIndex = 0;
  while ((m = ALLOWLIST_DECL.exec(text)) !== null) {
    const open = text.indexOf("[", m.index);
    const close = matchBracket(text, open, "[", "]");
    if (close < 0) continue;
    const body = text.slice(open + 1, close);
    const lineStart = text.slice(0, m.index).split("\n").length;
    const entries = [];
    // One pass over the body: a quoted string is an entry; its own line may carry the marker.
    const bodyLines = body.split("\n");
    bodyLines.forEach((raw, i) => {
      const code = raw.replace(/\/\/.*$/, "");
      const strRe = /["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g;
      let sm;
      while ((sm = strRe.exec(code)) !== null) {
        entries.push({ name: sm[1], line: lineStart + i, raw });
      }
    });
    out.push({ name: m[1], entries, line: lineStart });
  }
  return out;
}

function matchBracket(text, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function isUsersShaped(entries) {
  let hits = 0;
  const seen = new Set();
  for (const e of entries) {
    if (USERS_DISTINCTIVE.has(e.name) && !seen.has(e.name)) {
      seen.add(e.name);
      hits++;
    }
  }
  return hits >= 2;
}

function scanAllowlistFile(text, relPath) {
  const violations = [];
  const exemptions = [];
  for (const list of parseAllowlists(text)) {
    if (!isUsersShaped(list.entries)) continue;
    for (const entry of list.entries) {
      if (!FORBIDDEN_IN_ALLOWLIST.has(entry.name)) continue;
      const ok = OK_MARKER.exec(entry.raw);
      if (ok) {
        exemptions.push({
          file: relPath,
          line: entry.line,
          what: `${list.name}."${entry.name}"`,
          reason: (ok[1] || "").trim() || "(no reason given)",
        });
        continue;
      }
      violations.push({
        file: relPath,
        line: entry.line,
        kind: "users-shaped public projection allowlist names an internal id",
        text: `${list.name} includes "${entry.name}"`,
        why:
          "a public projection over a users row publishes the handle, never the id " +
          "(CLAUDE.md Locked Decision 40)",
      });
    }
  }
  return { violations, exemptions };
}

// ---------------------------------------------------------------------------
// Predicate 2 — public route / payload-builder object literals
// ---------------------------------------------------------------------------

/** Payload keys that name a person. `id` is handled separately (it needs a person-shaped value). */
const IDENTITY_KEYS = [
  "userId",
  "user_id",
  "ownerId",
  "owner_id",
  "authorId",
  "author_id",
  "expertId",
  "expertUserId",
  "providerId",
  "travelerId",
  "traveler_id",
  "creatorId",
  "createdById",
  "otherUserId",
  "curatedByExpertId",
  "localExpertId",
];

const IDENTITY_KEY_RE = new RegExp(`(^|[{,\\s])(${IDENTITY_KEYS.join("|")})\\s*:\\s*([^,}]*)`);

/**
 * `id:` whose value reads a PERSON-shaped row. Restricted to these aliases on purpose: `id: r.id`
 * on a listing row is a listing's own id, and flagging it would train people to grow the escape
 * hatch instead of reading the payload.
 */
const PERSON_ID_RE =
  /(^|[{,\s])id\s*:\s*(?:users|owner|earner|author|expert|provider|creator|seller|host|member|traveler|u|me)\s*\??\.\s*id\b/;

/**
 * A TS TYPE position, not a value. `userId: string`, `authorId: string | undefined`,
 * `id: users.id` in a `.select()` — the first two are declarations and parameter lists, which name
 * an identity without publishing one. Without this the guard flags every interface field and every
 * function signature that takes an owner, which is most of them.
 */
const TYPE_VALUE_RE = /^(?:string|number|boolean|any|unknown|null\s*\||string\s*\|)/;

/** Regions that are drizzle query arguments, not response payloads. */
const QUERY_OPENERS = [
  ".select(",
  ".values(",
  ".set(",
  ".where(",
  ".returning(",
  ".onConflictDoUpdate(",
  ".onConflictDoNothing(",
  ".groupBy(",
  ".orderBy(",
  ".having(",
];

/** Char offsets [start,end) of every drizzle-query argument region in the text. */
function queryRegions(text) {
  const regions = [];
  for (const opener of QUERY_OPENERS) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(opener, from);
      if (at < 0) break;
      const open = at + opener.length - 1; // the "(" itself
      const close = matchBracket(text, open, "(", ")");
      if (close > open) regions.push([open, close]);
      from = at + opener.length;
    }
  }
  return regions;
}

/** Line numbers (1-based) covered by any query region. */
function queryLineSet(text) {
  const regions = queryRegions(text);
  const lineOf = [];
  let line = 1;
  for (let i = 0; i < text.length; i++) {
    lineOf[i] = line;
    if (text[i] === "\n") line++;
  }
  const set = new Set();
  for (const [s, e] of regions) {
    for (let l = lineOf[s]; l <= lineOf[Math.min(e, text.length - 1)]; l++) set.add(l);
  }
  return set;
}

const ROUTE_OPENER = /\b(?:router|app)\s*\.\s*(get|post|put|patch|delete|all)\s*\(/;
const ROUTE_PATH = /(["'`])([^"'`]+)\1/;
const AUTH_TOKENS = /\b(isAuthenticated|requireAdmin|adminApiGuard|requireRole|isAdmin)\b/;

function stripComments(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return "";
  return line.replace(/\/\/.*$/, "");
}

function registrationHead(lines, i) {
  const head = [];
  for (let j = i; j < Math.min(i + 6, lines.length); j++) {
    head.push(lines[j]);
    if (/=>|\bfunction\b/.test(stripComments(lines[j]))) break;
  }
  return head;
}

/** Route paths whose family is out of predicate (2) by design — see NEGATIVE SPACE. */
function isExemptPath(routePath) {
  return (
    routePath.startsWith("/api/admin") ||
    routePath.startsWith("/api/me") ||
    routePath.startsWith("/api/auth") ||
    routePath.startsWith("/internal/")
  );
}

/** Public route blocks: [{ startLine, endLine, key }]. */
function publicRouteBlocks(text) {
  const lines = text.split("\n");
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const code = stripComments(lines[i]);
    const m = ROUTE_OPENER.exec(code);
    if (!m) continue;
    const head = registrationHead(lines, i);
    const headText = head.map(stripComments).join(" ");
    const pathMatch = ROUTE_PATH.exec(headText.slice(m.index));
    starts.push({
      index: i,
      method: m[1].toUpperCase(),
      routePath: pathMatch ? pathMatch[2] : "(unknown)",
      authed: AUTH_TOKENS.test(headText),
    });
  }
  const blocks = [];
  for (let s = 0; s < starts.length; s++) {
    const start = starts[s];
    const end = s + 1 < starts.length ? starts[s + 1].index : lines.length;
    if (start.authed || isExemptPath(start.routePath)) continue;
    blocks.push({
      startLine: start.index + 1,
      endLine: end,
      key: `${start.method} ${start.routePath}`,
    });
  }
  return blocks;
}

/** `function loadX(` / `const buildX = ` / `export async function loadX(` — payload builders. */
const BUILDER_DECL =
  /\b(?:export\s+)?(?:async\s+)?function\s+((?:load|build)[A-Za-z0-9_]*)\s*\(|\b(?:export\s+)?const\s+((?:load|build)[A-Za-z0-9_]*)\s*(?::[^=]*)?=\s*(?:async\s*)?\(/g;

/** Builder bodies as line ranges. */
function builderBlocks(text) {
  const blocks = [];
  let m;
  BUILDER_DECL.lastIndex = 0;
  while ((m = BUILDER_DECL.exec(text)) !== null) {
    const name = m[1] || m[2];
    const open = text.indexOf("{", m.index + m[0].length - 1);
    if (open < 0) continue;
    const close = matchBracket(text, open, "{", "}");
    if (close < 0) continue;
    const startLine = text.slice(0, open).split("\n").length;
    const endLine = text.slice(0, close).split("\n").length;
    blocks.push({ startLine, endLine, key: `${name}()` });
  }
  return blocks;
}

/**
 * `res.json(...)` / `res.status(n).json(...)` argument regions — the actual wire.
 */
const RES_JSON_RE = /\bres\s*(?:\.\s*status\s*\([^)]*\))?\s*\.\s*json\s*\(/g;

function responseRegionsIn(text, from, to) {
  const regions = [];
  RES_JSON_RE.lastIndex = from;
  let m;
  while ((m = RES_JSON_RE.exec(text)) !== null) {
    if (m.index >= to) break;
    const open = m.index + m[0].length - 1;
    const close = matchBracket(text, open, "(", ")");
    if (close > open) regions.push([open, close]);
    RES_JSON_RE.lastIndex = m.index + m[0].length;
  }
  return regions;
}

/**
 * The expression a `return` hands back, inside a payload builder. Covers the three shapes this
 * codebase uses: `return { ... };`, `return Promise.all(rows.map(r => ({ ... })));` and a bare
 * single-line return.
 */
function returnRegionsIn(text, from, to) {
  const regions = [];
  const re = /\breturn\b/g;
  re.lastIndex = from;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index >= to) break;
    const after = text.slice(m.index + 6, m.index + 86);
    const braceAt = after.search(/[{(]/);
    if (braceAt >= 0 && after.slice(0, braceAt).trim() === "") {
      const open = m.index + 6 + braceAt;
      const ch = text[open];
      const close = matchBracket(text, open, ch, ch === "{" ? "}" : ")");
      if (close > open) {
        regions.push([m.index, close]);
        re.lastIndex = close;
        continue;
      }
    }
    const eol = text.indexOf("\n", m.index);
    regions.push([m.index, eol < 0 ? to : eol]);
    re.lastIndex = m.index + 6;
  }
  return regions;
}

function lineOffsets(text) {
  const lineOf = new Array(text.length);
  let line = 1;
  for (let i = 0; i < text.length; i++) {
    lineOf[i] = line;
    if (text[i] === "\n") line++;
  }
  return lineOf;
}

function linesCovered(regions, lineOf, textLength) {
  const set = new Set();
  for (const [s0, e0] of regions) {
    const a = lineOf[Math.max(0, Math.min(s0, textLength - 1))];
    const b = lineOf[Math.max(0, Math.min(e0, textLength - 1))];
    for (let l = a; l <= b; l++) set.add(l);
  }
  return set;
}

function scanRouteFile(text, relPath) {
  const violations = [];
  const exemptions = [];
  const lines = text.split("\n");
  const skipLines = queryLineSet(text);
  const lineOf = lineOffsets(text);

  // Offsets of each line start, so a scope's line range becomes a char range.
  const lineStartOffset = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStartOffset.push(i + 1);
  const charRange = (scope) => {
    const a = lineStartOffset[Math.max(0, scope.startLine - 1)] ?? 0;
    const b = lineStartOffset[Math.min(scope.endLine, lineStartOffset.length - 1)] ?? text.length;
    return [a, b];
  };

  const scopes = [];
  for (const block of publicRouteBlocks(text)) {
    const [a, b] = charRange(block);
    // A public ROUTE publishes through res.json — nothing else on the block reaches a client.
    scopes.push({ key: block.key, lines: linesCovered(responseRegionsIn(text, a, b), lineOf, text.length) });
  }
  for (const block of builderBlocks(text)) {
    const [a, b] = charRange(block);
    // A payload BUILDER publishes through what it returns; it carries no auth signal of its own,
    // so it is checked regardless of the routes around it (the storefront leak lived in one).
    const regions = [...returnRegionsIn(text, a, b), ...responseRegionsIn(text, a, b)];
    scopes.push({ key: block.key, lines: linesCovered(regions, lineOf, text.length) });
  }

  const seen = new Set();
  for (const scope of scopes) {
    for (const l of scope.lines) {
      if (skipLines.has(l)) continue;
      const raw = lines[l - 1];
      if (raw === undefined) continue;
      const code = stripComments(raw);
      if (!code.trim()) continue;

      let kind = null;
      const idm = IDENTITY_KEY_RE.exec(code);
      if (idm) {
        const value = idm[3].trim().replace(/[,;]$/, "").trim();
        if (value !== "null" && !TYPE_VALUE_RE.test(value)) {
          kind = `payload key \`${idm[2]}\` publishes a user identity`;
        }
      }
      if (!kind && PERSON_ID_RE.test(code)) {
        kind = "payload key `id` publishes a person's `users.id`";
      }
      if (!kind) continue;

      const dedupe = `${relPath}:${l}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const ok = OK_MARKER.exec(raw);
      if (ok) {
        exemptions.push({
          file: relPath,
          line: l,
          what: `${scope.key} — ${code.trim()}`,
          reason: (ok[1] || "").trim() || "(no reason given)",
        });
        continue;
      }
      violations.push({
        file: relPath,
        line: l,
        kind,
        scope: scope.key,
        text: raw.trim(),
        why:
          "public payloads name an earner by HANDLE; `users.id` is internal " +
          "(CLAUDE.md Locked Decision 40)",
      });
    }
  }
  violations.sort((a, b) => a.line - b.line);
  return { violations, exemptions };
}

// ---------------------------------------------------------------------------

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

function allowlistFiles() {
  const files = [];
  if (fs.existsSync(SCHEMA)) files.push(SCHEMA);
  if (fs.existsSync(UTILS_DIR)) {
    for (const entry of fs.readdirSync(UTILS_DIR)) {
      if (/-read-scope\.ts$/.test(entry) || entry === "data-sanitizer.ts") {
        files.push(path.join(UTILS_DIR, entry));
      }
    }
  }
  return files;
}

function main() {
  const violations = [];
  const exemptions = [];

  for (const file of allowlistFiles()) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const r = scanAllowlistFile(fs.readFileSync(file, "utf-8"), rel);
    violations.push(...r.violations);
    exemptions.push(...r.exemptions);
  }

  const routes = routeFiles();
  for (const file of routes) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const r = scanRouteFile(fs.readFileSync(file, "utf-8"), rel);
    violations.push(...r.violations);
    exemptions.push(...r.exemptions);
  }

  // Exemptions print on EVERY run, pass or fail — filed debt must not become a silent baseline.
  if (exemptions.length > 0) {
    console.log(
      `[check-public-user-id] ${exemptions.length} exemption(s) in force (public-user-id-ok):`,
    );
    for (const e of exemptions) {
      console.log(`  ${e.file}:${e.line}  ${e.what}\n    reason: ${e.reason}`);
    }
    console.log("");
  }

  if (violations.length === 0) {
    console.log(
      `[check-public-user-id] OK — scanned ${routes.length} route file(s) and ` +
        `${allowlistFiles().length} projection file(s); no public payload publishes a users.id.`,
    );
    return;
  }

  console.error(`[check-public-user-id] FAIL — ${violations.length} public user-id exposure(s):\n`);
  for (const v of violations) {
    console.error(
      `  ${v.file}:${v.line}${v.scope ? `  [${v.scope}]` : ""}\n    ${v.kind}\n    ${v.text}\n    ${v.why}\n`,
    );
  }
  console.error(
    "CLAUDE.md Locked Decision 40: `users.id` is INTERNAL and an earner's PUBLIC identity is\n" +
      "`users.handle`. Address the earner by handle, the listing by `serviceId`, or the thread by\n" +
      "its opaque `conversationId` (POST /api/conversations/start). If a row has no handle, send\n" +
      "`handle: null` and render no profile link — an honest absence, never an id fallback (§13).\n" +
      "If a surface genuinely must publish one, annotate the line `public-user-id-ok: <reason>`;\n" +
      "every exemption is printed on every run, so it stays visible until it is paid off.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Self-tests (§18d): the predicate is checked against fixtures BEFORE the guard runs in CI,
// because a wrong predicate reports PASS forever and is invisible by construction.
// ---------------------------------------------------------------------------
function selfTest() {
  let failures = 0;

  const expectRoute = (label, source, expectedViolations, expectedExemptions = 0) => {
    const r = scanRouteFile(source, "fixture.ts");
    if (r.violations.length !== expectedViolations || r.exemptions.length !== expectedExemptions) {
      failures++;
      console.error(
        `  SELF-TEST FAIL (${label}): expected ${expectedViolations} violation(s)/` +
          `${expectedExemptions} exemption(s), got ${r.violations.length}/${r.exemptions.length}` +
          (r.violations.length ? ` — ${r.violations.map((v) => v.kind).join(", ")}` : ""),
      );
    }
  };

  const expectAllowlist = (label, source, expectedViolations, expectedExemptions = 0) => {
    const r = scanAllowlistFile(source, "fixture.ts");
    if (r.violations.length !== expectedViolations || r.exemptions.length !== expectedExemptions) {
      failures++;
      console.error(
        `  SELF-TEST FAIL (${label}): expected ${expectedViolations} violation(s)/` +
          `${expectedExemptions} exemption(s), got ${r.violations.length}/${r.exemptions.length}`,
      );
    }
  };

  // ── Predicate 2 ──────────────────────────────────────────────────────────
  // THE DEFECT, verbatim in shape: `loadStorefront`'s earner payload before this lane.
  expectRoute(
    "pre-fix loadStorefront earner.id (the reason this guard exists)",
    [
      "export async function loadStorefront(handle: string) {",
      "  const [owner] = await db",
      "    .select({ id: users.id, firstName: users.firstName, handle: users.handle })",
      "    .from(users);",
      "  return {",
      "    earner: {",
      "      id: owner.id,",
      "      handle: owner.handle,",
      "    },",
      "  };",
      "}",
    ].join("\n"),
    1,
  );

  // THE FIX: the handle is the identity; `owner.id` is still read INSIDE the builder.
  expectRoute(
    "post-fix loadStorefront",
    [
      "export async function loadStorefront(handle: string) {",
      "  const [owner] = await db",
      "    .select({ id: users.id, firstName: users.firstName, handle: users.handle })",
      "    .from(users);",
      "  const gems = await countGems(owner.id);",
      "  return {",
      "    earner: {",
      "      handle: owner.handle,",
      "      gems,",
      "    },",
      "  };",
      "}",
    ].join("\n"),
    0,
  );

  // A public route publishing an owner id under a named key.
  expectRoute(
    "public route payload with userId",
    [
      'app.get("/api/services/:id", async (req, res) => {',
      "  res.json({",
      "    id: service.id,",
      "    userId: service.userId,",
      "  });",
      "});",
    ].join("\n"),
    1,
  );

  // The same route, authenticated: out of predicate by design (see NEGATIVE SPACE).
  expectRoute(
    "authenticated route is out of predicate",
    [
      'app.get("/api/my-things", isAuthenticated, async (req, res) => {',
      "  res.json({ userId: row.userId });",
      "});",
    ].join("\n"),
    0,
  );

  // Admin routes ride §2's blanket guard.
  expectRoute(
    "admin route is exempt by path",
    [
      'router.get("/api/admin/conversations", async (req, res) => {',
      "  res.json({ userId: row.userId });",
      "});",
    ].join("\n"),
    0,
  );

  // A drizzle SELECT projection is not a response payload.
  expectRoute(
    "select({ id: users.id }) is not a payload",
    [
      'router.get("/api/things", async (req, res) => {',
      "  const rows = await db",
      "    .select({ id: users.id, userId: providerServices.userId })",
      "    .from(users);",
      "  res.json(rows.map((r) => ({ handle: r.handle })));",
      "});",
    ].join("\n"),
    0,
  );

  // An INSERT is a write, not a publication.
  expectRoute(
    "insert values({ userId }) is not a payload",
    [
      'router.get("/api/things", async (req, res) => {',
      "  await db.insert(things).values({ userId: someUser, note: n });",
      "  res.json({ ok: true });",
      "});",
    ].join("\n"),
    0,
  );

  // `null` is an honest absence, not an exposure (§13).
  expectRoute(
    "explicit null identity is not an exposure",
    [
      'router.get("/api/things", async (req, res) => {',
      "  res.json({ authorId: null, authorHandle: h });",
      "});",
    ].join("\n"),
    0,
  );

  // `id: r.id` on a LISTING row is the listing's own id — deliberately not matched.
  expectRoute(
    "a listing's own id is not a person's id",
    [
      'router.get("/api/things", async (req, res) => {',
      "  res.json(rows.map((r) => ({ id: r.id, title: r.title })));",
      "});",
    ].join("\n"),
    0,
  );

  // The escape hatch: exempted, and REPORTED.
  expectRoute(
    "public-user-id-ok exempts and is reported",
    [
      'router.get("/api/ready-made", async (req, res) => {',
      "  res.json({ authorId: r.authorId }); // public-user-id-ok: LD 40 lane 2 debt, see CLAUDE.md",
      "});",
    ].join("\n"),
    0,
    1,
  );

  // ── Predicate 1 ──────────────────────────────────────────────────────────
  // THE DEFECT: EXPERT_PUBLIC_FIELDS as #790 left it — users-shaped, and it names `id`.
  expectAllowlist(
    "pre-fix EXPERT_PUBLIC_FIELDS names id",
    [
      "export const EXPERT_PUBLIC_FIELDS = [",
      '  "id",',
      '  "firstName",',
      '  "lastName",',
      '  "profileImageUrl",',
      '  "handle",',
      "] as const;",
    ].join("\n"),
    1,
  );

  expectAllowlist(
    "post-fix EXPERT_PUBLIC_FIELDS",
    [
      "export const EXPERT_PUBLIC_FIELDS = [",
      '  "firstName",',
      '  "lastName",',
      '  "profileImageUrl",',
      '  "handle",',
      "] as const;",
    ].join("\n"),
    0,
  );

  // An APPLICANT'S OWN echo of their OWN `local_expert_forms` row is not a public users
  // projection: `id` is a form id, `userId` is the applicant's own, and the array names no column
  // unique to `users`. Flagging it would have filed a false debt against a self-echo.
  expectAllowlist(
    "EXPERT_APPLICATION_PUBLIC_FIELDS (a self-echo of local_expert_forms) is not users-shaped",
    [
      "export const EXPERT_APPLICATION_PUBLIC_FIELDS = [",
      '  "id", "userId", "expertType",',
      '  "firstName", "lastName", "email", "phone", "country", "city",',
      '  "status", "rejectionMessage", "createdAt",',
      "] as const;",
    ].join("\n"),
    0,
  );

  // A vendor row's `id` is a LISTING id, not a person's — and the array is not users-shaped.
  expectAllowlist(
    "VENDOR_DIRECTORY_FIELDS is not users-shaped",
    [
      "export const VENDOR_DIRECTORY_FIELDS = [",
      '  "id",',
      '  "name",',
      '  "category",',
      '  "email",',
      '  "city",',
      '  "country",',
      "] as const;",
    ].join("\n"),
    0,
  );

  // One distinctive name is not enough — the threshold is two, deliberately.
  expectAllowlist(
    "a single distinctive name does not make an array users-shaped",
    ["export const SOMETHING = [", '  "id",', '  "handle",', '  "title",', "] as const;"].join("\n"),
    0,
  );

  // The escape hatch on an allowlist entry.
  expectAllowlist(
    "allowlist exemption is reported, not failed",
    [
      "export const EXPERT_PUBLIC_FIELDS = [",
      '  "id", // public-user-id-ok: LD 40 lane 2 debt — the hire rail is still id-addressed',
      '  "profileImageUrl",',
      '  "handle",',
      "] as const;",
    ].join("\n"),
    0,
    1,
  );

  if (failures > 0) {
    console.error(`[check-public-user-id] SELF-TEST FAILED — ${failures} case(s).`);
    process.exit(1);
  }
  console.log("[check-public-user-id] self-tests OK (16 cases).");
}

if (process.argv.includes("--self-test")) selfTest();
else main();
