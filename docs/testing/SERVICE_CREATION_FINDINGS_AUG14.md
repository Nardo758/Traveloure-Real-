# Service Creation — findings from a hands-on pass (Aug 14, 2026)

> **Provenance:** decision-maker-commissioned hands-on QA pass on the dev preview, signed in as
> `ci-provider@traveloure.test`; four services created end-to-end (transport / remote / tour / in-home
> chef). **As-of:** main @ `6846ab6` (post-PR-#475 — rulings 112–116 in). Uploaded verbatim below;
> punch-list disposition lives in `docs/planning/QA_PUNCH_LIST.md` ("Folded in Aug 14, 2026 —
> service-creation hands-on pass"). Per ruling 26 §5 this findings doc is the durable defect record.

# Service Creation — findings from a hands-on pass

**Environment:** provider console on the dev preview, signed in as `ci-provider@traveloure.test`
**Date:** 14 Aug 2026
**Method:** four services created end-to-end across different offerings, categories, delivery methods and pricing models. Every draft was saved; none could be submitted for review because the CI provider account has no Stripe Identity / Connect verification, so the submit button is gated at the account level, not the form level.

| # | Service | Offering / Category | Delivery method | Pricing | Result |
|---|---------|--------------------|-----------------|---------|--------|
| A | TEST A — Airport Pickup (Kansai to Kyoto) | Airport Pickup & Drop-off Driver / Transportation & Logistics | In-Person | Hourly $85 | Draft saved, all form requirements met |
| B | TEST B — Video Call Interpreter (remote) | Real-Time Translator Companion / Personal Assistance | Video Call | Fixed $120 | Draft saved |
| C | TEST C — Gion Hidden Gems Walk | Hidden-Gems Walking Guide / Tours & Experiences | In-Person | Per person $55 | Draft saved |
| D | TEST D — In-Home Private Chef | In-Home Private Chef / Food & Culinary | In-Person | Fixed $260 | Draft saved |

---

## Verdict on your finding

**Confirmed, and it is worse than you described.** Placing and confirming a map pin does not satisfy, prefill, or even soften the separate location question — and the app throws away address data it had already resolved in order to keep asking for it.

---

## 1. The location duplication

### 1.1 Six places to say the same thing

On the Logistics step of any in-person flow, a provider can be asked for the same physical location up to six times:

1. **Meeting Point \*** — required free text
2. **Map address search** — "Address or landmark, e.g. Kiyomizu-dera, Kyoto" + Find
3. **Map pin** — drop / drag / confirm
4. **Neighborhood (where this happens)** — searchable picker
5. **Pickup Location** — free text, revealed by the *Offer Pickup/Drop-off* toggle
6. **Drop-off Point** — free text

In TEST A I entered "Kansai International Airport" **four separate times** to complete one listing.

### 1.2 The pin is resolved, then discarded

Searching "Kansai International Airport" returned a fully resolved result:

> Kansai International Airport (KIX), 1番地 Senshūkūkōkita, Izumisano, Osaka 549-0001, Japan · 34.43200, 135.23660

After clicking **Confirm this location**, the card collapsed to:

> Pin placed — saves with this listing
> 34.43200, 135.23660

The human-readable address was dropped. Meanwhile **Meeting Point \*** above was still empty, still red, still required. The system had the address string, discarded it, and then demanded the provider retype it by hand.

### 1.3 The product contradicts itself

The listing home page describes the meeting point like this:

> Meeting point — Confirmed on the Logistics step — **a typed address alone is not a location.**

That is exactly right, and it is the opposite of what the wizard does. In the wizard the *typed address is required* and the pin is labelled *"(optional)"*.

**Suggested fix:** make the pin the primary input. When a pin is confirmed, write the geocoded address into Meeting Point as an editable prefill, and drop the required marker. Keep the text box purely for the human bit the pin cannot carry — "Terminal 1 arrivals hall, by the family mart, I'll have a name board."

---

## 2. Duplicate and contradictory transport questions

### 2.1 Three controls, one fact

The *Getting there* card asks the same thing three ways:

- **Offer Pickup/Drop-off** — a toggle
- **How does the traveler reach the start?** — chips: `Pickup included` · `Pickup available` · `Meet at point` · `No transport`
- **And once you've met — do you transport them?** — dropdown

The help text under the third one is a tell:

> *A different question from the one above: this is about the service itself (a car, a van), not about how they arrive.*

When a form has to explain that two adjacent questions aren't the same question, they read as the same question.

Note also that `Meet at point` in the chip group restates the *Meeting Point* field at the top of the same step, and `Pickup included` / `Pickup available` restate the toggle immediately above the chips.

### 2.2 Contradictory answers are accepted

I set **Offer Pickup/Drop-off = ON** (with Pickup Location, Drop-off Point and Service Radius all filled), then selected **No transport**. Both states persisted side by side. No warning, no reconciliation, and the listing advanced.

### 2.3 A guessed default the flow promises not to make

The flow states its own rule twice:

> Leave anything you're unsure of blank — blank means "not stated", never a guessed default.

But **"And once you've met — do you transport them?"** ships pre-selected as **"Not applicable"** — a substantive answer the provider never gave, on a field whose own help text says *"Travelers see the answer."* The chip group above it correctly reads "Not specified." until touched; this dropdown should behave the same way.

### 2.4 Two radius concepts, and the binding is broken

With **Service Radius (km) = 60**, the *Pickup coverage — a radius or a route?* panel directly below read:

> Radius — a distance around your meeting pin.
> Set the Service radius above — that number is the ring travelers see. **No radius is set yet.**

I changed it to 45 and tabbed out. Same message. Reproduced twice, with two different values. Either the panel isn't reading `serviceRadius`, or there are genuinely two radius fields and one of them is invisible.

---

## 3. Validation and cross-field logic

### 3.1 Required fields do not block navigation — reproduced 3×

`Meeting Point *` left completely empty → **Next: Review & submit** advanced anyway. Confirmed on services A, C and D. The omission only surfaces at the very end, in the "Still needed before you submit" list. On a five-step form that means a provider can walk the whole flow and only learn at the finish line that step 4 was incomplete.

### 3.2 Party size accepts impossible ranges

**Minimum party size = 6**, **Maximum party size = 2** → accepted, advanced with no error. Add **Number of Seats = 3** on step 5 and the listing now carries three mutually contradictory capacity numbers that nothing reconciles. The Capacity step's own copy promises "a traveler can never book a party you cannot take" — with min > max, that promise is unsatisfiable.

### 3.3 Pin and neighborhood are never cross-checked

Pin at **Kansai Airport (Osaka prefecture)** + Neighborhood **"Kyoto Station Area · Kyoto"** → accepted silently. The listing files onto Kyoto's market page while its only real coordinate is ~50 km away in a different prefecture. At minimum this deserves a soft "your pin is outside Kyoto — is that right?".

### 3.4 There is no way to say "at the traveler's address"

TEST D was **In-Home Private Chef — "Restaurant-quality, their kitchen."** The flow still demanded a required Meeting Point and offered a map pin for a service that happens at an address the provider cannot possibly know at listing time. Nothing in the location model expresses "traveler-supplied location". The provider's only options are to invent an address or leave the listing permanently in draft.

This affects a lot of the catalog — in-home chefs, mobile beauty, in-room massage, anything that travels to the customer.

### 3.5 Logistics branches by method but not by category

A **Hidden-Gems Walking Guide** (TEST C) got the byte-identical Logistics step as an **airport driver** — pickup/drop-off toggle, pickup and drop-off text fields, service radius, transport-during-service dropdown. A walking tour has no vehicle.

This is worth contrasting with what the flow gets *right*: step 5's category blocks branch correctly (Vehicle Type / Number of Seats / License Plate appeared only for Transportation; a "Food handling" confirmation appeared only for Food & Culinary; a Japan-specific 通訳案内士 title confirmation appeared only for the guide). The category machinery exists — Logistics just doesn't use it.

---

## 4. Structural problems with the wizard

### 4.1 "Review & submit" contains no review

Step 5 shows **no summary of steps 1–4**. Instead it introduces brand-new *required* fields — `Vehicle Type *`, `Number of Seats *` — alongside Photos, What's Included, Booking Terms, Requirements from Client, Confirmations, Revisions Included, Expert Notes and Content Affinity Tags. It is an "everything else" screen wearing a review label. A provider who reaches it expecting to check their work instead finds more form.

### 4.2 Related booking rules are split across steps — and typed differently

- **Change cutoff** lives on step 2. Numeric, in hours.
- **Lead time** lives on step 5. Free text: *"e.g., 48 hours, 1 week, 3 days"*.

Step 2 has to signpost this to the provider: *"Lead time is set under Booking terms on the Review & submit step."* When a form has to explain its own layout, the layout is the problem.

The type mismatch matters more than the placement: change cutoff is enforceable at checkout, lead time as free text is not. Two rules that both gate booking, one enforceable and one decorative.

### 4.3 Capacity gets a whole step for two optional numbers

In the In-Person flow, step 3 "Capacity" contains exactly two optional inputs. In the Video Call flow the *identical block* is folded into "Session details". The same content is a step in one branch and a card in another. The In-Person version also renders the word "Capacity" twice, back to back — as the card title and again as the section heading beneath it.

### 4.4 The step count is asserted before you've chosen anything

Loading a blank new-service page, before selecting an offering or a delivery method, the header already reads:

> **5 steps** for this delivery method. Scheduling, Capacity and Logistics are here because this one happens somewhere.

There is no "this one" yet. Related: **Delivery Method always defaults to In-Person**, including for offerings that are obviously not — "Real-Time Translator Companion" defaulted to In-Person. That default will silently produce wrong data for every provider who doesn't notice the field.

### 4.5 Availability is required to sell but isn't in the wizard

The derived checklist's final item is:

> Publish some availability — *nothing else here makes this bookable — a listing with no slots can be approved and still sell nothing.*

It lives on Catalog, outside the five steps. So a provider can complete the entire creation flow, pass review, go live, and sell nothing.

### 4.6 Two different map libraries on one screen

The pin editor renders in **Google Maps**; the "On the map" preview immediately below it renders in **Leaflet / OpenStreetMap**. Different tiles, different zoom controls, different visual language, same step, six inches apart.

---

## 5. Data defect: the Osaka neighborhood list

Every city in the Neighborhood picker has a short curated list:

- **Kyoto** — Arashiyama, Downtown / Kawaramachi, Fushimi, Gion, Higashiyama, Kyoto Station Area, Nishijin, Pontocho (10)
- **Tokyo** — Asakusa, Daikanyama, Nakameguro, Shimokitazawa, Shinjuku, Yanaka (6)
- **Paris** — 8 · **New York** — 7 · **London** — 5

**Osaka has several thousand**, at chōme level: 万代一丁目, 万代三丁目, 三軒家東二丁目, 上本町西五丁目, and on and on. It looks like a raw Japanese address table was ingested for Osaka instead of a curated neighborhood list. It is unusable in a picker, it makes the page enormous, and it means an Osaka listing cannot be filed to a neighborhood that a traveler would ever browse by. There are also visible duplicates in it (西本町一丁目 appears twice).

---

## 6. Smaller things

| | Finding |
|---|---|
| 6.1 | **Digital-deliverable fields leak into every flow.** "Revisions Included" and "Includes Expert Notes" are offered for an airport driver and a walking tour. A driver does not do revisions. |
| 6.2 | **Content Affinity Tags aren't filtered by method.** A remote video-call interpreter is offered "Hotel arrival/departure", "Photo shoot", "Restaurant visit", "Hiking/outdoor", "Wedding/proposal". |
| 6.3 | **Photos are URL text fields**, not uploads — "Cover Photo URL", "Gallery Images (image URL)". Most providers have a photo on their phone, not a hosted URL. |
| 6.4 | **The offering search swallows the first keystrokes** right after page load; it needs a second click to focus. Reproduced twice. |
| 6.5 | **Stale pin status.** With a pin visibly dropped on the map and awaiting confirmation, the status line above still reads "No pin placed — only your typed location is shown." |
| 6.6 | **Time inputs are hard to hit.** Clicking mid-field lands on the AM/PM segment and swallows the hour and minute digits; you have to click the far-left edge. Cost me two attempts on both Earliest and Latest start. |
| 6.7 | **Disabled submit with no reason.** On the listing home page "Submit for review" is disabled and says nothing about why. The wizard's equivalent button explains itself ("Verification Required" + a linked reason). |
| 6.8 | **Offering vs Subcategory is a duplicate taxonomy.** Step 1 asks "What are you offering?" → *Airport Pickup & Drop-off Driver*. The very next field asks Subcategory → a list of job titles including *Airport Transfer Specialist*. Two near-synonymous vocabularies for one fact. |

---

## 7. What's working

Worth recording, because these are the parts that shouldn't be touched while fixing the above:

- **Method branching is genuinely good.** Switching to Video Call collapsed the wizard from 5 steps to 3 and said so plainly: *"No location, transport or travel-surcharge questions in this flow — the Logistics step never appears."* That is exactly the right behaviour and the right explanation.
- **Category branching on step 5 works.** Vehicle fields only for Transportation, Food handling only for Food & Culinary, the 通訳案内士 title confirmation only for guiding.
- **Draft autosave and back-navigation are solid.** Every value — pin, neighborhood, chips, text — survived every back-and-forth across all four services.
- **The derived checklist on the listing home page is excellent.** "1 thing left before review", each row deep-linking to the step that owns it, with honest copy about what it does and doesn't tick. It's better than the wizard it sits on top of.

---

## 8. Suggested priority

**Fix first — these are defects, not opinions**

1. Required-field validation must block navigation (§3.1)
2. Confirming a pin should prefill Meeting Point and drop the required marker (§1.2, §1.3)
3. Service Radius → Pickup coverage binding is broken (§2.4)
4. Min/max party size accepts impossible ranges (§3.2)
5. The Osaka neighborhood data (§5)

**Fix next — logic and duplication**

6. Collapse the three transport controls into one (§2.1)
7. Remove the "Not applicable" default (§2.3)
8. Add a "traveler's location" option (§3.4)
9. Branch Logistics by category, not just by method (§3.5)
10. Make lead time numeric and put it next to change cutoff (§4.2)

**Fix when convenient — structure**

11. Make "Review & submit" actually review (§4.1)
12. Fold Capacity into Scheduling for the in-person flow, as Video Call already does (§4.3)
13. Don't assert a step count before a method exists; stop defaulting to In-Person (§4.4)
14. Bring availability into the flow, or rename what the flow claims to complete (§4.5)
15. One map library (§4.6)

---

*Note on test conduct: to reach the end of the flow I ticked the provider self-attestations on step 5 (insurance/permits, and food handling on TEST D). These were ticked as test input on a CI test account in the dev preview, not as a statement of fact. All four services remain unsubmitted drafts.*
