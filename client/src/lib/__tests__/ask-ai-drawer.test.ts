/**
 * ask-ai-drawer.test.ts — L16 lanes 2 and 3; ledger `2026-09-16-l16-lanes2-3-drawer`.
 *
 * Brief of record: `docs/design/ASK_AI_DRAWER_BRIEF.md` §5 — the visibility table (§5.2), the flow
 * (§5.3) and the TEN copy rules (§5.4) — read against the LOCKED rulings **D-45..D-50** (ledger
 * `2026-09-16-l16-rulings-d45-d50`). CLAUDE.md Locked Decision 45 (3), Locked Decision 41 (b)/(c),
 * Locked Decision 42 **D16** / **D18**, §8, §13, §14, §18 rule 1.
 *
 * ── WHAT IS PINNED, AND IN WHAT FORM ─────────────────────────────────────────────────────────
 * V*  — the visibility table, every row (owner · WRITE advisor · pending advisor · anyone else).
 * P*  — the coverage/price line (lane 2): D-48's `aiTask` block rendered, and the THREE ways of
 *        having no answer that must produce no claim and no number.
 * C*  — the ten §13 copy rules of §5.4, each as the behaviour that makes it true.
 * R*  — the create rail's refusals as the drawer reads them: the honest 503, the 409 that names
 *        an in-flight ask, and the 429 that carries the server's own limit sentence.
 * S*  — the staleness/refusal path (D-50 (c)) and OPTION B's refund line: a REFUSAL offers a
 *        RE-ASK, never a retry of the same proposal and never a silent reprice.
 * A*  — STATIC facts about `AskAiDrawer.tsx` that no predicate can carry: no fee literal, no
 *        second fee read, no engine name, no undo control, and the routes it calls.
 *
 * ── NEGATIVE SPACE, and it is the load-bearing half (§18d posture) ───────────────────────────
 * These are PREDICATE and SOURCE facts. They do not prove a browser painted anything, they do not
 * prove the SERVER's gates (those are `server/__tests__/ai-ask-create-rail.db.test.ts` A1–A7 and
 * `proposal-apply-authorization.test.ts`), and they say nothing about whether a model call exists
 * — lane 1 stopped before it on purpose, which is exactly why R1 asserts the 503 is rendered as a
 * standing fact rather than an error the traveler can retry away.
 *
 * Run: npx tsx --test client/src/lib/__tests__/ask-ai-drawer.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ASK_AI_COPY,
  ASK_AI_RE_ASK_REASONS,
  appliedRecordLine,
  askAiDeferralToDraft,
  askAiPriceLine,
  askAiRailVisibility,
  askAiRowState,
  readAskRefusal,
  readChangeSet,
  readEstimatedCost,
  readProposalActionRefusal,
} from "../ask-ai-drawer";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/**
 * Both files DOCUMENT the rules they obey — "never `$0`", "no second fee read of
 * `GET /api/pricing`", "`model_tier` is a cost record" — so the ABSENCE assertions below run
 * against CODE ONLY. A predicate that a doc comment can trip is a predicate that punishes writing
 * the rule down, which is the opposite of what these files are for (§18d: a guard states what it
 * covers). Presence assertions keep the full source, so a rule cited in a comment still counts.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

const DRAWER_SRC = read("client/src/components/plancard/AskAiDrawer.tsx");
const MODULE_SRC = read("client/src/lib/ask-ai-drawer.ts");
const RAIL_SRC = read("client/src/components/plancard/SlipRail.tsx");
const DRAWER = code(DRAWER_SRC);
const MODULE = code(MODULE_SRC);
const RAIL = code(RAIL_SRC);

// ── V — the visibility table (§5.2, read against D-48 as RULED) ──────────────────────────────

test("V1 — the OWNER may read, ask, discard, pay and apply, with no round trip", () => {
  for (const logRead of ["pending", "ok", "refused", "error"] as const) {
    const v = askAiRailVisibility({ isOwner: true, isExpertViewer: false, logRead });
    assert.equal(v.visible, true, `owner hidden on logRead=${logRead}`);
    assert.equal(v.canAsk, true);
    assert.equal(v.canApply, true);
    // Nothing is said about an absent apply control, because none is absent.
    assert.equal(v.applyAbsenceNote, null);
  }
});

test("V2 — a §12 WRITE advisor (the log read SUCCEEDED) may ask, read and discard — and may NOT apply", () => {
  const v = askAiRailVisibility({ isOwner: false, isExpertViewer: true, logRead: "ok" });
  assert.equal(v.visible, true);
  assert.equal(v.canAsk, true);
  // D-48, AMENDED against the brief's own recommendation: PAY and APPLY are owner-only AT THE
  // ROUTE, and this surface mirrors that rather than drawing a control the route will refuse.
  assert.equal(v.canApply, false);
  assert.equal(v.applyAbsenceNote, ASK_AI_COPY.advisorCannotApply);
});

test("V3 — a PENDING advisor (the log read was REFUSED) sees nothing at all", () => {
  const v = askAiRailVisibility({ isOwner: false, isExpertViewer: true, logRead: "refused" });
  assert.equal(v.visible, false);
  assert.equal(v.canAsk, false);
  assert.equal(v.canApply, false);
});

test("V4 — an advisor whose log read has NOT answered draws nothing; §13, an unproven status is not a status", () => {
  for (const logRead of ["pending", "error"] as const) {
    const v = askAiRailVisibility({ isOwner: false, isExpertViewer: true, logRead });
    assert.equal(v.visible, false, `advisor shown on logRead=${logRead}`);
  }
});

test("V5 — anyone else sees nothing, whatever the read did", () => {
  for (const logRead of ["pending", "ok", "refused", "error"] as const) {
    const v = askAiRailVisibility({ isOwner: false, isExpertViewer: false, logRead });
    assert.equal(v.visible, false);
  }
});

// ── P — lane 2: the coverage / price line ────────────────────────────────────────────────────

test("P1 — a covered plan says so on the SERVER's word, and states NO price", () => {
  const line = askAiPriceLine({ coveredByTripPass: true, priceCents: 1234 });
  assert.equal(line.kind, "covered");
  assert.match(line.label, /Trip Pass/);
  assert.doesNotMatch(line.label, /\d/, "a covered plan must not be shown a charge");
});

test("P2 — an uncovered plan with a server-resolved band states THAT amount", () => {
  const line = askAiPriceLine({ coveredByTripPass: false, priceCents: 1234 });
  assert.equal(line.kind, "priced");
  assert.equal(line.amount, "$12.34");
  assert.match(line.label, /charged only when you apply/);
});

test("P3 — an OMITTED `aiTask` block renders NO claim: not covered, not uncovered, no number", () => {
  for (const block of [undefined, null, {} as any]) {
    const line = askAiPriceLine(block);
    assert.equal(line.kind, "unknown", `claimed something for ${JSON.stringify(block)}`);
    assert.doesNotMatch(line.label, /\d/);
    assert.doesNotMatch(line.label, /Trip Pass/);
  }
});

test("P4 — an absent `coveredByTripPass` is NOT `false`: a price is not stated on an unanswered coverage read", () => {
  const line = askAiPriceLine({ priceCents: 1234 });
  assert.equal(line.kind, "unknown");
  assert.doesNotMatch(line.label, /12/);
});

test("P5 — §13: an unresolvable or non-positive band is OMITTED, never rendered as `$0`", () => {
  for (const priceCents of [0, -1, Number.NaN, undefined as any]) {
    const line = askAiPriceLine({ coveredByTripPass: false, priceCents });
    assert.equal(line.kind, "unknown", `rendered a price for ${String(priceCents)}`);
    assert.doesNotMatch(line.label, /\$0/);
  }
});

// ── C — §5.4's ten copy rules ────────────────────────────────────────────────────────────────

test("C1 (rule 1) — a proposal is STAGED; nothing says added, updated, saved or done", () => {
  const state = askAiRowState({ id: "p1", status: "proposed" }, true);
  assert.equal(state.kind, "staged");
  assert.match(ASK_AI_COPY.stagedBadge, /Staged/i);
  const staged = `${state.note} ${ASK_AI_COPY.stagedBadge}`;
  assert.doesNotMatch(staged, /\b(added|updated|saved|done)\b/i);
});

test("C2 (rule 2) — asking is free and the price rides the APPLY control", () => {
  assert.match(ASK_AI_COPY.askIsFree, /free/i);
  assert.match(ASK_AI_COPY.priceSuffix, /apply/i);
  // §8: the copy names no figure at all — the number is the server's and arrives through P2.
  assert.doesNotMatch(ASK_AI_COPY.priceSuffix, /\d/);
  assert.doesNotMatch(ASK_AI_COPY.priceUnknown, /\d/);
});

test("C3 (rule 3) — an APPLIED proposal is a record; no undo is offered and none is derivable", () => {
  const state = askAiRowState({ id: "p1", status: "applied" }, true);
  assert.equal(state.kind, "applied");
  assert.equal(state.canApply, false);
  assert.equal(state.canDiscard, false);
  assert.match(state.note, /no undo/i);
  // Locked Decision 42 D18 — the word is never offered as an action anywhere in the copy.
  const allCopy = Object.values(ASK_AI_COPY).join(" ");
  assert.doesNotMatch(allCopy, /\b(undo it|revert|roll ?back|restore)\b/i);
});

test("C4 (rule 4) — the engine is NEVER named, in either direction", () => {
  const allCopy = Object.values(ASK_AI_COPY).join(" ");
  assert.doesNotMatch(allCopy, /claude|gpt|opus|sonnet|haiku|model|tier|lite/i);
  // And no degraded-quality disclaimer, which LD 41 (c) forbids just as firmly as a badge.
  assert.doesNotMatch(allCopy, /lower quality|cheaper model|less capable/i);
});

test("C5 (rule 5) — a present `protectedNote` is verbatim; an absent one says NOTHING", () => {
  const present = readChangeSet({ protectedNote: "Your expert's two items stay as they are." });
  assert.equal(present.protectedNote, "Your expert's two items stay as they are.");
  for (const cs of [{}, { protectedNote: "" }, { protectedNote: "   " }, null]) {
    assert.equal(readChangeSet(cs as any).protectedNote, null, `manufactured a note for ${JSON.stringify(cs)}`);
  }
  // Never "nothing is protected" — a claim only the server can make.
  assert.doesNotMatch(Object.values(ASK_AI_COPY).join(" "), /nothing is protected/i);
});

test("C6 (rule 6) — an empty log means NEVER ASKED, never 'the AI had nothing to say'", () => {
  assert.match(ASK_AI_COPY.emptyLog, /haven't asked/i);
  assert.doesNotMatch(ASK_AI_COPY.emptyLog, /nothing to say|no answer|no suggestions/i);
});

test("C7 (rule 7) — a DISCARDED proposal stays visible and is marked; the log is a record", () => {
  const state = askAiRowState({ id: "p1", status: "discarded" }, true);
  assert.equal(state.kind, "discarded");
  assert.equal(state.badge, ASK_AI_COPY.discardedBadge);
  assert.match(state.note, /record/i);
  // The renderer maps over EVERY row — no status filter anywhere in the drawer.
  assert.doesNotMatch(DRAWER, /\.filter\([^)]*status\s*[=!]==?\s*["']proposed["']/);
});

test("C8 (rule 8) — an EMPTY change set is a real answer and draws NO apply control", () => {
  const empty = askAiRowState({ id: "p1", status: "proposed", proposal: { notes: ["Nothing to change."] } }, true);
  assert.equal(empty.kind, "staged");
  assert.equal(empty.canApply, false, "charging for an apply that writes nothing is a charge for nothing");
  const full = askAiRowState(
    { id: "p2", status: "proposed", proposal: { additions: [{ title: "Nishiki Market" }] } },
    true,
  );
  assert.equal(full.canApply, true);
  // …and an owner who cannot apply (the advisor case) still gets no control on a non-empty one.
  assert.equal(askAiRowState({ id: "p2", status: "proposed", proposal: { additions: [{ title: "x" }] } }, false).canApply, false);
  assert.match(ASK_AI_COPY.emptyChangeSet, /nothing to apply/i);
});

test("C9 (rule 9) — a price the source did not state is OMITTED, never `$0`", () => {
  assert.equal(readEstimatedCost({ title: "x" }), null);
  assert.equal(readEstimatedCost({ title: "x", estimatedCost: "" }), null);
  assert.equal(readEstimatedCost({ title: "x", estimatedCost: "   " }), null);
  assert.equal(readEstimatedCost({ title: "x", estimatedCost: undefined as any }), null);
  // A price a source DID state is left exactly as stated — including a real "free".
  assert.equal(readEstimatedCost({ title: "x", estimatedCost: "$18" }), "$18");
  assert.equal(readEstimatedCost({ title: "x", estimatedCost: "Free" }), "Free");
});

test("C10 (rule 10) — a day the proposal did not name is a PLACEMENT, not the AI's answer", () => {
  const unplaced = readChangeSet({ additions: [{ title: "Kinkaku-ji" }] });
  assert.equal(unplaced.hasUnplacedAddition, true);
  const placed = readChangeSet({ additions: [{ title: "Kinkaku-ji", dayNumber: 2 }] });
  assert.equal(placed.hasUnplacedAddition, false);
  assert.match(ASK_AI_COPY.unplacedDay, /you can move/i);
  assert.doesNotMatch(ASK_AI_COPY.unplacedDay, /scheduled|the AI chose it/i);
});

test("C11 (D-45) — the drawer says out loud that it is STATELESS", () => {
  assert.match(ASK_AI_COPY.statelessNote, /nothing here remembers/i);
  // And it reads no conversation id: D-45 ruled `plan_proposals.conversation_id` stays NULL.
  assert.doesNotMatch(DRAWER, /conversationId/);
  assert.doesNotMatch(MODULE, /conversationId/);
});

test("C12 (LD 41 (b)) — on an EMPTY plan the drawer defers to the free draft and offers no paid task", () => {
  assert.equal(askAiDeferralToDraft("draft"), ASK_AI_COPY.emptyPlanDeferral);
  assert.equal(askAiDeferralToDraft("optimize"), null);
  assert.match(ASK_AI_COPY.emptyPlanDeferral, /free/i);
  // The rule itself is READ, never restated: the drawer takes `slipBuildAiAction`'s answer as a
  // prop and never counts items of its own (§18 rule 1 — a third copy of LD 41 (b)'s rule).
  assert.doesNotMatch(MODULE, /itemCount|activities\.length/);
  assert.doesNotMatch(DRAWER, /activities\.length/);
  assert.match(RAIL, /aiAction=\{slipBuildAiAction\(activities\.length\)\}/);
});

test("C13 (rule 3, the record) — §13: an applied row with no recorded ids says nothing, never '0 items'", () => {
  assert.equal(appliedRecordLine({ id: "p1", status: "applied" }), null);
  assert.equal(appliedRecordLine({ id: "p1", status: "applied", appliedItemIds: [] }), null);
  assert.equal(appliedRecordLine({ id: "p1", status: "applied", appliedItemIds: ["a"] }), "Created 1 item on your plan.");
  assert.equal(
    appliedRecordLine({ id: "p1", status: "applied", appliedItemIds: ["a", "b"] }),
    "Created 2 items on your plan.",
  );
});

// ── R — the create rail's refusals, as the drawer reads them ─────────────────────────────────

test("R1 — 503 is the HONEST 'not available yet', and it is NOT retryable", () => {
  const r = readAskRefusal(503, { message: "Asking the AI about a plan is not available yet.", reason: "model_call_not_built" });
  assert.equal(r.kind, "not_built");
  assert.equal(r.canRetry, false, "a retry promises an answer no code path can give");
  assert.match(r.message, /not available yet/i);
  // The server's own sentence is preferred; a body with none still answers honestly.
  assert.equal(readAskRefusal(503, {}).message, ASK_AI_COPY.notAvailableYet);
});

test("R2 — 409 names the in-flight ask and offers no second one", () => {
  const r = readAskRefusal(409, { message: "An answer for this plan is already on its way.", inFlightProposalId: "pr-1" });
  assert.equal(r.kind, "in_flight");
  assert.equal(r.canRetry, false);
  assert.equal(r.kind === "in_flight" ? r.inFlightProposalId : null, "pr-1");
  // D-46 (i): the 409 may name a proposal that has NO ROW yet, so the id is read and never used
  // to assert a row exists — an absent id is null, not an invented one.
  assert.equal(readAskRefusal(409, {}).kind === "in_flight" ? readAskRefusal(409, {}).inFlightProposalId : "x", null);
});

test("R3 — 429 carries the SERVER's own limit sentence and its own retry delay; nothing is invented", () => {
  const r = readAskRefusal(429, { message: "You have asked about this plan too many times.", scope: "sender_trip", retryAfterSec: 42 });
  assert.equal(r.kind, "rate_limited");
  assert.equal(r.kind === "rate_limited" ? r.retryAfterSec : null, 42);
  assert.equal(r.kind === "rate_limited" ? r.scope : null, "sender_trip");
  assert.match(r.message, /too many times/);
  // §13: a missing or nonsense delay is NULL, never a guessed number.
  for (const bad of [undefined, 0, -5, "soon"]) {
    const x = readAskRefusal(429, { retryAfterSec: bad as any });
    assert.equal(x.kind === "rate_limited" ? x.retryAfterSec : "x", null);
  }
});

test("R4 — anything else is an ordinary, retryable failure and says so", () => {
  assert.equal(readAskRefusal(400, {}).kind, "failed");
  assert.equal(readAskRefusal(500, {}).kind, "failed");
  assert.equal(readAskRefusal(0, {}).kind, "failed");
  assert.equal(readAskRefusal(400, { message: "Ask a question to get a proposal." }).message, "Ask a question to get a proposal.");
});

// ── S — the staleness path (D-50 (c)) and OPTION B's refund ──────────────────────────────────

test("S1 — an EXPIRED proposal is refused with the SERVER's reason and offers a RE-ASK", () => {
  const r = readProposalActionRefusal(409, {
    message: "This proposal quotes prices from when it was written…",
    reason: "stale_catalog_price",
  });
  assert.equal(r.reason, "stale_catalog_price");
  assert.equal(r.offersReAsk, true);
  assert.match(r.message, /quotes prices/);
});

test("S2 — the re-ask is decided by the REASON CODE, never by a message match", () => {
  assert.deepEqual([...ASK_AI_RE_ASK_REASONS].sort(), [
    "listing_unavailable",
    "protected_item",
    "refunded",
    "stale_catalog_price",
  ]);
  for (const reason of ASK_AI_RE_ASK_REASONS) {
    assert.equal(readProposalActionRefusal(409, { reason }).offersReAsk, true, reason);
  }
  // A refusal with no reason, and one the client does not recognise, offer nothing — the client
  // never invents a remedy for a refusal it cannot name (§13).
  assert.equal(readProposalActionRefusal(409, {}).offersReAsk, false);
  assert.equal(readProposalActionRefusal(409, { reason: "not_applicable" }).offersReAsk, false);
  assert.equal(readProposalActionRefusal(402, { reason: "no_payment" }).offersReAsk, false);
});

test("S3 — OPTION B: a refund block is REPORTED; an ABSENT one is 'nothing was charged', never a refund of nothing", () => {
  const issued = readProposalActionRefusal(409, { reason: "stale_catalog_price", refund: { outcome: "issued", refundId: "re_1" } });
  assert.match(issued.refundLine ?? "", /refunded/i);
  const pending = readProposalActionRefusal(409, { reason: "protected_item", refund: { outcome: "claimed" } });
  assert.match(pending.refundLine ?? "", /returned/i);
  // A Trip-Pass-covered apply moved no money and carries no refund block.
  assert.equal(readProposalActionRefusal(409, { reason: "protected_item" }).refundLine, null);
  assert.equal(readProposalActionRefusal(409, { reason: "protected_item", refund: {} }).refundLine, null);
});

test("S4 — a REFUNDED row is terminal: no apply, no discard, and a re-ask instead", () => {
  const state = askAiRowState({ id: "p1", status: "refunded" }, true);
  assert.equal(state.kind, "refunded");
  assert.equal(state.canApply, false);
  assert.equal(state.canDiscard, false);
  assert.match(state.note, /ask again/i);
  // …and never a silent reprice: the copy offers a fresh answer, not the same one at a new price.
  assert.doesNotMatch(state.note, /new price|updated price|re-?priced/i);
});

test("S5 — a STAGED row carrying a PaymentIntent cannot be discarded (the server's own refusal, mirrored)", () => {
  const withPi = askAiRowState({ id: "p1", status: "proposed", stripePaymentIntentId: "pi_1" }, true);
  assert.equal(withPi.canDiscard, false);
  const without = askAiRowState({ id: "p1", status: "proposed" }, true);
  assert.equal(without.canDiscard, true);
});

test("S6 — an UNRECOGNISED status draws no control and says it cannot be read (§13)", () => {
  for (const status of ["expired", "", null, undefined, 7 as any]) {
    const state = askAiRowState({ id: "p1", status: status as any }, true);
    assert.equal(state.kind, "unknown", `classified ${String(status)}`);
    assert.equal(state.canApply, false);
    assert.equal(state.canDiscard, false);
  }
});

// ── A — static facts about the renderer ──────────────────────────────────────────────────────

test("A1 — §8: no fee literal anywhere in the drawer or its copy module", () => {
  for (const [name, src] of [["AskAiDrawer.tsx", DRAWER], ["ask-ai-drawer.ts", MODULE]] as const) {
    assert.doesNotMatch(src, /\b(599|1999|4999|900|4500|19900|49900|499900)\b/, `${name} carries a fee literal`);
    assert.doesNotMatch(src, /\$\d/, `${name} spells a price`);
  }
});

test("A2 — D-48's read half is the ONE fee read: the drawer never fetches `/api/pricing`", () => {
  assert.doesNotMatch(DRAWER, /api\/pricing/);
  assert.doesNotMatch(MODULE, /api\/pricing/);
  assert.doesNotMatch(DRAWER, /aiTaskCents/);
  // It reads the block the proposals GET carries, and nothing else.
  assert.match(DRAWER, /askAiPriceLine\(logQuery\.data\?\.aiTask\)/);
});

test("A3 — the drawer calls the FOUR landed rails plus lane 1's create rail, and no other", () => {
  const urls = [...DRAWER.matchAll(/`\/api\/[^`]*`/g)].map((m) => m[0]);
  const normalized = urls.map((u) => u.replace(/\$\{[^}]*\}/g, ":id"));
  const allowed = new Set([
    "`/api/trips/:id/proposals`",
    "`/api/trips/:id/proposals/:id/discard`",
    "`/api/trips/:id/proposals/:id/pay`",
    "`/api/trips/:id/proposals/:id/apply`",
    // Cache invalidation of the plan the apply rewrote — a READ key, not a rail.
    "`/api/trips/:id/plancard`",
  ]);
  for (const u of normalized) assert.ok(allowed.has(u), `unexpected rail: ${u}`);
  for (const must of ["proposals`", "discard`", "pay`", "apply`"]) {
    assert.ok(normalized.some((u) => u.endsWith(must)), `missing rail ending ${must}`);
  }
});

test("A4 — §19: the ask body is EXACTLY `{ question }` and nothing else is sent", () => {
  assert.match(DRAWER, /JSON\.stringify\(\{ question: text \}\)/);
  // No model, tier, proposal, conversation or price ever leaves this surface on the ask.
  assert.doesNotMatch(DRAWER, /JSON\.stringify\(\{[^}]*\b(model|tier|proposal|price|amount|tripId)\b/);
});

test("A5 — §14: the only client-supplied value on APPLY is a PaymentIntent id", () => {
  assert.match(DRAWER, /paymentIntentId \? \{ paymentIntentId \} : \{\}/);
  assert.doesNotMatch(DRAWER, /body: JSON\.stringify\(\{[^}]*amount/);
  assert.doesNotMatch(DRAWER, /feeCents:\s*\d/);
});

test("A6 — the drawer names no engine and reads no `model_tier`", () => {
  assert.doesNotMatch(DRAWER, /modelTier|model_tier/);
  assert.doesNotMatch(MODULE, /modelTier|model_tier/);
});

test("A7 — LD 42 D18: no undo control exists in the renderer", () => {
  assert.doesNotMatch(DRAWER, /\bundo\b/i.source === "" ? /x^/ : /data-testid="[^"]*undo/i);
  assert.doesNotMatch(DRAWER, /Undo2|\bUndo\b/);
});

test("A8 — D16: the apply/pay controls are drawn from `visibility.canApply`, never from a role string", () => {
  // The visibility answer is the ONE input; no second `isOwner` test decides a control.
  assert.match(DRAWER, /canApply=\{visibility\.canApply\}/);
  assert.doesNotMatch(DRAWER, /isOwner\s*&&\s*<Button/);
  // And the rail mounts it for both viewer kinds, leaving the decision to the module.
  assert.match(RAIL, /isExpertViewer=\{isExpertViewer\}/);
});

test("A9 — the ONE copy home: the renderer spells no sentence of its own", () => {
  // Every user-visible sentence in the renderer comes from ASK_AI_COPY, the server's `message`,
  // or the two short labels the artboard names (the card eyebrow and the sheet title). A prose
  // string typed into a JSX branch is the drift §18 rule 1 names — here it drifts into a claim.
  const prose = [...DRAWER.matchAll(/>\s*([A-Z][a-z][^<>{}\n]{18,})\s*</g)].map((m) => m[1].trim());
  assert.deepEqual(prose, [], `renderer spells its own copy: ${JSON.stringify(prose)}`);
});
