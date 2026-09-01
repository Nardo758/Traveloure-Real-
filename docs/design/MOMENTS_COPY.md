# Moments — copy drafts (Landing v2.5, Lane 0)

**Copy pass RULED (decision-maker, 2026-09-01): run the drafts as-is + two honesty riders**
(applied below). First-weeks click data sharpens headlines; copy iterates with the walkthrough
digests. The proposal (story 1) is verbatim from the v2.5 mock and is the **register** — concrete,
present-tense, sensory; a demo-tuned headline; three pieces that each name the machine (a **local**
doing something specific · a bookable **service** · a **booking/hold**).

**Rider (a) — no fabricated experts.** Placeholder first names are not real experts. Where a market
has no real builder yet, piece 01 reads "**A local who…**" and the byline **honest-omits**; the
real first name replaces it when a real row exists. **Only Yuki (story 1) is real today.**

**Rider (b) — don't promise access nobody holds.** A piece may claim an access a real platform
expert holds (Yuki holding a counter seat — the ratified value prop). It may **not** claim a
relationship no expert on the platform has yet. The golf story is rewritten to **taste** (knowing
*which* courses and in what order), not **access** (getting you onto members' courses), until a
real Scottish expert holds those relationships.

## The register (what every story must do)

- **Eyebrow** — "A {occasion} in {city}", mono, uppercase, coral-ink.
- **Headline** — one line, the emotional promise made concrete (nouns you can picture), often
  with a private hook ("the ring stays your secret"). Demo-tuned: it should make a person in the
  target market lean in.
- **Three pieces**, numbered 01/02/03, each a single sentence naming a real part of the machine:
  1. the **local** curating something a guide can't (named when a real builder row exists, else
     "A local who…" per rider (a)),
  2. a **service** that gets booked (photographer, cellar, boat, table),
  3. the **booking/hold** that makes it real (seat held, car waiting, room blocked).
- **Builder byline** — `built by @handle · N reviews`, from **real rows only** (honest-omit when
  the moment has no builder yet; never a fabricated handle or count).

## `experienceType` (coarse machine key) + `momentKey` (fine identity) — RULED

The chooser (`EnhancedPlanningModal.tsx` `EXPERIENCE_TYPES`) accepts exactly **five** keys today:
`travel`, `wedding`, `corporate`, `event`, `retreat`. **These are not marketing labels — they are
machine keys** that drive optimizer complexity/pricing tiers and the PlanCard skins
(travel/wedding/corporate). Overloading them with occasion identity would make "proposal" a
fee-tier question. So the ruling (decision-maker, 2026-09-01, ledger `2026-09-01-moment-key`):

- **`experienceType` does NOT grow.** Each moment's `Plan this moment` CTA prefills one of the
  five existing keys per the table below — the coarse prefill. No fee-tier or template change.
- **The fine occasion identity rides on a new nullable `momentKey`**, carried on the trip
  (context/row), written by the chooser **only when opened from a moment**, persisted through trip
  creation, and read by (a) **attribution** — the moment→trip→purchase funnel joins on it — and
  (b) the **AI/expert plan-generation prompt** ("this is a proposal"), so the identity actually
  improves the plan, not just the analytics. `momentKey` values are exactly the moment keys
  (`proposal`, `golf`, `girls_trip`, `anniversary`, `honeymoon`, `milestone_birthday`,
  `family_occasion`) — one vocabulary across the `moments` config, the attribution event, and the
  trip.
- **Where `momentKey` lands (`trip_contexts` vs `trips`) is a Lane 2 Phase 0 question**; additive
  nullable column, migration number verified against origin, declared in `shared/schema.ts`
  (publish-trap rule). No fee-tier or template changes.

| # | Moment | market | `experienceType` (coarse, prefilled) | `momentKey` (fine identity) |
|---|--------|--------|--------------------------------------|------------------------------|
| 1 | Proposal | Kyoto | `event` | `proposal` |
| 2 | Golf trip | Edinburgh | `travel` | `golf` |
| 3 | Girls' trip | Cartagena | `travel` | `girls_trip` |
| 4 | Anniversary | Porto | `event` | `anniversary` |
| 5 | Honeymoon | Goa | `travel` | `honeymoon` |
| 6 | Milestone birthday | Mumbai | `event` | `milestone_birthday` |
| 7 | Family occasion | Jaipur | `event` | `family_occasion` |

