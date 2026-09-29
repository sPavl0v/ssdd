---
description: Write and run the ssdd-tagged tests for a spec subtree
argumentHint: "[path, e.g. 1.a.3]"
---
You are writing and running tests for this project's spec. The spec tree is the source of truth.

Arguments: {{ARGS}}

1. Run `{{CLI}} context <path> --for test` with the path above (none = whole tree)
   and read the whole output. Invalid path → show the message and stop.
2. Per leaf in the Tests section: missing → write a test; stale → rewrite the test against the
   current node text; current → keep it. Delete orphaned tests in scope.
3. Pick the test layer per the Tech stack (unit, integration, e2e). UI states usually need e2e.
4. Tag rules: every test carries exactly one tag, `[ssdd:<path>@v<pending version>#<fp>]`, with the
   leaf's path and fingerprint as printed in the Tests section. Put it in the test name, or, for a
   runner configured with `"tagStyle": "comment"`, in a comment on the line directly above the test
   definition. A leaf may have several tests.
5. A leaf that cannot be automated gets a skipped test with its tag and a one-line reason.
6. Run `{{CLI}} test <path>`; it prints the report.
7. On failure, check whether the test contradicts the node. If so, fix the test and rerun
   (at most 2 rounds). Never change application code here. Never edit files under ssdd/.
   Never run git commit, tag or push.
8. Summary: failing leaves with a one-line cause each, and suggest `/{{PREFIX}}-implement <path>`
   for them. If test files changed, end with a commit message in a code block
   (Commits format from the Constitution; default `test(<scope>): <summary>`) and the line
   "Run /{{PREFIX}}-commit with this message, as is or edited."
