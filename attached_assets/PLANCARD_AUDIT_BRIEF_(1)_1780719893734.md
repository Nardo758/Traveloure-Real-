# PlanCard — Design Audit Brief (READ-ONLY)

**Type:** read-only audit. **No code changes in this brief.** Produce findings only.
**Audit target:** the traveler-facing PlanCard ("itinerary control center on the phone").
**Spec baseline:** Piece 3 (PlanCard) + Unified Planning Flow Spec v2 §6 + Expert Workspace Spec flag #3.
**Output:** a findings table (§ "Required output") with `file:line` evidence for every line. Do not mark anything BUILT without a `file:line` citation.

---

## 0. How to run

1. Work on a read-only branch or detached HEAD. Touch no files.
2. For each check below, run the listed `grep`/inspection, capture the evidence, and classify:
   - **BUILT** — implemented and matches spec (cite `file:line`).
   - **PARTIAL** — present but diverges from spec (cite + describe divergence).
   - **MISSING** — no implementation found (state the greps that returned nothing).
   - **DRIFT** — implemented differently than spec in a way that will cause bugs/inconsistency.
3. End with the verification gate (§ "Verification gate") and the findings table.

Starting points to locate the surface:
```bash
# Find the PlanCard component system and the trip route
grep -rn "components/plancard" client/src --include=*.tsx --include=*.ts
grep -rn "PlanCard\|plancard" client/src/App.tsx
grep -rn "/trip/:id\|/trip/:tripId" client/src/App.tsx
ls -la client/src/components/plancard/ 2>/dev/null || echo "NO plancard dir"
```

---

## 1. Spec baseline (what the PlanCard is supposed to be)

- A lightweight in-app **map overview** with **3 toggleable layers**: (1) activity pins, (2) transport routes with **inline mode swap**, (3) expert notes.
- The transport-routes layer is a **multi-leg map display**: the card renders the **full day's route as connected legs across all stops** (stop → leg → stop → leg …), not just isolated pins or a single A→B line. This is the in-card visualization, separate from the native handoff.
- **Native handoff** to Google Maps / Apple Maps for turn-by-turn via a **deep-link URL builder** (PlanCard does *not* do turn-by-turn itself).
- **Transport legs are computed server-side after expert review is complete**; users can **customize mode selection inline**.
- **Collaboration model:** experts can edit + fill transport; friends can comment/suggest but **not** edit; owners have full control.
- **Attribution:** all changes tracked (who changed what, when).
- **Accept/reject flow** for both AI and expert suggestions.
- Populated by the post-optimize push (Unified Flow v2 §6): activities, services, transport legs, map layers, change-log, collaborators all land on `/trip/:id`.

---

## 2. Audit checks

### A1 — Shared component system exists
Spec: a shared `components/plancard/` renderer used by the traveler side.
```bash
ls client/src/components/plancard/
grep -rn "from .*components/plancard" client/src --include=*.tsx
```
Capture: the files in the dir, and which pages import them. Classify.

### A2 — Layer 1: activity pins
```bash
grep -rni "pin\|marker\|activity.*map\|map.*activity" client/src/components/plancard
```
Capture: is there a layer toggle for activity pins? Are pins driven by itinerary items with coords? Classify.

### A2b — Multi-leg route display (full-day connected route on the card)
Spec: the card draws the whole day as connected legs across all stops, not just pins.
```bash
grep -rni "polyline\|directions\|route\|waypoint\|leg\|path\|encodePolyline\|DirectionsRenderer\|geometry" client/src/components/plancard
```
Capture: does the in-card map render a connected multi-stop route (polyline/path through every stop in order), or only drop individual pins (A2)? If a route is drawn, is it one path per **leg** (so each leg can be styled/edited independently) or a single undifferentiated line? Where do the route geometries come from (server-computed legs vs client-side Directions call)? Classify. **This determines whether per-leg mode changes can redraw a single segment (Brief 2 Phase 3).**

### A3 — Layer 2: transport routes + INLINE MODE SWAP  *(gates the transport brief)*
```bash
grep -rni "transport\|route\|leg\|walk\|transit\|drive\|driving\|bicycl" client/src/components/plancard
grep -rni "mode" client/src/components/plancard
```
Capture, specifically:
- Is there a transport-routes layer at all?
- Is there any **inline control to change the mode of a leg** (dropdown/segmented/toggle), or is mode read-only/display-only?
- What modes are enumerated, and where do they come from (hard-coded array vs config)?
Classify. **This is the single most important check for the follow-on transport build.**

### A4 — Layer 3: expert notes
```bash
grep -rni "expert.*note\|notes.*layer\|expertNotes" client/src/components/plancard
grep -rn "expert-notes" client/src --include=*.tsx
```
Capture: does the PlanCard surface expert notes as a toggleable layer, reading the same `expert-notes` data the workspace writes (`routes.ts:17742/17759`)? Classify.

### A5 — Native handoff deep-link builder
Spec: deep-link URL builder to Google/Apple Maps.
```bash
grep -rni "maps.google\|google.com/maps\|maps.apple\|comgooglemaps\|geo:\|deep.?link\|mapsUrl" client/src --include=*.ts --include=*.tsx
```
Capture: is there a single URL-builder util, or are URLs constructed ad hoc? Does it handle multi-stop (waypoints) or only single destination? Does it branch iOS/Android/web? Classify.

