---
description: Implement and write tests for what changed in the ssdd spec since the last ssdd commit
argumentHint: "[path, e.g. 1.a.3]"
---
You are implementing this project's spec. The spec tree is the source of truth.

Arguments: {{ARGS}}

1. Run `{{CLI}} context <path> --for implement` with the path above (none = all changes)
   and read the whole output.
   Invalid path → show the message and stop. No changes → reply "No spec changes since v<N>" and stop.
2. Scope = the Changes, or the whole Target when a path was given (audit it against the code).
   Breadcrumb is context; Boundaries are out of scope.
3. Per change root: added → build from scratch; modified or moved → update the
   code to the new text, unchanged children must keep working; removed → delete its behavior
   and code unless another node still uses them. Keep code that already satisfies a node.
   Constitution or tech stack changed → no codebase-wide refactor; list affected areas under
   Suggested follow-ups.
4. Implement depth first. Each leaf is an acceptance criterion; parent titles and bodies
   describe grouping and shared behavior.
5. Find out how this project writes tests:
   a. The Memory section of the output lists the test setup → use it and go to step 6.
   b. Otherwise check, in order: the Tech stack in the output, README.md, AGENTS.md, CLAUDE.md,
      then the project's config files (package.json scripts, pyproject.toml, Makefile, go.mod,
      Cargo.toml, CI workflows). Per layer (unit, integration) you need the framework, where
      the test files live, the command that runs them, and the command that runs only the tests
      whose name starts with a given text. Nothing found → ask the user.
   c. Unless the Tech stack already states all of that, write what you found to the Memory
      file named in the output, under `## Tests`: one bullet per layer, in this form:
      `- <Layer>: <framework>, <file glob>; run: <command>; by name prefix: <command with <prefix>>`.
      Replace outdated bullets; do not add duplicates.
6. Write tests for the changes. The tests for all unchanged nodes already exist and pass: do not
   add, audit or change them.
   - A node below the top level gets unit tests. A leaf gets at least one unit test for its
     behavior. An inner node with body text gets at least one unit test for that body text.
   - A top-level node gets integration tests. They run the feature through the whole app with
     the real modules connected; replace only services outside the app. When a node in a
     feature is added, modified or moved, update the integration tests of that feature so they
     cover the new behavior of the feature.
   - Per change: added → write its tests; modified → rewrite its tests to the new text;
     moved → rename and move its tests to the new place in the tree; removed → delete its
     tests.
   - Name tests by node titles, nested the way the spec nests: the outermost suite has the
     exact title of the top-level node, each inner suite has the exact title of a node below
     it, and each test has the exact title of the node it tests. Put integration tests in a
     suite named "<top-level title> integration". Use the exact titles without labels, so
     that a name filter on the top-level title selects every test of the feature.
   - Do not put labels, paths, versions, commit hashes, tags or ids in test names, comments or
     files.
   - A behavior that cannot be automated gets a skipped test with a one-line reason.
   - Follow the project's existing test layout and the setup from step 5.
7. Follow the Constitution and Tech stack. Never edit files under ssdd/, except the Memory
   file as described in step 5. Never run git commit or push. Do not run tests; the user runs
   /{{PREFIX}}-test.
8. Ambiguous node → choose the reading most consistent with the spec and note it under
   Assumptions, with ready-to-paste bullets under Suggested spec changes.
   Conflict with the Constitution or Tech stack → stop and report.
9. Run build, type check and lint from the Tech stack and fix what fails.
10. Reply with: a table (path, change, action: built / updated / removed / audited, status,
    main files, test files), then Assumptions, Suggested spec changes, Out-of-scope changes,
    Suggested follow-ups.
11. End with a commit message in a code block, in the Commits format from the
    Constitution (default: Conventional Commits, `<type>(<scope>): <summary>` of at most
    72 characters; body = one bullet per change root with its path and title; no version),
    and the line "Run /{{PREFIX}}-test, then /{{PREFIX}}-commit with this message, as is or edited."
