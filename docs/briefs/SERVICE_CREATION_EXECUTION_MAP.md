# Service Creation Program — Execution Map (v1, for ratification)

One map, everything folded in: the console defect fixes (already running), the form fix pack, the
validated redesign spine, and the spec-gap lanes — each gap carried as a **blocked lane with its
decision embedded**, so ratifying this map answers the ballot. Sources of truth: the Service
Creation Audit, the interactive redesign mock (repaired), and the two batch-exercise reports
(`docs/testing/PROVIDER_BATCH_EXERCISE.md`, `docs/testing/MOCK_BATCH_EXERCISE.md`).

**Execution rules (unchanged from the Catalog/Distribute program):** one agent lane per item on
`claude/*` branches; behavioral proof against a local DB is part of every lane's definition of
done; five guards + tsc baseline + lockfile purity green before push; a ledger row per landed
lane; **mock parity** — if a lane deviates from the mock, the mock is updated in the same wave so
the ratified artifact never lies. UI copy: "Submit for review", never "Publish"; §13 everywhere.

---

## Wave 0 — console defects (IN FLIGHT now, lane FP-1)

Fixes the seven live defects the batch exercise proved, independent of any redesign decision:
custom-offering P0 dead end · Workstation creates born `pdf` · "Unknown" location chips ·
market-page scoping (structured `city` write + read fix — restores the catalog to discovery) ·
call listings losing all scheduling fields · deliverable enforcement + first client caller for the
ruling-58 protected upload · visible (not silent) commission-band fallback. Ledger row 87.

## Wave 1 — form fix pack (lane FP-2; no decisions needed)

Package A, sequenced after FP-1 to avoid ServiceForm collisions: submit-for-review rename + the
upfront review notice for providers · delete the dead Published/Draft switch · gate or drop the
four unread logistics fields · make every asterisk bind client-side · seam hygiene (human error
messages on Catalog mutations, delete confirmation, property/room rows filtered or re-routed,
bundle edit links carrying ids) · merge the duplicate questions (one transport, one duration, one
capacity story).

## Wave 2 — the validated spine (mock is the spec; both exercises passed it)

- **S1 — method-first + basics fast path.** Delivery method to step 1 position 2; the form
  branches off it; name/offering/method/price/description → saved resumable draft in one screen.
  *(Mock: "New create flow" tab.)*
