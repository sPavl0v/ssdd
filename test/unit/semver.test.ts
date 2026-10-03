import { describe, expect, it } from "vitest";
import { satisfies } from "../../src/semver.ts";

describe("semver ranges", () => {
  it.each([
    ["1.2.3", ">=1.2.0", true],
    ["1.1.9", ">=1.2.0", false],
    ["1.2.3", ">1.2.3", false],
    ["1.2.4", ">1.2.3", true],
    ["1.2.3", "<=1.2.3", true],
    ["1.2.3", "<1.2.3", false],
    ["1.2.3", "1.2.3", true],
    ["1.2.3", "=1.2.4", false],
    ["1.9.0", "^1.2.0", true],
    ["2.0.0", "^1.2.0", false],
    ["0.1.5", "^0.1.0", true],
    ["0.2.0", "^0.1.0", false],
    ["1.2.9", "~1.2.0", true],
    ["1.3.0", "~1.2.0", false],
    ["1.5.0", ">=1.0.0 <2.0.0", true],
    ["2.0.0", ">=1.0.0 <2.0.0", false],
    ["v1.2", ">=1", true],
  ])("%s satisfies %s → %s", (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });

  it("rejects unparsable versions and ranges", () => {
    expect(satisfies("latest", ">=1.0.0")).toBe(false);
    expect(satisfies("1.0.0", ">=abc")).toBe(false);
  });
});
