// Render Formula/ssdd.rb for the Homebrew tap (7.2) from dist/SHA256SUMS.
// Usage: bun scripts/formula.ts <org> > Formula/ssdd.rb
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const org = process.argv[2] ?? "<org>";
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const sums = Object.fromEntries(
  fs.readFileSync(path.join(root, "dist/SHA256SUMS"), "utf8").trim().split("\n").map((l) => l.split(/\s+/).reverse()),
);
const url = (f: string) => `https://github.com/${org}/ssdd/releases/download/v${version}/${f}`;
const block = (f: string) => `      url "${url(f)}"\n      sha256 "${sums[f] ?? "<sha256>"}"`;
process.stdout.write(`class Ssdd < Formula
  desc "Simple spec-driven development CLI"
  homepage "https://github.com/${org}/ssdd"
  version "${version}"
  license "MIT"

  on_macos do
    on_arm do
${block("ssdd-darwin-arm64")}
    end
    on_intel do
${block("ssdd-darwin-x64")}
    end
  end

  on_linux do
    on_arm do
${block("ssdd-linux-arm64")}
    end
    on_intel do
${block("ssdd-linux-x64")}
    end
  end

  def install
    bin.install Dir["ssdd-*"].first => "ssdd"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/ssdd --version")
  end
end
`);
