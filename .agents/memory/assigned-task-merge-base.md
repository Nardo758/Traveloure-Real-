---
name: Assigned task merge base
description: Avoid confusing GitHub main ancestry with the application's task-completion branch.
---

Before creating a branch for an assigned application task, identify the
application main branch used by task completion, not just GitHub's origin/main.
Keep the task's source diff confined to its scope.

**Why:** These branches can contain equivalent changes with different ancestry.
Basing a task only on GitHub main caused completion to replay unrelated upstream
history; automatic conflict merging also produced incorrect edits outside the
task. A clean GitHub PR alone did not establish a clean application task diff.

**How to apply:** Preserve the original branch, rebuild a scoped task on the
application's actual main when ancestry differs, and retain its existing
regressions. Do not publish or commit on either main branch. Follow the approved
GitHub-main release policy separately for externally reviewed release work.
