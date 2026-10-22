/**
 * BOT-1 Phase 1 — the pure rules (ledger `2026-10-15-bot1-phase1`).
 *
 *   BP1 scopes and token liveness: a token calls only the endpoints it names; revoked or expired is dead
 *   BP2 the source a proposal cites: active, official, terms-checked; an https page on the source's own host
 *   BP3 the writer's admission: source, official https URL, official license, quote, and the verifying admin
 *   BP4 decision B: the source row's interval first, then the setting; neither ⇒ null, never a number from code
 *   BP5 an approved bot fact is read exactly as the official refresh is — tier, tags, feasibility, publishing only
 *       through public_ok — and is never confirmable into a nugget
 *   BP6 the label ruling: the provenance line names the source and "checked <date>", never "Traveloure team"
 *   BP7 the dedupe key ignores key order
 *   BP8 row 126: closed dates take their expiry from the dates, timed entry needs the reviewer's; a map, search or OTA
 *       host is never the official site; a bot's text never claims "verified" or "confirmed"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOT_FACT_ORIGIN,
  admitBotFact,
  admitBotSource,
  botFactExpiryDays,
  botKindExpiryRule,
  botProposalDedupeInput,
  isNotOfficialSiteHost,
  textClaimsVerification,
  botTokenLive,
  isValidExpiryDaysSetting,
  tokenHasScope,
} from "../bot-proposals";
import { factProvenanceLine, isConfirmableFact, isPageReadOrigin, isPublishable, originTier } from "../content-facts";
import { TEAM_AUTHOR_LABEL, placeFactTags } from "../content-tiers";
import { admitFeasibilityFact } from "../feasibility-facts";

const now = new Date("2026-10-15T12:00:00Z");
const source = { active: true, licenseClass: "official", termsCheckedAt: "2026-10-01T00:00:00Z", homepage: "https://www.shokoku-ji.jp/" };

test("BP1 scopes and token liveness", () => {
  assert.equal(tokenHasScope(["facts:read"], "facts:read"), true);
  assert.equal(tokenHasScope(["facts:read"], "proposals:write"), false);
  assert.equal(tokenHasScope(null, "facts:read"), false);
  assert.equal(botTokenLive({}, now), true);
  assert.equal(botTokenLive({ revokedAt: "2026-10-14T00:00:00Z" }, now), false);
  assert.equal(botTokenLive({ expiresAt: "2026-10-14T00:00:00Z" }, now), false);
  assert.equal(botTokenLive({ expiresAt: "2026-10-16T00:00:00Z" }, now), true);
});

test("BP2 the cited source and page", () => {
  assert.deepEqual(admitBotSource(source, "https://www.shokoku-ji.jp/kinkakuji/"), { ok: true });
  assert.deepEqual(admitBotSource(source, "https://shokoku-ji.jp/kinkakuji/"), { ok: true }, "www. is the same host");
  assert.deepEqual(admitBotSource(source, "http://www.shokoku-ji.jp/"), { ok: false, reason: "url_not_https" });
  assert.deepEqual(admitBotSource(source, "https://evil.example/shokoku-ji.jp"), { ok: false, reason: "url_off_source_host" });
  assert.deepEqual(admitBotSource(source, "https://shokoku-ji.jp.evil.example/"), { ok: false, reason: "url_off_source_host" });
  for (const bad of [null, { ...source, active: false }, { ...source, licenseClass: "editorial" }, { ...source, termsCheckedAt: null }]) {
    assert.deepEqual(admitBotSource(bad, "https://www.shokoku-ji.jp/"), { ok: false, reason: "source_not_eligible" });
  }
});

test("BP3 the writer's admission", () => {
  const d = { origin: BOT_FACT_ORIGIN, sourceId: "s1", sourceUrl: "https://www.shokoku-ji.jp/", license: "official", value: { quote: "9:00–17:00" }, verifiedBy: "admin-1" };
  assert.deepEqual(admitBotFact(d), { ok: true });
  assert.deepEqual(admitBotFact({ ...d, verifiedBy: null }), { ok: false, reason: "not_verified" });
  assert.deepEqual(admitBotFact({ ...d, license: "editorial" }), { ok: false, reason: "not_official" });
  assert.deepEqual(admitBotFact({ ...d, value: {} }), { ok: false, reason: "no_quote" });
  assert.deepEqual(admitBotFact({ ...d, sourceId: null }), { ok: false, reason: "no_source" });
  assert.deepEqual(admitBotFact({ ...d, sourceUrl: "http://x" }), { ok: false, reason: "no_official_url" });
});

test("BP4 decision B — the expiry", () => {
  assert.equal(botFactExpiryDays(30, "90"), 30, "the source row's interval wins");
  assert.equal(botFactExpiryDays(null, "90"), 90);
  assert.equal(botFactExpiryDays(0, "90"), 90, "a non-positive interval is unset");
  assert.equal(botFactExpiryDays(null, null), null, "nothing set ⇒ no number invented");
  assert.equal(botFactExpiryDays(null, "abc"), null);
  assert.equal(isValidExpiryDaysSetting("90"), true);
  for (const bad of ["0", "-1", "9.5", "", "10000", 90]) assert.equal(isValidExpiryDaysSetting(bad), false, String(bad));
});

test("BP5 read as the official refresh; never confirmable", () => {
  assert.equal(isPageReadOrigin(BOT_FACT_ORIGIN), true);
  assert.equal(originTier(BOT_FACT_ORIGIN), originTier("official_refresh"));
  for (const t of ["hours", "last_admission"]) assert.deepEqual(placeFactTags(BOT_FACT_ORIGIN, "official", t), placeFactTags("official_refresh", "official", t));
  const f = { origin: BOT_FACT_ORIGIN, license: "official", factType: "hours", sourceLicenseClass: "official" };
  assert.equal(isPublishable({ ...f, sourcePublicOk: true }), true);
  assert.equal(isPublishable({ ...f, sourcePublicOk: null }), false, "publishable only where the source is public_ok");
  assert.equal(isConfirmableFact({ origin: BOT_FACT_ORIGIN, license: "official" }), false);
  const v = admitFeasibilityFact({ factType: "last_admission", value: { byWeekday: { "1": "16:30" }, quote: "last entry 16:30" }, origin: BOT_FACT_ORIGIN, license: "official", sourceUrl: "https://x.example/" });
  assert.deepEqual(v, { ok: true });
});

test("BP6 the label ruling", () => {
  const line = factProvenanceLine({ origin: BOT_FACT_ORIGIN, sourceName: "Kinkaku-ji (Shokoku-ji)", fetchedAt: "2026-10-15T09:00:00Z", expiresAt: "2027-01-13T09:00:00Z" }, now);
  assert.equal(line, "Kinkaku-ji (Shokoku-ji) · checked 15 Oct 2026");
  assert.equal(line.includes(TEAM_AUTHOR_LABEL), false);
  const unnamed = factProvenanceLine({ origin: BOT_FACT_ORIGIN, fetchedAt: "2026-10-15T09:00:00Z" }, now);
  assert.equal(unnamed.includes(TEAM_AUTHOR_LABEL), false);
  assert.equal(unnamed.includes("Traveloure"), false);
});

test("BP7 the dedupe key ignores key order", () => {
  const a = botProposalDedupeInput({ kind: "place_fact.hours", placeRef: "p1", sourceUrl: "https://x/", value: { text: "t", quote: "q", weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] } });
  const b = botProposalDedupeInput({ kind: "place_fact.hours", placeRef: "p1", sourceUrl: "https://x/", value: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"], quote: "q", text: "t" } });
  assert.equal(a, b);
});

test("BP8 row 126: expiry rules, the official site, no claimed check", async () => {
  const { resolveReviewedExpiry } = await import("../fact-review");
  assert.equal(botKindExpiryRule("place_fact.closed_dates"), "from_dates");
  assert.equal(botKindExpiryRule("place_fact.timed_entry_required"), "reviewer_required");
  assert.equal(botKindExpiryRule("place_fact.hours"), "review_rule");
  const base = { factType: "timed_entry_required", checkedAt: now, sourceIntervalDays: 30, settingValue: "90", now };
  assert.equal((resolveReviewedExpiry(base) as any).ok, true, "without the flag, timed entry keeps CS-1's default");
  assert.equal((resolveReviewedExpiry({ ...base, requireEntered: true }) as any).reason, "expiry_required");
  for (const h of ["www.google.com", "maps.google.co.jp", "goo.gl", "www.klook.com", "www.booking.com", "jp.trip.com", "www.tripadvisor.jp", null]) {
    assert.equal(isNotOfficialSiteHost(h), true, String(h));
  }
  for (const h of ["www.shokoku-ji.jp", "nijo-jocastle.city.kyoto.lg.jp"]) assert.equal(isNotOfficialSiteHost(h), false, h);
  assert.equal(textClaimsVerification("Verified closed"), true);
  assert.equal(textClaimsVerification("confirmed by staff"), true);
  assert.equal(textClaimsVerification("Closed for maintenance"), false);
});
