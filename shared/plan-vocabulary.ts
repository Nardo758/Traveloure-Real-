/**
 * PLAN PARTY — the ONE derivation of "how many people is this plan for", on BOTH sides of the wire.
 * Ledger `2026-09-05-slip-events-first-render`; CLAUDE.md Locked Decision 33 ("`travelers` stays
 * DERIVED from the pair by one `partyTotal`") and §18 rule 1.
 *
 * ── WHY IT MOVED HERE ────────────────────────────────────────────────────────────────────────
 * `travelersForSave` and `partyTotal` were client-only (`client/src/lib/plan-vocabulary.ts`), while
 * the SERVER carried its own inline copy of the same arithmetic on the trip-create path
 * (`sanitizedInput.numberOfTravelers = sanitizedInput.adults + (sanitizedInput.kids ?? 0)` in
 * `server/routes.ts`). Two authors of one derivation is the drift class §18 rule 1 names, and it
 * drifted: `PATCH /api/trips/:tripId/occasion` — the rail step 4 writes `adults`/`kids` through —
 * wrote the PAIR and never the total, so a plan minted for two adults kept the create path's
 * untouched `number_of_travelers` and the slip header read "1 traveler" beside a Trip Strip chip
 * and a step 4 that both said "2". The number was not wrong in one place; it had two homes and
 * only one of them was being written.
 *
 * So the derivation lives in `shared/` — the same reason `shared/plan-events.ts` does — and the
 * client module re-exports it verbatim, so every existing import keeps working and there is
 * exactly ONE implementation. Do not copy either function back into a route, a component or a
 * storage writer.
 *
 * NO MONEY, NO IDENTITY (§14/§19): a party size is planning content. Nothing here reads or feeds a
 * charge, a fee, a rate or an ownership decision, and the columns it derives (`trips.adults`,
 * `trips.kids`, `trips.number_of_travelers`) are de-masked to NULL by migration 241 precisely so an
 * uncaptured party stays honestly uncaptured.
 */

/**
 * TRAVELERS, DE-MASKED (ledger `2026-09-03-item-event-link`; the fix restores migration 241's
 * intent on the edit panel).
 *
 * THE DEFECT THIS CLOSES. `EditTripPanel` seeded its travelers input with a literal `2` and wrote
 * `travelers` on EVERY save. Migration 241 de-masked party size precisely so an uncaptured count
 * stays NULL — an honest "not captured" the demand rollup can tell apart from a real answer (§13,
 * and the same posture `insertTripSchema`'s de-masking comment states). The panel silently put the
 * mask back one layer up: a traveler who opened the panel to fix a typo in the title left with a
 * fabricated party of two, and nothing downstream could tell it from a stated one.
 *
 * THE RULE: untouched ⇒ NOT SET. An empty input is not a party of one, not a party of two, and not
 * a zero — it is an unanswered question, and `undefined` is how this codebase says that. The panel
 * writes through `switchTripContext`, whose SWITCH_FIELDS have REPLACE semantics, so an omitted
 * `travelers` clears the field rather than re-asserting a guess.
 *
 * @param raw the raw input value (`""` while empty, a numeric string once typed, or a number when
 *            seeded from an existing context).
 * @returns a positive integer when the traveler really stated one; `undefined` for every form of
 *          "they did not" — empty, whitespace, non-numeric, zero or negative.
 */
export function travelersForSave(raw: string | number | undefined | null): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string" && raw.trim() === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.floor(n);
  return rounded > 0 ? rounded : undefined;
}

