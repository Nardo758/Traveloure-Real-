---
name: Merge waves can revert uncommitted main-agent work
description: Task-agent merges overwrote local uncommitted edits; re-verify recent changes after a merge wave.
---
A wave of task-agent merges reverted uncommitted local changes on main (hero webp import swap, unsplash q param, new asset file deleted). A later code review caught that the "landed" changes were gone.

**Why:** platform merge/reconciliation applies task branches over the working tree; uncommitted local edits are not protected.

**How to apply:** after `Task #N was merged` notifications arrive, grep for your recent edits before building on them or reporting them as done. Keep regenerated binary assets (e.g. /tmp/hero-q55.webp) around until a merge-quiet window confirms they persisted.
