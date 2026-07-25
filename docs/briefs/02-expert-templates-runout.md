# Brief 02 — Old templates console: run-out gating

**Tier:** Haiku. **Migration:** none. **Server changes:** none. **Est. size:** ~40 LOC, UI-only.

## ⚠️ DECISION GATE

The decision-maker has three options for the legacy `expert_templates` marketplace
("Itinerary Templates") now that the Ready-Made store is the one factory→store pipeline:
**fold** (migrate stock), **run-out** (no new creations, existing stock keeps selling), or
**hide** (remove surfaces now). This brief implements **run-out**, which is the recommended
option — but it has NOT been ratified. **Do not execute until the decision-maker confirms
"run-out".** If they pick fold or hide, this brief is void and a new one is needed.

## Scope (run-out = stop NEW creations, change nothing else)

1. `client/src/pages/expert/templates.tsx` (the seller console at `/expert/templates`):
   - Remove/disable the "create new template" action (button and any empty-state create CTA).
   - Add a banner at the top: new store content is built in the Workstation as a Store Listing —
     link to `/expert/ready-made`. Honest copy, e.g. "New Ready Made Trips are built in the
     Workstation. Your existing templates below keep selling and can still be edited."
   - Everything else stays: edit, submit/resubmit, publish toggle, earnings display.
2. Nothing else. Explicitly out of scope: the create/PATCH server endpoints (leave them — the
   UI gate is the run-out mechanism; killing endpoints risks breaking edit flows that share
   code), the buyer surfaces (`/expert-templates/:id`, Discover packages tab, my-bookings
   Packages tab), admin approval queue, and any data migration.

## Traps

- Do NOT touch the Ready-Made store pages — the store console (`/expert/ready-made`) is a
  different page (`client/src/pages/expert/ready-made.tsx`).
- Do NOT remove the route from `App.tsx` — existing sellers still manage stock there.
- The empty state for an expert with zero templates should now point at the Workstation, not at
  a dead create button.

## Gate

- tsc delta 0, build, both guard scripts (README).
- Behavioral (manual or scripted): `/expert/templates` renders for an expert; no create action
  present; banner links to `/expert/ready-made`; an existing template still opens its editor.
