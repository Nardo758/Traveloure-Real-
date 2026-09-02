# Expert Field Knowledge — Evidence Test (content layer)

Implements ruling `2026-08-29-evidence-is-the-test`. This document supplies the prompt copy, rubric, thresholds, and scorer contract under that ruling. It does not reopen the ruling. Lives at `docs/expert-field-knowledge/evidence-test.md`.

## 0. Frame (binding, from the ruling)

- Unit of assessment: one **claimed neighborhood**. An expert claiming three neighborhoods takes three captures.
- Expert-facing vocabulary: **"Show us {neighborhood}."** Never "test," "exam," "score," "pass," "fail."
- Every answer writes a **typed row** (nugget / mini-slip / contingency / access claim). The capture *is* inventory. Grading her produces the shelf.
- Scores are admin-only. Admin ratifies; never auto-approve.
- Verification gates **actions**, not the account (`2026-08-29-graded-unlocks`).

## 1. The four prompts

Each prompt has a `daypart` parameter set per neighborhood (default `evening`; Porto Bolhão → `morning`, Jaipur Johari Bazaar → `late afternoon`). Copy below uses Gion / evening.

### P1 — Places (required)
> **Two or three places in Gion you'd send a friend.** For each: what they should actually do there, when it's right (hour, day, season), and the one thing that goes wrong if they don't know it.

Typed fields per entry: `name`, `category`, `do_this`, `when` (structured: hours/days/season), `watch_out`, `price_band`, `expert_confidence`. Writes `gem_candidates` + depth note.

### P2 — Composed {daypart} (required)
> **Put together one evening in Gion for someone with about four hours.** Three stops in order, how long at each, how you'd get between them, and why that order and not another.

Typed fields: ordered `items[3]` with `duration_min`, `transition` (mode + minutes), `order_reason`, and at least one `hard_constraint` (last entry, reservation window, closure day, last train). Writes a `mini_slip_template` row + timing priors.

### P3 — Contingency (required)
> **It's the evening above, and one of these happens — pick one: it's raining hard / the second stop is closed / they've got a nine-year-old with them / they got a late start and only have two hours.** What changes, and why?

Typed fields: `trigger` (enum), `replaces_item`, `alternate`, `reason`. Writes a `contingency` row keyed to the P2 template.

### P4 — Access (optional)
> **Anywhere in Gion where you can get something a walk-in can't** — a table, a time, an introduction, a door that's usually closed? One line is enough.

Typed fields: `venue`, `access_type` (enum: reservation / timing / introduction / entry), `relationship_basis`. Writes an `access_claim` row. **Not scored** at capture; verified separately by ops and later by scout-check. Counts toward nothing until then.

## 2. Rubric

Every P1 entry, P2 as a whole, and P3 as a whole are scored on four dimensions, 0–2 each (max 8).

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| **Specificity** | a category or area ("a good izakaya near Shijō") | a named place | named + operational detail (which entrance, counter vs. table, the hour that matters) |
| **Verifiability** | opinion with no checkable claim | checkable in principle | contains a date, hour, price, or condition a scout could confirm or refute on a visit |
| **Localness (web gap)** | matches the top-of-Google / guidebook consensus | known, but needs context the web doesn't give to be usable | not findable, or contradicts the web consensus with a stated reason |
| **Practicality** | unusable as written | usable | usable, with the failure mode named |

### Web-gap check (mechanical, feeds Localness)
Scorer runs one search per P1 entry: `{name} {neighborhood}`. If the expert's `do_this` + `watch_out` are substantively present in the top three results, **Localness caps at 1**. This is the operational form of the October 2025 principle: *if Google answers it, it isn't expert knowledge.* The check result (`web_gap: found | partial | absent`, with the URL) is stored on the row for admin.

## 3. Thresholds → unlocks

| Unlock (from graded-unlocks ruling) | Requires |
|---|---|
| **places-verified** → gems, bylines, anchor eligibility | P1: at least two entries scoring ≥5, each with Localness ≥1 and Verifiability ≥1 |
| **+ sequencing/timing** → slip handoffs, "Plan with me" priority | places-verified **and** P2 ≥5 with Practicality = 2 and a valid `hard_constraint` |
| **+ contingency** → revisions | sequencing-verified **and** P3 ≥4 with `alternate` scoring Specificity ≥1 |

