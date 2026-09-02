/**
 * egress-guard.test.ts — SSRF guard proofs (audit finding §2, ledger
 * `2026-09-02-outbound-fetch-egress`).
 *
 * PURE unit tests: the DNS resolver and `fetch` are both injected, so nothing
 * here touches the network, the DB, or the clock.
 *
 * Run: npx vitest run --root . server/__tests__/egress-guard.test.ts
 */
import { describe, it, expect, vi } from "vitest";
import {
  EgressBlockedError,
  assertSafeEgressUrl,
  classifyBlockedAddress,
  fetchGuardedText,
  registrableDomain,
} from "../utils/egress-guard";

const ALLOWED = ["partner.example"];

/** A resolver that answers every hostname with the same fixed address list. */
const resolverReturning = (...addresses: string[]) =>
  vi.fn(async () => addresses);

/** Resolver that must never be reached (scheme/host layers run before DNS). */
const resolverThatMustNotRun = () =>
  vi.fn(async () => {
    throw new Error("resolver should not have been called");
  });

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error: any) {
    expect(error).toBeInstanceOf(EgressBlockedError);
    return error.reason;
  }
  throw new Error("expected the guard to refuse, but it returned");
}

// ─── layer 1: scheme ────────────────────────────────────────────────────────
describe("assertSafeEgressUrl — scheme allowlist", () => {
  it("rejects file: before DNS is consulted", async () => {
    const resolve = resolverThatMustNotRun();
    expect(
      await reasonOf(assertSafeEgressUrl("file:///etc/passwd", { allowedHosts: ALLOWED, resolve })),
    ).toBe("scheme_not_allowed");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects ftp:", async () => {
    expect(
      await reasonOf(
        assertSafeEgressUrl("ftp://partner.example/x", {
          allowedHosts: ALLOWED,
          resolve: resolverThatMustNotRun(),
        }),
      ),
    ).toBe("scheme_not_allowed");
  });

  it("rejects gopher: and data: too (same layer)", async () => {
    for (const url of ["gopher://partner.example/1", "data:text/html,hi"]) {
      expect(
        await reasonOf(
          assertSafeEgressUrl(url, { allowedHosts: ALLOWED, resolve: resolverThatMustNotRun() }),
        ),
      ).toBe("scheme_not_allowed");
    }
  });

  it("rejects a non-absolute URL", async () => {
    expect(
      await reasonOf(assertSafeEgressUrl("/just/a/path", { allowedHosts: ALLOWED })),
    ).toBe("invalid_url");
  });
});

// ─── layer 2: host allowlist ────────────────────────────────────────────────
describe("assertSafeEgressUrl — host allowlist", () => {
  it("rejects a host that is not on the allowlist, before DNS", async () => {
    const resolve = resolverThatMustNotRun();
    expect(
      await reasonOf(
        assertSafeEgressUrl("https://evil.test/steal", { allowedHosts: ALLOWED, resolve }),
      ),
    ).toBe("host_not_allowed");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects a suffix-confusion host (notpartner.example)", async () => {
    expect(
      await reasonOf(
        assertSafeEgressUrl("https://notpartner.example/x", {
          allowedHosts: ALLOWED,
          resolve: resolverThatMustNotRun(),
        }),
      ),
    ).toBe("host_not_allowed");
  });

  it("rejects an empty allowlist rather than treating it as 'anything goes'", async () => {
    expect(await reasonOf(assertSafeEgressUrl("https://partner.example/", { allowedHosts: [] })))
      .toBe("no_allowed_hosts");
  });

  it("passes a public host on the allowlist", async () => {
    const resolve = resolverReturning("93.184.216.34");
    const url = await assertSafeEgressUrl("https://partner.example/products?p=2", {
      allowedHosts: ALLOWED,
      resolve,
    });
    expect(url.hostname).toBe("partner.example");
    expect(resolve).toHaveBeenCalledWith("partner.example");
  });

  it("passes a subdomain of an allowlisted registrable domain", async () => {
    const url = await assertSafeEgressUrl("https://shop.partner.example/list", {
      allowedHosts: ALLOWED,
      resolve: resolverReturning("2606:2800:220:1:248:1893:25c8:1946"),
    });
    expect(url.hostname).toBe("shop.partner.example");
  });
});

