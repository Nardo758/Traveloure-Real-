# Brief — one occasion vocabulary, and what an occasion should carry

**Status: PROPOSAL. NOT APPLIED.** Nothing in the "Proposed columns" or "Proposed rows" sections
below exists in the database, in `shared/schema.ts`, or in any migration. Applying any of it is a
**schema change**, and CLAUDE.md's Coordination Prevention rule reserves those for the
decision-maker: *"Update this document FIRST with the decision and rationale… If you find this
document conflicts with your plan, escalate to the decision-maker (user) rather than overriding."*
The publish-trap rules make that doubly true — a column added here must be declared in
`shared/schema.ts` or the Replit deploy push will drop it, and a CHECK added over an existing column
fails the publish mid-push and offers the destructive "copy dev over production" option.

Shipped alongside this brief (ledger `2026-09-03-occasion-vocabulary`), and requiring no schema
change: `shared/occasions.ts`, the table-driven occasion select on the Trip Strip's edit panel, the
trip-row write that makes the wedding tooling unlock, the deletion of the dead
`experienceTypeSlugEnum`, and the "Wedding Anniversary" nav relabel.

---

## 1. Where the vocabulary stands after this lane

**The `experience_types` table is the ONE runtime vocabulary.** It is read by
`GET /api/experience-types` and seeded by `server/seeds/experience-template-tabs.seed.ts` (mirrored
by `server/seed-experience-types.ts`) — 22 rows. Every surface that offers occasions to a traveler
now fetches that list; none enumerates its own.

Two machine vocabularies remain, deliberately, because both have real consumers:

| Vocabulary | What it is | Who reads it |
|---|---|---|
| `experience_types` rows | the occasions a traveler picks from | every entry-point surface |
| `eventTypeEnum` (10 values) | the `trips.event_type` column | the fee/optimizer literal branches; `SlipLogisticsSection`'s wedding tooling |
| occasion CLASS (`travel`/`event`/`couple`) | presentation vocabulary — the Trip Strip's possessive lead and its party noun | `client/src/lib/plan-vocabulary.ts` → `shared/occasions.ts` |

`shared/occasions.ts` is the ONE place the translations live. A fourth list (`experienceTypeSlugEnum`)
was deleted: declared, referenced nowhere, and already drifted from the seeded set.

---

## 2. The problem this brief exists to answer

The class model in `FLOW-SPEC.md` v1 — Travel / Event / Couples, each class dictating the shape of
the planning flow — **did not survive its own stress test.** v2's verdict, verbatim:

> Stops, scheduled events inside, and a guest list are three independent capabilities any occasion
> can need in any combination (golf: events without guests; girls' trip: guests + one big night +
> stops; reunion: all three; honeymoon: stops only; date night: events only, one evening, own city).

A class cannot express that, because it bundles decisions that vary independently. **An occasion is
a row, not a class.** The class the codebase keeps (`travel`/`event`/`couple`) survives only as
PRESENTATION vocabulary for one headline and one party noun — it must not be promoted into a flow
switch.

---

## 3. Proposed columns on `experience_types`

Six additive, nullable columns. Every one is a **default the traveler can flip from inside the
plan** — never a lock. All are ordinary catalog configuration: no amount, rate, identity or grant,
so §14/§18/§19 do not apply and no strip is needed.

| Column | Type / values | Drives |
|---|---|---|
| `default_stops` | `one` \| `many` | step 2's shape: one destination vs an ordered stop list. The location-mismatch check reads the event's place then every stop, and is never suppressed by stop count. |
| `default_duration` | `day` \| `range` | step 3: a single date + time vs first-day/last-day. |
| `default_schedule` | boolean | whether step 5 ("What's happening") appears, whether step 3 shows "the main moment" anchor card, and whether the slip groups items under events. Chips come from the presets that already exist in `logistics-presets.service.ts`. |
| `default_guests` | boolean | whether the Guests page, its per-event columns, invites and the "N attending" count exist for this occasion. |
| `vocabulary` | `travelers` \| `guests` \| `attendees` | step 4's noun, the Trip Strip's party chip, and the slip's panel names. |
| `default_visibility` | `shown` \| `hidden` | `hidden` suppresses the Guests page, Share and invite links — the proposal case, where the surprise is the product. |

**Why not a CHECK constraint on any of them.** Migrations 181 and 195 set the precedent and the
publish-trap note explains it: a CHECK added over a column that prod rows can violate fails the
deploy push and offers the destructive option. App-enforced, DB-permissive.

**Why nullable.** A NULL default means "not decided for this occasion", which the flow must render
as its own neutral behaviour — never as a fabricated `one`/`day`/`off` (§13). The seeder fills the
rows below; a row someone adds later without them is honestly undecided.

---

## 4. Proposed per-occasion defaults

From `FLOW-SPEC.md` v2. Rows marked ⚠ are the ones this brief is least confident about and most
wants ruled on.

