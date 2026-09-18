/**
 * robots-txt.ts — the ONE robots.txt fetch/parse/consult module (§18 rule 1).
 *
 * Ledger `2026-09-18-scraper-robots`: business plan v1.4 §4 said robots.txt
 * enforcement was built; it was not. `DMOSourceRegistry.respectRobotsTxt`
 * (`server/content/providers/DMOSourceRegistry.ts`) existed and was read by
 * nothing, and the affiliate scraper's ONE page fetch
 * (`server/services/affiliate-scraper.service.ts`) never consulted robots.txt
 * at all and presented a spoofed desktop-Chrome User-Agent — a site could never
 * name us in its own robots.txt because we never told it who we were.
 *
 * Two exports carry the whole module:
 *   - `fetchRobotsRules(origin, deps)` — fetches and parses an origin's
 *     robots.txt, THROUGH the egress guard (`assertSafeEgressUrl`), cached
 *     per-origin in-process for `ROBOTS_TXT_CACHE_TTL_MS`. Never throws: a
 *     network error, a 5xx, a 404, or a parse failure all resolve to
 *     `{ groups: [] }` (no restriction found), because a robots.txt this
 *     module cannot read imposes no restriction on the request it is asked
 *     about (the standard's own posture) — the DIFFERENCE between those
 *     outcomes is only in whether a warning was logged (see below).
 *   - `isPathAllowed(rules, path, userAgent)` — pure, synchronous: standard
 *     longest-match Allow/Disallow semantics within the most specific matching
 *     User-agent group (else `*`).
 *
 * ── STATED NEGATIVE SPACE (§18d posture: green means green-within-these-bounds) ──
 *   • Only ONE robots.txt group per distinct User-agent token is honoured — a
 *     robots.txt with two NON-CONSECUTIVE blocks naming the same token (an
 *     unusual, technically-invalid-by-convention shape) has its rules taken
 *     from the FIRST such block only, never merged across both. Consecutive
 *     `User-agent:` lines immediately above one rule block are merged, which
 *     is the shape every real robots.txt in the wild actually uses.
 *   • `Crawl-delay`, `Sitemap`, `Host` and any other non-Allow/Disallow
 *     directive are read and ignored — this module answers exactly one
 *     question (may this path be fetched), never a rate limit or a sitemap.
 *   • Redirects on the robots.txt fetch itself are followed up to
 *     `MAX_EGRESS_REDIRECTS` hops, each hop re-entering the SAME egress guard
 *     with the SAME origin-derived allowlist as the first — a redirect to a
 *     different registrable domain is refused exactly as the page fetch would
 *     refuse it, never silently followed.
 *   • This module does not itself decide what "unreachable" should mean for
 *     the CALLER's own request — every caller still treats "no restriction
 *     found" as allowed. It is the caller's job to log or not; this module
 *     logs its OWN fetch-layer outcome once per origin per cache fill.
 */
import {
  EgressBlockedError,
  MAX_EGRESS_REDIRECTS,
  assertSafeEgressUrl,
  normalizeHost,
  type EgressResolver,
} from "./egress-guard";
import {
  ROBOTS_TXT_CACHE_TTL_MS,
  ROBOTS_TXT_FETCH_TIMEOUT_MS,
  ROBOTS_TXT_MAX_BYTES,
  ROBOTS_TXT_USER_AGENT,
} from "../config/robots-txt.config";

const ROBOTS_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface RobotsLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void;
}

const consoleRobotsLogger: RobotsLogger = {
  warn: (message, meta) => console.warn(message, meta ?? {}),
};

export interface RobotsFetchDeps {
  /** Injected for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to the OS resolver (via the egress guard). */
  resolve?: EgressResolver;
  /** Injected for tests; defaults to `Date.now`. */
  now?: () => number;
  /** Injected for tests; defaults to `console.warn`. */
  logger?: RobotsLogger;
}

