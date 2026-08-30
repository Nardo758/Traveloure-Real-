# Mock batch-creation exercise — proposed service-creation redesign

**Target:** `scratchpad/service-creation-mock.html` (6 tabs, 2,104 lines, self-contained; read-only).
**Method:** headless Chromium (Playwright, `/opt/pw-browsers/chromium-1194`), file:// load, every interactive
element exercised. Screenshots in `scratchpad/mock-exercise-shots/`. Drivers: `drive-mock.mjs`,
`drive-mock2.mjs`, `drive-mock3.mjs`, `drive-mock4.mjs`.
**Frame:** this is a MOCK. It cannot persist and has no storefront. Verdicts grade whether the *proposed
structure* can express each shape — (a) EXPRESSIBLE, (b) NOT IN MOCK SCOPE (spec gap, not a failure),
(c) DESIGN FAILS (structure actively cannot hold the shape without rework).

---

## 1. Shape-by-shape verdict table

| # | Shape | Verdict | Notes |
|---|-------|---------|-------|
| 1a | **In-person, route-anchored** (walking food tour: route stops + meeting pin + capacity) | **EXPRESSIBLE** | Best-served shape in the deck. "In person" generates `Basics → Where it happens → Logistics & group → Review` (4 steps). Location card carries one address + one pin + one radius slider + inline stop list; Logistics carries duration (one unit), group min/max, one "Getting there" question. Mapping tab's authoring canvas is genuinely good (see §5 positives). Gaps: no stop **reorder** affordance anywhere (§22a is replace-list, positions from array order — so ordering must be authorable); create-flow stop rows have **no name input** (adding one yields the literal text "New stop — name it" with no way to name it); no per-stop arrive-early/dwell field. Shots `03`–`08`, `31`–`37`. |
| 1b | **In-person + delivered artifact** (photography session → edited photos) | **NOT IN MOCK SCOPE** *(design risk flagged)* | The method taxonomy is single-choice; "Hybrid" is defined as **in person + video** only (`flow:['basics','location','logistics','online','review']`, and the Online step asks "Where does the online half happen? Traveloure video room / my own link"). There is no in-person-with-deliverable branch, so photo count, delivery timeframe, usage/licence rights have nowhere to live. The 7-method vocabulary is inherited from CLAUDE.md §3, so this is not an invention of the redesign — but making the method the *root* of the form makes the limit structural. Shot `15`. |
| 1c | **In-person, class-shaped** (cooking class) | **EXPRESSIBLE (core) / NOT IN MOCK SCOPE (specifics)** | Duration, capacity bounds, meeting pin, what-to-bring and access free-texts all present and sensible. Nothing for dietary/allergen, ingredients, minimum age, or a per-head materials fee (the surcharge taxonomy is only *travel* and *out-of-hours*). Shot `07`. |
| 2 | **Property** (machiya guesthouse, ≥2 rooms, nightly price, date-range availability) | **DESIGN FAILS** | The One-door "Property" tile promises "a room, apartment or house with per-night pricing and room availability" — clicking it routes to **the single-service Basics screen carrying whatever method was last selected** (`#tile-property` handler is identical to `#tile-single`: `S.step=0; render(); showTab('flow')`). In my run it landed on offering "Written city guide", price unit "per download", steps "Basics → What they get → Review". There is no rooms/units concept, no "per night" price unit anywhere in the unit list (`per person | per group | per hour` + the seeded unit), no date-range availability, no property builder specified on any tab. This is a promised-but-fake affordance on the screen the redesign calls "the only place a new listing is born". Shot `27`. |
| 3 | **Digital artifact** (PDF guide) | **EXPRESSIBLE** | "PDF guide" → `Basics → What they get → Review`. The step asks what they receive, how soon after buying, an **upload** block with a named file + Replace, and an optional free-sample choice. Honest one-liner: "Travellers get the current file at the moment they buy. Updating it later does not re-send." Missing: the **pasted-URL vs upload** distinction that exists in the real platform (ruling 58 — `objstore:` prefix vs legacy URL, protected streaming download), any entitlement/re-download story, and any non-PDF artifact type. Shots `11`, `12`. |
| 4 | **Live session** (60-min consultation) | **EXPRESSIBLE (thin)** | "Video call"/"Phone call" → `Basics → Session details → Review`. Session asks duration, venue (Traveloure room / my own link / I call their number), languages, "your usual hours" free text, and what they walk away with. The negative space is explicit and well-argued ("No location card, no transport question, no travel surcharge … not disabled, not skipped over. Absent."). Missing and load-bearing: **timezone as a field** (only free text "Weekday evenings, JST"), **join-link capture** — choosing "My own link" reveals no URL input, **capacity** (1:1 vs group call — group size is only on the in-person Logistics step), lead time/buffer, reschedule and no-show policy. Video and Phone render byte-identical bodies including "Where does it happen? Traveloure video room". Shots `09`, `10`. |
| 5 | **Async** ("text me your questions") | **DESIGN FAILS** *(mis-wired branch)* | `async_messaging` and `voice_notes` are both routed to the **PDF artifact step verbatim** — same "Upload the file / tokyo-like-a-local-v3.pdf / 4.1 MB / Show a sample? First 3 pages, free". With async selected, Basics seeds the *consultation call* ($40 per call, "Kyoto Trip Planning Call — 45 minutes") while the next step demands a PDF upload. No SLA / response-time, engagement window, message or voice-note count, channel, or completion definition anywhere. The repo has already ruled `voice_notes` into the `provider_declared` (async) lane (QA punch list, Aug 2026), so the mock's artifact-lumping also contradicts the platform's own model. Shots `13`, `14`. |
| 6 | **Bundles ×2** | **NOT IN MOCK SCOPE** | The locked tile is a *positive* — it states the real reason and the real counter ("Locked. Unlocks when you have 2 approved services — you have 1 approved, 1 in review", 50% progress bar) instead of a dead button. Nothing beyond the lock: no composition surface, no price relationship/discount rule, no availability intersection, no component-cancellation story. The tile is a `<div>`, so it is not keyboard reachable. Shot `26`. |
| 7 | **Custom offering** ("don't see your offering?") | **NOT IN MOCK SCOPE** | The Basics offering select carries exactly two options: the seeded offering and "Something else — browse the catalog" (inert). No free-text custom-offering path, no "can't find it" affordance, no statement of what happens to category/review when a provider names something new. Shot `28`. |
| 8 | **Post-creation arc** (draft → checklist → submit) | **EXPRESSIBLE in shape / fails in behaviour** | The *shape* is the strongest idea in the deck: Save draft on screen 1 creates the listing, the remainder is named in plain language, and the submit button always works (no disabled button, no red asterisks). But: the checklist is **method-blind** (a PDF-guide draft is told to place a map pin and confirm in-person liability cover, and its "Already done" says "Delivery method: In person · $68 per person" under a hero reading "PDF guide · $24 per download"); each item's CTA (**"Open location →"**) **ticks the item as done instead of navigating**; Submit for review leaves the hero pill on "Draft", leaves the checklist at "3 things left", and stays re-clickable. The Pricing & fees drawer is taxonomy-only. Availability/calendar authoring appears **nowhere**. Shots `20`–`25`, `43`. |
| 9 | **Share / distribute** | **NOT IN MOCK SCOPE** | The move is *argued* (Catalog wireframe marks storefront bar / share kit / promote feed / analytics strip as "moves"; the sidebar gains a "Distribute · new" entry with an honest note that the page exists with no nav entry). But every "Promote this →" is dead, and no tab shows what Distribute *contains* — no short link, QR, the three share-image formats, or §22d's route format. Shot `30`. |
| 10 | **Read path stand-in** (traveler honesty strip + Catalog preview) | **EXPRESSIBLE (partial)** | Three traveler cards demonstrate the honesty postures cleanly: confirmed pin + radius; "3 of 5 stops located" with only located stops drawn; and **no map at all** when there are no coordinates ("We would rather show nothing than guess one" — never a city-center fallback). ODbL attribution present on every canvas including the minis. Two claims the render does not keep: the caption says the unlocated stops "are listed below the map by name" — **no such list renders**; and "the pin the traveler sees is the neighbourhood, not the doorstep" — the traveler mini draws the exact same point marker as the authoring canvas, with no fuzzing/precision rule shown. Nothing traveler-side exists for: logistics answers (bring/wear, access note, getting-there), capacity, the "travel fee may apply" disclosure, surcharge zones, the deliverable sample, or session venue/timezone. Shot `38`. |