### A6 — Transport leg PERSISTENCE + activate-transport  *(gates the transport brief)*
Spec: legs computed server-side post-review. Determine **whether legs are stored or ephemeral.**
```bash
grep -rni "activate-transport\|activateTransport" server --include=*.ts
grep -rni "transport_leg\|transportLeg\|transport_legs\|legs" shared/schema.ts
grep -rni "transport" shared/schema.ts
sed -n '10740,10860p' server/routes.ts   # inspect the activate-transport handler around routes.ts:10765
```
Capture and answer explicitly:
- Is there a `transport_legs` (or equivalent) table? If yes, list its columns. If no, say so plainly.
- What does `activate-transport` return, and **does it write legs anywhere** or just compute-and-return?
- Per leg, what fields exist: from/to, distance, duration, **selectedMode**, per-mode alternatives?
This answer determines the data layer of the transport feature. Classify.

### A7 — Collaboration permissions (owner / expert / friend)
Spec: owner full control; expert edit + fill transport; friend comment/suggest only (no edit).
```bash
grep -rni "collaborator\|owner\|role.*friend\|canEdit\|permission\|suggest" client/src/components/plancard
grep -rni "collaborator\|trip.*role\|tripRole" shared/schema.ts server --include=*.ts
```
Capture: is there a role/permission model on the trip for collaborators? Is edit-vs-suggest enforced **server-side** or only hidden in UI? Classify.

### A8 — Attribution / change-log
Spec: every change tracked (who changed what, when).
```bash
grep -rni "changeLog\|change_log\|changedBy\|changed_by\|updatedBy\|audit\|history" shared/schema.ts server --include=*.ts
grep -rni "changeLog\|attribution\|changedBy" client/src/components/plancard
```
Capture: is there a change-log table/structure with actor + timestamp + target? Classify.

### A9 — Accept/reject flow for AI + expert suggestions
```bash
grep -rni "accept\|reject\|suggestion\|proposed\|pending.*change" client/src/components/plancard server --include=*.ts
```
Capture: is there a suggestion object with an accept/reject action that mutates the plan on accept? Distinguish AI vs expert origin. Classify.

### A10 — Workspace ↔ PlanCard renderer divergence (Expert Workspace flag #3)
Spec/known issue: the expert workspace renders the itinerary with **bespoke** components (`DayCard`, `ARow`, `TConn`) instead of `components/plancard/`.
```bash
grep -rn "DayCard\|ARow\|TConn" client/src/pages/expert/workspace.tsx
grep -rn "from .*components/plancard" client/src/pages/expert/workspace.tsx
```
Capture: confirm the two renderers still diverge, or note if reconciled. Classify (expect DRIFT).

### A11 — Fee / hard-coded literals near transport (fee-architecture rule)
Rule: every platform fee must be admin-configurable; no hard-coded literals. Also flag any hard-coded mode lists or pricing tied to transport.
```bash
grep -rni "0\.\(15\|25\|30\|75\|85\)\|fee\s*=\|FEE\b" client/src/components/plancard
grep -rni "const.*mode.*=\s*\[" client/src --include=*.tsx   # hard-coded mode arrays
```
Capture: any hard-coded fee or mode literal that should be config-driven. Classify.

---

## 3. Verification gate

```bash
npx tsc --noEmit        # must pass on the untouched tree (baseline sanity)
git status              # MUST show no modified files — this is a read-only audit
```
If `git status` shows changes, the audit was not read-only — revert and rerun.

---

## 4. Required output

Return exactly this table, one row per check, plus the four narrative answers below it.

| Check | Status | Evidence (`file:line`) | Notes / divergence |
|-------|--------|------------------------|--------------------|
| A1 shared component system | | | |
| A2 activity pins layer | | | |
| A2b multi-leg route display | | | |
| A3 transport routes + inline mode swap | | | |
| A4 expert notes layer | | | |
| A5 native deep-link builder | | | |
| A6 transport leg persistence | | | |
| A7 collaboration permissions | | | |
| A8 attribution / change-log | | | |
| A9 accept/reject flow | | | |
| A10 workspace↔plancard divergence | | | |
| A11 hard-coded fee/mode literals | | | |

**Then answer in prose (these unblock the transport build):**
1. **A6 verdict:** Is there a persisted transport-leg record? If yes, paste its columns. If no, describe exactly what `activate-transport` returns.
2. **A3 verdict:** Does an inline mode-swap control already exist? If partial, what's missing?
3. **A7 verdict:** Are collaborator edit/suggest permissions enforced server-side or UI-only?
4. **A8 verdict:** Is there any attribution structure today, or does it need to be built?

---

## 5. What NOT to do

- **Do not modify any file.** This brief produces findings only.
- **Do not mark a check BUILT without a `file:line` citation.** "It probably exists" is not evidence.
- **Do not infer behavior from component names** (e.g. a `TransportLayer` file does not mean inline mode swap is wired — open it and confirm the control).
- **Do not skip A6.** Every downstream decision in the transport brief depends on whether legs persist.
- **Do not collapse PARTIAL into BUILT** to make the table look clean. Divergence is the point of the audit.
- **Do not re-verify line numbers from memory.** `server/routes.ts` is ~18.5k lines; cite what you actually see.