interface RobotsRule {
  /** The raw pattern text, kept for longest-match length comparison. */
  pattern: string;
  allow: boolean;
  regex: RegExp;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

/**
 * The parsed shape `fetchRobotsRules` returns and `isPathAllowed` reads.
 * `groups: []` is the SAME shape for "no robots.txt", "robots.txt unreachable",
 * "robots.txt was empty" and "robots.txt failed to parse" — all four mean "no
 * restriction found", which is exactly what `isPathAllowed` should answer `true`
 * for. The outcomes differ only in what `fetchRobotsRules` logs on the way
 * there, never in the value it returns.
 */
export interface RobotsRules {
  groups: RobotsGroup[];
}

const EMPTY_RULES: RobotsRules = { groups: [] };

/** ch → its regex-escaped form, or itself when it needs no escaping. */
function escapeRegexChar(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * Compiles a robots.txt pattern (`*` = any run of characters, a trailing `$` =
 * end-of-string anchor, everything else literal) into a regex that matches a
 * path PREFIXED by the pattern — the standard's own semantics.
 */
function compilePattern(pattern: string): RegExp {
  const hasEndAnchor = pattern.endsWith("$");
  const body = hasEndAnchor ? pattern.slice(0, -1) : pattern;
  let source = "^";
  for (const ch of body) {
    source += ch === "*" ? ".*" : escapeRegexChar(ch);
  }
  if (hasEndAnchor) source += "$";
  return new RegExp(source);
}

/** Strips a robots.txt `#` comment (unconditional — no escaping in the format). */
function stripComment(line: string): string {
  const hashIndex = line.indexOf("#");
  return hashIndex === -1 ? line : line.slice(0, hashIndex);
}

/**
 * Parses robots.txt body text into groups. Never throws — an unparseable or
 * empty file simply yields no groups (allowed), matching the standard's
 * "malformed robots.txt ⇒ proceed as if none existed" posture.
 *
 * Group-forming rule (RFC 9309 §2.2): one or more CONSECUTIVE `User-agent:`
 * lines open a group; the rule lines that follow, up to the next
 * non-consecutive `User-agent:` line, belong to every agent named in that
 * run. A rule line before any `User-agent:` line is ignored (no group to
 * attach it to).
 */
export function parseRobotsTxt(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue; // not a "field: value" line — ignore it

    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!value) continue;
      if (current && lastLineWasAgent) {
        current.agents.push(value);
      } else {
        current = { agents: [value], rules: [] };
        groups.push(current);
      }
      lastLineWasAgent = true;
      continue;
    }

    lastLineWasAgent = false;
    if (!current) continue; // a rule with no group open yet — ignored

    if (field === "disallow") {
      // An empty Disallow value means "allow all" — the standard's own
      // no-op, so we add no rule at all rather than a zero-length one.
      if (!value) continue;
      current.rules.push({ pattern: value, allow: false, regex: compilePattern(value) });
    } else if (field === "allow") {
      if (!value) continue;
      current.rules.push({ pattern: value, allow: true, regex: compilePattern(value) });
    }
    // Crawl-delay / Sitemap / Host / anything else: read and ignored (stated
    // negative space above — this module answers one question only).
  }

  return groups;
}

/** The product token before the first "/", the same derivation the config uses. */
function extractProductToken(userAgent: string): string {
  const trimmed = userAgent.trim();
  const slash = trimmed.indexOf("/");
  return (slash === -1 ? trimmed : trimmed.slice(0, slash)).trim();
}

/**
 * The most specific matching User-agent group: an EXACT case-insensitive
 * product-token match, else the `*` group, else none (⇒ allowed).
 */
function selectGroup(groups: RobotsGroup[], userAgent: string): RobotsGroup | null {
  const token = extractProductToken(userAgent).toLowerCase();
  const exact = groups.find((group) => group.agents.some((agent) => agent.toLowerCase() === token));
  if (exact) return exact;
  return groups.find((group) => group.agents.some((agent) => agent === "*")) ?? null;
}