---

## 2. Findings, severity-ordered

Grade = FEATURE / LOGIC / WORKFLOW. "Expected → Actual" is what the mock's own copy promises vs what it does.

| # | Sev | Class | Shape | Expected → Actual | Shot |
|---|-----|-------|-------|--------------------|------|
| F1 | **P0** | FEATURE | Property | Door tile says "per-night pricing and room availability" → clicking it opens the single-service Basics screen with the previously selected method (landed on "PDF guide / per download / What they get"); no rooms, no nightly unit, no property builder on any tab. | `27` |
| F2 | **P0** | FEATURE | All | Every shape needs bookable time (departures, session slots, nightly ranges) → availability/calendar authoring is specified **nowhere**: the draft sidebar row is an inert `<div>` reading "Lives on Catalog", and Catalog's "Edit slots" button is dead. Nothing in the redesign makes a listing sellable. | `20`,`30` |
| F3 | **P1** | LOGIC | Async / voice notes | Method-first form should ask the async questions → both async methods render the **PDF upload step verbatim** ("Upload the file … Show a sample? First 3 pages, free") over call-seeded Basics; no SLA/window/scope fields exist. | `13`,`14` |
| F4 | **P1** | LOGIC | Post-creation | ⑤ "named things left" for *this* listing → checklist is hardcoded and method-blind: a PDF guide is told to place a map pin and confirm in-person liability cover; "Already done" contradicts the hero on method and price. | `22` |
| F5 | **P1** | WORKFLOW | Post-creation | "each deep-linked" → clicking **"Open location →"** ticks the item complete and does not navigate; checklist state is user-asserted, not derived from the record. A provider can tick their way to "Nothing left — ready for review" having done nothing. | `21` |
| F6 | **P1** | FEATURE | Live session | 60-min consultation needs a timezone, a join link and a capacity → timezone is free text ("Weekday evenings, JST"), "My own link (Zoom, Meet, Teams)" reveals **no URL field**, and no capacity question exists on the remote branch. | `09` |
| F7 | **P2** | LOGIC | Post-creation | A2 fix promises status becomes a read-only pill "Draft → In review → Live" → Submit for review shows a notice but the hero pill stays **Draft**, the checklist stays "3 things left", and the button is re-clickable with no second effect. | `23` |
| F8 | **P2** | LOGIC | In-person / mapping | ⑩ "two mounts, one component" + the confirm posture ("A typed address is never a location") → the create-flow pin button is a one-way latch (`S.pin = !S.pin ? true : true`) that **confirms instantly at hardcoded coordinates with no confirm gate and no way to clear**; "Move the pin" moves nothing. Mount A on the Mapping tab is a static image, not the component. | `04`,`38b` |
| F9 | **P2** | FEATURE | Pricing | ④ "Money in one place" → the drawer specifies a taxonomy with **no amount entry at all**: choosing "Flat fee"/"Per km"/"Part now" reveals nothing (segments are unwired), Save and Cancel are identical, base price is hardcoded "$68 per person" regardless of listing, and the travel-surcharge section renders for a *remote* listing directly under its own copy "Remote listings never see this section." | `24`,`25`,`43` |
| F10 | **P2** | LOGIC | Post-creation | ⑤ legend: "Honest submit … **no invented turnaround**" → "usually within 2 business days" appears **5 times** across Basics, Review, the draft card, the submitted notice and fix A1. Either it is a real staffed SLA (then the legend is wrong) or it is invented (then the copy is). | `20`,`08` |
| F11 | **P2** | FEATURE | In-person route | §22a route stops are an ordered replace-list → **no reorder affordance** exists in either mount, and create-flow stop rows have no name input, so "+ Add a stop" produces an unnameable "New stop — name it". | `06`,`37` |
| F12 | **P2** | LOGIC | One door | "Picking one pre-selects the category and jumps straight into the Basics screen" → clicking **Lodging & Accommodation** lands on Basics still showing "Category: Tours & Experiences / Written city guide". Category has no effect on anything, and the Lodging category vs the Property tile are two doors to the same undefined place. | `28` |
| F13 | **P2** | FEATURE | Share/distribute | ⑦ "one 'Promote this →' link per card points at Distribute" → all four links are dead and no surface shows Distribute's contents (short link, QR, three image formats, §22d route format). | `30` |
| F14 | **P2** | FEATURE | Custom offering | A real catalog always has an unlisted offering → only an inert "Something else — browse the catalog" option; no free-text path, no category-mapping or review rule. | `28` |
| F15 | **P3** | LOGIC | Read path | Caption: unlocated stops "are listed below the map by name" → no such list renders in the traveler card; and "the pin the traveler sees is the neighbourhood, not the doorstep" → the traveler mini draws the exact authoring point with no fuzzing rule. | `38` |
| F16 | **P3** | LOGIC | Mapping | Zones are "display only … amounts are set in Pricing & fees" → the ring label is a hardcoded **"+$15"** with no source, and zone geometry cannot be drawn or sized (two fixed rings). Per §8 the amount must resolve from config, and the mock should show where the ring radius comes from. | `35` |
| F17 | **P3** | WORKFLOW | Fix pack | A3: "The link opens the location card **with the field focused**" → it lands on the location step with `document.activeElement === BODY`. | `42` |
| F18 | **P3** | LOGIC | Catalog | The Catalog-after tab is the argument for a slim Catalog → its own controls are inert: status filter segments, List/Map toggle (no map view exists), Edit, Edit slots, and the per-card "Show on my storefront" toggles all do nothing. Acceptable as a wireframe, but the Map half of the "list↔map toggle" (§22b, the map's home) is asserted, never shown. | `30` |
| F19 | **P3** | FEATURE | Accessibility | Tabs are `<button>`s with `aria-selected` but no `role="tab"`/`tablist`; the Bundle tile and the Availability / Photos & media rows are `<div>`s (not focusable); the layer toggles use `aria-disabled="true"`, which makes AT and automation refuse the click that would otherwise deliver the explanatory note. | `26` |

### Positives worth carrying into the ruling

* **The Mapping tab is the strongest surface in the deck** and behaved correctly under every probe: a bare
  map click is refused with a stated reason ("That click did nothing — arm a mode first … a bare click must
  never drop a pin"); placing a pin yields **Unconfirmed** with "Pin placed but **not saved**" and
  Confirm/Discard; Discard genuinely clears; radius and zone layers are **gated on a confirmed pin** with an
  honest reason ("a radius has no centre without one"); relocate names the stop it is arming for; the
  located counter (`3 of 4 located`) and the "sequence, not travel routing" caption stay truthful as stops
  are added, placed and removed. This matches the §22 posture (confirm-gated pin, nullable stop coords,
  dashed connectors labelled as sequence, ODbL attribution).
* **Method-first genuinely removes questions rather than disabling them** — the remote flows carry no
  location, transport or travel-surcharge question at all, and say so.
* **The draft-first arc** (five fields → a real listing → a named remainder → a button that always works) is
  a real answer to the "everything before it saves anything + disabled button + five red asterisks" problem.
* **The Bundle lock is honest** (real precondition, real counter) — the pattern to reuse for any locked door.
* **The delete modal names the listing and states what happens to the 2 upcoming bookings.**
* **"Platform commission is not shown or set here — it is resolved from your category, not typed into a form"**
  is exactly the §8/§18 posture and should survive into the build.
* Traveler no-coordinates card refuses to render a map at all — the §13/§20 honesty posture, stated in the
  provider's own language.

---

## 3. Spec-gap list — what the redesign must specify before an execution map can be drafted

*(the core deliverable; each item is a surface the mock either asserts without showing, or never reaches)*

1. **Property builder.** Units/rooms and their relationship to one listing; nightly/weekly price units (the
   unit list today cannot express "per night"); occupancy and extra-guest rules; date-range availability +
   min-stay; per-room photos; address/pin disclosure rule for a stay; house rules; stay-shaped cancellation.
   Also: does the Property tile create a `provider_services` row (CLAUDE.md canonical-table rule) or a new
   shape — this is a schema question and needs the decision-maker.
2. **Availability & calendar authoring** — the biggest hole. Per method: departures/slots for in-person,
   timezone-aware slots with lead time and buffers for live sessions, date ranges for property, none for
   artifacts. Blackout dates; how capacity (group min/max) relates to `vendor_availability_slots.booked_count`;
   and *where* it lives — the mock says "Lives on Catalog" but never shows the surface.
3. **The async / voice-notes branch.** Response SLA, engagement window, scope (message or note count),
   channel, and what "delivered/complete" means for a shape with no booked slot — the repo has already ruled
   `voice_notes` into the `provider_declared` async lane; the spec must match that, not the PDF step.
4. **Live-session details.** Timezone as a first-class field; join-link capture when "My own link" is chosen;
   1:1 vs group capacity on the remote branch; reschedule/no-show; recording/notes deliverable.
5. **The deliverable rail.** Upload vs legacy pasted URL (ruling 58's `objstore:` prefix), the protected
   streaming download and its entitlement gate, versioning/re-delivery semantics, sample generation, accepted
   file types beyond PDF.
6. **Checklist derivation.** Which items exist **per delivery method**; derivation from record state (never a
   user tick); each item's deep-link target; what blocks submit vs what is advisory; how the list reacts when
   the method is changed after the draft exists.
7. **Submit → review state machine on the console.** Draft → In review → Live / Changes requested; what is
   editable while in review and whether an edit resets it; where the decision surfaces; and whether the
   "2 business days" turnaround is a real staffed SLA the platform will stand behind (§13 honesty).
8. **Pricing & fees amounts.** Flat / per-km / percentage entry; deposit amount and balance timing (a deposit
   rail was ratified in-repo — the drawer must match it); surcharge-zone amounts **and zone geometry
   authoring**; per-method visibility rules; and the §8 rule that no rate literal lives in code or in a mock
   label ("+$15").
9. **Bundle composition.** Eligible components, price relationship/discount, availability intersection,
   component cancellation/refund, and whether a bundle re-enters review.
10. **Custom offering path.** "Don't see your offering?" → free text → category mapping → what review sees.
11. **Category ↔ method relationship.** Does a category constrain the method set or prefill anything? What
    resolves the Lodging-category / Property-tile collision? Today neither does anything.
12. **Map component contract across the two mounts.** Shared pin+stop state (the mock keeps two independent
    lists); the confirm gate present in *both* mounts (the create-flow pin has none); stop rename, reorder and
    replace-list semantics matching §22a; the unlocated flag; whether zones are authorable or read-only.
13. **Traveler read surfaces for everything authored.** Pin precision/fuzzing rule; the unlocated-stops name
    list; logistics answers (bring/wear, access, getting-there); capacity; the "travel fee may apply"
    disclosure; deliverable sample; session venue/timezone. Rule of thumb the mock implies but does not
    enforce: *nothing authored in the flow ships without a traveler-side representation or an explicit
    decision that it is provider-only.*
14. **Distribute page contents + entry.** Share kit (three image formats incl. §22d's route format), short
    link, QR, and the analytics boundary (measurement stays on Performance).
15. **In-person + artifact combination**, and per-category extra fields (allergens/dietary, minimum age,
    structured accessibility): either rule them out explicitly or name the extension mechanism. Making the
    delivery method the root of the form makes this decision load-bearing.
16. **Photos & media authoring** — listed as a settings row, never specified (cover-photo requirement,
    gallery, clip, where it is edited).
17. **The edit path for an existing/live listing.** The mock only shows birth; Catalog "Edit" is dead. The
    copy promises "changes are re-checked before anything goes live" — that needs a specified flow.
18. **Delete semantics with live bookings** — the modal copy is good; the actual rule (bookings survive, the
    listing leaves search) needs ratifying.
19. **The five replaced entry points.** The One-door tab names them (Catalog empty state, Catalog header,
    Dashboard quick action, Onboarding, Playbook) — the execution map needs each one's current target and
    whether any keeps a fast path.

---

## 4. Mock bugs (distinct from design findings)

**Zero console errors and zero page errors across all four driver runs** — the mock is clean JS.
The following are implementation defects in the mock itself (they misrepresent the design under review):

| ID | Bug |
|----|-----|
| M1 | `#btn-pin` handler is `S.pin = !S.pin ? true : true` — a one-way latch. "Move the pin" cannot move or clear the pin, and it confirms instantly at hardcoded coords, contradicting the Mapping tab's own confirm gate. |
| M2 | Checklist item CTAs tick the item instead of navigating (the whole row is one button). |
| M3 | The Draft tab is method-blind: only `#draft-hero-sub` syncs; `CHECKS`/`DONE` are hardcoded in-person copy. |
| M4 | `#tile-property` and the 12 category tiles share `#tile-single`'s handler — no property flow, no category pre-select, despite copy claiming both. |
| M5 | Catalog controls inert: status filter segments, List/Map toggle, Edit, Edit slots, Promote this, storefront toggles. |
| M6 | Pricing drawer: segmented controls unwired; Save === Cancel; base price hardcoded; travel-surcharge section shown for remote listings against its own help text. |
| M7 | Submit for review is idempotent-by-accident only (re-clickable, no state change anywhere else on the page). |
| M8 | Create-flow stop rows render the stop name as text (no input) while the Mapping rail renders inputs — the two "mounts" are not the same list or the same component; `S.stops` and `M.stops` are independent state. |
| M9 | The arm bar overlays the top ~50 px of the canvas and its click handler returns early, so a pin cannot be placed in the top strip of the map. |
| M10 | A3's promise "with the field focused" is not implemented (`activeElement` stays `BODY`). |
| M11 | Accessibility: no `role="tab"/"tablist"`; Bundle tile and two settings rows are non-focusable `<div>`s; `aria-disabled` layer toggles are unreachable to AT/automation while still carrying the only path to their explanatory note. |
| M12 | Zone label "+$15" and the two zone radii are hardcoded literals with no stated source (§8 posture). |

---

## 5. Narrative — does the design survive contact with a full real-world catalog?

**Partly, and the part that survives is the important part.**

Three ideas in this proposal are right and worth ratifying more or less as drawn. **Delivery-method-first**
works: the step list is genuinely generated (3 / 4 / 5 steps), and the remote flows *omit* the location,
transport and surcharge questions rather than disabling them — walking the same seven methods through the
mock produced seven coherent forms in four shapes, and the review screen tells the truth about what was
never asked. **Draft-first** works: five fields to a saved listing, with the remainder named in plain
language, is a real answer to a form that collects everything before it saves anything and then shows a
disabled button. And **the map-authoring canvas is the best-behaved surface in the deck** — armed modes, a
confirm gate that actually withholds the save, layers gated on a confirmed pin with a stated reason, an
honest located-count, and connectors labelled as sequence rather than routing. That canvas could be built
from this mock nearly as-is.

What does not survive is the **catalog's breadth**. Drive a real provider's inventory through it and the
design covers one shape richly (place-anchored in-person), one adequately (a PDF artifact), one thinly (a
live call missing its timezone, join link and capacity), gets one **actively wrong** (async and voice notes
are handed a PDF upload form), and **fails one outright** (Property is a door with nothing behind it — and
it is a door on the screen the proposal calls "the only place a new listing is born"). The single largest
hole is not any one shape: it is that **nothing in the redesign makes a listing sellable.** Availability and
calendar authoring — departures, timezone-aware slots, nightly date ranges — is mentioned twice as living
"on Catalog" and never specified or shown. A provider can complete this entire flow, submit, be approved,
and still have nothing a traveler can book.

The second-order risk is subtler and worth naming to the decision-maker: **the redesign's honesty claims
outrun its own implementation in three places.** The legend promises "no invented turnaround" over copy
that invents one five times; the checklist promises deep links and delivers checkboxes that mark work done
without doing it; and "two mounts, one component" is asserted over a create-flow pin that has no confirm
gate at all. Each is cheap to fix on paper — but the checklist one is the sharpest, because a checklist a
provider can tick without acting is *worse* than the disabled button it replaces: the old button lied about
what it did, and this one would let the provider lie to themselves about what is finished. Derive it from
the record, per method, or it will re-create the problem it was drawn to solve.

**Recommendation for the ruling.** Approve the spine (method-first step generation, draft-first with a
derived checklist, the one-door ladder, the map component and its confirm posture, and Package A's six
fixes — A1–A6 are all independently shippable and none depends on the redesign landing). Do **not** approve
Property or Bundle as drawn — the tiles should stay locked with honest preconditions, exactly as Bundle
already is, until each has a specified builder. Treat the 19 items in §3 as the gate: an execution map
drafted before availability, the async branch, the property builder and the checklist-derivation rule are
specified will discover them mid-build, on a form whose entire structure is derived from the delivery
method it does not yet handle correctly.
