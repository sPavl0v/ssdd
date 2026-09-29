import { describe, expect, test } from "vitest";
import { FIELDS, canSubmit, validate } from "./form.ts";

describe("login form", () => {
  test("[ssdd:1.a.1@v1#577745] has email and password fields", () => {
    expect(FIELDS).toEqual(["email", "password"]);
  });

  test("[ssdd:1.a.2@v1#51103e] submit is disabled until both fields are filled", () => {
    expect(canSubmit({ email: "", password: "" })).toBe(false);
    expect(canSubmit({ email: "a@b.c", password: "" })).toBe(false);
    expect(canSubmit({ email: "", password: "secret123" })).toBe(false);
    expect(canSubmit({ email: "a@b.c", password: "secret123" })).toBe(true);
  });

  test('[ssdd:1.b.1@v1#f82015] rejects an email without "@"', () => {
    expect(validate({ email: "ab.c", password: "secret123" })).toEqual(["Enter a valid email"]);
  });

  test("[ssdd:1.b.2@v1#574d74] rejects a password shorter than 8 characters", () => {
    expect(validate({ email: "a@b.c", password: "short" })).toEqual(["Password must be at least 8 characters"]);
  });
});
