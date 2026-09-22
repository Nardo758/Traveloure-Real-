# Lane brief — "unqualified responsive grid classes" needs a rule before it can have a guard (board #1412)

**Status: NOT BUILDABLE AS FILED.** #1412 asks to *block* unqualified responsive grid classes.
Blocking requires a predicate, and no ruling in this repo says which base grid widths are
acceptable. Writing one into a CI guard would be a design decision taken by whoever wrote the
script — the class §13/§18 rule 1 keep naming.

## The census — measured 2026-09-22

Unprefixed `grid-cols-N` in `client/src` (no `sm:`/`md:`/`lg:`/`xl:` breakpoint):

| Class | Occurrences |
|---|---|
| `grid-cols-1` | 262 — always fine, it IS the mobile base |
| `grid-cols-2` | **144** |
| `grid-cols-3` | **27** |
| `grid-cols-4` | **30** |

So ~**201** unprefixed multi-column classes, of which ~**57** declare three or more columns.

**Usage is not violation.** An unprefixed `grid-cols-2` is often correct — two compact stat tiles
sit fine at 375 px. A naive guard banning every unprefixed `grid-cols-N` (N>1) would flag 201 sites,
most of them working as intended, and would be a mass refactor wearing a guard's clothes.

## What is actually missing

**Nothing checks whether page content overflows at 375 px.** The only mobile-width assertion in the
suite is `breakpoint-hamburger.spec.ts` C4, and it asserts the *mobile menu panel* has a scroll
container — not that any page's content fits. (That spec is a recorded orphan in
`scripts/test-orphan-baseline.txt:26`, which is correct and tracked; it is not a second finding.)

So the real gap is not "a lint is missing". It is that **no evidence exists that any of the 57 is
broken**. #1412 is written from a plausible hunch, and the hunch may be right, but the board row
carries no instance.

## The decision this lane needs

**How many columns may an unprefixed base class declare?** Two shapes:

- **(a) Rule the threshold, then guard it.** e.g. "an unprefixed `grid-cols-N` with N ≥ 3 is a
  defect; two is allowed". That is 57 sites to triage, each either given a `grid-cols-1 md:` base or
  annotated as deliberate. A guard after that triage is cheap and genuinely holds the line.
- **(b) Measure before ruling — cheaper, and it produces evidence instead of opinion.** Add one
  Playwright assertion at 375 px: `document.documentElement.scrollWidth <= clientWidth` on the
  public routes the DOM gates already visit. Any page that overflows is a REAL instance; if none
  overflows, #1412 closes as speculative and no 57-site refactor happens.

**My recommendation: (b) first.** It converts a hunch into a list, costs one assertion on gates that
already boot the app, and it guards the thing that actually matters — content fitting the viewport —
rather than a class name that only correlates with it. If (b) finds instances, (a)'s threshold
writes itself from them.

## Negative space

No money path, no schema, no migration, no authorization. This is a layout-quality lane.
**Nothing here should be built as a class-name grep until the rule is ruled** — a guard whose
predicate its author invented is the thing this repo's §18d discipline exists to prevent, and
banning 201 working call sites to catch an unknown number of broken ones is a poor trade.
