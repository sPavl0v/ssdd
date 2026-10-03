---
description: Bump the ssdd spec version, commit everything and push
argumentHint: "<commit message>"
---
You are committing a new ssdd spec version. This is deterministic: make no code changes.

Message: {{ARGS}}

1. Empty message → reply "Pass a message, e.g. the one /{{PREFIX}}-implement or /{{PREFIX}}-test printed" and stop.
2. Write the message verbatim to a temporary file outside the repo and run
   `{{CLI}} commit -F <file>` (a file avoids shell quoting of multi-line messages).
3. Show the CLI output as is: version, commit hash, branch and push result, or the errors and
   the recovery steps it prints (spec errors, a rejected push). Do not retry or fix anything.
