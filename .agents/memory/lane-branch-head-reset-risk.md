---
name: Lane branch HEAD reset risk
description: This workspace's git HEAD can move off a lane branch back to main mid-session, apparently triggered by unrelated task-agent merges completing elsewhere.
---

Mid-session, with uncommitted work in progress on `lane/bento-assembly`, the workspace's git HEAD was found moved back to `main` (reflog: `checkout: moving from lane/bento-assembly to main` then `reset: moving to origin/main`). This coincided with unrelated project tasks merging elsewhere in the same project. The lane branch itself was not deleted or altered — only the working directory's checked-out ref moved, with in-progress uncommitted edits carried along on top of `main`'s tree.

**Why this matters:** long-running lane work with deliberate per-commit pauses (e.g. a hard-stop-per-commit review workflow) is vulnerable to losing track of which branch it's actually on. A `git status`/`git branch --show-current` check before resuming work after any pause is cheap insurance.

**How to apply:** when doing extended multi-commit work on a lane branch, (1) periodically verify `git branch --show-current` matches the intended lane, especially after any gap in tool calls, (2) commit and push the lane branch to `origin` early and often rather than waiting for the whole lane to finish — a pushed branch survives a local HEAD reset; an unpushed one does not, (3) if HEAD is found moved, recover via `git stash` (working tree) → `git checkout <lane>` → `git stash pop`, then diff-verify nothing unexpected came along.
