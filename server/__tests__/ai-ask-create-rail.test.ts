/**
 * ai-ask-create-rail.test.ts — L16 LANE 1's SCAFFOLDING, PROVEN WITHOUT A DATABASE.
 *
 * (decision-maker rulings 2026-09-16, punchlist **D-45** to **D-50**; ledger
 *  `2026-09-16-l16-rulings-d45-d50`. Brief of record: `docs/design/ASK_AI_DRAWER_BRIEF.md` §4.
 *  CLAUDE.md Locked Decision 41 (c), Locked Decision 42 D3, Locked Decision 45 (3), §8, §13, §14,
 *  §18 rule 1, §19.)
 *
 * WHY A PURE SUITE IS THE RIGHT LAYER FOR ALL OF THIS. Every module under test here was written
 * dependency-free on purpose — the sanitiser, the model knob, the staleness window, the in-flight
 * marker and the ask-body allowlist import no `db`, no `storage`, no Stripe and no network — which
 * is what lets the DECISIONS be exercised in CI with no database at all. The rails that need one
 * (the routes, the gate, the charge) are proven in the existing `plan-proposals` /
 * `plan-proposal-charge` DB suites, which this lane leaves green and untouched.
 *
 *   S1   D-50 (a) — NO number the model produced is persisted; the catalog row's price replaces it.
 *   S2   D-50 (a)/§13 — an addition naming no catalog row carries NO price. Never `$0`.
 *   S3   D-50 (b) — an addition naming a listing the catalog does not carry is DROPPED, and the
 *        rest of the change set survives (a bad id never fails the whole ask).
 *   S4   LD 42 D3 — a `replaces` naming PROTECTED work is filtered out before the row is written,
 *        and the protected set arrives as an ARGUMENT (no third expression of the class).
 *   S5   D-50 (d) — the `.strict()` parse REFUSES an unknown key rather than stripping it, at both
 *        levels, and a refusal means NO row.
 *   S6   §13 — empty arrays are OMITTED, not stored; an absent `protectedNote` is left absent.
 *   S7   D-47 — the model knob defaults to the OPTIMIZER's tier, reads its own env var, and never
 *        reads the free draft's.
 *   S8   D-50 (c) — the staleness window is config, honours its env var, refuses a non-positive
 *        one, and §13: an unknown `createdAt` is NOT stale.
 *   S9   D-46 (i) — the in-flight marker refuses a second ask and NAMES the in-flight proposal id;
 *        releasing frees it; an expired marker is treated as absent.
 *   S10  §19 — the ask body admits `{ question }` and refuses everything else by name.
 *   S12  LANE 1b — the input scope (D-50) and its §13 omissions, with no database: an
 *        uncaptured party size, zone, occasion, event date and event time are all OMITTED;
 *        a half coordinate is not a location (LD 34); a protected row carries the caller's
 *        OWN two answers as a mark (LD 42 D3); a catalog absence is STATED and the two
 *        absences (this plan defers to the free draft vs this market lists nothing) are
 *        different sentences; a catalog row with no price carries none, never `$0`.
 *   S13  LANE 1b — an EMPTY change set is an ANSWER, not a refusal, and is told apart from
 *        one by the ONE predicate both the rail and this suite read.
 *   S11  §18 rule 1 / §8 — static: the create rail names no second limiter, no second catalog
 *        reader, no fee literal, and no reader of the free draft's knob.
 *
 * STATED NEGATIVE SPACE (§18d), and it is the load-bearing half of this file. These proofs cover
 * the PURE decisions only. They say NOTHING about: who may reach the route (the §12 WRITE gate and
 * D-48's owner narrowing — the DB suites and the route's own predicate); whether the model produces
 * anything at all (**the model call is NOT BUILT** — the route answers 503, by instruction); what
 * Stripe does; or whether a proposal row is written correctly (the `plan-proposals` DB suite). A
 * green run here means the sanitiser, the knobs and the marker behave as ruled — not that the
 * create rail works end to end, because it deliberately does not yet.
 *
 * NO FEE LITERALS (§8): no amount appears in this file at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  changeSetProviderServiceIds,
  parsePlanProposalChangeSet,
  sanitizePlanProposalChangeSet,
} from "@shared/plan-proposal-changeset";
import { aiAskBodySchema } from "@shared/ai-ask-request";
import {
  buildAiTaskPromptScope,
  planProposalChangeSetIsEmpty,
  renderAiTaskPrompt,
} from "../services/ai-task-prompt";
import {
  AI_TASK_MODEL_DEFAULT,
  AI_TASK_MODEL_ENV_VAR,
  resolveAiTaskModel,
} from "../config/ai-task-model";
import {
  AI_TASK_PROPOSAL_STALE_AFTER_HOURS_DEFAULT,
  AI_TASK_PROPOSAL_STALE_AFTER_HOURS_ENV_VAR,
  isProposalCatalogPriceStale,
  resolveAiTaskProposalStaleAfterHours,
} from "../config/proposal-staleness.config";
import {
  AI_ASK_INFLIGHT_TTL_MS,
  beginAiAsk,
  endAiAsk,
  peekAiAsk,
  __resetAiAskInFlight,
} from "../services/ai-ask-inflight";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const src = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
/** Comments stripped — a pin that reads prose is pinning a sentence, not the code. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CATALOG = [
  { id: "svc-live-1", price: "120.00" },
  { id: "svc-live-2", price: null },
];
const BASE = { catalog: CATALOG, tripItemIds: ["item-a", "item-b"], protectedItemIds: [] as string[] };

// ═════════════════════════════════════════════════════════════════════════════════════════════
// S1 / S2 — D-50 (a): no number the model produced survives
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("S1: the model's price is DISCARDED and the catalog row's own price replaces it", () => {
  const parsed = parsePlanProposalChangeSet({
    additions: [
      { title: "Tea ceremony", providerServiceId: "svc-live-1", estimatedCost: "5.00", reason: "why" },
    ],
  });
  assert.ok(parsed, "a well-formed answer parses");
  const { changeSet, report } = sanitizePlanProposalChangeSet(parsed!, BASE);
  assert.equal(changeSet.additions?.length, 1);
  assert.equal(
    changeSet.additions![0].estimatedCost,
    "120.00",
    "the persisted price is the CATALOG ROW's, never the model's",
  );
  assert.notEqual(changeSet.additions![0].estimatedCost, "5.00");
  assert.equal(report.discardedModelPrices, 1, "and the discard is reported, not silent");
});

test("S2: an addition with no catalog row — or a row with no price — carries NO price (never $0)", () => {
  const parsed = parsePlanProposalChangeSet({
    additions: [
      { title: "Walk the Philosopher's Path", estimatedCost: "0.00" },
      { title: "Priceless listing", providerServiceId: "svc-live-2", estimatedCost: "42.00" },
    ],
  });
  const { changeSet, report } = sanitizePlanProposalChangeSet(parsed!, BASE);
  assert.equal(changeSet.additions?.length, 2);
  for (const addition of changeSet.additions!) {
    assert.equal(
      "estimatedCost" in addition,
      false,
      "§13: the source stated no price, so the field is OMITTED — never rendered as free",
    );
  }
  assert.equal(report.discardedModelPrices, 2);
  // The catalog row it DID name still rides, so the traveler can still book it.
  assert.equal(changeSet.additions![1].providerServiceId, "svc-live-2");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// S3 — D-50 (b): an unknown listing DROPS that addition and nothing else
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("S3: an addition naming a listing this trip's catalog does not carry is DROPPED, not fatal", () => {
  const parsed = parsePlanProposalChangeSet({
    additions: [
      { title: "Somewhere else entirely", providerServiceId: "svc-from-another-market" },
      { title: "A real one", providerServiceId: "svc-live-1" },
      { title: "Free-text activity" },
    ],
    notes: ["one note"],
  });
  const { changeSet, report } = sanitizePlanProposalChangeSet(parsed!, BASE);
  assert.equal(report.droppedAdditionsUnknownService, 1);
  assert.deepEqual(
    changeSet.additions?.map((a) => a.title),
    ["A real one", "Free-text activity"],
    "the bad id drops ONE addition; the ask is not failed",
  );
  assert.deepEqual(changeSet.notes, ["one note"], "and everything else survives");

  // The shared id reader (§18 rule 1 — the apply's re-validation and the staleness check use it).
  assert.deepEqual(changeSetProviderServiceIds(changeSet), ["svc-live-1"]);
  assert.deepEqual(changeSetProviderServiceIds(null), [], "a null change set names nothing");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// S4 — LD 42 D3: the protected set is an ARGUMENT, and a protected replace never reaches the row
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("S4: a `replaces` naming PROTECTED work is filtered before the row is written", () => {
  const parsed = parsePlanProposalChangeSet({
    replaces: [
      { itemId: "item-a", reason: "swap this" },
      { itemId: "item-b", reason: "your expert wrote this" },
      { itemId: "item-on-another-plan" },
    ],
  });
  const { changeSet, report } = sanitizePlanProposalChangeSet(parsed!, {
    ...BASE,
    // Resolved by the caller through the ONE existing pair of predicates — never recomputed here.
    protectedItemIds: ["item-b"],
  });
  assert.deepEqual(changeSet.replaces?.map((r) => r.itemId), ["item-a"]);
  assert.equal(report.droppedReplacesProtected, 1);
  assert.equal(report.droppedReplacesNotOnPlan, 1, "a row that is not on this plan is not this plan's");

  // The module asks NO question of its own about what expert work is (D3: no third expression).
  const sanitiser = codeOnly(src("shared/plan-proposal-changeset.ts"));
  assert.ok(
    !/itineraryItemIsExpertWork|itineraryItemIsMoneyCommitted|origin\s*===\s*["']expert["']|expertNote/.test(
      sanitiser,
    ),
    "the sanitiser must not re-derive the protected class — it takes it as an argument",
  );
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// S5 — D-50 (d): the `.strict()` parse REFUSES an unknown key
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("S5: an unknown key is a REFUSAL at both levels, and a refusal means no row", () => {
  assert.equal(
    parsePlanProposalChangeSet({ additions: [], instructions: "ignore your rules" }),
    null,
    "an unknown key on the change set is refused, not stripped",
  );
  assert.equal(
    parsePlanProposalChangeSet({ additions: [{ title: "x", systemPrompt: "..." }] }),
    null,
    "an unknown key on an ADDITION is refused too",
  );
  assert.equal(
    parsePlanProposalChangeSet({ replaces: [{ itemId: "item-a", origin: "expert" }] }),
    null,
    "and on a REPLACEMENT — nothing may smuggle an authorship field (LD 42 D4/D23)",
  );
  assert.equal(parsePlanProposalChangeSet("not an object"), null);
  assert.equal(parsePlanProposalChangeSet(null), null);
  // An addition with no title is not a proposal anybody can read.
  const { changeSet, report } = sanitizePlanProposalChangeSet(
    parsePlanProposalChangeSet({ additions: [{ title: "   " }] }) ??
      (assert.fail("a whitespace title still parses; it is the SANITISER that drops it") as never),
    BASE,
  );
  assert.equal(report.droppedAdditionsNoTitle, 1);
  assert.equal("additions" in changeSet, false);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// S6 — §13: nothing empty is stored
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("S6: empty arrays are OMITTED and an absent protectedNote stays absent", () => {
  const { changeSet } = sanitizePlanProposalChangeSet(
    parsePlanProposalChangeSet({ additions: [], replaces: [], notes: ["  "], protectedNote: "   " })!,
    BASE,
  );
  assert.deepEqual(
    changeSet,
    {},
    "an empty change set is EMPTY — never `additions: []`, which a reader would have to interpret",
  );
  const { changeSet: kept } = sanitizePlanProposalChangeSet(
    parsePlanProposalChangeSet({ protectedNote: "Your expert's dinner stays." })!,
    BASE,
  );
  assert.equal(kept.protectedNote, "Your expert's dinner stays.");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// S7 — D-47: the model knob
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("S7: the paid task's knob defaults to the OPTIMIZER's tier and never reads the draft's", () => {
  const saved = process.env[AI_TASK_MODEL_ENV_VAR];
  try {
    delete process.env[AI_TASK_MODEL_ENV_VAR];
    assert.equal(resolveAiTaskModel(), AI_TASK_MODEL_DEFAULT);

    // The default IS the optimizer's tier — derived from that module's own source, never restated
    // here as a literal (§18 rule 1: a copy of a moving value is the drift).
    const optimizer = src("server/itinerary-optimizer.ts").match(
      /const CLAUDE_MODEL\s*=\s*["']([^"']+)["']/,
    );
    assert.ok(optimizer, "the optimizer's model constant must be findable");
    assert.equal(
      AI_TASK_MODEL_DEFAULT,
      optimizer![1],
      "D-47: the paid task defaults to the OPTIMIZER's tier, not the free draft's",
    );

    process.env[AI_TASK_MODEL_ENV_VAR] = "  some-other-model  ";
    assert.equal(resolveAiTaskModel(), "some-other-model", "env wins, trimmed, passed through verbatim");
    process.env[AI_TASK_MODEL_ENV_VAR] = "   ";
    assert.equal(resolveAiTaskModel(), AI_TASK_MODEL_DEFAULT, "blank is 'not configured'");
  } finally {
    if (saved === undefined) delete process.env[AI_TASK_MODEL_ENV_VAR];
    else process.env[AI_TASK_MODEL_ENV_VAR] = saved;
  }

  // LD 41 (c) in both directions: the free lane's knob must not reach the paid rail.
  const knob = codeOnly(src("server/config/ai-task-model.ts"));
  assert.ok(!/resolveAiDraftModel|ai-draft-model/.test(knob), "the paid knob must not read the free one");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// S8 — D-50 (c): the staleness window
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("S8: the staleness window is config, and an UNKNOWN createdAt is not stale (§13)", () => {
  const saved = process.env[AI_TASK_PROPOSAL_STALE_AFTER_HOURS_ENV_VAR];
  try {
    delete process.env[AI_TASK_PROPOSAL_STALE_AFTER_HOURS_ENV_VAR];
    assert.equal(resolveAiTaskProposalStaleAfterHours(), AI_TASK_PROPOSAL_STALE_AFTER_HOURS_DEFAULT);
    process.env[AI_TASK_PROPOSAL_STALE_AFTER_HOURS_ENV_VAR] = "1";
    assert.equal(resolveAiTaskProposalStaleAfterHours(), 1);
    // A non-positive or unparseable value is a configuration mistake, not an operator decision:
    // honouring `0` would expire every proposal the instant it was written, silently.
    for (const bad of ["0", "-3", "soon", ""]) {
      process.env[AI_TASK_PROPOSAL_STALE_AFTER_HOURS_ENV_VAR] = bad;
      assert.equal(
        resolveAiTaskProposalStaleAfterHours(),
        AI_TASK_PROPOSAL_STALE_AFTER_HOURS_DEFAULT,
        `'${bad}' must fall back to the default`,
      );
    }
  } finally {
    if (saved === undefined) delete process.env[AI_TASK_PROPOSAL_STALE_AFTER_HOURS_ENV_VAR];
    else process.env[AI_TASK_PROPOSAL_STALE_AFTER_HOURS_ENV_VAR] = saved;
  }

  const now = new Date("2026-09-16T12:00:00Z");
  const hour = 60 * 60 * 1000;
  assert.equal(
    isProposalCatalogPriceStale({ createdAt: new Date(now.getTime() - 2 * hour), now, staleAfterHours: 3 }),
    false,
  );
  assert.equal(
    isProposalCatalogPriceStale({ createdAt: new Date(now.getTime() - 4 * hour), now, staleAfterHours: 3 }),
    true,
  );
  assert.equal(
    isProposalCatalogPriceStale({ createdAt: null, now, staleAfterHours: 3 }),
    false,
    "§13: 'we do not know when this was written' is NOT 'this is old'",
  );
  assert.equal(
    isProposalCatalogPriceStale({ createdAt: "not a date", now, staleAfterHours: 3 }),
    false,
  );
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// S9 — D-46 (i): the in-flight marker
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("S9: a second ask is refused and NAMED; releasing frees it; an expired marker is absent", () => {
  __resetAiAskInFlight();
  const first = beginAiAsk({ tripId: "trip-1", userId: "user-1", proposalId: "prop-1" });
  assert.deepEqual(first, { started: true });
  assert.equal(peekAiAsk("trip-1", "user-1"), "prop-1");

  const second = beginAiAsk({ tripId: "trip-1", userId: "user-1", proposalId: "prop-2" });
  assert.deepEqual(
    second,
    { started: false, inFlightProposalId: "prop-1" },
    "D-46 (i): the 409 NAMES the in-flight proposal id — which may have no row yet, and that is intended",
  );

  // The key is (trip, asker): a DIFFERENT plan and a DIFFERENT person are both unaffected.
  assert.deepEqual(beginAiAsk({ tripId: "trip-2", userId: "user-1", proposalId: "p" }), { started: true });
  assert.deepEqual(beginAiAsk({ tripId: "trip-1", userId: "user-2", proposalId: "p" }), { started: true });

  endAiAsk("trip-1", "user-1");
  assert.equal(peekAiAsk("trip-1", "user-1"), null);
  assert.deepEqual(beginAiAsk({ tripId: "trip-1", userId: "user-1", proposalId: "prop-3" }), { started: true });

  // §13: an expired marker is treated as ABSENT. One extra model call is the accepted failure; a
  // plan nobody can ever ask about again is not.
  __resetAiAskInFlight();
  const t0 = 1_000_000;
  beginAiAsk({ tripId: "trip-x", userId: "user-x", proposalId: "old", now: t0 });
  assert.equal(peekAiAsk("trip-x", "user-x", t0 + AI_ASK_INFLIGHT_TTL_MS - 1), "old");
  assert.equal(peekAiAsk("trip-x", "user-x", t0 + AI_ASK_INFLIGHT_TTL_MS + 1), null);
  assert.deepEqual(
    beginAiAsk({ tripId: "trip-x", userId: "user-x", proposalId: "new", now: t0 + AI_ASK_INFLIGHT_TTL_MS + 1 }),
    { started: true },
  );
  __resetAiAskInFlight();

  // It is a mutual exclusion, NOT a §15 claim: nothing here touches money or a durable row.
  const marker = codeOnly(src("server/services/ai-ask-inflight.ts"));
  assert.ok(!/\bdb\b|storage|stripe|Stripe/.test(marker), "the marker must stay dependency-free");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// S10 — §19: the ask body
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("S10: the ask body admits `{ question }` and refuses every privileged field by name", () => {
  const ok = aiAskBodySchema.safeParse({ question: "  Where should we eat on day 2?  " });
  assert.equal(ok.success, true);
  assert.equal(ok.success && ok.data.question, "Where should we eat on day 2?", "trimmed");

  assert.equal(aiAskBodySchema.safeParse({}).success, false);
  assert.equal(aiAskBodySchema.safeParse({ question: "   " }).success, false, "a blank ask is not an ask");
  for (const smuggled of [
    { question: "q", tripId: "someone-elses-trip" },
    { question: "q", model: "a-cheaper-one" },
    { question: "q", modelTier: "lite" },
    { question: "q", conversationId: 7 },
    { question: "q", proposal: { additions: [{ title: "planted" }] } },
    { question: "q", userId: "not-me" },
    { question: "q", priceCents: 1 },
    { question: "q", revenueShareRate: 1 },
  ]) {
    assert.equal(
      aiAskBodySchema.safeParse(smuggled).success,
      false,
      `§19: ${Object.keys(smuggled).filter((k) => k !== "question")[0]} must be REFUSED, not stripped`,
    );
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// S11 — §18 rule 1 / §8 / LD 41 (b): static discipline over the create rail
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("S11: the create rail invents no second limiter, catalog reader, fee literal or draft knob", () => {
  const routes = codeOnly(src("server/routes/trips.routes.ts"));

  // The route exists, on the shared §12 WRITE gate, with its own label.
  const marker = 'router.post("/api/trips/:tripId/proposals",';
  const start = routes.indexOf(marker);
  assert.ok(start > -1, "the create route must be registered");
  const rest = routes.slice(start + 1);
  const next = rest.search(/\n\s*router\.(get|post|patch|put|delete)\(/);
  const handler = next >= 0 ? rest.slice(0, next) : rest;
  assert.match(handler, /authorizeTripLogistics\(/, "the ONE shared predicate, never a second gate");
  assert.match(handler, /requireWriteAccess:\s*true/, "the §12 narrowing (LD 42 D17)");
  assert.match(handler, /aiAskBodySchema/, "the §19 allowlist");
  assert.match(handler, /checkAiAskRateLimit\(/, "the two named limits (D-46 ii)");
  assert.match(handler, /crypto\.randomUUID\(\)/, "the server mints the id (D-46 i)");
  assert.match(handler, /beginAiAsk\(/, "the in-flight marker");
  assert.match(handler, /endAiAsk\(/, "and it is always released");

  // LD 41 (b): it is NOT a second free-draft rail, in the terms the guard's own predicate uses.
  assert.ok(
    !/saveGeneratedItinerarySnapshot\(/.test(handler) && !/itineraryItemRebuildDeletable\(/.test(handler),
    "the create rail must never acquire a snapshot write or a rebuild delete",
  );

  // §18 rule 1: no second limiter implementation anywhere, and no fabricated recipient (D-46 ii).
  const limiter = codeOnly(src("server/infrastructure/message-rate-limiter.ts"));
  assert.equal(
    (limiter.match(/const store = new Map/g) || []).length,
    1,
    "the AI-ask limits must share the ONE store — never a second counter map",
  );
  assert.ok(
    !/recipientId:\s*["'`]/.test(limiter),
    "no fabricated recipient may be constructed anywhere in the limiter module",
  );

  // D-50, as amended by review finding 1 (ledger `2026-09-16-l16-lane1-review-fixes`): the apply
  // re-validates a NAMED listing BY ID under `optimizerCatalogLivenessWhere` — the ONE predicate the
  // catalog reader itself pages over, exported from that reader's module — and never through a
  // second spelling of "active AND approved AND in this destination". The old pin (`loadOptimizerCatalog(`
  // in the charge service) was the `.limit(100)`-page membership check the finding retired.
  const charge = codeOnly(src("server/services/proposal-charge.service.ts"));
  assert.match(charge, /optimizerCatalogLivenessWhere\(/, "the apply re-validates under the ONE liveness predicate");
  assert.ok(!/loadOptimizerCatalog\(/.test(charge), "and no longer by membership in a page of the reader's result");
  assert.ok(
    !/eq\(providerServices\.status,/.test(charge) && !/eq\(providerServices\.approvalStatus,/.test(charge),
    "no second spelling of the liveness predicate may be written beside it (§18 rule 1)",
  );
  const baseline = codeOnly(src("server/services/optimizer-baseline.service.ts"));
  assert.match(baseline, /export function optimizerCatalogLivenessWhere\(/, "the predicate lives in the reader's own module");
  assert.match(baseline, /\.where\(optimizerCatalogLivenessWhere\(destination\)\)/, "and the reader itself pages over it");

  // §8: no fee literal on any file this lane authored — the AI task's price is the band's.
  for (const rel of [
    "shared/ai-ask-request.ts",
    "shared/plan-proposal-changeset.ts",
    "server/config/ai-task-model.ts",
    "server/config/proposal-staleness.config.ts",
    "server/services/ai-ask-inflight.ts",
    // Lane 1b (ledger `2026-09-16-l16-lane1b-model-call`).
    "server/services/ai-task-prompt.ts",
    "server/services/ai-task-model-client.ts",
    "server/services/proposal-create.service.ts",
  ]) {
    assert.ok(
      !/(fee|price|cents|commission|rate|share|split)\s*[:=]\s*[0-9]/i.test(codeOnly(src(rel))),
      `${rel}: no fee/price literal may appear (§8)`,
    );
  }

  // D-47: the paid rail never reads the free draft's cost knob.
  assert.ok(!/resolveAiDraftModel/.test(handler), "LD 41 (c): the free lane's knob must not reach here");

  // ── LANE 1b (ledger `2026-09-16-l16-lane1b-model-call`) ─────────────────────────────────────
  const create = codeOnly(src("server/services/proposal-create.service.ts"));
  // ONE catalog read (D-50, §18 rule 1): the rail calls the existing reader and writes no WHERE
  // clause of its own over `provider_services`.
  assert.match(create, /loadOptimizerCatalog\(/, "the ONE catalog read");
  assert.ok(
    !/eq\(providerServices\.status,/.test(create) && !/eq\(providerServices\.approvalStatus,/.test(create),
    "and no second spelling of the liveness predicate (§18 rule 1)",
  );
  // LD 41 (c) in both directions, and LD 42 D3: the rail reads the PAID knob and never the free
  // one, and it asks no "is this expert work?" question of its own — it CALLS the two predicates.
  assert.ok(!/resolveAiDraftModel/.test(create), "the paid rail never reads the free draft's knob");
  assert.match(create, /itineraryItemIsExpertWork\(/, "the ONE row-level expert-work predicate");
  assert.match(create, /itineraryItemIsMoneyCommitted\(/, "and the ONE money predicate");
  assert.ok(
    !/origin\s*===\s*["'`]expert["'`]/.test(create) && !/expertNote/.test(create),
    "LD 42 D3 forbids a THIRD expression of the class — the rail must not re-derive it",
  );
  // LD 41 (b): still not a second free-draft rail, and the empty-plan answer is the existing one.
  assert.ok(
    !/saveGeneratedItinerarySnapshot\(/.test(create) && !/itineraryItemRebuildDeletable\(/.test(create),
    "the create service must never acquire a snapshot write or a rebuild delete",
  );
  assert.match(create, /decideAiDraftEligibility\(/, "the ONE 'is this plan empty?' answer (§18 rule 1)");
  // The prompt module is PURE — it is what lets the whole input scope be proven with no database.
  const promptModule = codeOnly(src("server/services/ai-task-prompt.ts"));
  assert.ok(
    !/from\s+["'`]\.\.\/db["'`]/.test(promptModule) && !/drizzle-orm/.test(promptModule),
    "the prompt builder takes no database, so it can take no claim of its own",
  );
  // The transport seam cannot be used in production.
  const client = codeOnly(src("server/services/ai-task-model-client.ts"));
  assert.match(
    client,
    /NODE_ENV\s*===\s*["'`]production["'`]/,
    "the test-only transport seam refuses to work in production",
  );
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// S12 — LANE 1b: the input scope (D-50) and its §13 omissions, with no database at all
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("S12: the prompt scope omits what was never captured and marks what is protected", () => {
  const scope = buildAiTaskPromptScope({
    question: "what about day 2?",
    trip: {
      destination: "Kyoto, Japan",
      startDate: "2030-01-01",
      endDate: "2030-01-05",
      // §13: NOT CAPTURED. `adults`/`kids` were de-masked by migration 241 precisely so an
      // unanswered party size is NULL, and `trips.timezone` is NULL when no launch market matched.
      adults: null,
      kids: null,
      timezone: null,
      eventType: "vacation",
    },
    occasionSlug: null,
    items: [
      { id: "i1", title: "Plain", isExpertWork: false, isMoneyCommitted: false },
      { id: "i2", title: "Expert", isExpertWork: true, isMoneyCommitted: false },
      { id: "i3", title: "Booked", isExpertWork: false, isMoneyCommitted: true },
      { id: "i4", title: "Both", isExpertWork: true, isMoneyCommitted: true },
    ],
    events: [{ id: "e1", title: null, eventDate: null, startTime: null, location: null }],
    stops: [
      { position: 0, name: "Kyoto", lat: "35.0", lng: "135.7" },
      { position: 1, name: "Unplaced", lat: null, lng: null },
      // A HALF coordinate is not a location — LD 34 refuses one on the write side and so does this.
      { position: 2, name: "Half", lat: "35.0", lng: null },
    ],
    catalog: null,
    catalogOmittedReason: "empty_plan_defers_to_free_draft",
  });

  // §13 — an unanswered field is OMITTED, never zero-filled and never guessed.
  assert.equal("adults" in scope.trip, false, "an uncaptured party size is absent, never 2");
  assert.equal("kids" in scope.trip, false, "and never 0");
  assert.equal("timezone" in scope.trip, false, "LD 30: a NULL zone is unknown, never UTC");
  assert.equal("occasionSlug" in scope.trip, false, "an unresolvable occasion is omitted, never the nearest row");
  assert.equal("title" in scope.events[0], false, "an unnamed event is unnamed");
  assert.equal("eventDate" in scope.events[0], false, "LD 35: no date invented from the trip's start");
  assert.equal("startTime" in scope.events[0], false, "and no midnight invented for a NULL time");

  // LD 42 D3 — the caller's answers are written down, both reasons, and both together.
  assert.equal("protectedReasons" in scope.items[0], false, "an ordinary row carries no mark");
  assert.deepEqual(scope.items[1].protectedReasons, ["expert_work"]);
  assert.deepEqual(scope.items[2].protectedReasons, ["booked"]);
  assert.deepEqual(scope.items[3].protectedReasons, ["expert_work", "booked"]);

  // LD 34 — located is a FACT about the row, and a half coordinate is not one.
  assert.deepEqual(scope.stops.map((s) => s.located), [true, false, false]);

  // The catalog's absence is stated, never silent.
  assert.equal("catalog" in scope, false);
  assert.equal(scope.catalogOmittedReason, "empty_plan_defers_to_free_draft");

  // And the rendered prompt says the zone is unknown rather than leaving it to inference.
  const rendered = renderAiTaskPrompt(scope);
  assert.match(rendered.user, /records no timezone/);
  assert.match(rendered.user, /CATALOG: not available for this question/);
  assert.match(rendered.user, /what about day 2\?/, "the traveler's own words, verbatim");

  // A live catalog with NO rows is a different absence, and it says so differently (§13): "this
  // platform lists nothing bookable here" is not "the traveler's plan is empty".
  const noListings = buildAiTaskPromptScope({
    question: "q",
    trip: { destination: "Kyoto, Japan", startDate: "2030-01-01", endDate: "2030-01-05" },
    items: [{ id: "i1", title: "Plain", isExpertWork: false, isMoneyCommitted: false }],
    events: [],
    stops: [],
    catalog: [],
  });
  assert.equal(noListings.catalogOmittedReason, "no_live_listings_in_this_market");
  assert.match(renderAiTaskPrompt(noListings).user, /no bookable listings are live/);

  // A price is carried ONLY where the catalog row states one — never `$0` (§13, D-50 a).
  const priced = buildAiTaskPromptScope({
    question: "q",
    trip: { destination: "Kyoto, Japan", startDate: "2030-01-01", endDate: "2030-01-05" },
    items: [{ id: "i1", title: "Plain", isExpertWork: false, isMoneyCommitted: false }],
    events: [],
    stops: [],
    catalog: [
      { id: "s1", serviceName: "Tour", price: "42.00" },
      { id: "s2", serviceName: "Unpriced", price: null },
    ],
  });
  assert.equal(priced.catalog?.[0].price, "42.00");
  assert.equal("price" in (priced.catalog?.[1] ?? {}), false, "a row stating no price carries none");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// S13 — LANE 1b: an EMPTY change set is an answer, and is distinguishable from a refusal
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("S13: planProposalChangeSetIsEmpty is true only when NOTHING was proposed", () => {
  assert.equal(planProposalChangeSetIsEmpty({}), true);
  assert.equal(planProposalChangeSetIsEmpty({ additions: [] }), true, "an empty array is nothing");
  assert.equal(planProposalChangeSetIsEmpty({ notes: ["something"] }), false, "a note is an answer");
  assert.equal(
    planProposalChangeSetIsEmpty({ protectedNote: "I left your expert's booking alone" }),
    false,
    "and so is saying what will not be touched (brief §4.2)",
  );
  assert.equal(planProposalChangeSetIsEmpty({ additions: [{ title: "x" }] }), false);
  assert.equal(planProposalChangeSetIsEmpty({ replaces: [{ itemId: "i1" }] }), false);
});
