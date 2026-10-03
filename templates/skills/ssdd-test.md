---
description: Run the tests of every feature the ssdd spec changes touch, unit and integration
argumentHint: "[path, e.g. 1.a.3]"
---
You are running this project's tests against the spec. The spec tree is the source of truth.

Arguments: {{ARGS}}

1. Run `{{CLI}} context <path> --for test` with the path above (none = all changes since the
   last ssdd commit) and read the whole output. Invalid path → show the message and stop.
2. Find out how this project runs its tests:
   a. The Memory section of the output lists the test setup → use it and go to step 3.
   b. Otherwise check, in order: the Tech stack in the output, README.md, AGENTS.md, CLAUDE.md,
      then the project's config files (package.json scripts, pyproject.toml, Makefile, go.mod,
      Cargo.toml, CI workflows). Per layer (unit, integration) you need the framework, where
      the test files live, the command that runs them, and the command that runs only the tests
      whose name starts with a given text. Nothing found → ask the user.
   c. Unless the Tech stack already states all of that, write what you found to the Memory
      file named in the output, under `## Tests`: one bullet per layer, in this form:
      `- <Layer>: <framework>, <file glob>; run: <command>; by name prefix: <command with <prefix>>`.
      Replace outdated bullets; do not add duplicates.
3. Tests are named by node titles: the outermost suite has the exact title of the top-level
   node, inner suites and tests have the exact titles of the nodes below it, and integration
   tests are in the suite "<top-level title> integration". Tests have no labels, paths,
   versions, hashes or tags.
4. Per node in the Changes: the tests that step 3 names do not exist → write them by the
   rules in /{{PREFIX}}-implement step 6 (unit tests below the top level, integration tests for
   the top-level node). A removed node still has tests → delete them. Do not add, audit or
   change the tests of unchanged nodes.
5. Run the tests:
   - "No spec changes" in the output → run the whole test suite.
   - Otherwise, for each feature under Features to test: run all its unit tests and all its
     integration tests, with the name prefix filter set to the exact top-level title. A runner
     without a name filter → run the test files of that feature.
   - A remembered command no longer works (missing script, unknown tool) → redo steps 2b and
     2c, then run again.
6. On failure, check whether the test contradicts the spec. If so, fix the test and run again
   (at most 2 rounds). Never change application code here. Never edit files under ssdd/,
   except the Memory file as described in step 2.
   Never run git commit or push.
7. Report:
   - Per feature: path, title, unit tests passed / failed / skipped, integration tests passed /
     failed / skipped.
   - Per failing test: its name, the node path it tests, and a one-line cause.
   Suggest `/{{PREFIX}}-implement <path>` for nodes with failing tests.
   If test files or the Memory file changed, end with a commit message in a code block
   (Commits format from the Constitution; default `test(<scope>): <summary>`) and the line
   "Run /{{PREFIX}}-commit with this message, as is or edited."
