# Constitution

Rules every change must follow. They override convenience. If a spec node
conflicts with them, stop and report instead of implementing it.

## Principles

### YAGNI: You Aren't Gonna Need It
- Build only what the spec asks for now.
- No speculative options, parameters, hooks, abstractions or config for
  future needs.
- No dead code: remove unused code, commented-out code and unused dependencies.

### DRY: Don't Repeat Yourself
- Every piece of knowledge (business rule, constant, validation, format) has
  one source of truth.
- Rule of three: a second copy is acceptable; extract on the third.
- Do not merge code that only looks alike but changes for different reasons.

### KISS: Keep It Simple
- Choose the simplest solution that meets the spec: plain functions and data
  over classes, patterns and indirection.
- Use the standard library and existing dependencies before adding new ones.
- Clear names and small functions over clever tricks.

## Commits

Conventional Commits 1.0.0 (https://www.conventionalcommits.org).

```
<type>(<scope>): <summary>

<body>

<footer>
```

- type: feat, fix, refactor, perf, test, docs, style, build, ci, chore, revert.
- scope: optional; the top-level feature slug, e.g. `auth`.
- summary: imperative mood, lowercase, no final period, max 72 characters.
- body: optional; what changed and why, one bullet per changed spec path.
- breaking change: `!` after type or scope, plus a `BREAKING CHANGE:` footer.

Example:

```
feat(auth): add remember-me option to login

- 1.4 "Remember me" checkbox: added
- 1.6.1 Success: session length depends on remember me
```
