---
description: Session-bootstrap checklist — orient on the repo's current state and stop for go-ahead before starting work
---

Orient on this repo before doing anything else. In order:

1. Read `CLAUDE.md`'s "Locked Decisions & Current Intent" section (the numbered
   rulings and §13–§19) for the platform's current intended behavior and any
   flagged divergences.
2. Read the tail of `docs/DECISIONS.md` (last ~150 lines) for the most recent
   ratified rulings, especially any dated in the last few days.
3. Run `git status` and note the current branch name.
4. List open pull requests (`gh pr list`).

Then report back, and STOP — do not start any work yet:

1. **In-flight lane** — is the current branch mid-task (uncommitted changes,
   an unmerged PR already open for it, a partially-applied plan)? Say what it is.
2. **Next queued task** — if a task map, dispatch doc, or punch list is present
   in context or referenced by the recent ledger rows, name the next queued item.
3. **Loose ends** — any ledger row that looks unfiled/undocumented, or any CI
   guard that is currently failing or was recently found to have a gap.

Wait for the user's go-ahead before starting any of it.
