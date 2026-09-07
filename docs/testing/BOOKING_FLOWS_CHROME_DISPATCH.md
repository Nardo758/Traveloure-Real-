# Dispatch · Booking flows walkthrough (Claude in Chrome)

**Purpose.** Walk the live site as four different people and record, for every "buy / add / hire" control you meet,
what the button says, what it asks, and where the thing lands. The brief this feeds
(`docs/design/CONSOLE_AND_AI_CONCIERGE_BRIEF.md`) claims the variation collapses to three questions — what kind of
thing, how it is fulfilled, who is buying — and names what is missing. Your job is to confirm or contradict that
from the screen, and to find what the code reading missed.

**Site:** `[SITE_URL]` (use the preview/dev environment, Stripe in test mode). **Accounts:** `[GUEST: none]`,
`[TRAVELER_NEW: no plans]`, `[TRAVELER_PLANNING: one plan in planning, one final]`, `[EXPERT]`, `[PROVIDER]`.

## Rules of engagement

1. **Report, don't repair.** You are observing. Never edit anything in a console, never message a real person.
2. **Never complete a purchase, a hire, or a request** that reaches another human or a card. Stop at the last
   screen before Pay / Send / Confirm and screenshot it. If a flow has no such screen, say so — that is a finding.
3. **A dead route returns 200 and the app shell, not a 404.** If a URL shows the generic "Lost at Sea" page or an
   empty app frame, record it as *dead route*, never as "page exists".
4. **Every finding is a screenshot + the URL + the exact button label + what happened next.** No paraphrase of
   copy; quote it.
5. **Do not infer what a button does from its label.** Press it (up to the stop rule above) and record the landing.
6. **Absence is a finding.** "No way to pick which plan" or "no time asked" is worth more than a working step.

## What we already know (don't re-derive; confirm or contradict)

- Every sellable listing, whether an expert's or a provider's, is one row type; the difference is who sells it.
- An expert also offers something no provider can: joining a plan as its advisor. That has its own picker and
  requires a plan to exist first.
- Delivery methods are seven: pdf, video, call, in_person, voice_notes, async_messaging, hybrid. In-person and
  hybrid are place-anchored; those plus call and video are scheduled; pdf is an artifact; the last two are
  provider-declared.
- The cart is meant to be a projection of a plan's items, but a separate guest cart exists as a fallback.
- Adding to a final plan is supposed to auto-fork the next version rather than block.

## The walk

Do each row as the named person. For each, answer the **five questions** in the report template.

| # | As | Go to | Do |
|---|---|---|---|
| 1 | Guest | `/services` → any service | Press every CTA on the card and the detail page. Try to add, try to book. Where does it land? Is a plan ever mentioned? |
| 2 | Guest | `/experts` → an expert → their storefront (`/s/<handle>` if they have one, else `/experts/<id>`) | What buttons exist? Is "hire / plan with" offered to a guest? What does it do? |
| 3 | Guest | `/ready-made` → a plan | Buy up to the payment screen. Where does it say the plan will land? |
| 4 | Guest | `/cart` | What is in it after 1–3? Sign in now. What happens to the cart? Where does it go? |
| 5 | Traveler, no plans | `/services` → a service with **in_person** delivery | Add to plan / Book. Are you asked which plan? Are you asked a time or slot? Where does it land (slip? cart? nowhere)? |
| 6 | Traveler, no plans | same, but a **pdf** or **async_messaging** service | Same questions. Does the flow differ from row 5 at all? |
| 7 | Traveler, no plans | an expert's storefront | Press "hire / request / plan with". Are you sent to make a plan first? Does a request get created with no plan? |
| 8 | Traveler with plans | `/services` → any service | Is the target plan shown anywhere before you press Add? After? Can you choose between your two plans? |
| 9 | Traveler with plans | `/plans/<planning plan id>` | On the slip: Browse services, Hand off to an expert, Message. Follow Browse: does the plan context survive into the browse and back? |
| 10 | Traveler with plans | `/trip/<final plan id>` | Try to add a service from here (any door). Does it fork a new version, block, or silently edit? |
| 11 | Traveler with plans | `/experiences/<any slug>` | The "inquire / request" controls. Does it mint a plan first or send a request with none? |
| 12 | Traveler with plans | `/concierge` and `/concierge?tier=ai` | Pick each tier up to the stop rule. Where does AI land? Expert? Full? |
| 13 | Traveler with plans | `/ai-assistant` | Say a destination and dates. Press Create this plan. Where do you land, and can you get back to the conversation from the plan? |
| 14 | Traveler with plans | `/cart` | What is in it? Does it match the slip's "in checkout" count? Are there items here that are not on any plan? |
| 15 | Traveler with plans | `/bookings` | Pick a booking. Can you tell which plan it belongs to and which service it was? |
| 16 | Expert | `/provider/services` or the expert's own listing editor | Create-a-listing form: which delivery methods, pricing, and booking-mode fields exist? Screenshot the whole form. |
| 17 | Provider | same | Same. Note any field the expert form has that the provider form lacks, or vice versa. |
| 18 | Expert | `/expert/inbox` and `/expert/workspace` | What arrives when a traveler adds / requests / hires (use the stopped flows from 5–12 as the trigger). Is there a per-item "route to expert" anywhere? |

## Report template (one block per row of the walk)

```
Row N · as <person> · <URL>
1. What kind of thing was it?   listing (expert-sold / provider-sold) · advisor · ready-made · partner item
2. What did the button say?     "<exact label>" — and any second button
3. What was I asked?            plan? which plan? time/slot? party size? nothing?
4. Where did it land?           slip (which day/event?) · cart · a request · a message · nowhere · dead route
5. What was invented or hidden? a guessed time, a default plan, a price with no source, an empty state that lies
Screenshots: <n>
```

Then a closing section, **What the brief missed**, in three lists: (a) things the walk contradicted, (b) controls
that exist and the brief does not mention, (c) anything you could not test and why.

## Stop conditions

Stop and report immediately if a flow would charge a card, notify a real expert or provider, or create a booking
row without a stop screen. Those are findings on their own.
