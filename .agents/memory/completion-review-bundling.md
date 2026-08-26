---
name: Completion pipeline bundles unrelated ahead-of-target commits into one review
description: A scoped task's markTaskComplete rebase can pull in pre-existing, unrelated bugs from other commits and block completion until they're fixed too.
---

When `markTaskComplete` triggers an automatic rebase of local `main` onto a
more-advanced internal branch, any commits that were already ahead of the
task's target (authored by earlier, unrelated work) get folded into the same
diff the completion code review evaluates. The review does not scope itself
to the current task's own changes — it reviews the whole bundled diff.

**Why:** a rebase conflict pulled in a prior "Implement Bento anchor
functionality" commit that had several real, pre-existing contract
violations against `docs/design/BENTO_ASSEMBLY.md` (anchor ranked by
first-match instead of rating/offerings; ready-made floating not gated by an
explicit sort; wrong field names for the live `/api/experts` rating
aggregate `expertRating`/`expertReviewCount` vs legacy
`averageRating`/`reviewCount`; legacy generic `expert` role misclassified as
local instead of planner; §3.2 ready-made-beside-anchor placement not
implemented; neighbourhood-name matching not punctuation-tolerant like the
server's `normalizeNeighborhoodKey`). None of these were introduced by the
task in progress (a read-only landing audit), but the review rejected
completion four times in a row, each time surfacing one more layer of the
same pre-existing subsystem's bugs, until all were fixed.

**How to apply:** if a completion-time rebase pulls in unrelated ahead-of-
target commits and the code review rejects on bugs you didn't write, don't
dispute scope — there's no mechanism to review only your own commits. Fix
the flagged issues directly (they're usually real), add regression tests
using the actual production data contracts (not just legacy/fixture field
names), and expect that fixing one surfaced bug in a complex subsystem can
reveal the next one. If rejections keep surfacing materially new problems
after a few rounds, it's reasonable to keep going as long as each ask is
concrete and bounded — but recognize this as scope creep worth flagging to
the user in a follow-up task in case a deeper systemic sweep of that
subsystem is warranted.
