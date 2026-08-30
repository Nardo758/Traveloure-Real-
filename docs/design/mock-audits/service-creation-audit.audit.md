# Audit brief — Service Creation Audit (historical audit artifact)

**Mock:** `docs/design/service-creation-audit.html` (open in a browser — this is a static report,
nothing to click through)
**Ledger:** `docs/DECISIONS.md` rows 92 ("mock ratified in full, Wave 2 ordered"), 93 (Lane A1 —
method-first branching, "Logistics" renamed to the spatial step), 94 (Lane S5 — one-door
launcher), 97 (Lane S2 — derived checklist / draft landing / honest submit), and the packages this
file itself proposes (A/B/C, §04)
**Status:** Historical / superseded-by-fix. This is not a design mock to conform to — it is the
audit that TRIGGERED most of the ledger rows above. Nearly every finding it lists has since been
fixed by a named lane; this brief's job is to hand the external auditor a "was this actually
fixed" checklist, not to re-argue the findings.
**Live surfaces:** see `service-creation-mock.audit.md` and `provider-console-mockup.audit.md` —
same surfaces (`client/src/lib/service-form-steps.ts`, `client/src/pages/provider/service-form.tsx`,
`client/src/pages/provider/workstation.tsx`, `client/src/pages/provider/services.tsx`,
`client/src/pages/provider/listing-home.tsx`, `client/src/pages/provider/distribute.tsx`)

## What this file recorded (Aug 12, 2026, against `main` as it then stood)

Four sections: **§1** profiled the then-live 4-step wizard as ~78–87 controls, 44 of them crammed
into step 2 alone, with delivery method asked mid-step-2 (after price, after a screenful of
questions its answer would have removed). **§2** catalogued seven different surfaces that could
edit one listing (form, Catalog card switch, Catalog "Card shows", Catalog map pin, Catalog map
route stops, Catalog availability, Workstation dialogs) and noted Workstation was, in practice,
a bundle/property manager whose "Single service" tile just linked away to the same form — the
ratified "one door" rule (ruling 74) was recorded in the ledger but never built; five separate
create entry points all bypassed Workstation. **§3** ranked findings: critical (submit button
said "Publish" but the server always stored `submitted`; price asked before delivery method;
six different location questions/three radius vocabularies; dead/inert controls incl. a
Published/Draft switch wired to nothing; a since-separately-fixed office-pin silent-write bug)
down through high (one-door never built; Catalog doing three pages' jobs while Distribute had no
nav entry; money config scattered across three steps; role-vocabulary mismatches; raw JSON error
blobs, unguarded delete, no autosave) to one "worth keeping" item (Save Draft from any step; a
shared create/edit component; the never-clobber contract holding at the field level). **§4**
grouped the fix into three packages — A (hygiene, no ruling conflict), B (form restructure:
method-first, a Basics fast path, one location component, money moved out of creation, a
checklist instead of a disabled button), and C (surface reorg: Distribute gets a nav entry,
Catalog slims down) — recommending A → B → C order but noting each could ship independently.

## How an auditor should re-verify this against today's tree

This file is a point-in-time snapshot; do not re-run its methodology from scratch. Instead spot-check
that its named fixes actually landed, using the greps below (all runnable from repo root):

1. `grep -n "flowForMethod\|stepForSection" client/src/lib/service-form-steps.ts` — confirms
   Package B's "delivery method first, form branches off it" landed (ledger row 93).
2. Open the create flow and confirm delivery method is asked on step 1 (not mid step 2), before
   price is committed — confirms the critical "price before delivery method" finding is closed.
3. `grep -n "Add New Service" client/src/pages/provider/services.tsx client/src/pages/provider/workstation.tsx`
   — confirm Catalog's add action routes to Workstation rather than opening the form directly
   (ledger row 94, the one-door fix).
4. `grep -n "Published/Draft\|published-draft-switch" client/src -r` — expect NO live dead switch;
   if one still exists it is a regression against a claimed-fixed finding, not a known divergence.
5. Open `/provider/distribute` from the sidebar nav directly (not via a button on another page) —
   confirms the nav-entry finding (ledger row 98) is closed.
6. Delete a listing from Catalog and confirm a confirmation step exists (the audit's "unguarded
   delete" finding) — cross-reference `2026-08-17-delete-archive` for the fuller refuse+archive
   behavior, which is a separate, later ledger row layered on top of this fix.
7. Check listing-home / the post-create screen for a checklist ("N things left before review")
   rather than a single disabled submit button gated on every field (Package B's last bullet,
   ledger row 97).

Do not treat an unfixed finding here as automatically current-state-accurate either — some items
(e.g. the exact wording of role-vocabulary mismatches, or which specific fields were "dead") may
have shifted under later, unrelated lanes. Confirm against the live component, not this file's
prose, for anything not covered by the greps above.

## Known divergences / notes

- The office-location pre-fill bug this file flags as "fix already dispatched" is NOT this
  report's open item — treat it as closed unless a fresh grep of
  `server/routes.ts`/property-location-privacy service shows otherwise; it is out of scope for
  re-litigation here.
- This file predates the step renames ("Logistics" now names the spatial step, not the timing
  step) that later rulings introduced — where this file says "Logistics," current code and the
  other mocks in this family may mean the step now called "Scheduling." Match by described
  behavior (duration, cutoffs, booking rules), not by the label string, when cross-referencing.
