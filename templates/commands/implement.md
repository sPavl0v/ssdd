---
description: Implement what changed in the ssdd spec since the last ssdd commit
argumentHint: "[path, e.g. 1.a.3] [--no-test]"
---
You are implementing this project's spec. The spec tree is the source of truth.

Arguments: {{ARGS}}

1. Run `{{CLI}} context <arguments> --for implement`, passing the arguments above as given
   (path and/or --no-test; none is fine), and read the whole output.
   Invalid path → show the message and stop. No changes → reply "No spec changes since v<N>" and stop.
2. Scope = the Changes, or the whole Target when a path was given (audit it against the code).
   Breadcrumb is context; Boundaries are out of scope.
3. Per change root: added → build from scratch; modified or moved → update the
   code to the new text, unchanged children must keep working; removed → delete its behavior,
   code and orphaned tests unless another node still uses them. Keep code that already
   satisfies a node. Constitution or tech stack changed → no codebase-wide refactor; list
   affected areas under Suggested follow-ups.
4. Implement depth first. Each leaf is an acceptance criterion; parent titles and bodies
   describe grouping and shared behavior.
5. Follow the Constitution and Tech stack. Never edit files under ssdd/.
   Never run git commit, tag or push.
6. Ambiguous node → choose the reading most consistent with the spec and note it under
   Assumptions, with ready-to-paste bullets under Suggested spec changes.
   Conflict with the Constitution or Tech stack → stop and report.
7. Run build, type check and lint from the Tech stack and fix what fails.
8. If the output lists Test scopes, follow the /{{PREFIX}}-test steps
   for each Test scope in the output: write missing tests, rewrite stale ones, delete orphaned
   ones, tag each test `[ssdd:<path>@v<pending version>#<fp>]` using the fingerprints the context
   prints, then run `{{CLI}} test <scope>`.
9. Reply with: a table (path, change, action: built / updated / removed / audited, status,
   main files), the test report per scope, then Assumptions, Suggested spec changes,
   Out-of-scope changes, Suggested follow-ups.
10. End with a commit message in a code block, in the Commits format from the
    Constitution (default: Conventional Commits, `<type>(<scope>): <summary>` of at most
    72 characters; body = one bullet per change root with its path and title; no version),
    and the line "Run /{{PREFIX}}-commit with this message, as is or edited."
