# ssdd — Simple Spec-Driven Development

ssdd is designed to keep one spec which reflects the current state of an application. Spec is represented as a tree(nodes and leafs) of application features and logic. Each node usually represent a structural element and each leaf - its behavior. Example:

```markdown
- [1] Login page
  - [1.a] Login form
    - [1.a.1] When the user presses Enter in the Email input or the Password input, the app does the same as a click on the Submit button.
    - [1.a.2] When the POST /login response has status 200, the app opens /home.
    - [1.a.3] Email input
      - [1.a.3.a] The Email value is valid when, without leading and trailing whitespace, it matches `^[^@\s]+@[^@\s]+\.[^@\s]+$`.
      - [1.a.3.b] While the Email input has focus, its outline color is #2E7D32.
      - [1.a.3.c] While the Email input has no focus, its outline color is #BDBDBD.
      - [1.a.3.d] When the user clicks the Submit button and the Email value is not valid, the Email input shows the error "Enter a valid email address".
      - [1.a.3.e] When the user changes the Email value, the Email input hides its error.
      - [1.a.3.f] When the Login page opens, the Email input shows no error.
    - [1.a.4] Password input
      - [1.a.4.a] The Password value is valid when it has 8 or more characters.
      - [1.a.4.b] While the Password input has focus, its outline color is #1565C0.
      - [1.a.4.c] While the Password input has no focus, its outline color is #BDBDBD.
      - [1.a.4.d] When the user types a character in the Password input, the Password input shows "*" in place of that character.
      - [1.a.4.e] When the user clicks the Submit button and the Password value is not valid, the Password input shows the error "Password must be at least 8 characters".
      - [1.a.4.f] When the user changes the Password value, the Password input hides its error.
      - [1.a.4.g] When the Login page opens, the Password input shows no error.
    - [1.a.5] Submit button
      - [1.a.5.a] When the user clicks the Submit button and the Email value or the Password value is not valid, the app sends no request.
      - [1.a.5.b] When the user clicks the Submit button and both values are valid, the app sends POST /login with the JSON body `{"email": <email>, "password": <password>}`.
        <email> is the Email value without leading and trailing whitespace, as a JSON string. <password> is the Password value, as a JSON string.
      - [1.a.5.c] While a POST /login request is open, the Submit button is disabled.
        A request is open until its response arrives or 10000 ms pass.
    - [1.a.6] Error message
      - [1.a.6.a] When the Login page opens, the Error message is hidden.
      - [1.a.6.b] When the user clicks the Submit button, the Error message is hidden.
      - [1.a.6.c] When the POST /login response has status 401, the Error message shows "Email or password is incorrect".
      - [1.a.6.d] When the POST /login response has a status other than 200 and 401, or the request closes without a response, the Error message shows "Login failed. Try again.".
```

## Workflow

Workflow consists on 5 simple steps:

`npx ssdd init`(once) -> `/ssdd-specify` -> `/ssdd-implement` -> `/ssdd-test` -> `/ssdd-commit`