// ─── layer 3: resolved-address deny ─────────────────────────────────────────
describe("assertSafeEgressUrl — resolved address deny", () => {
  const blocked = [
    ["127.0.0.1", "loopback"],
    ["10.0.0.1", "private"],
    ["172.16.0.5", "private"],
    ["192.168.1.1", "private"],
    ["169.254.169.254", "cloud metadata"],
    ["100.64.0.1", "CGNAT"],
    ["0.0.0.0", "this-network"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast/reserved"],
    ["::1", "IPv6 loopback"],
    ["::", "IPv6 unspecified"],
    ["fc00::1", "IPv6 unique-local"],
    ["fe80::1", "IPv6 link-local"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    ["::ffff:169.254.169.254", "IPv4-mapped metadata"],
  ] as const;

  for (const [address, label] of blocked) {
    it(`rejects an allowlisted host resolving to ${address} (${label})`, async () => {
      expect(
        await reasonOf(
          assertSafeEgressUrl("https://partner.example/x", {
            allowedHosts: ALLOWED,
            resolve: resolverReturning(address),
          }),
        ),
      ).toBe("blocked_address");
    });
  }

  it("rejects when ANY of several answers is private (multi-A DNS)", async () => {
    expect(
      await reasonOf(
        assertSafeEgressUrl("https://partner.example/x", {
          allowedHosts: ALLOWED,
          resolve: resolverReturning("93.184.216.34", "169.254.169.254"),
        }),
      ),
    ).toBe("blocked_address");
  });

  it("rejects a host that resolves to nothing", async () => {
    expect(
      await reasonOf(
        assertSafeEgressUrl("https://partner.example/x", {
          allowedHosts: ALLOWED,
          resolve: vi.fn(async () => []),
        }),
      ),
    ).toBe("unresolvable_host");
  });

  it("rejects a host whose resolution throws (fail closed)", async () => {
    expect(
      await reasonOf(
        assertSafeEgressUrl("https://partner.example/x", {
          allowedHosts: ALLOWED,
          resolve: vi.fn(async () => {
            throw new Error("ENOTFOUND");
          }),
        }),
      ),
    ).toBe("dns_resolution_failed");
  });

  it("never leaks the resolved address into the message — only its category", async () => {
    try {
      await assertSafeEgressUrl("https://partner.example/x", {
        allowedHosts: ALLOWED,
        resolve: resolverReturning("169.254.169.254"),
      });
      throw new Error("expected a refusal");
    } catch (error: any) {
      expect(error).toBeInstanceOf(EgressBlockedError);
      expect(error.message).not.toContain("169.254.169.254");
      expect(error.message).toContain("link-local");
    }
  });
});

// ─── raw IP literals go through the same classifier ─────────────────────────
describe("raw IP literal targets", () => {
  it("rejects a raw private IP literal even when the literal is itself allowlisted", async () => {
    const resolve = resolverThatMustNotRun();
    expect(
      await reasonOf(
        assertSafeEgressUrl("http://169.254.169.254/latest/meta-data/", {
          allowedHosts: ["169.254.169.254"],
          resolve,
        }),
      ),
    ).toBe("blocked_address");
    expect(resolve).not.toHaveBeenCalled(); // literals skip DNS, not the deny
  });

  it("rejects a raw private IP literal against a domain allowlist (host layer)", async () => {
    expect(
      await reasonOf(
        assertSafeEgressUrl("http://10.0.0.1/admin", {
          allowedHosts: ALLOWED,
          resolve: resolverThatMustNotRun(),
        }),
      ),
    ).toBe("host_not_allowed");
  });

  it("rejects a bracketed IPv6 loopback literal", async () => {
    expect(
      await reasonOf(
        assertSafeEgressUrl("http://[::1]:8080/", { allowedHosts: ["::1"] }),
      ),
    ).toBe("blocked_address");
  });

  it("classifyBlockedAddress fails closed on garbage", () => {
    expect(classifyBlockedAddress("not-an-ip")).toBe("unparseable");
    expect(classifyBlockedAddress("")).toBe("unparseable");
    expect(classifyBlockedAddress("93.184.216.34")).toBeNull();
    expect(classifyBlockedAddress("2606:2800:220:1:248:1893:25c8:1946")).toBeNull();
  });
});

// ─── registrable domain derivation (the allowlist's own source) ─────────────
describe("registrableDomain", () => {
  it("returns TLD+1 and admits subdomains through it", () => {
    expect(registrableDomain("www.partner.example")).toBe("partner.example");
    expect(registrableDomain("shop.eu.partner.example")).toBe("partner.example");
  });

  it("handles a known multi-part suffix", () => {
    expect(registrableDomain("shop.partner.co.uk")).toBe("partner.co.uk");
  });

  it("refuses to derive from a bare TLD or a malformed host", () => {
    expect(registrableDomain("com")).toBeNull();
    expect(registrableDomain("")).toBeNull();
    expect(registrableDomain("a..b.com")).toBeNull();
    expect(registrableDomain("co.uk")).toBeNull();
  });
});

// ─── layer 4: redirect cap with per-hop re-validation ───────────────────────
function redirectResponse(location: string, status = 302): any {
  return {
    status,
    ok: false,
    headers: { get: (name: string) => (name.toLowerCase() === "location" ? location : null) },
  };
}

function okResponse(body: string): any {
  return {
    status: 200,
    ok: true,
    statusText: "OK",
    headers: { get: () => null },
    body: null,
    text: async () => body,
  };
}

describe("fetchGuardedText — redirects", () => {
  it("follows an in-allowlist redirect and returns the final body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("https://shop.partner.example/list"))
      .mockResolvedValueOnce(okResponse("<html>ok</html>"));
    const text = await fetchGuardedText("https://partner.example/", {
      allowedHosts: ALLOWED,
      resolve: resolverReturning("93.184.216.34"),
      fetchImpl: fetchImpl as any,
    });
    expect(text).toBe("<html>ok</html>");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].redirect).toBe("manual");
  });

  it("rejects a redirect chain that lands on a private address, AT THE HOP", async () => {
    // The allowlisted host is public; the host it redirects to resolves to the
    // metadata address. This is the classic bypass of a check-then-fetch guard.
    const resolve = vi.fn(async (host: string) =>
      host === "internal.partner.example" ? ["169.254.169.254"] : ["93.184.216.34"],
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("https://internal.partner.example/latest/meta-data/"));

    expect(
      await reasonOf(
        fetchGuardedText("https://partner.example/", {
          allowedHosts: ALLOWED,
          resolve,
          fetchImpl: fetchImpl as any,
        }),
      ),
    ).toBe("blocked_address");
    // The second hop was refused BEFORE it was requested.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a redirect that leaves the allowlist", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(redirectResponse("https://evil.test/collect"));
    expect(
      await reasonOf(
        fetchGuardedText("https://partner.example/", {
          allowedHosts: ALLOWED,
          resolve: resolverReturning("93.184.216.34"),
          fetchImpl: fetchImpl as any,
        }),
      ),
    ).toBe("host_not_allowed");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a 4-hop redirect chain (cap is 3)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("https://partner.example/1"))
      .mockResolvedValueOnce(redirectResponse("https://partner.example/2"))
      .mockResolvedValueOnce(redirectResponse("https://partner.example/3"))
      .mockResolvedValueOnce(redirectResponse("https://partner.example/4"))
      .mockResolvedValue(okResponse("never reached"));

    expect(
      await reasonOf(
        fetchGuardedText("https://partner.example/", {
          allowedHosts: ALLOWED,
          resolve: resolverReturning("93.184.216.34"),
          fetchImpl: fetchImpl as any,
        }),
      ),
    ).toBe("redirect_limit");
    expect(fetchImpl).toHaveBeenCalledTimes(4); // original + 3 followed redirects
  });

  it("rejects a redirect with no Location header", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: { get: () => null },
    });
    expect(
      await reasonOf(
        fetchGuardedText("https://partner.example/", {
          allowedHosts: ALLOWED,
          resolve: resolverReturning("93.184.216.34"),
          fetchImpl: fetchImpl as any,
        }),
      ),
    ).toBe("invalid_url");
  });

  it("caps the body it reads", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse("x".repeat(5000)));
    const text = await fetchGuardedText("https://partner.example/", {
      allowedHosts: ALLOWED,
      resolve: resolverReturning("93.184.216.34"),
      fetchImpl: fetchImpl as any,
      maxBytes: 100,
    });
    expect(text.length).toBe(100);
  });
});

