---
name: GitHub push auth in this workspace
description: How shell git push authenticates and the failure modes seen (expired token embedded in remote URL, stale askpass).
---
Shell `git push` failures ("Invalid username or token") had TWO stacked causes:
1. The old expired token was embedded directly in `remote.origin.url` — fixing helpers/env did nothing until `git remote set-url origin https://github.com/...` (plain URL, no credentials).
2. The session's `replit-git-askpass` serves stale credentials and does not refresh when the user reconnects GitHub mid-session.

**Current working setup:** plain origin URL + local `credential.helper` shell function that emits `username=x-access-token` / `password=$GITHUB_TOKEN`, so pushes track the `GITHUB_TOKEN` secret automatically.

**How to apply:** if shell push fails auth, first check `git config --get remote.origin.url` for an embedded token. The `gitPush` CodeExecution callback (Replit GitHub connection) works independently of all of this and is the reliable fallback.
