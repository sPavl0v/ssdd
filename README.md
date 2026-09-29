# ssdd — simple spec-driven development

ssdd keeps one living spec: a numbered feature checklist that says how the app behaves today. You edit the checklist, run `/ssdd-implement`, and git works out which nodes changed since the last ssdd commit. The agent then builds, updates and tests only those nodes.

```markdown
- [1] Login page
  - [1.a] Form
    - [1.a.1] Shows email and password fields
    - [1.a.2] Submit is disabled until both fields are filled
  - [1.b] Submit
    - [1.b.1] Valid credentials start a session and redirect to /home
- [2] Dashboard ref:dashboard
```

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/<org>/ssdd/main/install.sh | sh   # macOS / Linux
irm https://raw.githubusercontent.com/<org>/ssdd/main/install.ps1 | iex        # Windows
brew install <org>/tap/ssdd
uv tool install ssdd        # or: uvx ssdd init
npx ssdd init               # JS projects that want to pin a version
```

The CLI is a standalone binary, so it needs neither Node nor Bun.

## Workflow

1. `ssdd init` writes `ssdd/rootspec.md`, `constitution.md`, `techstack.md` and `ssdd.config.json`, installs the slash commands and prints the first commit message.
2. `/ssdd-commit <message>` sets the version to 1, commits, tags `ssdd-v1` and pushes.
3. Edit `ssdd/rootspec.md`, or any `ssdd/specs/<feature>/spec.md`.
4. `/ssdd-implement` diffs the spec against the last ssdd commit. It builds added nodes, updates changed ones and removes deleted ones, then runs the tests for the affected parents and prints a commit message.
5. `/ssdd-commit <that message>`.

The three agent commands are `/ssdd-implement [path] [--no-test]`, `/ssdd-test [path]` and `/ssdd-commit <message>`. Supported agents: Claude Code, Cursor, GitHub Copilot, Gemini CLI, opencode and Codex CLI (`ssdd agents add <agent>`).

## Spec format

- A node is a bullet (`-`, `*`, `+`). Any following lines at the node's indentation that are not bullets form its body.
- Labels come from position, with numbers and letters alternating by level (`1.a.3.b`). Never write them by hand: `ssdd fmt` fills them in.
- A node whose title ends in `ref:<feature>` mounts `ssdd/specs/<feature>/spec.md` at that point. Use `ssdd split` and `ssdd join` to move subtrees between files.
- HTML comments are notes for humans and are ignored by change detection. Bullet style, indentation and labels are ignored too.
- The spec holds no status. Status comes from test reports.

## Tests

Each test carries one tag that links it to a leaf: `[ssdd:<path>@v<version>#<fingerprint>]`. `ssdd context --for test` prints the tag to use for each leaf. When paths shift, `ssdd sync` rewrites the tags. A test whose leaf was reworded after it was written is reported as stale.

```
ssdd test 1.a  ·  spec v7  ·  2 leaves  ·  3 tests

[1.a]      Form                                   ✗  1/2
  [1.a.1]  Shows email and password fields        ✓
  [1.a.2]  Submit is disabled until both fields   ✗  expected disabled, got enabled
```

Test runners are set in `ssdd.config.json` under `test.runners`. For each runner you give a shell command containing `{filter}` and the path of the JUnit XML file it writes. For pytest-style runners, set `"tagStyle": "comment"` and put the tag in a comment on the line above the test.

## CLI

| Command | Purpose |
| --- | --- |
| `ssdd init [--agents claude,cursor] [--prefix p] [--yes]` | Scaffold `ssdd/`, install agent commands |
| `ssdd sync [--check]` | Format spec files and relink test tags |
| `ssdd fmt [--check]` | Format spec files only |
| `ssdd tree [path] [--depth n] [--version v] [--json]` | Print the numbered tree |
| `ssdd show <path> [--json]` | Print one node with its file, line and fingerprint |
| `ssdd context [path] --for implement\|test [--no-test]` | Print the agent context bundle |
| `ssdd diff [path] [--from v] [--to v] [--json]` | Show the change set between versions |
| `ssdd commit (-m msg \| -F file) [--no-push]` | Bump the version, commit, tag `ssdd-v<N>`, push |
| `ssdd test [path] [--depth n] [--failed] [--strict] [--verbose] [--json]` | Run tagged tests and print the report |
| `ssdd check [--json]` | Lint spec, config and tags (for CI) |
| `ssdd split <path> <feature>` / `ssdd join <feature>` | Move a subtree to or from a feature file |
| `ssdd history [--json]` | List versions with change counts |
| `ssdd agents add\|remove\|list [agent]` | Manage slash commands |
| `ssdd hook install` | Add a pre-commit hook that runs `ssdd sync --check` |

Exit codes: 0 means OK, 1 means failures (or lint errors), 2 means a usage or config error.

## Example

`examples/login-app` is a small app specced with a login checklist. Every leaf has a tagged Vitest test. To try it, copy it into a fresh git repo, run `npm install`, then `ssdd test`.

## Development

```sh
npm install
npm test            # vitest: unit tests plus throwaway git repos with a bare remote
npm run typecheck
npm run build       # dist/ssdd for this machine
npm run build:all   # every target, SHA256SUMS and npm platform packages
npm run build:wheels
npm run schema      # schema/ssdd.config.schema.json
```

Layout: `src/spec` (parser, formatter, tree, split/join), `src/version` (git, baseline, mapping, change set, sync, commit, history), `src/tests` (tags, runners, JUnit, report), `src/agents` (adapters), `src/context` (bundle), `src/cli` (commands). Templates live in `templates/` and are embedded into the binary by `scripts/embed-assets.mjs`.