// ─── the guard runs BEFORE any network call ─────────────────────────────────
describe("fetchGuardedText — never fetches first and checks after", () => {
  it("does not call fetch at all when the scheme layer refuses", async () => {
    const fetchImpl = vi.fn();
    await reasonOf(
      fetchGuardedText("file:///etc/passwd", {
        allowedHosts: ALLOWED,
        resolve: resolverThatMustNotRun(),
        fetchImpl: fetchImpl as any,
      }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not call fetch when the host layer refuses", async () => {
    const fetchImpl = vi.fn();
    await reasonOf(
      fetchGuardedText("http://169.254.169.254/latest/meta-data/", {
        allowedHosts: ALLOWED,
        resolve: resolverThatMustNotRun(),
        fetchImpl: fetchImpl as any,
      }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not call fetch when the address layer refuses", async () => {
    const fetchImpl = vi.fn();
    await reasonOf(
      fetchGuardedText("https://partner.example/", {
        allowedHosts: ALLOWED,
        resolve: resolverReturning("10.0.0.1"),
        fetchImpl: fetchImpl as any,
      }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ─── the real call path: AffiliateScraperService.fetchWebPage ───────────────
// `../db` and `../storage` are mocked so this stays a pure unit test (the
// service module imports them at load time; neither is exercised here).
vi.mock("../db", () => ({ db: {}, pool: {}, getPoolStats: () => ({}) }));
vi.mock("../storage", () => ({ storage: {} }));

describe("AffiliateScraperService.fetchWebPage", () => {
  it("never calls fetch when the guard refuses the target", async () => {
    const { affiliateScraperService } = await import("../services/affiliate-scraper.service");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await expect(
        (affiliateScraperService as any).fetchWebPage(
          "http://169.254.169.254/latest/meta-data/",
          ["partner.example"],
        ),
      ).rejects.toBeInstanceOf(EgressBlockedError);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("derives the allowlist from the partner row (websiteUrl's registrable domain)", async () => {
    const { affiliateScraperService } = await import("../services/affiliate-scraper.service");
    const derive = (partner: any) =>
      (affiliateScraperService as any).deriveAllowedScrapeHosts(partner);

    expect(derive({ websiteUrl: "https://www.partner.example/" })).toEqual(["partner.example"]);
    // productListUrl on the same registrable domain is added; off-domain is NOT.
    expect(
      derive({
        websiteUrl: "https://www.partner.example/",
        scrapeConfig: { productListUrl: "https://shop.partner.example/tours" },
      }),
    ).toEqual(["partner.example", "shop.partner.example"]);
    expect(
      derive({
        websiteUrl: "https://www.partner.example/",
        scrapeConfig: { productListUrl: "http://169.254.169.254/latest/meta-data/" },
      }),
    ).toEqual(["partner.example"]);
    expect(() => derive({ websiteUrl: "not a url" })).toThrow(EgressBlockedError);
  });
});
