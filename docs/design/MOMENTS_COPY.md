# Moments — copy drafts (Landing v2.5, Lane 0)

**These are DRAFTS for the decision-maker's copy pass.** Per ruling `2026-09-01-landing-moments`
and the dispatch's HARD STOP after Lane 0, the Moments section renders **Leon's ratified words,
not these drafts**. The proposal (story 1) is taken verbatim from the v2.5 mock and is the
**register** — concrete, present-tense, sensory; a demo-tuned headline; three pieces that each
name the machine (a named **expert** doing something specific · a bookable **service** · a
**booking/hold**). The golf draft (story 2) is written to that register as the second reference.
The remaining five follow the same shape for Leon to edit.

## The register (what every story must do)

- **Eyebrow** — "A {occasion} in {city}", mono, uppercase, coral-ink.
- **Headline** — one line, the emotional promise made concrete (nouns you can picture), often
  with a private hook ("the ring stays your secret"). Demo-tuned: it should make a person in the
  target market lean in.
- **Three pieces**, numbered 01/02/03, each a single sentence naming a real part of the machine:
  1. the **expert** curating something a guide can't (a named local does the choosing),
  2. a **service** that gets booked (photographer, cellar, boat, table),
  3. the **booking/hold** that makes it real (seat held, car waiting, room blocked).
- **Builder byline** — `built by @handle · N reviews`, from **real rows only** (honest-omit when
  the moment has no builder yet; never a fabricated handle or count).

## `experienceType` mapping — READ THIS (grounding, not invented)

The chooser (`EnhancedPlanningModal.tsx` `EXPERIENCE_TYPES`) accepts exactly **five** keys today:
`travel`, `wedding`, `corporate`, `event`, `retreat`. The dispatch forbids inventing an
`experienceType` outside that set, so each moment's `Plan this moment` CTA prefills one of these
five. The seven moments are **finer than the five keys** — proposal, anniversary, milestone
birthday and family occasion all fall under `event`; golf, girls' trip and honeymoon under
`travel`. That is a real tension, surfaced here honestly:

- **Decision for Leon / Lane 2 Phase 0 (do NOT resolve in copy):** either (a) accept the coarse
  prefill (several moments → the same key, and the moment's identity carries in the section copy +
  the `momentKey` we attribute on, not in the chooser), or (b) the chooser's vocabulary grows to
  distinguish these occasions — a chooser change, filed, never invented inside a moment string.
  The drafts below use option (a): the honest current-key mapping, with the intended finer key
  noted in brackets so Leon can see the gap.

| # | Moment | market | `experienceType` (real key) | intended finer key (if chooser grows) |
|---|--------|--------|------------------------------|----------------------------------------|
| 1 | Proposal | Kyoto | `event` | `proposal` |
| 2 | Golf trip | Edinburgh | `travel` | `golf` |
| 3 | Girls' trip | Cartagena | `travel` | `girls_trip` |
| 4 | Anniversary | Porto | `event` | `anniversary` |
| 5 | Honeymoon | Goa | `travel` | `honeymoon` |
| 6 | Milestone birthday | Mumbai | `event` | `milestone_birthday` |
| 7 | Family occasion | Jaipur | `event` | `family_occasion` |

Markets are drafted for fit and are one per market across seven of the eight operating markets
(Bogotá reserved for the typed-search / cities rail). At launch a moment only appears on the slide
if it has ≥1 real, attributed photo (photo gate, ruling `2026-09-01-landing-moments`); the mock
notes only Kyoto's proposal qualifies today, the rest join as experts contribute. These drafts are
written independent of which qualify first — Lane 2 Phase 0's photo-availability table decides the
live-at-launch set.

---

## 1 · Proposal — Kyoto  *(verbatim from the mock — the register)*

- **eyebrow:** A proposal in Kyoto
- **headline:** The spot, the photographer, the dinner after — and the ring stays your secret.
- **pieces:**
  1. Yuki picks the lane in Gion no guide lists — and the hour it empties.
  2. A photographer waits out of sight; you never see the camera.
  3. Kaiseki booked for after, the counter seat held.
- **builder byline:** built by @yuki-flowers · 46 reviews
- **`experienceType`:** `event`  *(finer: proposal)*
- **market:** Kyoto
- **demo hypothesis:** A high-stakes, once-in-a-life occasion is where "a local would know the
  spot" beats any search box — the moment a traveler most wants a human, not an algorithm. If any
  moment converts cold traffic, it is this one.

## 2 · Golf trip — Edinburgh  *(second reference draft)*

- **eyebrow:** A golf trip in Scotland
- **headline:** Four rounds on the courses that don't take web bookings — and a car that knows the tee times.
- **pieces:**
  1. Callum trades on names at the members' courses a tourist can't ring — and slots you where the light is best.
  2. A driver runs the bags between links so no one carries a bag off the 18th to a train.
  3. Tee times held under one booking, the whisky bar after each round already on the list.
