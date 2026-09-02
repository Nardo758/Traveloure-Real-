/**
 * egress-guard.ts — SSRF guard for server-side outbound fetches on a URL that
 * came out of a database row somebody can write.
 *
 * Ledger: `2026-09-02-outbound-fetch-egress`. Audit of record:
 * `docs/findings/SECURITY_AUDIT_2026-09-01.md` §2 (the affiliate scraper's
 * `fetchWebPage` was a bare `fetch()` on `partner.scrapeConfig.productListUrl ||
 * partner.websiteUrl` — no scheme allowlist, no private-CIDR deny, no redirect
 * cap — and the response was fed to an LLM whose extraction is readable back
 * through the product feeds, so it was an exfiltration channel and not a blind
 * probe).
 *
 * Four layers, in this order, and the order is load-bearing — nothing is fetched
 * before all four have passed for that exact URL:
 *   1. scheme allowlist (http/https only — no file:, ftp:, gopher:, data:);
 *   2. host allowlist DERIVED FROM THE OWNING ROW (never a config literal and
 *      never an env var — the allowlist has to be as narrow as the row, or a
 *      row-writer just picks a different allowlisted target);
 *   3. address deny on the RESOLVED addresses (loopback, RFC1918, link-local
 *      incl. the 169.254.169.254 metadata address, CGNAT, multicast, reserved,
 *      and the IPv6 equivalents including the ::ffff: IPv4-mapped forms). A raw
 *      IP literal goes through the same classifier;
 *   4. a redirect cap where EVERY hop re-enters layers 1–3 — an allowlisted host
 *      that 302s to 169.254.169.254 is the standard bypass.
 *
 * ── STATED NEGATIVE SPACE (§18d posture: green means green-within-these-bounds) ──
 *   • **DNS rebinding is NOT covered.** The check resolves the hostname and then
 *     hands the *hostname* to `fetch`, which resolves it again; a resolver that
 *     answers public-then-private between those two moments defeats layer 3.
 *     Closing it needs connect-time pinning (a custom agent that dials the
 *     validated address with the Host header preserved), which is a bigger
 *     change than this finding and is deliberately not bundled.
 *   • `registrableDomain` uses a SMALL embedded multi-part-suffix list, not the
 *     full Public Suffix List. An unlisted multi-part suffix collapses to its
 *     last two labels, which is over-permissive *within that suffix only* — it
 *     can never widen past the partner row's own TLD+1.
 *   • The byte cap is a cap on what is READ, not a promise about what the peer
 *     sent; the timeout is per hop, not per chain.
 *   • Nothing here says anything about what the fetched CONTENT is allowed to do
 *     downstream — that is the LLM-extraction path's problem, not this module's.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type EgressBlockReason =
  | "invalid_url"
  | "scheme_not_allowed"
  | "host_not_allowed"
  | "no_allowed_hosts"
  | "dns_resolution_failed"
  | "unresolvable_host"
  | "blocked_address"
  | "redirect_limit";

/**
 * Typed so a route can turn a guard refusal into a 400 ("you pointed this at
 * something it may not fetch") instead of a 500 ("the scrape broke"). Never
 * carries the resolved address — only the CATEGORY it fell into.
 */
export class EgressBlockedError extends Error {
  readonly code = "EGRESS_BLOCKED";
  readonly reason: EgressBlockReason;

  constructor(reason: EgressBlockReason, message: string) {
    super(message);
    this.name = "EgressBlockedError";
    this.reason = reason;
  }
}

export type EgressResolver = (hostname: string) => Promise<string[]>;

/** Default resolver: every address the OS resolver returns, not just the first. */
export const defaultEgressResolver: EgressResolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
};

export const MAX_EGRESS_REDIRECTS = 3;
export const MAX_EGRESS_RESPONSE_BYTES = 2 * 1024 * 1024;
export const EGRESS_TIMEOUT_MS = 15_000;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Multi-part public suffixes common enough to matter. NOT the Public Suffix
 * List — see the negative space at the top of the file.
 */
const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "me.uk", "ac.uk", "gov.uk", "net.uk", "sch.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "id.au",
  "co.nz", "net.nz", "org.nz", "govt.nz",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
  "com.br", "com.mx", "com.ar", "com.co", "com.pe", "com.ec", "com.uy", "com.ve",
  "com.tr", "com.cn", "net.cn", "org.cn", "gov.cn",
  "co.in", "net.in", "org.in", "co.za", "co.kr", "co.il", "co.ke", "co.th", "co.id",
  "com.sg", "com.hk", "com.tw", "com.my", "com.ph", "com.vn", "com.pk", "com.bd",
  "com.sa", "com.eg", "com.ng", "com.pl", "com.ua", "com.ru", "com.es", "com.pt",
  "com.gr", "com.cy", "com.mt", "com.do", "com.gt", "com.bo", "com.py",
]);