- **S2 — derived checklist + honest submit.** Checklist computed from the draft's method and
  record state; rows navigate, work ticks them; Submit → In review transition.
  *(Mock: "Draft & checklist". Closes spec gaps #6, #19-adjacent behavior.)*
- **S3 — map authoring is create-flow step 4, named "Logistics" (decision-maker ruled Aug 12).**
  Pin + radius + route stops + zone rings in one confirm-gated component, living as the flow's
  4th step (after the renamed steps — old Logistics → **"Scheduling"**, old Group →
  **"Capacity"**); place-anchored/hybrid methods only. **Catalog's map mode is traveler preview
  ONLY** (read-only; honesty strip lives there) — this amends the earlier "Catalog is the map's
  authoring home" posture; availability stays on Catalog, so post-creation work is exactly two
  verbs: publish availability, or develop the offering (checklist rows re-enter the flow's
  steps, including step 4 for location fixes). Same write rails (§22a replace-list, one pin
  path). *(Closes gap #12.)*
- **S4 — money out of creation.** One price at create; surcharge modes/amounts, zone ring
  geometry, deposits, cancellation live in the post-creation Pricing & fees surface. Includes the
  amount-entry shapes the mock now shows. *(Closes gap #8's authoring half.)*
- **S5 — the one-door launcher.** Workstation "What are you building?" screen (service / bundle /
  property + category tiles moved from Catalog's empty state); all five create entry points
  reroute through it. **Executes ruling 74 disposition 1 as ratified.** *(Closes gap #19.)*
- **S6 — Distribute in the sidebar + Catalog slim.** Storefront header, share dialog, and Promote
  block consolidate onto Distribute; Catalog becomes read/manage/triage. *(Closes gap #14. Note:
  clarifies ruling 74 disp. 6 — the duplicate mount already made it ambiguous; this map's
  ratification records the clarification.)*

## Gate G — decisions embedded (answering = unblocking Wave 3)

> **Every Gate G item is now DESIGNED INTO THE MOCK as a proposed, interactive surface** carrying
> a "Proposed — gap #N · ratify or amend" chip: G1 = the Availability tab (weekly patterns,
> date-ranges, blackouts, honest no-calendar state); G2 = the Property builder behind the One-door
> Property tile; G3 = the session/async detail steps in the create flow; G4 = the Bundle builder
> (with a locked/unlocked preview toggle); G5's #13/#16/#17/#18 = panels on Mapping, Photos,
> Draft, and Fix pack. **Ratifying is now a click-through of the mock, not an abstract ballot** —
> the questions below remain the record of what each surface decides.

- **G1 · Availability model** — the biggest hole on both sides (nothing becomes bookable well).
  **Q:** one unified editor for slots, weekly patterns, blackouts, and property date-ranges — or
  per-shape editors? **REC:** one editor, per-method semantics (slots for scheduled methods,
  ranges for property rooms, none for artifact/async), weekly repeat + blackout as first-class,
  mounted on Catalog with the Workstation room rows deep-linking in. → unblocks **S7**.
- **G2 · Property builder** — today 5 fields; an innkeeper can't enter photos, cancellation,
  check-in, house rules, amenities, capacity. **Q:** dedicated builder scope? **REC:** dedicated
  flow behind the one-door Property tile, rooms as child rows, per-night unit, the missing fields;
  stays on `provider_services` (canonical-table rule); gets its own mock tab before build.
  → unblocks **S8**.
- **G3 · Live-session & async details.** **Q:** which fields become real? **REC:** scheduled
  remote: timezone, join-link (provider's own link, shown post-booking only), remote capacity;
  async: response window, scope statement, completion promise wired to the existing
  `provider_declared` completion rule — no new completion machinery. → unblocks **S9**.
- **G4 · Bundle composition.** **Q:** builder shape + traveler rendering? **REC:** keep the
  Workstation dialog, add real component linking on the traveler page, method chip derived from
  components (FP-1's fix is the interim), price stays no-auto-sum with the existing honest copy.
  → unblocks **S10**.
- **G5 · The batch** (each one line; REC in parentheses):
  #5 deliverable rail remainder — versioning + re-send rule (keep "no re-send", document it);
  #7 review SLA — is "2 business days" real? (measure first, then commit or drop the number);
  #10 custom-offering redesign (keep flow, land in a real pending-category state);
  #11 category↔method rules incl. the Lodging/Property collision (explicit allow-matrix);
  #13 traveler representation of everything authored — party size, lead time, cutoff, timezone,
  start window, buffer, neighborhoods, transport, gallery (dedicated lane **T-REP**: render or
  stop collecting — no third option under §13);
  #15 hybrid-with-artifact branch (defer unless a real provider asks);
  #16 photos/media — upload vs pasted URLs (extend the ruling-58 objstore rail to images);
  #17 edit-path for a live listing (edits go back through review only for identity fields —
  define the field list);
  #18 delete-with-bookings (refuse + archive, mirroring the shipped withdraw precedent).

## Wave 3 — gap-dependent lanes

**S7** availability (G1) · **S8** property builder (G2) · **S9** session/async fields (G3) ·
**S10** bundles (G4) · **T-REP** traveler representation sweep (#13) — each starts only when its
gate answer is ratified; each updates the mock in the same wave.

---

*Ratifying this map = go on Waves 1–2 as specced, plus your answers (or amendments) to G1–G5.
Wave 0 is already running under the existing fix-the-UI-first instruction. Fixture inventory from
the batch exercise (`traveloure_batch` DB, credentials and IDs in the exercise doc) serves as the
test bed for every lane above.*