/**
 * Standard longest-match: within the selected group, the rule whose pattern is
 * the LONGEST match against `path` wins; an Allow and a Disallow of equal
 * length resolve to Allow (the standard's own tie-break). No matching rule at
 * all, or no matching group at all, is ALLOWED — robots.txt only ever narrows
 * from a default of "everything is allowed".
 */
export function isPathAllowed(rules: RobotsRules, path: string, userAgent: string): boolean {
  const group = selectGroup(rules.groups, userAgent);
  if (!group || group.rules.length === 0) return true;

  const target = path.startsWith("/") ? path : `/${path}`;
  let best: RobotsRule | null = null;
  for (const rule of group.rules) {
    if (!rule.regex.test(target)) continue;
    if (!best) {
      best = rule;
    } else if (rule.pattern.length > best.pattern.length) {
      best = rule;
    } else if (rule.pattern.length === best.pattern.length && rule.allow && !best.allow) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

type RobotsFetchOutcome =
  | { kind: "fetched"; text: string }
  | { kind: "not_found" }
  | { kind: "unreachable"; reason: string };

/**
 * The raw fetch of ONE origin's `/robots.txt`, through the SAME SSRF guard the
 * page fetch itself uses (`assertSafeEgressUrl`) — a redirect hop that leaves
 * the origin's own registrable domain is refused exactly as it would be for
 * the page fetch, never silently followed. Never throws.
 */
async function fetchRobotsTxtOnce(
  robotsUrl: string,
  host: string,
  deps: RobotsFetchDeps,
): Promise<RobotsFetchOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  let current = robotsUrl;

  for (let hop = 0; hop <= MAX_EGRESS_REDIRECTS; hop++) {
    let safeUrl: URL;
    try {
      safeUrl = await assertSafeEgressUrl(current, { allowedHosts: [host], resolve: deps.resolve });
    } catch (error) {
      const reason = error instanceof EgressBlockedError ? error.reason : "invalid_url";
      return { kind: "unreachable", reason: `egress_blocked:${reason}` };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ROBOTS_TXT_FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(safeUrl.toString(), {
        method: "GET",
        headers: { "User-Agent": ROBOTS_TXT_USER_AGENT, Accept: "text/plain,*/*;q=0.5" },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error: any) {
      return { kind: "unreachable", reason: `fetch_error:${error?.message ?? "unknown"}` };
    } finally {
      clearTimeout(timer);
    }

    if (ROBOTS_REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers?.get?.("location");
      if (!location) return { kind: "unreachable", reason: `redirect_no_location:${response.status}` };
      try {
        current = new URL(location, safeUrl).toString();
      } catch {
        return { kind: "unreachable", reason: "redirect_invalid_location" };
      }
      continue; // next iteration re-enters assertSafeEgressUrl for the new hop
    }

    if (response.status === 404) return { kind: "not_found" };

    if (response.status < 200 || response.status >= 300) {
      return { kind: "unreachable", reason: `http_status:${response.status}` };
    }

    let text: string;
    try {
      const full = await response.text();
      text = full.length > ROBOTS_TXT_MAX_BYTES ? full.slice(0, ROBOTS_TXT_MAX_BYTES) : full;
    } catch (error: any) {
      return { kind: "unreachable", reason: `body_read_error:${error?.message ?? "unknown"}` };
    }
    return { kind: "fetched", text };
  }

  return { kind: "unreachable", reason: "redirect_limit" };
}

const robotsCache = new Map<string, { rules: RobotsRules; expiresAt: number }>();

/** Test-only: clears the process-lifetime cache so tests never leak state into one another. */
export function resetRobotsCacheForTests(): void {
  robotsCache.clear();
}

/**
 * Fetches and parses `origin`'s robots.txt, cached per-origin for
 * `ROBOTS_TXT_CACHE_TTL_MS`. Never throws.
 *
 * Logging posture: a robots.txt that is genuinely UNREACHABLE (network error,
 * a non-404 4xx, a 5xx, or a redirect that could not be followed safely) is
 * logged with `logger.warn` — it is allowed, but it is worth an operator's
 * attention. A clean 404 ("this site has no robots.txt") is NOT logged — it is
 * the ordinary, expected way for a robots.txt to be absent. A parse failure
 * (should not normally occur; the parser tolerates malformed lines) is also
 * logged, distinctly.
 */
export async function fetchRobotsRules(origin: string, deps: RobotsFetchDeps = {}): Promise<RobotsRules> {
  const now = deps.now ?? Date.now;
  const logger = deps.logger ?? consoleRobotsLogger;

  let normalizedOrigin: string;
  let host: string;
  try {
    const parsed = new URL(origin);
    normalizedOrigin = parsed.origin;
    host = normalizeHost(parsed.hostname);
  } catch {
    return EMPTY_RULES;
  }
  if (!host) return EMPTY_RULES;

  const nowMs = now();
  const cached = robotsCache.get(normalizedOrigin);
  if (cached && cached.expiresAt > nowMs) {
    return cached.rules;
  }

  const outcome = await fetchRobotsTxtOnce(`${normalizedOrigin}/robots.txt`, host, deps);

  let rules: RobotsRules;
  if (outcome.kind === "fetched") {
    try {
      rules = { groups: parseRobotsTxt(outcome.text) };
    } catch (error) {
      logger.warn("[robots-txt] failed to parse robots.txt; treating as no restrictions", {
        origin: normalizedOrigin,
        error: error instanceof Error ? error.message : String(error),
      });
      rules = EMPTY_RULES;
    }
  } else if (outcome.kind === "not_found") {
    rules = EMPTY_RULES;
  } else {
    logger.warn("[robots-txt] robots.txt unreachable; treating as no restrictions", {
      origin: normalizedOrigin,
      reason: outcome.reason,
    });
    rules = EMPTY_RULES;
  }

  robotsCache.set(normalizedOrigin, { rules, expiresAt: nowMs + ROBOTS_TXT_CACHE_TTL_MS });
  return rules;
}

/**
 * Thrown by a caller (never by this module) when `isPathAllowed` refused a
 * target. Kept separate from `EgressBlockedError` — a robots.txt refusal is a
 * courtesy this platform chose to honour, not an SSRF/security refusal — but
 * carries the same "refused before any content request left the server, and
 * the message never carries anything beyond the path/origin already public in
 * the request itself" shape, so a route can answer it the same way (a 4xx, not
 * a 500).
 */
export class RobotsDisallowedError extends Error {
  readonly reason = "robots_disallow" as const;
  readonly origin: string;
  readonly path: string;

  constructor(origin: string, path: string, userAgent: string) {
    super(`robots.txt disallows "${path}" for "${userAgent}" at ${origin}.`);
    this.name = "RobotsDisallowedError";
    this.origin = origin;
    this.path = path;
  }
}

/**
 * Convenience wrapper: fetch `origin`'s rules and throw `RobotsDisallowedError`
 * if `path` is disallowed for `userAgent`. Callers that already hold a
 * `RobotsRules` value (e.g. checking several paths on one origin) should call
 * `fetchRobotsRules` once and then `isPathAllowed` directly instead of this.
 */
export async function assertRobotsAllowed(
  url: string,
  userAgent: string,
  deps: RobotsFetchDeps = {},
): Promise<void> {
  const parsed = new URL(url); // let an unparseable url throw its own natural error
  const rules = await fetchRobotsRules(parsed.origin, deps);
  const path = parsed.pathname || "/";
  if (!isPathAllowed(rules, path, userAgent)) {
    throw new RobotsDisallowedError(parsed.origin, path, userAgent);
  }
}
