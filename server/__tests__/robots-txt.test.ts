/**
 * robots-txt.test.ts — proofs for the ONE robots.txt parser/consult module
 * (ledger `2026-09-18-scraper-robots`; §18 rule 1).
 *
 * PURE unit tests: `fetch`, the clock and the logger are all injected, so
 * nothing here touches the network, the DB, or the real clock — the same
 * posture `egress-guard.test.ts` states for itself, and this file is wired
 * into the SAME vitest job for that reason (`tsx --test` cannot load a file
 * that imports from `vitest`).
 *
 * Run: npx vitest run --root . server/__tests__/robots-txt.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseRobotsTxt,
  isPathAllowed,
  fetchRobotsRules,
  assertRobotsAllowed,
  resetRobotsCacheForTests,
  RobotsDisallowedError,
  type RobotsRules,
} from "../utils/robots-txt";

const UA = "TraveloureBot";

/** A public/non-blocked address so tests never touch real DNS. */
const resolveToPublicIp = vi.fn(async () => ["93.184.216.34"]);

function rulesFrom(text: string): RobotsRules {
  return { groups: parseRobotsTxt(text) };
}

function okResponse(body: string, status = 200): any {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 200 ? "OK" : "",
    headers: { get: () => null },
    text: async () => body,
  };
}

function statusOnlyResponse(status: number): any {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "",
    headers: { get: () => null },
    text: async () => "",
  };
}

beforeEach(() => {
  resetRobotsCacheForTests();
});

// ─── parsing + matching: standard longest-match Allow/Disallow semantics ───
describe("isPathAllowed — group selection and longest-match", () => {
  it("selects the most specific matching User-agent group over '*' (group precedence)", () => {
    const rules = rulesFrom(`
      User-agent: TraveloureBot
      Disallow: /no-bots-allowed/

      User-agent: *
      Disallow: /
    `);

    // The specific group's narrow rule applies — NOT the "*" group's blanket ban.
    expect(isPathAllowed(rules, "/no-bots-allowed/x", UA)).toBe(false);
    expect(isPathAllowed(rules, "/anything-else", UA)).toBe(true);
    // A different crawler with no group of its own falls to "*".
    expect(isPathAllowed(rules, "/anything-else", "SomeOtherBot")).toBe(false);
  });

  it("matches the User-agent group case-insensitively", () => {
    const rules = rulesFrom(`
      User-agent: travelourebot
      Disallow: /private/
    `);
    expect(isPathAllowed(rules, "/private/x", UA)).toBe(false);
  });

  it("merges CONSECUTIVE User-agent lines into one group", () => {
    const rules = rulesFrom(`
      User-agent: TraveloureBot
      User-agent: OtherBot
      Disallow: /shared-block/
    `);
    expect(isPathAllowed(rules, "/shared-block/x", UA)).toBe(false);
    expect(isPathAllowed(rules, "/shared-block/x", "OtherBot")).toBe(false);
  });

  it("picks the LONGEST matching pattern regardless of Allow/Disallow order", () => {
    const rules = rulesFrom(`
      User-agent: *
      Disallow: /
      Allow: /public/
    `);
    expect(isPathAllowed(rules, "/public/tour", UA)).toBe(true); // Allow is longer
    expect(isPathAllowed(rules, "/private/tour", UA)).toBe(false); // only "/" matches
  });

  it("resolves an equal-length Allow/Disallow tie in favour of Allow", () => {
    const rules = rulesFrom(`
      User-agent: *
      Disallow: /tours
      Allow: /tours
    `);
    expect(isPathAllowed(rules, "/tours", UA)).toBe(true);
  });

  it("supports the '*' wildcard as a prefix match", () => {
    const rules = rulesFrom(`
      User-agent: *
      Disallow: /private/*.pdf
    `);
    expect(isPathAllowed(rules, "/private/report.pdf", UA)).toBe(false);
    // No trailing $ anchor: matches as long as the sequence is found from the
    // start, so a longer suffix after the pattern still matches.
    expect(isPathAllowed(rules, "/private/report.pdf.bak", UA)).toBe(false);
    expect(isPathAllowed(rules, "/public/report.pdf", UA)).toBe(true);
  });

  it("supports the trailing '$' end anchor", () => {
    const rules = rulesFrom(`
      User-agent: *
      Disallow: /private/*.pdf$
    `);
    expect(isPathAllowed(rules, "/private/report.pdf", UA)).toBe(false);
    // Anchored: anything AFTER ".pdf" means the pattern no longer matches to
    // the end of the string, so this one is allowed.
    expect(isPathAllowed(rules, "/private/report.pdf.bak", UA)).toBe(true);
  });

  it("treats an empty Disallow value as 'allow all'", () => {
    const rules = rulesFrom(`
      User-agent: *
      Disallow:
    `);
    expect(isPathAllowed(rules, "/anything", UA)).toBe(true);
    expect(isPathAllowed(rules, "/", UA)).toBe(true);
  });

  it("'Disallow: /' refuses every path", () => {
    const rules = rulesFrom(`
      User-agent: *
      Disallow: /
    `);
    expect(isPathAllowed(rules, "/", UA)).toBe(false);
    expect(isPathAllowed(rules, "/anything/at/all", UA)).toBe(false);
  });

  it("no matching group and no rules at all both mean allowed", () => {
    expect(isPathAllowed({ groups: [] }, "/anything", UA)).toBe(true);
    const rules = rulesFrom(`
      User-agent: SomeOtherBotOnly
      Disallow: /
    `);
    expect(isPathAllowed(rules, "/anything", UA)).toBe(true);
  });

  it("ignores comments, blank lines, and directives it does not implement", () => {
    const rules = rulesFrom(`
      # a comment on its own line
      User-agent: * # trailing comment
      Crawl-delay: 5
      Sitemap: https://example.com/sitemap.xml
      Disallow: /private/
    `);
    expect(isPathAllowed(rules, "/private/x", UA)).toBe(false);
    expect(isPathAllowed(rules, "/public/x", UA)).toBe(true);
  });
});