/**
 * THE PARTY TOTAL — one derivation of "how many people is this plan for", never two
 * (ledger `2026-09-04-one-modal-many-doors`; CLAUDE.md Locked Decision 33).
 *
 * The plan modal's step 4 asks TWO questions (Adults and Kids — `trips.adults` / `trips.kids`,
 * both de-masked to NULL by migration 241), while the Trip Strip's party chip, the trip context
 * and the slip's own header read ONE number. That is a derivation, and a derivation with two
 * authors is the drift class §18 rule 1 names — so it is written here, beside `travelersForSave`,
 * and the modal, the create route and the occasion PATCH all call it.
 *
 * §13 — the empty state survives the addition. `travelersForSave` already turns every spelling of
 * "they did not answer" into `undefined`; this function keeps that: with NEITHER field stated the
 * total is `undefined` (NOT SET), never 0 and never a fabricated 2. A stated kids count with no
 * adults is honoured as given rather than being topped up with an assumed adult — assuming one is
 * exactly the masking migration 241 removed. Neither field carries an explicit ZERO: "not set" and
 * "zero" are different answers, and only the first is true of a control nobody touched.
 */
export function partyTotal(
  adults: string | number | undefined | null,
  kids: string | number | undefined | null,
): number | undefined {
  // BOTH halves go through `travelersForSave`, so every spelling of "they did not answer" —
  // empty, whitespace, non-numeric, zero, negative — reads the same on both, and the plan modal's
  // "0 means cleared" marker in the trip-context blob is read back as NOT SET here rather than as
  // a count of none.
  const a = travelersForSave(adults);
  const k = travelersForSave(kids);
  if (a === undefined && k === undefined) return undefined;
  return (a ?? 0) + (k ?? 0);
}

/**
 * THE PLANCARD'S PARTY COUNT — which of the plan's two party facts the card renders, in order
 * (QA F4; ledger `2026-09-05-slip-events-first-render` D3, which recorded this half as
 * "RECORDED, NOT FIXED").
 *
 * THE DEFECT THIS CLOSES. `trips` carries the party TWICE: the pair the traveler answered
 * (`adults`/`kids`, written by step 4 through `PATCH /api/trips/:tripId/occasion`) and the
 * DERIVED total (`number_of_travelers`). D3 made both write rails derive the total, but that
 * says nothing about the rows already on disk: a plan minted before it landed can hold
 * `adults = 2, kids = NULL, number_of_travelers = NULL`, and the plancard assembler read
 * `trip.numberOfTravelers || 1` — so the slip header said "1 traveler" beside a Trip Strip chip
 * and a step 4 that both said "2". The stated answer was sitting in the row the whole time.
 *
 * SO THE PAIR WINS. The pair is what the traveler actually answered; the total is a derivation
 * OF it. Reading the derivation first means a stale or unwritten total can outrank the answer it
 * was derived from — which is exactly the shape of the bug. `partyTotal` is the ONE derivation
 * (§18 rule 1) and this delegates to it rather than re-adding the two numbers here.
 *
 * §13 — THE HELD FALLBACK IS LEFT EXACTLY AS FOUND, AND IS NOT THIS FUNCTION'S OPINION. When
 * NEITHER the pair NOR the total states anything, the party is genuinely uncaptured and the
 * caller passes the `fallback` it has always used. Migration 241 de-masked these columns so NULL
 * would stay NULL, and rendering an uncaptured party as "1 traveler" is that mask one layer up —
 * a real, contained defect, recorded by D3 and still open. It is deliberately NOT fixed here:
 * how a fully-uncaptured party renders is a held decision, and changing it in passing would
 * decide it silently. The ladder is written down here so that when the decision is made there is
 * exactly ONE line to change.
 */
export function plancardPartyCount(
  adults: string | number | undefined | null,
  kids: string | number | undefined | null,
  numberOfTravelers: string | number | undefined | null,
  fallback: number,
): number {
  const stated = partyTotal(adults, kids);
  if (stated !== undefined) return stated;
  // `travelersForSave` reads every spelling of "not stated" — NULL, "", 0, negative, non-numeric —
  // as `undefined`, so the stored total gets the same honesty test the pair does, and the caller's
  // held fallback is reached in exactly the cases `|| fallback` reached it in before.
  return travelersForSave(numberOfTravelers) ?? fallback;
}