| slug | stops | duration | schedule | guests | vocabulary | visibility |
|---|---|---|---|---|---|---|
| `travel` | many | range | off | off | travelers | shown |
| `wedding` | one | range | **on** | **on** | guests | shown |
| `proposal` | one | day | on | off | travelers | **hidden** |
| `birthday` | one | day | on | on | guests | shown |
| `date-night` | one | day | off | off | travelers | shown |
| `anniversary-trip` | one | range | off | off | travelers | shown |
| `wedding-anniversaries` | one | day | on | on | guests | shown |
| `corporate-events` | one | range | on | on | attendees | shown |
| `retreats` | one | range | on | on | attendees | shown |
| `boys-trip` | many | range | on | on | travelers | shown |
| `girls-trip` | many | range | on | on | travelers | shown |
| `bachelor-bachelorette` | many | range | on | on | guests | shown |
| `reunions` | many | range | on | on | guests | shown |
| `baby-shower` | one | day | on | on | guests | shown |
| `graduation-party` | one | day | on | on | guests | shown |
| `engagement-party` | one | day | on | on | guests | shown |
| `housewarming-party` | one | day | off | on | guests | shown |
| `retirement-party` | one | day | on | on | guests | shown |
| `career-achievement-party` | one | day | on | on | guests | shown |
| `farewell-party` | one | day | on | on | guests | shown |
| `holiday-party` | one | day | on | on | guests | shown |
| ⚠ `sports-event` | one | range | off | off | travelers | shown |

⚠ `sports-event` is the least settled row: travelling to a fixture is a travel shape, but the
fixture itself is the immovable anchor a `schedule` default would express. It is also the one slug
whose CLASS today is `travel` only because the keyword classifier had no keyword for it — the
fallback, not a judgement. **Two other classes are inherited baselines this lane deliberately did
NOT change** and that a ruling here would settle: `retreats` and `reunions` are `event`-class today
(the classifier matched "retreat"/"reunion"), while FLOW-SPEC v1 grouped both under Travel.

**Golf is the case that proves the columns are right and the classes were wrong.** A golf trip is
`travel` (`many` stops, `travelers`) and simultaneously needs `schedule` ON — tee times in sequence
— with `guests` OFF. No class expresses that; a row does.

---

## 5. Proposed rows that do not exist yet

Three occasions are referenced by shipped surfaces and have **no seeded row**, so nothing renders
for them. This lane did NOT invent them (§13 — never render a guess); it reports them.

| Proposed slug | Why it is needed | Proposed defaults |
|---|---|---|
| `milestone-birthday` | the landing Moment `milestone_birthday` is a distinct product from a birthday party (a trip built around the night). This lane points its `experienceSlug` at the generic `birthday` row as the honest nearest EXISTING row. | one / range / on / on / guests / shown |
| `family-occasion` | the landing Moment `family_occasion` has **no** honest nearest row, so its `experienceSlug` ships as `null` and the CTA seeds no occasion at all. | one / range / on / on / guests / shown |
| `corporate-retreats` | the nav item "Corporate Retreats" links to `/experiences/corporate`, **a slug no seeder writes** — the page has no template. | many / range / on / on / attendees / shown |

**Also unseeded, and reported here rather than fixed:** the nav item "Romantic Getaways" links to
`/experiences/romance`, which no seeder writes either. Neither `romance` nor `corporate` is an
obvious typo for an existing slug (`retreats` and `corporate-events` are different products), so
neither href was silently repointed. Both need either a seeded row or a nav decision.

---

## 6. The two Anniversaries

There are two, they are different products, and until this lane the nav called one of them
"Anniversary" with no qualifier:

| slug | seeded name | What it is | Class |
|---|---|---|---|
| `anniversary-trip` | Anniversary Trip | a couple's getaway — two people, a range of days, no guest list | `couple` |
| `wedding-anniversaries` | Wedding Anniversaries | a celebration with guests — a party on a date | `event` |

**Shipped in this lane:** the nav item at `/experiences/wedding-anniversaries` is relabelled
**"Wedding Anniversary"** (en + ja), and `OCCASION_CLASS_BY_SLUG` classes the two differently — the
one deliberate correction to the previous keyword classifier, which matched "anniversar" and called
both a couple's occasion. `shared/__tests__/occasions.test.ts` **O4** pins them apart.

**Still open for ratification:** the seeded NAME "Wedding Anniversaries" is plural where every other
row is singular, and the couples row's card copy still reads "Anniversary" on some surfaces. Renaming
a seeded row is a data change and is not in this lane.

---

## 7. What this brief deliberately does not propose

- **No `trips` columns.** Ceremony date, guest count and per-event grouping are the FLOW-SPEC's own
  open questions (`itinerary_items.user_experience_id`, `trip_destinations`) and belong to that
  ratification, not this one.
- **No merge of the two machine vocabularies.** `eventTypeEnum` has literal-reading consumers on the
  money path; collapsing it into slugs would silently re-branch fees.
- **No new mappings in `OCCASION_SLUG_TO_EVENT_TYPE`.** Every added mapping moves trips into a
  different fee/optimizer branch — a decision-maker call, not a refactor's side effect. The map
  shipped byte-identical to the one it replaced.
- **No revival of the three-class flow model.** v2 retired it; the class that remains is
  presentation vocabulary and must not be promoted back into a flow switch.