Markets are drafted for fit and are one per market across seven of the eight operating markets
(Bogotá reserved for the typed-search / cities rail). At launch a moment only appears if it has ≥1
**attributed real** photo (photo gate, rulings `2026-09-01-landing-moments` + `2026-09-01-photo-tiers`).
**Phase 0 finding (`docs/audits/landing-moments-phase-0.md`): ZERO qualify today** — the mock's
"Kyoto qualifies from gem photos" is false, because those gem photos are `images.unsplash.com`
stock, which the gate forbids. The section is therefore suppressed until the first attributed real
photo lands (empty state B), which enters through the front door (a real expert photo via evidence
capture), not a seed. These drafts stand regardless; the live-at-launch set is data-driven.

---

## 1 · Proposal — Kyoto  *(verbatim from the mock — the register)*

- **eyebrow:** A proposal in Kyoto
- **headline:** The spot, the photographer, the dinner after — and the ring stays your secret.
- **pieces:**
  1. Yuki picks the lane in Gion no guide lists — and the hour it empties.
  2. A photographer waits out of sight; you never see the camera.
  3. Kaiseki booked for after, the counter seat held.
- **builder byline:** built by @yuki-flowers · 46 reviews
- **`experienceType`:** `event`  *(momentKey: proposal)*
- **market:** Kyoto
- **demo hypothesis:** A high-stakes, once-in-a-life occasion is where "a local would know the
  spot" beats any search box — the moment a traveler most wants a human, not an algorithm. If any
  moment converts cold traffic, it is this one.

## 2 · Golf trip — Edinburgh  *(second reference draft; rider (b) applied — taste, not access)*

- **eyebrow:** A golf trip in Scotland
- **headline:** Four rounds in the right order, on the courses worth the trip — and a car that runs the bags between links.
- **pieces:**
  1. A local who knows which courses are worth your four rounds — and the order that plays each at its best hour.
  2. A driver runs the bags between links so no one carries a bag off the 18th to a train.
  3. Tee times booked in sequence, the whisky bar after each round already on the list.
- **builder byline:** *(real row or omit — no real builder yet)*
- **`experienceType`:** `travel`  *(momentKey: golf)*
- **market:** Edinburgh (Scotland — the home of golf)
- **demo hypothesis:** A high-ticket group trip where a local's *curation* — which courses, in which
  order, at which hour — plus the coordination of transport and tee times is the draw. Tests whether
  taste + logistics convert on a group trip, without over-claiming access no expert holds yet
  (rider b). If/when a real Scottish expert holds members'-course relationships, the access wedge
  can return.

## 3 · Girls' trip — Cartagena

- **eyebrow:** A girls' trip in Cartagena
- **headline:** The rooftop before it fills, the boat that skips the crowded cay, the table for eight that never says no.
- **pieces:**
  1. A local who reads the night — which rooftop is worth it Thursday, which is dead — so you never waste a sunset.
  2. A private boat runs you to the island the day-tour flotillas don't reach, lunch aboard.
  3. Dinner for eight held at the courtyard place that "doesn't take groups," the late table yours.
- **builder byline:** *(real row or omit)*
- **`experienceType`:** `travel`  *(momentKey: girls_trip)*
- **market:** Cartagena
- **demo hypothesis:** The group-logistics headache (getting eight people into one good night) is
  a concrete pain a local erases. Tests whether "she handles the parts that don't fit in a group
  chat" reads as worth paying for.

## 4 · Anniversary — Porto

- **eyebrow:** An anniversary in Porto
- **headline:** The cellar that isn't on the tour, the river at the hour it turns gold, dinner where they remember your year.
- **pieces:**
  1. A local who opens the family cellar that runs no public tastings — a vintage from the year you married, poured for you two.
  2. A boat down the Douro timed to the light, not the schedule the day-trips run on.
  3. The corner table at the place with no sign held for 8pm, the port after already chosen.
