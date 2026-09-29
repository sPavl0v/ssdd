#!/bin/sh
# ssdd installer: picks the binary for this OS/CPU, verifies its checksum, installs to ~/.local/bin.
# Usage: curl -fsSL https://raw.githubusercontent.com/<org>/ssdd/main/install.sh | sh
set -eu
REPO="${SSDD_REPO:-<org>/ssdd}"
VERSION="${SSDD_VERSION:-latest}"
DEST="${SSDD_INSTALL_DIR:-$HOME/.local/bin}"

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) echo "ssdd: unsupported OS $(uname -s); on Windows use install.ps1" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) cpu=x64 ;;
  arm64|aarch64) cpu=arm64 ;;
  *) echo "ssdd: unsupported CPU $(uname -m)" >&2; exit 1 ;;
esac
file="ssdd-$os-$cpu"
if [ "$VERSION" = latest ]; then base="https://github.com/$REPO/releases/latest/download"; else base="https://github.com/$REPO/releases/download/v$VERSION"; fi

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$base/$file" -o "$tmp/$file"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"
expected="$(grep " $file\$" "$tmp/SHA256SUMS" | cut -d' ' -f1)"
if command -v sha256sum >/dev/null 2>&1; then actual="$(sha256sum "$tmp/$file" | cut -d' ' -f1)"; else actual="$(shasum -a 256 "$tmp/$file" | cut -d' ' -f1)"; fi
[ -n "$expected" ] && [ "$expected" = "$actual" ] || { echo "ssdd: checksum mismatch for $file" >&2; exit 1; }

mkdir -p "$DEST"
install -m 755 "$tmp/$file" "$DEST/ssdd"
echo "installed $("$DEST/ssdd" --version) to $DEST/ssdd"
case ":$PATH:" in *":$DEST:"*) ;; *) echo "add $DEST to your PATH" ;; esac
