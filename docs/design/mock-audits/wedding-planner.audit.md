# Audit brief — Planner (/start/events · three doors)

**Mock:** `docs/design/wedding-flow/Planner.dc.html`. Full page (navbar + "Events" masthead):
"Which side of the event are you on? Two of these are for people who work events. One is for you."
Three door cards: **"I'm planning my own event"** (`new` badge — "A wedding, a proposal, a reunion
— you're the host." → "Start a plan"), **"I provide event services"** (→ "Become a provider"),
**"I plan & coordinate events"** (→ "Become an expert"). Footer note: "Before: only (b) and (c)
existed, so a couple following 'Event Planner' was sent to sell."
**Status:** The mock's OWN footer states its purpose: add a third door because today only two
exist and a planning couple gets misrouted into a supply-side signup. **This is the exact
before-state the live page still shows.**
**Live surfaces:**
- `client/src/pages/start-events.tsx` — the whole page

## What the mock ratifies

1. **Three doors**, not two: a NEW "I'm planning my own event" card is added ahead of the existing
   provider/expert cards, explicitly marked `new`.
2. The new door's CTA is "Start a plan" — implying it opens the planning entry (`usePlanning`),
   not a supply-side signup form.
3. The page's own framing changes from a 2-way fork ("which business are you starting") to a
   3-way fork ("which side of the event are you on") including travelers.
4. The mock explicitly documents its own rationale: the CURRENT 2-door page misroutes couples.

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| "I'm planning my own event" door (new, → Start a plan) | `start-events.tsx:15-36` (`OPTIONS` array — only `vendor` and `planner` keys) | **NOT BUILT** | `OPTIONS` has exactly two entries. No third "traveler/host" option exists. This is the single largest, most concrete finding across all 15 artboards: the page's own code comment (`start-events.tsx:1-9`) describes precisely the problem the mock's footer states ("the /earn card sent everyone into the PROVIDER form… the nav and partner-with-us links sent everyone into the EXPERT application… every Event Planner entry point now lands here and the person picks the business they're starting") — but the fix that comment documents only unified the TWO supply-side doors. It did not add the traveler door the mock adds. A traveler/couple who lands on `/start/events` today still has no option that leads to planning their own wedding — only "become a provider" or "become an expert". |
| "I provide event services" / "Become a provider" | `start-events.tsx:16-25` (`key: "vendor"`, `href: "/become-provider"`) | MATCH | Present, same destination. |
| "I plan & coordinate events" / "Become an expert" | `start-events.tsx:26-35` (`key: "planner"`, `href: "/become-expert?type=event_planner"`) | MATCH | Present, same destination. |
| Page framing: "which side of the event are you on?" (traveler-inclusive) | `start-events.tsx:57-59` ("Which event business are you starting?") | DIVERGENCE | Live copy still frames the page as choosing a BUSINESS, consistent with the 2-door reality — this is the same gap as the missing third door, restated in the masthead copy. |
| Mock's footer note ("Before: only (b) and (c) existed…") | `start-events.tsx:1-9` (code comment) | Self-confirming | The mock's own "before" annotation and the live page's own code comment describe the SAME unresolved problem in nearly the same words — strong independent confirmation this gap is real and current, not a stale mock. |

## Already ruled

- Nothing here is ruled against. No ledger row or CLAUDE.md note marks the third door as deliberately deferred; `docs/planning/WEDDING_FLOW_BUILD_SEQUENCE.md` doesn't call it out either (its F2 finding is about `usePlanning` NOT being wired into four *other* pages — `experiences.tsx`, `experts.tsx`, etc. — and does not mention `/start/events` at all, so this specific gap appears to be a genuinely new finding from this audit, not a previously-tracked one).

## Not built

- The entire third door ("I'm planning my own event" → Start a plan) and the page's traveler-inclusive framing. This is a real, unratified, currently-live funnel gap: a couple/host following any "Event Planner" link on the site today is still sent to one of two supply-side forms, exactly as the mock's own footer describes as the bug being fixed.
