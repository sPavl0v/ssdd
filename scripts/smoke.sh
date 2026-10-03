#!/usr/bin/env bash
# Pack the npm package and run the user flow through npx against a throwaway repo with a bare remote:
# init, commit v1, edit the spec, print the implement context, commit v2, and confirm the remote has version 2.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

tarball="$(cd "$root" && npm pack --silent --pack-destination "$work" | tail -n 1)"
ssdd() { npm exec --yes --package="$work/$tarball" -- ssdd "$@"; }

cd "$work"
git init -q --bare remote.git
mkdir app && cd app
git init -q -b main
git config user.email smoke@example.com
git config user.name smoke
git remote add origin ../remote.git

ssdd --version
ssdd init
ssdd commit -m "chore(ssdd): initialize ssdd spec"
printf -- '---\nssdd: 1\nversion: 1\n---\n# Login\n\n- Login form\n  - Shows email field\n' > ssdd/rootspec.md
ssdd context --for implement > /dev/null
ssdd commit -m "feat(login): login form"
git -C ../remote.git show main:ssdd/rootspec.md | grep -qx 'version: 2'
echo "smoke test passed: $tarball"