/** Strip the brackets a WHATWG URL puts around an IPv6 literal host. */
function unbracket(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

export function normalizeHost(host: string): string {
  return unbracket(String(host || "").trim().toLowerCase()).replace(/\.+$/, "");
}

/**
 * TLD+1 for a hostname (or the literal itself, for an IP). Returns null when a
 * registrable domain cannot be derived — a bare TLD, an empty host, or a
 * multi-part suffix with nothing registered under it. A null NEVER becomes an
 * empty allowlist that silently permits things; callers must treat it as a
 * refusal (§13: an underivable answer is omitted, never guessed).
 */
export function registrableDomain(host: string): string | null {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  if (isIP(normalized)) return normalized;

  const labels = normalized.split(".").filter((label) => label.length > 0);
  if (labels.length !== normalized.split(".").length) return null; // empty label => malformed
  if (labels.length < 2) return null;

  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) {
    if (labels.length < 3) return null;
    return labels.slice(-3).join(".");
  }
  return lastTwo;
}

function parseIpv4(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  const octets = address.split(".").map((part) => Number(part));
  return octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? octets
    : null;
}

/** Expand any IPv6 spelling (incl. `::`, embedded IPv4, zone id) to 8 groups. */
function parseIpv6(address: string): number[] | null {
  const zoneAt = address.indexOf("%");
  const bare = zoneAt === -1 ? address : address.slice(0, zoneAt);
  if (isIP(bare) !== 6) return null;

  const halves = bare.split("::");
  if (halves.length > 2) return null;

  const parseSide = (side: string): number[] | null => {
    if (side === "") return [];
    const items = side.split(":");
    const out: number[] = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item.includes(".")) {
        if (index !== items.length - 1) return null;
        const octets = parseIpv4(item);
        if (!octets) return null;
        out.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/i.test(item)) return null;
      out.push(parseInt(item, 16));
    }
    return out;
  };

  const head = parseSide(halves[0]);
  if (head === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;

  const tail = parseSide(halves[1]);
  if (tail === null) return null;
  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...new Array(fill).fill(0), ...tail];
}

function classifyIpv4(octets: number[]): string | null {
  const [a, b, c] = octets;
  if (a === 0) return "this-network";
  if (a === 10) return "private";
  if (a === 127) return "loopback";
  if (a === 100 && b >= 64 && b <= 127) return "cgnat";
  if (a === 169 && b === 254) return "link-local"; // includes 169.254.169.254 (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  if (a === 192 && b === 0 && c === 0) return "reserved";
  if (a === 192 && b === 0 && c === 2) return "documentation";
  if (a === 192 && b === 88 && c === 99) return "reserved";
  if (a === 198 && (b === 18 || b === 19)) return "benchmark";
  if (a === 198 && b === 51 && c === 100) return "documentation";
  if (a === 203 && b === 0 && c === 113) return "documentation";
  if (a >= 224 && a <= 239) return "multicast";
  if (a >= 240) return "reserved"; // includes 255.255.255.255 broadcast
  return null;
}

function classifyIpv6(groups: number[]): string | null {
  const allZero = groups.every((group) => group === 0);
  if (allZero) return "unspecified"; // ::
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return "loopback"; // ::1

  // ::ffff:a.b.c.d (IPv4-mapped) and ::a.b.c.d (IPv4-compatible, deprecated):
  // both are just an IPv4 address wearing a v6 costume — classify the v4.
  const firstFiveZero = groups.slice(0, 5).every((group) => group === 0);
  if (firstFiveZero && groups[5] === 0xffff) {
    return classifyIpv4(embeddedIpv4(groups, 6)) ?? null;
  }
  if (firstFiveZero && groups[5] === 0) {
    return classifyIpv4(embeddedIpv4(groups, 6)) ?? null;
  }
  // 64:ff9b::/96 NAT64 and 2002::/16 6to4 also carry a v4 destination.
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0) {
    return classifyIpv4(embeddedIpv4(groups, 6)) ?? null;
  }
  if (groups[0] === 0x2002) {
    return classifyIpv4(embeddedIpv4(groups, 1)) ?? null;
  }

  if ((groups[0] & 0xfe00) === 0xfc00) return "unique-local"; // fc00::/7
  if ((groups[0] & 0xffc0) === 0xfe80) return "link-local"; // fe80::/10
  if ((groups[0] & 0xff00) === 0xff00) return "multicast"; // ff00::/8
  if (groups[0] === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) return "discard"; // 100::/64
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return "documentation"; // 2001:db8::/32
  return null;
}

function embeddedIpv4(groups: number[], startGroup: number): number[] {
  const high = groups[startGroup];
  const low = groups[startGroup + 1];
  return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff];
}

/**
 * The address deny. Returns the CATEGORY an address falls into, or null when it
 * is an ordinary routable address. An address this function cannot parse is
 * treated as blocked ("unparseable") — fail closed.
 */
