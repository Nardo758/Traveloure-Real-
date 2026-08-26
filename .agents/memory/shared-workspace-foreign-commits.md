---
name: Foreign commits landing on a checked-out lane branch
description: A shared workspace's completion-review process for an unrelated project task can append real code commits (not just docs) onto whatever branch happens to be checked out mid-session.
---

Mid-session, with `lane/bento-assembly` checked out and uncommitted work in progress, two commits from unrelated, concurrently-completing project tasks landed on the local branch — apparently because their completion-review processes ran while this branch was the shared workspace's active checkout. One of the two carried a real, plausible-looking code diff (not just docs) touching files this lane also cared about. Neither commit had reached `origin` yet, so `origin/lane/bento-assembly` stayed clean.

**Why this matters:** this is a stronger failure mode than a simple HEAD reset (see `lane-branch-head-reset-risk.md`) — the foreign commits are indistinguishable from legitimate lane work by `git log` alone. A confident-sounding commit message and a real-looking diff are not proof the change is correct or in-scope; they came from a different task's context and were never reviewed against this lane's spec.

**How to apply:**
1. Before trusting any commit found on a lane branch that you don't remember making, check whether it's pushed (`git log --oneline branch vs origin/branch`) — unpushed-and-unfamiliar is the tell.
2. Read the actual diff of a suspect commit before deciding to keep or discard it; don't take its commit message's claims at face value.
3. If a suspect diff claims to fix a specific bug, verify the claim against real data/DB state directly (e.g. query the actual production values, unit-test the actual function with real-shaped inputs) rather than trusting the diff's own narrative — a well-written diff can still misdiagnose or fix a case that was already correct.
4. If discarding, `git reset --hard origin/<lane>` after confirming origin is clean; independently re-implement any part of the diff that your own verification found genuinely defensible, as fresh reviewed work — don't cherry-pick from a commit whose overall correctness you don't trust.