// ─── the fetch layer: fetchRobotsRules ──────────────────────────────────────
describe("fetchRobotsRules — fetch, cache, and unreachable/not-found handling", () => {
  it("fetches and parses a 200 robots.txt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse("User-agent: *\nDisallow: /private/\n"));
    const rules = await fetchRobotsRules("https://partner.example", { fetchImpl, resolve: resolveToPublicIp });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://partner.example/robots.txt");
    expect(isPathAllowed(rules, "/private/x", UA)).toBe(false);
  });

  it("a 404 is treated as 'no robots.txt' — allowed, and NOT logged", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(statusOnlyResponse(404));
    const logger = { warn: vi.fn() };
    const rules = await fetchRobotsRules("https://partner.example", { fetchImpl, logger, resolve: resolveToPublicIp });
    expect(rules.groups).toEqual([]);
    expect(isPathAllowed(rules, "/anything", UA)).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("a 5xx is unreachable — allowed, but LOGGED", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(statusOnlyResponse(503));
    const logger = { warn: vi.fn() };
    const rules = await fetchRobotsRules("https://partner.example", { fetchImpl, logger, resolve: resolveToPublicIp });
    expect(rules.groups).toEqual([]);
    expect(isPathAllowed(rules, "/anything", UA)).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toMatch(/unreachable/i);
  });

  it("a network error is unreachable — allowed, but LOGGED", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const logger = { warn: vi.fn() };
    const rules = await fetchRobotsRules("https://partner.example", { fetchImpl, logger, resolve: resolveToPublicIp });
    expect(rules.groups).toEqual([]);
    expect(isPathAllowed(rules, "/anything", UA)).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("caches a fetched answer within the TTL, and re-fetches once it expires", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse("User-agent: *\nDisallow: /private/\n"));
    let nowMs = 1_000_000;
    const now = () => nowMs;

    await fetchRobotsRules("https://partner.example", { fetchImpl, now, resolve: resolveToPublicIp });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Still within the TTL: a second call must not re-fetch.
    nowMs += 5 * 60 * 1000; // +5 minutes
    await fetchRobotsRules("https://partner.example", { fetchImpl, now, resolve: resolveToPublicIp });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Past the TTL (default 60 minutes): the next call re-fetches.
    nowMs += 61 * 60 * 1000;
    await fetchRobotsRules("https://partner.example", { fetchImpl, now, resolve: resolveToPublicIp });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("caches an unreachable answer too, so a down robots.txt is not re-fetched on every path check", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timeout"));
    let nowMs = 0;
    const now = () => nowMs;
    const logger = { warn: vi.fn() };

    await fetchRobotsRules("https://partner.example", { fetchImpl, now, logger, resolve: resolveToPublicIp });
    await fetchRobotsRules("https://partner.example", { fetchImpl, now, logger, resolve: resolveToPublicIp });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("an unparseable origin yields no rules rather than throwing", async () => {
    const fetchImpl = vi.fn();
    const rules = await fetchRobotsRules("not a url", { fetchImpl });
    expect(rules.groups).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("different origins are cached independently", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse("User-agent: *\nDisallow: /\n"));
    await fetchRobotsRules("https://a.example", { fetchImpl, resolve: resolveToPublicIp });
    await fetchRobotsRules("https://b.example", { fetchImpl, resolve: resolveToPublicIp });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

// ─── assertRobotsAllowed: the throwing convenience wrapper real callers use ─
describe("assertRobotsAllowed", () => {
  it("throws RobotsDisallowedError naming the origin and path when disallowed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse("User-agent: *\nDisallow: /private/\n"));
    await expect(
      assertRobotsAllowed("https://partner.example/private/tours", UA, { fetchImpl, resolve: resolveToPublicIp }),
    ).rejects.toBeInstanceOf(RobotsDisallowedError);

    try {
      await assertRobotsAllowed("https://partner.example/private/tours", UA, { fetchImpl, resolve: resolveToPublicIp });
      throw new Error("expected a throw");
    } catch (error: any) {
      expect(error).toBeInstanceOf(RobotsDisallowedError);
      expect(error.reason).toBe("robots_disallow");
      expect(error.origin).toBe("https://partner.example");
      expect(error.path).toBe("/private/tours");
    }
  });

  it("resolves without throwing when the path is allowed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse("User-agent: *\nDisallow: /private/\n"));
    await expect(
      assertRobotsAllowed("https://partner.example/public/tours", UA, { fetchImpl, resolve: resolveToPublicIp }),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing when robots.txt is unreachable (fail-open, per the standard's posture)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      assertRobotsAllowed("https://partner.example/anything", UA, { fetchImpl, logger: { warn: vi.fn() }, resolve: resolveToPublicIp }),
    ).resolves.toBeUndefined();
  });
});
