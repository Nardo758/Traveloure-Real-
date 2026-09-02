# Backfill email — the twelve existing experts

Drafted in Phase 1 of the `expert-field-knowledge` v2 lane from the companion file's §1 prompts
(`docs/expert-field-knowledge/evidence-test.md`), rendered as prose. **Leon sends.** Replies received by
email are entered by ops through the manual-entry form (`/admin/neighborhood-claims/manual-entry`) as the
same typed rows the console writes — same scorer, same ratification (companion §7). Twelve ratified claims
light the hero and every anchor.

Vocabulary rule (companion §0): this email never says test, exam, score, pass or fail. The ask is
"show us {neighborhood}."

Per-recipient parameters: `{first_name}`, `{city}`, `{neighborhood}` (their strongest one — from
`local_expert_forms.neighborhoods`), `{daypart}` (that neighborhood's `default_daypart`, default
"evening"), `{console_link}` (`/expert/neighborhoods`).

---

**Subject:** Show us {neighborhood}

Hi {first_name},

You're one of the first local experts on Traveloure, and we're about to put your neighborhoods on the
map — literally. Before we do, we'd like to see {neighborhood} the way you see it.

There are three short things below. They take about fifteen minutes. You can reply to this email, or do
it in your console at {console_link} (the Neighborhoods panel), whichever is easier. If you know more
than one neighborhood well, tell us which ones you'd claim, and answer the three things for the one you
know best — we'll ask about the others later.

**1. Two or three places in {neighborhood} you'd send a friend.**
For each: what they should actually do there, when it's right (hour, day, season), and the one thing
that goes wrong if they don't know it.

**2. Put together one {daypart} in {neighborhood} for someone with about four hours.**
Three stops in order, how long at each, how you'd get between them, and why that order and not
another. Include anything that can't move — a last entry, a reservation window, a closure day, a
last train.

**3. It's the {daypart} above, and one of these happens — pick one:**
it's raining hard / the second stop is closed / they've got a nine-year-old with them / they got a
late start and only have two hours. What changes, and why?

**Optional — anywhere in {neighborhood} where you can get something a walk-in can't?**
A table, a time, an introduction, a door that's usually closed. One line is enough. We keep this one
to ourselves until we've been able to check it with you.

A few honest notes:

- Specific beats polished. "Go in from the south gate, the main gate is a queue by six" is worth more
  to a traveler than a paragraph about atmosphere.
- If a place is already the first thing a search turns up, tell us the part the search doesn't.
- What you send us becomes part of your profile: your places may appear with your name on them, your
  evening may be offered to travelers as a starting point, and we'll credit you when they are. By
  replying you're telling us that's fine. If you'd rather we didn't use something, say so in the reply
  and we'll keep it out.

When we've read your answers we'll mark {neighborhood} as verified on your profile, and a few things
open up from there — your places can appear as gems with your byline, travelers planning around
{neighborhood} can be pointed to you first, and you can be asked to adjust a plan when something
changes. We'll tell you exactly what's open when it is.

Thank you for being early. This only works because you know the street.

Leon
Traveloure

---

## Ops notes (not part of the email)

- Enter each reply through `/admin/neighborhood-claims/manual-entry`: pick the expert, pick the
  neighborhood, transcribe the answers into the typed fields, tick "the reply carried consent" (the
  paragraph above is the consent line), and submit. The rows are identical to console entry; only the
  diary's `actor_type` reads `ops`.
- If the expert names a neighborhood the picker doesn't have, that market's `city_neighborhoods` rows
  are missing — file it, do not free-type a neighborhood. Unclaimed stays dark.
- The optional access line goes into the P4 fields and is held (never scored or shown) per ruling
  `2026-09-01-access-claims-held`.
- Consent language is interim (ToS §11.2). COUNSEL-1 (data-use + byline + aggregated analytics) may
  replace the consent paragraph; the claim row stamps `consent_version` so replies under the old text
  stay distinguishable.
