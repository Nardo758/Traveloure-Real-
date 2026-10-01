---
name: Large shell callback output
description: Preserve complete text when copying large tracked assets through programmatic shell callbacks.
---

Do not assume a large shell callback result is the complete command output merely
because its `truncated` field is false. Verify the source byte count and its
beginning and end before writing that result as a recovered file.

**Why:** A large tracked Markdown asset returned only its trailing portion through
the programmatic shell callback, despite an increased output budget and a false
truncation flag. The command succeeded, so an unchecked copy silently lost entire
sections.

**How to apply:** For recovery or transformations of large text assets, read
bounded chunks (approximately 30–40 KB), concatenate them, and validate the result
against the source. Prefer the normal file tools for standalone file operations.