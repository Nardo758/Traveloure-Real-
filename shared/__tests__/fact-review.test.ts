/**
 * CS-1 item 3 — a dated fact shows only after a person has reviewed it (ledger `2026-10-19-cs1-fact-review`).
 *
 *   FR1  the sets: safety = last_admission, last_service, closure, transit, event; dated = hours + safety;
 *        ticketing_rule is not dated
 *   FR2  factIsReviewed: a dated, machine-read fact needs a person's id; every other type and origin passes
 *   FR3  resolveReviewedExpiry: safety needs an entry; hours default to the latest allowed date; never later than
 *        the source's setting (else the platform setting); a sooner season end wins; no setting ⇒ refused
 *   FR4  the traveler label is "Checked <date> · Source: <site>" and never says "verified"
 *   FR5  the waiting line: top-level link; a link-out source still links; link_out_no_link is plain text
 *   FR6  no machine writer can set verified_by: every recordFacts caller is a person's action, machines write
 *        through recordMachineFacts, and no adapter or job names verifiedBy
 *   FR7  the read-only counts script names the same dated types
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DATED_FACT_TYPES,
  REVIEWED_ORIGINS,
  SAFETY_FACT_TYPES,
  factIsReviewed,
  isDatedFactType,
  isSafetyFactType,
  lastEntryWaitingLine,
  resolveReviewedExpiry,
  reviewedFactLabel,
} from "../fact-review";
import { factProvenanceLine } from "../content-facts";

const DAY = 86_400_000;
const checkedAt = new Date("2026-10-01T03:00:00Z");
const now = new Date("2026-10-05T03:00:00Z");

test("FR1 — the sets", () => {
  assert.deepEqual([...SAFETY_FACT_TYPES], ["last_admission", "last_service", "closed_dates", "transit", "event"]);
  assert.deepEqual([...DATED_FACT_TYPES], ["hours", ...SAFETY_FACT_TYPES]);
  assert.equal(isDatedFactType("ticketing_rule"), false);
  assert.equal(isDatedFactType("timed_entry_required"), false, "ruled Oct 20, 2026: not a dated fact");
  assert.equal(isDatedFactType("closure"), false, "closed_dates replaced closure");
  assert.equal(isSafetyFactType("hours"), false);
  assert.equal(isSafetyFactType("event"), true);
});

test("FR2 — factIsReviewed", () => {
  assert.equal(factIsReviewed({ factType: "hours", origin: "official_refresh", verifiedBy: null }), false);
  assert.equal(factIsReviewed({ factType: "closed_dates", origin: "crawled", verifiedBy: "  " }), false);
  assert.equal(factIsReviewed({ factType: "last_service", origin: "official_refresh", verifiedBy: "admin-1" }), true);
  assert.equal(factIsReviewed({ factType: "ticketing_rule", origin: "official_refresh", verifiedBy: null }), true);
  assert.equal(factIsReviewed({ factType: "location", origin: "places_api", verifiedBy: null }), true);
  // Platform-owned content and a person's own words keep their existing rules.
  for (const origin of ["platform_listing", "gem", "event", "hotel_cache", "expert_nugget", "traveler_note"]) {
    assert.equal(factIsReviewed({ factType: "hours", origin, verifiedBy: null }), true, origin);
  }
  assert.deepEqual([...REVIEWED_ORIGINS], ["crawled", "official_refresh", "bot_proposal", "places_api"]);
});

test("FR3 — resolveReviewedExpiry", () => {
  const base = { checkedAt, now, sourceIntervalDays: 30, settingValue: "90" };
  // Safety: an entry is required, never a default.
  assert.deepEqual(resolveReviewedExpiry({ ...base, factType: "last_admission" }).ok, false);
  assert.equal((resolveReviewedExpiry({ ...base, factType: "event" }) as any).reason, "expiry_required");
  // Hours: the latest allowed date, from the source's setting (30 days), not the platform's.
  const h = resolveReviewedExpiry({ ...base, factType: "hours" });
  assert.equal(h.ok && h.expiresAt.getTime(), checkedAt.getTime() + 30 * DAY);
  // No source setting ⇒ the platform setting.
  const h2 = resolveReviewedExpiry({ ...base, sourceIntervalDays: null, factType: "hours" });
  assert.equal(h2.ok && h2.expiresAt.getTime(), checkedAt.getTime() + 90 * DAY);
  // Neither ⇒ refused; nothing in code supplies a number.
  assert.equal((resolveReviewedExpiry({ ...base, sourceIntervalDays: null, settingValue: null, factType: "hours" }) as any).reason, "expiry_unset");
  // A sooner season end wins; a later one is refused.
  const season = new Date("2026-10-20T00:00:00Z");
  const s = resolveReviewedExpiry({ ...base, factType: "closed_dates", entered: season.toISOString() });
  assert.equal(s.ok && s.expiresAt.getTime(), season.getTime());
  assert.equal((resolveReviewedExpiry({ ...base, factType: "closure", entered: "2026-12-31" }) as any).reason, "expiry_after_limit");
  assert.equal((resolveReviewedExpiry({ ...base, factType: "hours", entered: "2026-10-02" }) as any).reason, "expiry_past");
  assert.equal((resolveReviewedExpiry({ ...base, factType: "hours", entered: "soon" }) as any).reason, "expiry_invalid");
  // The reviewer may shorten hours.
  const short = resolveReviewedExpiry({ ...base, factType: "hours", entered: "2026-10-10T00:00:00Z" });
  assert.equal(short.ok && short.expiresAt.toISOString(), "2026-10-10T00:00:00.000Z");
});

test("FR4 — the traveler label", () => {
  assert.equal(reviewedFactLabel(checkedAt, "Kinkaku-ji", "Asia/Tokyo"), "Checked 1 Oct 2026 · Source: Kinkaku-ji");
  const line = factProvenanceLine(
    { origin: "official_refresh", factType: "last_admission", fetchedAt: checkedAt, verifiedAt: now, verifiedBy: "admin-1", license: "official", sourceName: "Kinkaku-ji" },
    now,
    "Asia/Tokyo",
  );
  assert.equal(line, "Checked 1 Oct 2026 · Source: Kinkaku-ji");
  const bot = factProvenanceLine({ origin: "bot_proposal", factType: "hours", fetchedAt: checkedAt, verifiedBy: "admin-1", sourceName: "Kiyomizu-dera" }, now, "Asia/Tokyo");
  assert.doesNotMatch(bot, /verified/i);
  assert.match(bot, /^Checked .* · Source: Kiyomizu-dera$/);
});

test("FR5 — the waiting line", () => {
  const extract = lastEntryWaitingLine({ placeName: "Kinkaku-ji", homepage: "https://www.shokoku-ji.jp/kinkakuji/visit/", termsClass: "extract" });
  assert.equal(extract.text, "Last entry not checked yet. See Kinkaku-ji's official site before you go.");
  assert.equal(extract.url, "https://www.shokoku-ji.jp/", "the top-level page, never a deep link");
  const fushimi = lastEntryWaitingLine({ placeName: "Fushimi Inari Taisha", homepage: "https://inari.jp/en/", termsClass: "link_out" });
  assert.equal(fushimi.url, "https://inari.jp/");
  const jrc = lastEntryWaitingLine({ placeName: "JR Central", homepage: "https://jr-central.co.jp/", termsClass: "link_out_no_link" });
  assert.equal(jrc.url, null, "named in plain text, no URL");
  assert.equal(jrc.text, "Last entry not checked yet. See JR Central's official site before you go.");
  assert.equal(lastEntryWaitingLine({ placeName: "X", homepage: "not a url", termsClass: "extract" }).url, null);
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      out.push(...walk(p));
    } else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

test("FR6 — no machine writer can set verified_by", () => {
  const root = process.cwd();
  const files = [...walk(path.join(root, "server")), ...walk(path.join(root, "scripts"))];
  // Every direct caller of recordFacts is a person's action: an admin's bot approval or refresh review.
  const PERSON_WRITERS = new Set(["server/services/bot-proposals.service.ts", "server/services/fact-review.service.ts"]);
  const callers = files
    .filter((f) => /\brecordFacts\(/.test(fs.readFileSync(f, "utf8").replace(/export async function recordFacts\(/, "")))
    .map((f) => path.relative(root, f).replace(/\\/g, "/"))
    .filter((f) => f !== "server/services/content-facts/place-facts.service.ts");
  assert.deepEqual(callers.sort(), [...PERSON_WRITERS].sort());
  // Inside the facts service, the only direct call is the machine wrapper's, which strips the reviewer.
  const svc = fs.readFileSync(path.join(root, "server/services/content-facts/place-facts.service.ts"), "utf8");
  const direct = svc.split("\n").filter((l) => /\brecordFacts\(/.test(l) && !/export async function recordFacts\(/.test(l));
  assert.deepEqual(direct.map((l) => l.trim()), ["return recordFacts(input.map((d) => ({ ...d, verifiedBy: null })), ctx);"]);
  // The refresh job writes through the machine wrapper.
  assert.match(fs.readFileSync(path.join(root, "server/jobs/officialRefresh.ts"), "utf8"), /recordMachineFacts\(/);
  // No adapter, job or import script names a reviewer.
  const machineFiles = files.filter((f) => /server\/services\/content-facts\/.*adapter|server\/jobs\/|scripts\//.test(f.replace(/\\/g, "/")));
  for (const f of machineFiles) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /verifiedBy\s*:/, path.relative(root, f));
});

test("FR7 — the counts script reads the same dated types", async () => {
  const mod = await import(path.join(process.cwd(), "scripts/report-unreviewed-refresh-facts.cjs"));
  assert.deepEqual((mod.default ?? mod).DATED_FACT_TYPES, [...DATED_FACT_TYPES]);
});
