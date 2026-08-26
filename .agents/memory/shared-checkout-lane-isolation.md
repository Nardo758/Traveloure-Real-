---
name: Shared-checkout lane isolation
description: How to publish one lane's commit from a Replit checkout that other in-flight lanes share, without carrying their unpushed work along or breaking task completion review.
---

Multiple task lanes can share one Replit checkout/branch (e.g. everyone commits to
`main` in the same workspace). If another lane has unpushed commits ahead of the
remote base when you need to publish your own commit to its own branch, do NOT
`git checkout -b lane/x` from the current HEAD — that carries every ancestor
unpushed commit (including the other lane's broken/incomplete work) onto your new
branch too.

**Why:** the task-completion reviewer diffs the actual checked-out branch/HEAD, not
just "the file you meant to change." A docs-only commit stacked on top of another
lane's in-progress commits got the whole bundle reviewed together, and the reviewer
rejected it for the other lane's incomplete code (missing selector logic, unmet
Playwright spec) even though the actual target branch content was clean.

**How to apply:** when you detect foreign unpushed commits ahead of your target base
(`git log origin/<base>..<current-branch>`), cherry-pick only your own commit onto a
fresh branch created from the remote base ref (`git checkout -b lane/x origin/<base>`,
then `git cherry-pick <your-sha>`), push that. Then reset the shared branch back to
its pre-existing tip (`git reset --hard <sha-before-your-commit>` on the shared
branch) so it no longer carries your commit on top of the other lane's work — this
is safe since your commit is already preserved on the new branch. Never touch or
reorder the other lane's own commits. Finally, check out your clean branch before
calling task completion so the reviewer's diff target matches what you actually
intended to ship.
