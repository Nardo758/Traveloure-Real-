# Audit brief — Service creation (delivery-method-branched wizard)

**Mock:** `docs/design/service-creation-mock.html` (open in a browser; click through). Note a
second copy exists at `docs/testing/mock/service-creation-mock.html` — it differs byte-for-byte
from the design copy; treat `docs/design/service-creation-mock.html` as canonical for this brief
and flag the testing-dir copy's existence to whoever owns that directory rather than resolving it
here.
**Ledger:** CLAUDE.md item 3 (canonical delivery methods), CLAUDE.md §24 (Bring/Access), F2-CLOSED
migration 111 (born-submitted); `docs/DECISIONS.md` rows 92, 93, 97, 101, 103, 104, 105, 112, 113,
2026-08-16-bring-access
**Status:** Merged — this mock is the same underlying artifact as
`docs/design/provider-console-mockup/mockup.html` (see that file's audit brief), scoped here to
the create-flow wizard itself. One item in THIS file's copy is stale relative to the other export
(see Known divergences).
**Live surfaces:**
- `client/src/lib/service-form-steps.ts` — the one placement authority (`flowForMethod`,
  `stepForSection`, `clampStep`)
- `client/src/lib/service-form-required.ts`
- `client/src/pages/provider/service-form.tsx`, `client/src/pages/expert/service-form.tsx`,
  `client/src/components/ServiceForm.tsx`
- `shared/schema.ts` — `deliveryMethodEnum` (~line 523), `providerServices.approvalStatus`
  default, `whatToBring`/`accessNotes` columns (~line 806)
- `client/src/pages/provider/listing-home.tsx` (post-create checklist)
- `client/src/pages/service-detail.tsx` (traveler read-out)

## Behaviors the mock ratifies

1. **Delivery method is asked FIRST** — step 1, second question, right after picking an
   offering — and the step list is BUILT from it, not a fixed sequence a provider walks
   regardless of what they're selling.
2. **Canonical 7 delivery methods, no eighth branch:** `in_person`, `hybrid`, `video`, `call`,
   `pdf`, `voice_notes`, `async_messaging`. Branch shapes:
   - `in_person` → Basics · Scheduling · Capacity · Logistics · Review & submit (5)
   - `hybrid` → Basics · Scheduling · Capacity · Logistics · Online half · Review (6)
   - `video` / `call` → Basics · Session details · Review (3)
   - `pdf` → Basics · What they get · Review (3)
   - `voice_notes` / `async_messaging` → Basics · Async details · Review (3)
3. **A PDF/video/call/async listing never sees location, transport, pickup, or surcharge UI at
   all** — the branch omits the step outright rather than showing it disabled or empty.
4. **Bring/Access are asked once, in free text, on the step that carries timing/duration/
   capacity questions** (named "Scheduling" in current naming — see step-rename note below), and
   only for place-anchored/hybrid methods. Copy disclaims any accessibility standard being
   claimed on the host's behalf ("we do not claim... on your behalf").
5. **Born-submitted (F2-CLOSED, migration 111):** the click that used to say "Publish Service"
   submits for admin review — the mock's own copy states "the server stores it as *submitted*,
   never published." `approval_status` defaults to `submitted` at both the ORM and DB layer;
   there is no client-reachable path to `approved`.
6. **A listing exists — and is a resumable draft — after five fields**, not after every step is
   completed. Save works from any step; the last step is not a disabled button gated on every
   field.
7. **The submit-review checklist is derived from the draft, not a manually-ticked list** — rows
   navigate back into the flow, they do not tick themselves independently of the underlying data.
8. **"Usually within 2 business days" is an expectation, not a committed SLA** — the mock flags
   this explicitly as an open question (spec gap #7), not a promise to hold the platform to.
9. **Edit-split on an approved listing** (§23): safe edits (price, photos, availability,
   description, Bring/Access, pin position) apply live; identity edits (name, category/offering,
   delivery method, safety attestations, adding a route) re-enter review via
   `pending_changes`/`edit_review_status`, with the previously approved version staying live.
10. **KNOWN DEFECT S-1 — absence is already tracked; report state, do not file as new.** This
    mock's own copy still shows the edit-split explain panel and the delete-with-bookings
    handling with mixed build-status markers (see Known divergences) — cross-check against the
    provider-console-mockup audit brief's item 10 rather than re-litigating S-1 here.

## Visual grammar

- `builtchip` (filled/teal) = ratified and built, ledger-cited. `propchip` (outline) = ratified
  design awaiting build, OR (rarely in this file) genuinely still proposed — read the chip's own
  label text ("build pending" vs "Ratified (Gate G5)") rather than assuming chip style alone
  settles it.
- The step rail on the left renders step names generated from `flowForMethod`; a step's absence
  from the rail for a given method is itself the ratified behavior, not a rendering gap.

## How to audit

1. `grep -n "in_person\|hybrid\|video\|call\|pdf\|voice_notes\|async_messaging" client/src/lib/service-form-steps.ts`
   — confirm exactly 7 keys and the branch shapes in behavior 2 above.
2. Open the wizard, pick `pdf` as delivery method — step through to Review and confirm no
   Scheduling/Capacity/Logistics step ever renders, and no Bring/Access fields appear anywhere in
   the pdf branch.
3. `grep -n "approvalStatus" shared/schema.ts` — confirm the column defaults to `"submitted"`,
   not `"draft"` or `"approved"`, and that no insert/update path exposed to a provider/expert can
   set it to `approved` directly (compare against `insertProviderServiceSchema`'s `.omit()` list).
4. Complete only the fields the mock calls "enough to save" (name, offering, delivery method,
   price) and confirm the draft persists and is resumable, without every later step being filled.
5. `grep -n "whatToBring\|accessNotes" client/src/pages/service-detail.tsx` — confirm an
   unanswered field is omitted from the traveler page, never rendered as "none provided."
6. Submit a draft for review and confirm the UI copy uses "submitted for review" language, not
   "published"/"live", and that the listing's status on Catalog reads `In review`/`Draft`, not
   `Live`, immediately after the click.

## Known divergences / notes

- This file's copy of the delete-with-bookings item shows a `propchip` "Ratified (Gate G5) —
  build pending", while the sibling export at
  `docs/design/provider-console-mockup/mockup.html` shows the same item as `builtchip` "Ratified ·
  built — delete refusal + archive (ledger 2026-08-17-delete-archive)". The two exports were not
  re-synced together; treat the provider-console-mockup export (and the ledger row it cites) as
  authoritative for that specific behavior, and confirm against the live delete flow directly
  rather than trusting either mock's chip.
- A second, differing copy of this same filename lives at `docs/testing/mock/service-creation-mock.html`.
  This brief does not resolve which one that directory intends to be current — note the
  discrepancy if it matters to the surface under audit, don't silently pick one.