export function classifyBlockedAddress(address: string): string | null {
  const candidate = String(address || "").trim();
  const family = isIP(unbracket(candidate));
  const bare = unbracket(candidate);
  if (family === 4) {
    const octets = parseIpv4(bare);
    return octets ? classifyIpv4(octets) : "unparseable";
  }
  if (family === 6) {
    const groups = parseIpv6(bare);
    return groups ? classifyIpv6(groups) : "unparseable";
  }
  return "unparseable";
}

export interface EgressGuardOptions {
  /** Hosts this fetch may reach. A candidate matches on equality or as a subdomain. */
  allowedHosts: string[];
  /** Injected for tests; defaults to the OS resolver (all addresses). */
  resolve?: EgressResolver;
}

function hostMatchesAllowlist(host: string, allowedHosts: string[]): boolean {
  return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * The whole guard for ONE url. Throws `EgressBlockedError` on any refusal and
 * returns the parsed URL when every layer passes. Callers MUST await this before
 * they call fetch — never fetch first and check after.
 */
export async function assertSafeEgressUrl(url: string, opts: EgressGuardOptions): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new EgressBlockedError("invalid_url", "Not a valid absolute URL.");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new EgressBlockedError(
      "scheme_not_allowed",
      `Scheme "${parsed.protocol.replace(":", "")}" is not allowed; only http and https are.`,
    );
  }

  const allowedHosts = (opts.allowedHosts ?? [])
    .map((entry) => normalizeHost(entry))
    .filter((entry) => entry.length > 0);
  if (allowedHosts.length === 0) {
    throw new EgressBlockedError("no_allowed_hosts", "No egress host allowlist could be derived.");
  }

  const host = normalizeHost(parsed.hostname);
  if (!host) {
    throw new EgressBlockedError("invalid_url", "URL has no host.");
  }
  if (!hostMatchesAllowlist(host, allowedHosts)) {
    throw new EgressBlockedError(
      "host_not_allowed",
      `Host "${host}" is not on this record's allowlist (${allowedHosts.join(", ")}).`,
    );
  }

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await (opts.resolve ?? defaultEgressResolver)(host);
    } catch {
      throw new EgressBlockedError("dns_resolution_failed", `Host "${host}" could not be resolved.`);
    }
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new EgressBlockedError("unresolvable_host", `Host "${host}" resolved to no addresses.`);
    }
  }

  // EVERY resolved address must be routable — a host with one public and one
  // private answer is blocked, because which one `fetch` dials is not ours to pick.
  for (const address of addresses) {
    const category = classifyBlockedAddress(address);
    if (category) {
      throw new EgressBlockedError(
        "blocked_address",
        `Host "${host}" resolves to a non-routable address (${category}).`,
      );
    }
  }

  return parsed;
}

export interface GuardedFetchOptions extends EgressGuardOptions {
  headers?: Record<string, string>;
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

async function readCappedText(response: Response, maxBytes: number): Promise<string> {
  const body = (response as any)?.body;
  if (!body || typeof body.getReader !== "function") {
    const text = await response.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let out = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const chunk: Uint8Array = value;
    if (bytes + chunk.byteLength >= maxBytes) {
      out += decoder.decode(chunk.slice(0, Math.max(0, maxBytes - bytes)));
      try {
        await reader.cancel();
      } catch {
        /* the peer going away while we hang up is not an error worth raising */
      }
      return out;
    }
    bytes += chunk.byteLength;
    out += decoder.decode(chunk, { stream: true });
  }
  out += decoder.decode();
  return out;
}

/**
 * Guarded GET returning the response body as text.
 *
 * `redirect: "manual"` is load-bearing: letting the runtime follow redirects
 * would put hops 2..n outside the guard entirely, which is the bypass this
 * function exists to close. Each hop re-enters `assertSafeEgressUrl` in full.
 */
export async function fetchGuardedText(url: string, opts: GuardedFetchOptions): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxRedirects = opts.maxRedirects ?? MAX_EGRESS_REDIRECTS;
  const maxBytes = opts.maxBytes ?? MAX_EGRESS_RESPONSE_BYTES;
  const timeoutMs = opts.timeoutMs ?? EGRESS_TIMEOUT_MS;

  let current = String(url);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safeUrl = await assertSafeEgressUrl(current, opts);

    // The timer spans the body read too, not just the request: a peer that answers
    // headers promptly and then dribbles the body forever is the same denial as one
    // that never answers.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response: Response = await fetchImpl(safeUrl.toString(), {
        method: "GET",
        headers: opts.headers,
        redirect: "manual",
        signal: controller.signal,
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers?.get?.("location");
        if (!location) {
          throw new EgressBlockedError(
            "invalid_url",
            `Redirect ${response.status} carried no Location header.`,
          );
        }
        try {
          current = new URL(location, safeUrl).toString();
        } catch {
          throw new EgressBlockedError("invalid_url", "Redirect Location is not a usable URL.");
        }
        continue; // next iteration re-enters assertSafeEgressUrl for the new hop
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
      }
      return await readCappedText(response, maxBytes);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new EgressBlockedError(
    "redirect_limit",
    `Exceeded the ${maxRedirects}-redirect limit.`,
  );
}
