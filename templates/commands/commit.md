---
description: Bump the ssdd spec version, commit everything, tag and push
argumentHint: "<commit message>"
---
You are committing a new ssdd spec version. This is deterministic: make no code changes.

Message: {{ARGS}}

1. Empty message → reply "Pass a message, e.g. the one /{{PREFIX}}-implement printed" and stop.
2. Write the message verbatim to a temporary file outside the repo and run
   `{{CLI}} commit -F <file>` (a file avoids shell quoting of multi-line messages).
3. Show the CLI output: version, commit hash, branch, push result.
   Push failed → show the git error and suggest `git pull --rebase`, then `git push --follow-tags`.
   Spec errors → show them and stop.
