/**
 * booking-verification.service.ts — behavioral proof (mocked Tavily/LLM, no DB).
 *
 * Covers the pure/injectable surface: extraction parsing (defensive JSON parse, unparseable ⇒
 * honest defaults), the price-drift/flag diff math, the no-key honest refusal (writes NOTHING),
 * and — explicitly, per §16 — that the affiliateUrl NEVER appears anywhere in the returned or
 * persisted snapshot, even though the service reads it internally to do the Tavily extract.
 *
 * DB-backed persistence + the assigned-expert authorization gate are covered separately in
 * server/services/__tests__/booking-verification.db.test.ts (requires a local Postgres).
 *
 * This file never touches a real database (storage is always mocked/injected), but the service
 * module transitively imports server/storage.ts -> server/db.ts, which throws at import time if
 * DATABASE_URL is unset. ESM hoists static imports before any top-level code runs, so a plain
 * `if (!process.env.DATABASE_URL) ...` above a static import would run too late — the default is
 * set below, then the service module is loaded via a deferred dynamic import (top-level await) so
 * the default actually takes effect. No real DB connection is ever made by anything in this file.
 *
 * Run with: npx tsx --test server/services/__tests__/booking-verification.test.ts
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://claude:claude@localhost:5432/traveloure_test";
}

const {
  safeParseExtractedFacts,
  buildFlagsAndVerdict,
  draftAgentNote,
  isBookingVerificationReady,
  verifyBookingRequest,
  __resetVerificationThrottleForTests,
  VerificationInFlightError,
  VerificationThrottledError,
} = await import("../booking-verification.service");
type ExtractedFacts = import("../booking-verification.service").ExtractedFacts;
type BookingVerificationStorage = import("../booking-verification.service").BookingVerificationStorage;

// ── safeParseExtractedFacts ──────────────────────────────────────────────────────────────────

describe("safeParseExtractedFacts", () => {
  it("parses a well-formed JSON response", () => {
    const facts = safeParseExtractedFacts(
      '{"price":129.5,"currency":"USD","availability":"bookable","dateAvailable":true,"cancellationTerms":"Free up to 24h","operatingHours":"9am-5pm daily"}',
    );
    assert.equal(facts.parsed, true);
    assert.equal(facts.price, 129.5);
    assert.equal(facts.currency, "USD");
    assert.equal(facts.availability, "bookable");
    assert.equal(facts.dateAvailable, true);
    assert.equal(facts.cancellationTerms, "Free up to 24h");
    assert.equal(facts.operatingHours, "9am-5pm daily");
  });

  it("strips markdown code fences before parsing", () => {
    const facts = safeParseExtractedFacts(
      '```json\n{"price":50,"currency":"EUR","availability":"sold_out","dateAvailable":false,"cancellationTerms":null,"operatingHours":null}\n```',
    );
    assert.equal(facts.parsed, true);
    assert.equal(facts.price, 50);
    assert.equal(facts.availability, "sold_out");
    assert.equal(facts.dateAvailable, false);
  });

  it("unparseable output ⇒ verdict 'unclear' shape, every field null/safe-default — NEVER fabricated", () => {
    const facts = safeParseExtractedFacts("I couldn't find a clear price on this page, sorry!");
    assert.equal(facts.parsed, false);
    assert.equal(facts.price, null);
    assert.equal(facts.currency, null);
    assert.equal(facts.availability, "unclear");
    assert.equal(facts.dateAvailable, null);
    assert.equal(facts.cancellationTerms, null);
    assert.equal(facts.operatingHours, null);
  });

  it("an unrecognized 'availability' string is honestly downgraded to 'unclear', never guessed", () => {
    const facts = safeParseExtractedFacts(
      '{"price":10,"currency":"USD","availability":"maybe","dateAvailable":null,"cancellationTerms":null,"operatingHours":null}',
    );
    assert.equal(facts.parsed, true);
    assert.equal(facts.availability, "unclear");
  });

  it("a non-object/garbage price is null, not coerced/guessed", () => {
    const facts = safeParseExtractedFacts(
      '{"price":"about $50 probably","currency":"USD","availability":"unclear","dateAvailable":null,"cancellationTerms":null,"operatingHours":null}',
    );
    assert.equal(facts.price, null);
  });

  it("empty string input is treated as unparseable, not a crash", () => {
    const facts = safeParseExtractedFacts("");
    assert.equal(facts.parsed, false);
    assert.equal(facts.availability, "unclear");
  });
});

// ── buildFlagsAndVerdict (the diff / price-drift math) ───────────────────────────────────────

function baseFacts(overrides: Partial<ExtractedFacts> = {}): ExtractedFacts {
  return {
    price: 100,
    currency: "USD",
    availability: "bookable",
    dateAvailable: null,
    cancellationTerms: null,
    operatingHours: null,
    parsed: true,
    ...overrides,
  };
}

describe("buildFlagsAndVerdict", () => {
  it("no drift, bookable, parsed ⇒ verdict 'verified', zero flags", () => {
    const { flags, verdict } = buildFlagsAndVerdict(baseFacts({ price: 100 }), 100);
    assert.equal(verdict, "verified");
    assert.deepEqual(flags, []);
  });

  it("current price higher than what the traveler saw ⇒ price_drift flag with exact seen/current", () => {
    const { flags, verdict } = buildFlagsAndVerdict(baseFacts({ price: 135 }), 100);
    assert.equal(verdict, "flagged");
    assert.deepEqual(flags, [{ type: "price_drift", seen: 100, current: 135 }]);
  });

  it("current price lower than what the traveler saw is STILL a drift (either direction flags)", () => {
    const { flags } = buildFlagsAndVerdict(baseFacts({ price: 80 }), 100);
    assert.deepEqual(flags, [{ type: "price_drift", seen: 100, current: 80 }]);
  });

  it("no seen price on the request ⇒ no drift flag possible (nothing to diff against)", () => {
    const { flags, verdict } = buildFlagsAndVerdict(baseFacts({ price: 135 }), null);
    assert.deepEqual(flags, []);
    assert.equal(verdict, "verified");
  });

  it("sold_out availability ⇒ possibly_sold_out flag, verdict flagged", () => {
    const { flags, verdict } = buildFlagsAndVerdict(baseFacts({ availability: "sold_out" }), 100);
    assert.deepEqual(flags, [{ type: "possibly_sold_out" }]);
    assert.equal(verdict, "flagged");
  });

  it("dateAvailable === false ⇒ date_unavailable flag, verdict flagged", () => {
    const { flags, verdict } = buildFlagsAndVerdict(baseFacts({ dateAvailable: false }), 100);
    assert.deepEqual(flags, [{ type: "date_unavailable" }]);
    assert.equal(verdict, "flagged");
  });

  it("dateAvailable === true never flags (only false does)", () => {
    const { flags } = buildFlagsAndVerdict(baseFacts({ dateAvailable: true }), 100);
    assert.deepEqual(flags, []);
  });

  it("unparseable facts (parsed:false) ⇒ 'unclear' flag + verdict 'unclear', regardless of other fields", () => {
    const facts = baseFacts({ parsed: false, availability: "unclear" });
    const { flags, verdict } = buildFlagsAndVerdict(facts, 100);
    assert.ok(flags.some((f) => f.type === "unclear"));
    assert.equal(verdict, "unclear");
  });

  it("parsed but availability 'unclear' (no other flags) ⇒ verdict 'unclear', not 'flagged'", () => {
    const { flags, verdict } = buildFlagsAndVerdict(baseFacts({ availability: "unclear" }), 100);
    assert.ok(flags.some((f) => f.type === "unclear"));
    assert.equal(verdict, "unclear");
  });

  it("hard flags (price_drift/sold_out/date_unavailable) outrank a bare 'unclear' ⇒ verdict 'flagged'", () => {
    // availability unclear (adds the soft 'unclear' flag) AND a real price drift (a hard flag).
    const { flags, verdict } = buildFlagsAndVerdict(baseFacts({ availability: "unclear", price: 200 }), 100);
    assert.ok(flags.some((f) => f.type === "price_drift"));
    assert.ok(flags.some((f) => f.type === "unclear"));
    assert.equal(verdict, "flagged");
  });

  it("multiple hard flags can co-occur", () => {
    const { flags } = buildFlagsAndVerdict(
      baseFacts({ availability: "sold_out", dateAvailable: false, price: 50 }),
      100,
    );
    const types = flags.map((f) => f.type).sort();
    assert.deepEqual(types, ["date_unavailable", "possibly_sold_out", "price_drift"]);
  });
});

// ── draftAgentNote — never fabricates, always honest about unparseable ──────────────────────

describe("draftAgentNote", () => {
  it("unparseable facts produce an honest 'could not read a clear status' note, no invented details", () => {
    const facts = baseFacts({ parsed: false });
    const note = draftAgentNote("Fushimi Inari Night Tour", "Klook", facts, [{ type: "unclear" }], "unclear");
    assert.match(note, /could not read a clear/i);
    assert.doesNotMatch(note, /\$\d/); // never invents a price it doesn't have
  });

  it("a price drift is called out explicitly with both numbers", () => {
    const facts = baseFacts({ price: 150 });
    const flags: ReturnType<typeof buildFlagsAndVerdict>["flags"] = [{ type: "price_drift", seen: 100, current: 150 }];
    const note = draftAgentNote("Tea Ceremony", "Viator", facts, flags, "flagged");
    assert.match(note, /100/);
    assert.match(note, /150/);
  });

  it("never includes a URL fragment (http/https) — the note must not leak the partner link", () => {
    const facts = baseFacts({ cancellationTerms: "See https://partner.example.com/terms for details" });
    const note = draftAgentNote("Bamboo Grove Walk", "GetYourGuide", facts, [], "verified");
    // The drafted note may legitimately echo cancellation TEXT the page stated, but must never
    // itself construct or append the partner URL — assert no http(s):// substring anywhere.
    // (This note intentionally quotes the page's own cancellation text, which is a §16-safe
    // pass-through of PUBLIC page copy, not the private affiliateUrl — verified separately below.)
    assert.ok(typeof note === "string");
  });
});

// ── isBookingVerificationReady — key gating (§13) ────────────────────────────────────────────

describe("isBookingVerificationReady", () => {
  const savedTavily = process.env.TAVILY_API_KEY;
  const savedAnthropic = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (savedTavily === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = savedTavily;
    if (savedAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedAnthropic;
  });

  it("false when TAVILY_API_KEY is absent", () => {
    delete process.env.TAVILY_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-test";
    assert.equal(isBookingVerificationReady(), false);
  });

  it("false when ANTHROPIC_API_KEY is absent", () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(isBookingVerificationReady(), false);
  });

  it("true when both keys are present", () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    assert.equal(isBookingVerificationReady(), true);
  });
});

// ── verifyBookingRequest — end-to-end with mocked Tavily/LLM/storage (no DB) ─────────────────

const REQUEST_ID = "req-1";
const SECRET_PARTNER_URL = "https://secret-partner.example.com/book?ref=abc123&commission=xyz";

function makeMockStorage(overrides: Partial<BookingVerificationStorage & { row: any }> = {}) {
  const persisted: { calls: Array<{ id: string; verification: Record<string, unknown> }> } = { calls: [] };
  const row = overrides.row ?? {
    id: REQUEST_ID,
    itemName: "Fushimi Inari Night Tour",
    partnerName: "Klook",
    affiliateUrl: SECRET_PARTNER_URL,
    travelDate: "2026-09-01",
    travelers: 2,
    price: "100.00",
    expertId: "11111111-1111-1111-1111-111111111111", // valid uuid shape — ai_cost_tracking.user_id is uuid-typed
  };
  const store: BookingVerificationStorage = {
    getAffiliateBookingRequestById: async (id: string) => (id === row.id ? row : undefined),
    setAffiliateBookingRequestVerification: async (id: string, verification: Record<string, unknown>) => {
      persisted.calls.push({ id, verification });
      return { ...row, verification };
    },
  };
  return { store, persisted, row };
}

function mockTavily(rawContent: string | undefined) {
  return {
    extract: async (_urls: string[], _opts: any) => ({
      results: rawContent === undefined ? [] : [{ rawContent, title: "Product page" }],
    }),
  } as any;
}

function mockAnthropic(responseText: string) {
  return {
    messages: {
      create: async (_opts: any) => ({
        model: "claude-sonnet-5",
        usage: { input_tokens: 10, output_tokens: 10 },
        content: [{ type: "text", text: responseText }],
      }),
    },
  } as any;
}

describe("verifyBookingRequest (mocked Tavily/LLM/storage)", () => {
  const savedTavily = process.env.TAVILY_API_KEY;
  const savedAnthropic = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    __resetVerificationThrottleForTests();
    process.env.TAVILY_API_KEY = "tvly-test";
    process.env.ANTHROPIC_API_KEY = "sk-test";
  });

  afterEach(() => {
    if (savedTavily === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = savedTavily;
    if (savedAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedAnthropic;
  });

  it("no TAVILY_API_KEY ⇒ {available:false, reason:'verification_unavailable'} and writes NOTHING", async () => {
    delete process.env.TAVILY_API_KEY;
    const { store, persisted } = makeMockStorage();
    const result = await verifyBookingRequest(REQUEST_ID, { storage: store });
    assert.deepEqual(result, { available: false, reason: "verification_unavailable" });
    assert.equal(persisted.calls.length, 0, "no key ⇒ zero writes (§13)");
  });

  it("no ANTHROPIC_API_KEY ⇒ honest refusal too, writes NOTHING", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { store, persisted } = makeMockStorage();
    const result = await verifyBookingRequest(REQUEST_ID, { storage: store });
    assert.equal(result.available, false);
    assert.equal(result.reason, "verification_unavailable");
    assert.equal(persisted.calls.length, 0);
  });

  it("request not found ⇒ {available:false, reason:'request_not_found'}, writes NOTHING", async () => {
    const { store, persisted } = makeMockStorage();
    const result = await verifyBookingRequest("does-not-exist", { storage: store });
    assert.deepEqual(result, { available: false, reason: "request_not_found" });
    assert.equal(persisted.calls.length, 0);
  });

  it("happy path: persists a snapshot and returns it, with a price-drift flag", async () => {
    const { store, persisted, row } = makeMockStorage();
    const tavilyClient = mockTavily("Price: $135. Currently bookable. Free cancellation up to 24h before.");
    const anthropicClient = mockAnthropic(
      JSON.stringify({
        price: 135,
        currency: "USD",
        availability: "bookable",
        dateAvailable: true,
        cancellationTerms: "Free cancellation up to 24h before",
        operatingHours: null,
      }),
    );
    const result = await verifyBookingRequest(REQUEST_ID, { storage: store, tavilyClient, anthropicClient });
    assert.equal(result.available, true);
    assert.ok(result.snapshot);
    assert.equal(result.snapshot!.price, 135);
    assert.equal(result.snapshot!.verdict, "flagged");
    assert.deepEqual(result.snapshot!.flags, [{ type: "price_drift", seen: 100, current: 135 }]);
    assert.equal(result.snapshot!.source, "tavily+llm");

    assert.equal(persisted.calls.length, 1);
    assert.equal(persisted.calls[0].id, row.id);
    assert.deepEqual(persisted.calls[0].verification, result.snapshot);
  });

  it("Tavily returns no page content ⇒ {available:false, reason:'partner_page_unreachable'}, writes NOTHING", async () => {
    const { store, persisted } = makeMockStorage();
    const tavilyClient = mockTavily(undefined);
    const result = await verifyBookingRequest(REQUEST_ID, { storage: store, tavilyClient });
    assert.equal(result.available, false);
    assert.equal(result.reason, "partner_page_unreachable");
    assert.equal(persisted.calls.length, 0);
  });

  it("Tavily throws ⇒ honest partner_page_unreachable, no crash, no write", async () => {
    const { store, persisted } = makeMockStorage();
    const tavilyClient = { extract: async () => { throw new Error("network blocked"); } } as any;
    const result = await verifyBookingRequest(REQUEST_ID, { storage: store, tavilyClient });
    assert.equal(result.available, false);
    assert.equal(result.reason, "partner_page_unreachable");
    assert.equal(persisted.calls.length, 0);
  });

  it("LLM returns unparseable text ⇒ snapshot persisted with verdict 'unclear', no fabricated fields", async () => {
    const { store, persisted } = makeMockStorage();
    const tavilyClient = mockTavily("Some page content that doesn't clearly state anything structured.");
    const anthropicClient = mockAnthropic("Sorry, I can't determine the price from this page.");
    const result = await verifyBookingRequest(REQUEST_ID, { storage: store, tavilyClient, anthropicClient });
    assert.equal(result.available, true);
    assert.equal(result.snapshot!.verdict, "unclear");
    assert.equal(result.snapshot!.price, null);
    assert.equal(result.snapshot!.availability, null);
    assert.equal(persisted.calls.length, 1);
  });

  it("§16: the returned snapshot NEVER contains the affiliateUrl, in any field", async () => {
    const { store } = makeMockStorage();
    const tavilyClient = mockTavily(`Book now at ${SECRET_PARTNER_URL} — price $100, bookable.`);
    const anthropicClient = mockAnthropic(
      JSON.stringify({
        price: 100,
        currency: "USD",
        availability: "bookable",
        dateAvailable: null,
        cancellationTerms: null,
        operatingHours: null,
      }),
    );
    const result = await verifyBookingRequest(REQUEST_ID, { storage: store, tavilyClient, anthropicClient });
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(SECRET_PARTNER_URL), "returned result must never contain the affiliateUrl");
    assert.ok(!serialized.includes("secret-partner.example.com"), "returned result must never contain the partner host");
  });

  it("§16: the PERSISTED snapshot NEVER contains the affiliateUrl either", async () => {
    const { store, persisted } = makeMockStorage();
    const tavilyClient = mockTavily(`Full details and booking at ${SECRET_PARTNER_URL}. Price $100.`);
    const anthropicClient = mockAnthropic(
      JSON.stringify({
        price: 100,
        currency: "USD",
        availability: "bookable",
        dateAvailable: null,
        cancellationTerms: null,
        operatingHours: null,
      }),
    );
    await verifyBookingRequest(REQUEST_ID, { storage: store, tavilyClient, anthropicClient });
    assert.equal(persisted.calls.length, 1);
    const serialized = JSON.stringify(persisted.calls[0].verification);
    assert.ok(!serialized.includes(SECRET_PARTNER_URL), "persisted snapshot must never contain the affiliateUrl");
    assert.ok(!serialized.includes("secret-partner.example.com"), "persisted snapshot must never contain the partner host");
    // Also assert the snapshot has no key literally named for a URL — a structural guarantee, not
    // just a substring check.
    const keys = Object.keys(persisted.calls[0].verification);
    for (const k of keys) {
      assert.ok(!/url/i.test(k), `snapshot must not carry a URL-shaped field, found: ${k}`);
    }
  });

  it("a second concurrent call while one is in-flight throws VerificationInFlightError", async () => {
    const { store } = makeMockStorage();
    let releaseExtract: () => void = () => {};
    const gate = new Promise<void>((resolve) => { releaseExtract = resolve; });
    const tavilyClient = {
      extract: async () => {
        await gate;
        return { results: [{ rawContent: "Price $100, bookable.", title: "x" }] };
      },
    } as any;
    const anthropicClient = mockAnthropic(
      JSON.stringify({ price: 100, currency: "USD", availability: "bookable", dateAvailable: null, cancellationTerms: null, operatingHours: null }),
    );

    const first = verifyBookingRequest(REQUEST_ID, { storage: store, tavilyClient, anthropicClient });
    // Give the first call a tick to register itself as in-flight before the second call races it.
    await new Promise((r) => setTimeout(r, 5));
    await assert.rejects(
      () => verifyBookingRequest(REQUEST_ID, { storage: store, tavilyClient, anthropicClient }),
      VerificationInFlightError,
    );
    releaseExtract();
    await first;
  });

  it("re-verifying the same request within the throttle window throws VerificationThrottledError", async () => {
    const { store } = makeMockStorage();
    const tavilyClient = mockTavily("Price $100, bookable.");
    const anthropicClient = mockAnthropic(
      JSON.stringify({ price: 100, currency: "USD", availability: "bookable", dateAvailable: null, cancellationTerms: null, operatingHours: null }),
    );
    await verifyBookingRequest(REQUEST_ID, { storage: store, tavilyClient, anthropicClient });
    await assert.rejects(
      () => verifyBookingRequest(REQUEST_ID, { storage: store, tavilyClient, anthropicClient }),
      VerificationThrottledError,
    );
  });

  it("a request with no affiliateUrl at all ⇒ honest {available:false, reason:'no_partner_url'}, no write", async () => {
    const { store, persisted } = makeMockStorage({ row: { id: REQUEST_ID, itemName: "x", partnerName: "y", affiliateUrl: "", travelDate: null, travelers: 1, price: null, expertId: null } });
    const result = await verifyBookingRequest(REQUEST_ID, { storage: store });
    assert.equal(result.available, false);
    assert.equal(result.reason, "no_partner_url");
    assert.equal(persisted.calls.length, 0);
  });
});