Thresholds are constants in one config object (`evidence_thresholds`), admin-adjustable, never literals in the scorer. Same discipline as `fee_bands`.

## 4. Scorer contract

Scorer is an AI first pass producing structured JSON; admin sees the JSON and ratifies. It never writes `expert_neighborhoods`.

```json
{
  "claim_id": "…",
  "p1": [{ "row_id": "…", "specificity": 2, "verifiability": 1, "localness": 2, "practicality": 2,
           "web_gap": "absent", "web_gap_url": null, "note": "one line for admin" }],
  "p2": { "specificity": 1, "verifiability": 2, "localness": 1, "practicality": 2,
          "hard_constraint_valid": true, "note": "…" },
  "p3": { "specificity": 2, "verifiability": 1, "localness": 1, "practicality": 2, "note": "…" },
  "recommended_unlocks": ["places", "sequencing"],
  "weakest_dimension": "localness",
  "flags": ["guidebook_phrasing_p1_row_2"]
}
```

Flags the scorer must raise: `guidebook_phrasing` (near-verbatim match to a top search result), `duplicate_of_expert_{id}` (same venue + same watch_out already verified by another expert — not disqualifying, informational), `contradiction` (P3 alternate contradicts P2 constraint), `unparseable_when`.

## 5. What the expert sees

- On ratification: **"Gion — verified."** plus the unlock copy for what's now open. No scores, no dimensions.
- On non-ratification: one sentence naming the *weakest dimension in plain language*, never the number. Templates:
  - localness → "We'd love one thing about {place} a visitor couldn't get from a search."
  - specificity → "Which {place}, and what exactly should they do there?"
  - verifiability → "When, specifically — an hour or a day makes this usable."
  - practicality → "What goes wrong if they don't know this?"
- Resubmission: same claim, edits in place, once per 14 days. Prior rows are versioned, not deleted (the failed answer is still inventory).
- The claim stays `claimed` (dark) throughout. Dark is honest.

## 6. Worked example — Gion, P1 entry

**Scores 8.** "Yasaka Shrine, but go in from the south gate off Higashiōji, not the main Nishirōmon everyone photographs — the lantern hall is lit from about 18:00 and the south approach is empty while the main gate is a queue. Skip on the 1st–3rd of January and during Gion Matsuri (mid-July) unless you want the crowd itself." — named + operational (entrance, hour), checkable, the entrance advice is not the web consensus, failure mode named.

**Scores 3.** "Yasaka Shrine is beautiful at night and a must-see in Gion. Go in the evening when it's lit up." — named (1), checkable in principle (1), top-of-Google (0, web_gap found), usable (1). Not places-verified on its own.

## 7. Backfill path (the twelve existing experts)

The backfill email asks each expert to (a) claim their neighborhoods and (b) answer P1–P3 for one of them, in reply or in the console panel once Phase 2 lands. Replies received by email are entered by ops as typed rows through the same intake — same scorer, same ratification. Twelve ratified claims lights the hero and every anchor.

## 8. Open decisions for Leon

> `superseded@190b9909` — all three resolved by ledger rows `2026-09-01-evidence-thresholds-config` (1: values seeded in `evidence_thresholds`, admin-adjustable, no code fallback), `2026-09-01-scorer-model` (2: Sonnet, §2 rubric as system prompt, §4 JSON validated; web-gap one search per P1 entry) and `2026-09-01-access-claims-held` (3: hold). Phase 2 executes them (`server/services/evidence-scorer.service.ts`). The text below is kept as the historical proposal.

1. **Threshold values** in §3 are my proposal; they're constants, so start there and tune after the twelve backfill captures score.
2. **Scorer model**: Sonnet with the rubric as system prompt is enough; the web-gap search is the expensive part — one search per P1 entry, ~3 per capture.
3. **P4 access claims**: verified by ops call at launch, or held until scout-check? Recommendation: hold. An unverified access claim on a public profile is the one thing here that could embarrass you.