- **builder byline:** built by @callum-fife · 31 reviews  *(illustrative — real row or omit)*
- **`experienceType`:** `travel`  *(finer: golf)*
- **market:** Edinburgh (Scotland — the home of golf)
- **demo hypothesis:** A group trip built on access no traveler can self-serve (private tee times,
  members' courses) tests whether the expert's *connections* — not just their taste — are the draw.
  High ticket, clear "you literally cannot book this yourself" wedge.

## 3 · Girls' trip — Cartagena

- **eyebrow:** A girls' trip in Cartagena
- **headline:** The rooftop before it fills, the boat that skips the crowded cay, the table for eight that never says no.
- **pieces:**
  1. Valentina reads the night — which rooftop is worth it Thursday, which is dead — so you never waste a sunset.
  2. A private boat runs you to the island the day-tour flotillas don't reach, lunch aboard.
  3. Dinner for eight held at the courtyard place that "doesn't take groups," the late table yours.
- **builder byline:** *(real row or omit)*
- **`experienceType`:** `travel`  *(finer: girls_trip)*
- **market:** Cartagena
- **demo hypothesis:** The group-logistics headache (getting eight people into one good night) is
  a concrete pain a local erases. Tests whether "she handles the parts that don't fit in a group
  chat" reads as worth paying for.

## 4 · Anniversary — Porto

- **eyebrow:** An anniversary in Porto
- **headline:** The cellar that isn't on the tour, the river at the hour it turns gold, dinner where they remember your year.
- **pieces:**
  1. Miguel opens the family cellar that runs no public tastings — a vintage from the year you married, poured for you two.
  2. A boat down the Douro timed to the light, not the schedule the day-trips run on.
  3. The corner table at the place with no sign held for 8pm, the port after already chosen.
- **builder byline:** *(real row or omit)*
- **`experienceType`:** `event`  *(finer: anniversary)*
- **market:** Porto
- **demo hypothesis:** A couple marking a date wants the evening to *mean* something specific to
  them — the "year you married" hook tests whether personalisation a search can't do converts the
  romantic-occasion traveler.

## 5 · Honeymoon — Goa

- **eyebrow:** A honeymoon in Goa
- **headline:** The beach the resorts can't sell you, the cook who comes to you, the morning nobody schedules.
- **pieces:**
  1. Priya sends you to the south-Goa cove the package tours never reach — and the shack that grills the morning's catch.
  2. A private cook sets dinner on the sand for two, the menu built around what the boats brought in.
  3. One day left deliberately empty — a boat on call if you want it, nothing booked if you don't.
- **builder byline:** *(real row or omit)*
- **`experienceType`:** `travel`  *(finer: honeymoon)*
- **market:** Goa
- **demo hypothesis:** Honeymooners over-plan and then wish they hadn't. Tests whether "a local
  who knows when to book and when to leave you alone" — restraint as a feature — is a differentiator
  against a packed resort package.

## 6 · Milestone birthday — Mumbai

- **eyebrow:** A milestone birthday in Mumbai
- **headline:** The city's best night, engineered — the table, the car, the after-party you didn't know existed.
- **pieces:**
  1. Arjun builds the night around the one restaurant worth the wait — and gets you in on a Saturday.
  2. A car holds between the dinner, the bar, and the rooftop so the group never stands on a curb.
  3. The private room at the place that "only does members" blocked for your name, cake in on cue.
- **builder byline:** *(real row or omit)*
- **`experienceType`:** `event`  *(finer: milestone_birthday)*
- **market:** Mumbai
- **demo hypothesis:** A 40th/50th is a night someone is *responsible* for not ruining. Tests
  whether handing the logistics of a high-pressure celebration to a local who "knows the city's
  best night" removes enough anxiety to convert the host.

## 7 · Family occasion — Jaipur

- **eyebrow:** A family occasion in Jaipur

- **headline:** Three generations, one palace courtyard, and a plan that moves at everyone's pace.
- **pieces:**
  1. Rohan opens a heritage haveli's courtyard for the family dinner — the host family cooking, not a banquet hall.
  2. Cars sized to the group carry grandparents and kids the same route, no one left standing in the heat.
  3. The fort visit booked for the cool hour, a guide who slows for the elders, the evening table held after.
- **builder byline:** *(real row or omit)*
- **`experienceType`:** `event`  *(finer: family_occasion)*
- **market:** Jaipur
- **demo hypothesis:** Multigenerational trips fail on pace and access (grandparents and kids want
  different days). Tests whether a local who "moves at everyone's pace" and opens doors a family
  can't (private haveli, cool-hour bookings) wins the hardest-to-please planner — the one booking
  for a whole family.

---

## Notes for the copy pass

- Every `built by @handle · N reviews` byline must resolve to a **real** builder row at render or
  be omitted (§13) — the illustrative handles above are placeholders for Leon's edit, not
  commitments.
- Headlines are ~1 line at the mock's `26px` display size; keep to that measure so they don't wrap
  past two lines at 1280 or overflow the story panel at 390.
- The three pieces are the load-bearing copy — each must name a *specific* machine part, never a
  vague benefit. "A local helps you plan" is not a piece; "Yuki picks the lane in Gion no guide
  lists" is.
