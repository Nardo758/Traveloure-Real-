---
name: Publishing is an operator action from origin/main — the agent never publishes
description: The Replit Agent commits on a task branch and stops. Publishing builds the WORKSPACE, not the remote, so a checkout ahead of main puts unreviewed code into production with every check green.
---

On 2026-09-06 production was published from this workspace while the checkout carried a local
commit that was not on `main`. Branch protection did its job and bounced the push — and that
changed nothing, because **a Replit Autoscale publish does not read `origin`. It builds the
workspace filesystem.** Commit `96c39f5` was served to real users while `origin/main` had never
seen it. Nothing failed: the push was rejected (visible), the publish succeeded (also visible),
and only the two together told the story.

**Why the existing rule did not catch it.** `CLAUDE.md`'s "Branch and publish rule" already said
a publish is only ever made from a workspace where `main == origin/main`. It said it in prose.
Prose is not a check, and the publish button does not read `CLAUDE.md`.

**How to apply — the agent's half:**

1. **Never publish.** Publishing is an operator action, full stop. If a change needs to reach
   production, say so and stop; do not press Publish/Redeploy, and do not offer to.
2. **Never commit on `main`, and never `git push` to `main`.** Work goes on a `task-*` / `fix/*`
   branch cut from `origin/main`, is pushed to that branch, and is carried to review by a PR.
3. **Open the PR and stop there.** Merging is not the agent's call either; a PR that is green is
   still waiting on a human.
4. If the workspace is found sitting on `main` with local commits, do not "tidy" it by publishing
   or force-pushing. Report it — that state is the incident, not a chore.

**How to apply — the operator's half (`docs/RELEASE.md` step 0):**

```bash
git checkout main && git fetch origin && git reset --hard origin/main
```

then Run once, confirm the boot log's `"Migrations complete"` line and the `[build] commit …`
line, republish, and **decline any SQL / database-migration step the publish offers**
(`CLAUDE.md` §20 — that prompt means the checkout and prod disagree, never that prod needs SQL).

**The rule is now enforced, within stated bounds.** `scripts/publish-preflight.cjs` runs as the
first step of the *deployment* build (`.replit` `[deployment] build` → `npm run build:prod`) and
fails the build unless the checkout is `main`, clean, equal to `origin/main`, and carrying a
lockfile with zero `replit.local` URLs. It is a no-op for `npm run dev` and for CI's `npm run
build`. **What it still cannot see:** whether the DEPLOYED build came from this checkout — it
prints both shas and the migration registry's last entry precisely so a human can compare them to
the boot log. Read the script header's NEGATIVE SPACE section before treating a green preflight as
proof that production is running reviewed code.