- **builder byline:** *(real row or omit)*
- **`experienceType`:** `event`  *(momentKey: anniversary)*
- **market:** Porto
- **demo hypothesis:** A couple marking a date wants the evening to *mean* something specific to
  them — the "year you married" hook tests whether personalisation a search can't do converts the
  romantic-occasion traveler.

## 5 · Honeymoon — Goa

- **eyebrow:** A honeymoon in Goa
- **headline:** The beach the resorts can't sell you, the cook who comes to you, the morning nobody schedules.
- **pieces:**
  1. A local who sends you to the south-Goa cove the package tours never reach — and the shack that grills the morning's catch.
  2. A private cook sets dinner on the sand for two, the menu built around what the boats brought in.
  3. One day left deliberately empty — a boat on call if you want it, nothing booked if you don't.
- **builder byline:** *(real row or omit)*
- **`experienceType`:** `travel`  *(momentKey: honeymoon)*
- **market:** Goa
- **demo hypothesis:** Honeymooners over-plan and then wish they hadn't. Tests whether "a local
  who knows when to book and when to leave you alone" — restraint as a feature — is a differentiator
  against a packed resort package.

## 6 · Milestone birthday — Mumbai

- **eyebrow:** A milestone birthday in Mumbai
- **headline:** The city's best night, engineered — the table, the car, the after-party you didn't know existed.
- **pieces:**
  1. A local who builds the night around the one restaurant worth the wait — and gets you in on a Saturday.
  2. A car holds between the dinner, the bar, and the rooftop so the group never stands on a curb.
  3. The private room at the place that "only does members" blocked for your name, cake in on cue.
- **builder byline:** *(real row or omit)*
- **`experienceType`:** `event`  *(momentKey: milestone_birthday)*
- **market:** Mumbai
- **demo hypothesis:** A 40th/50th is a night someone is *responsible* for not ruining. Tests
  whether handing the logistics of a high-pressure celebration to a local who "knows the city's
  best night" removes enough anxiety to convert the host.

## 7 · Family occasion — Jaipur

- **eyebrow:** A family occasion in Jaipur

- **headline:** Three generations, one palace courtyard, and a plan that moves at everyone's pace.
- **pieces:**
  1. A local who opens a heritage haveli's courtyard for the family dinner — the host family cooking, not a banquet hall.
  2. Cars sized to the group carry grandparents and kids the same route, no one left standing in the heat.
  3. The fort visit booked for the cool hour, a guide who slows for the elders, the evening table held after.
- **builder byline:** *(real row or omit)*
- **`experienceType`:** `event`  *(momentKey: family_occasion)*
- **market:** Jaipur
- **demo hypothesis:** Multigenerational trips fail on pace and access (grandparents and kids want
  different days). Tests whether a local who "moves at everyone's pace" and opens doors a family
  can't (private haveli, cool-hour bookings) wins the hardest-to-please planner — the one booking
  for a whole family.

---

## Notes for the copy pass (riders applied)

- **Riders applied (decision-maker, 2026-09-01):** (a) placeholder expert names removed — every
  piece 01 except story 1 (Yuki, real) now reads "A local who…" and every byline except story 1
  honest-omits; the real first name replaces "A local who" when a real builder row exists. (b) the
  golf story is taste, not access — its former "trades on names at the members' courses a tourist
  can't ring" is gone, along with the "courses that don't take web bookings" headline claim.
- Every `built by @handle · N reviews` byline must resolve to a **real** builder row at render or
  be omitted (§13). Only `@yuki-flowers` (story 1) is a real row today.
- **Access-claim caution beyond golf:** stories 3/4/7 still describe a local unlocking a private
  thing (a no-groups table, a family cellar, a haveli courtyard) — that is the ratified value prop
  (cf. Yuki's held counter seat), and the "A local who…" framing + omitted byline keep it honest as
  *the kind of thing a local does*, not a promise from a named person. Before a given market's
  moment goes live with a **named** expert, its access claims must match that expert's real
  capability (rider b's principle, per market).
- Headlines are ~1 line at the mock's `26px` display size; keep to that measure so they don't wrap
  past two lines at 1280 or overflow the story panel at 390.
- The three pieces are the load-bearing copy — each must name a *specific* machine part, never a
  vague benefit. "A local helps you plan" is not a piece; "Yuki picks the lane in Gion no guide
  lists" is.