1. `ssdd init` creates rootspec.md, constitution.md, techstack.md, memory.md and ssdd.config.json in root/ssdd folder + create 4 following skills in .claude/ folder.
2. `/ssdd-specify <what should be changed>` - update the spec for you. Uses [ASD-STE100](https://www.asd-ste100.org/) to make descriptions clean and easy to interpret for agents.
3. `/ssdd-implement` runs the implementation based on what changed in spec from last commit. Uses git diff to identify changes. Creates a unit test(s) for each leaf + integration tests for each top-level feature.
4. `/ssdd-test` runs all unit and integration tests.
5. `/ssdd-commit <message>` increment a rootspec version and commit changes

Supported agent: Claude Code (installed as skills in `.claude/skills/<name>/SKILL.md`).


## Install

Requires Node.js >=20 and git. Run it with npx:

```sh
npx ssdd init
```

## Files

`ssdd init` creates following structure at `root`. It never overwrites a file that already exists.

```
ssdd/
  rootspec.md                 the spec tree
  specs/<feature>/spec.md     optional: a feature subtree in its own file
  constitution.md             rules every change must follow
  techstack.md                languages, libraries, layout and commands
  memory.md                   facts the agents looked up
  ssdd.config.json            CLI settings
```

- **`ssdd/rootspec.md`** - main spec which describes application. It has three parts:
  - ssdd and rootspec version.
  - A preamble: a heading with the app name and one paragraph that says what the app is and who uses it. Agents read it as context for every node.
  - The tree of nodes (see [Spec format](#spec-format)).
- **`ssdd/specs/<feature>/spec.md`** (optional) - additional sub-spec for a top-level feature. Use it if your rootspec became too large. create a reference in rootspec.md by: `ref:<feature>`
- **`ssdd/constitution.md`** has the rules that every change must follow. Agents stop and report when a spec node conflicts with it. Edit it to add your own rules. `/ssdd-specify` never edits it.
- **`ssdd/techstack.md`** - technical details of the projects.
- **`ssdd/memory.md`** holds facts the agents looked up because `constitution.md` and `techstack.md` do not state them, such as how to run the tests (see [Memory](#memory)). Agents write it; you can edit or clear it.
- **`ssdd/ssdd.config.json`** has the CLI settings:

  | Key | Default | Meaning |
  | --- | --- | --- |
  | `ssddVersion` | `>=<installed version>` | ssdd versions this project accepts; the CLI stops with exit 2 when it does not match |
  | `git.remote` | `"origin"` | remote that `ssdd commit` pushes to when the branch has no upstream |
  | `git.push` | `true` | `false` keeps every `ssdd commit` local |

- **`.claude/skills/ssdd-<name>/SKILL.md`** are the four agent commands for Claude Code: `ssdd-specify`, `ssdd-implement`, `ssdd-test` and `ssdd-commit`.


## Spec format

- A node is a bullet (`-`, `*`, `+`). Any following lines at the node's indentation that are not bullets form its body.
- Labels come from position, with numbers and letters alternating by level (`1.a.3.b`). Number levels go from 1 to 1000 (`1.a.234`); letter levels go from a to z, then aa to zz (`1.an.4`), so a node has at most 1000 or 702 children. 
- Leaves are written in ASD-STE100 Simplified Technical English, in one of these forms: `When <trigger>, <result>.`, `While <state>, <result>.`, `The <element> <is|shows> <value>.` or `The <value> is valid when <rule>.` Every value is exact (text in quotes, colors as hex, durations in ms, patterns as regular expressions). Leaves contain no examples, no vague words and no references to other nodes by label. `/ssdd-specify` follows these rules for everything it writes.
- A node whose title ends in `ref:<feature>` mounts `ssdd/specs/<feature>/spec.md` at that point.
- HTML comments are notes for humans and are ignored by change detection. Bullet style, indentation and labels are ignored too.

## Memory

`ssdd/memory.md` holds project facts the agent had to look up because they aren't in `constitution.md` or `techstack.md`. `ssdd context` prints it for every command, so the next run doesn't repeat the search. For now it remembers how to write and run tests: `/ssdd-implement` and `/ssdd-test` read it first, and when the tech stack doesn't state the test frameworks and commands clearly, it writes what it found there. Edit or clear it whenever you like; it is committed with the spec but never counts as a spec change.

## Tests

`/ssdd-implement` writes the tests together with the code:

- Every node below the top level gets unit tests: each leaf at least one, and each inner node with body text at least one for that text.
- Every top-level node is a feature and gets integration tests that run it through the whole app.
- Only changed nodes get new or updated tests. The agent takes it that the tests of the unchanged spec already exist.

Tests carry no tags, labels, versions or hashes. They are named after node titles and nested like the spec: the outermost suite has the top-level title, the tests have the leaf titles, and integration tests sit in a suite named `<top-level title> integration`. A name filter on a top-level title therefore selects every test of that feature.

`/ssdd-test` runs, for every top-level feature with changes since the last ssdd commit, all its unit and integration tests, not only the tests of the changed nodes. `ssdd context --for test` lists those features. When nothing changed, it runs the whole suite. The agent works out how to run tests from `ssdd/techstack.md`, README.md, AGENTS.md, CLAUDE.md or the project's config files, and first checks `ssdd/memory.md`.

## CLI

You normally don't call the CLI yourself: `ssdd init` sets things up, and the agent commands call the rest.

| Command | Purpose |
| --- | --- |
| `ssdd init [--agents claude] [--yes]` | Scaffold `ssdd/`, install agent commands |
| `ssdd context [path] --for specify\|implement\|test` | Print the agent context bundle |
| `ssdd commit (-m msg \| -F file) [--no-push]` | Bump the version, commit, push |

Exit codes: 0 means OK, 1 means failures (spec errors, a rejected push), 2 means a usage or config error.

## Example

`examples/login-app` is a small UI app written with ssdd.

## Development

```sh
npm install
npm test            # vitest: unit tests plus throwaway git repos with a bare remote
npm run typecheck
npm run build       # bundle into dist/cli.mjs (Node, no runtime dependencies)
npm run smoke       # npm pack, then run init/commit/context/commit through npx
```
