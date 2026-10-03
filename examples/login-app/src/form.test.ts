import { describe, expect, test } from "vitest";
import { FIELDS, canSubmit, validate } from "./form.ts";

describe("Login page", () => {
  describe("Login form", () => {
    test("The Login form shows the Email input above the Password input.", () => {
      expect(FIELDS).toEqual(["email", "password"]);
    });

    describe("Email input", () => {
      test('The Email value is valid when it contains the character "@".', () => {
        expect(validate({ email: "a@b.c", password: "secret123" })).toEqual([]);
        expect(validate({ email: "@", password: "secret123" })).toEqual([]);
        expect(validate({ email: "ab.c", password: "secret123" })).toEqual(["Enter a valid email"]);
      });

      test('When a submit has an Email value that is not valid, the Error list shows "Enter a valid email".', () => {
        expect(validate({ email: "", password: "secret123" })).toEqual(["Enter a valid email"]);
      });
    });

    describe("Password input", () => {
      test("The Password value is valid when it has 8 or more characters.", () => {
        expect(validate({ email: "a@b.c", password: "exactly8" })).toEqual([]);
        expect(validate({ email: "a@b.c", password: "more-than-8" })).toEqual([]);
        expect(validate({ email: "a@b.c", password: "seven77" })).toEqual(["Password must be at least 8 characters"]);
      });

      test('When a submit has a Password value that is not valid, the Error list shows "Password must be at least 8 characters".', () => {
        expect(validate({ email: "a@b.c", password: "" })).toEqual(["Password must be at least 8 characters"]);
      });
    });

    describe("Submit button", () => {
      test("While the Email value is empty or contains only whitespace characters, or the Password value is empty, the Submit button is disabled.", () => {
        expect(canSubmit({ email: "", password: "secret123" })).toBe(false);
        expect(canSubmit({ email: " \t\n", password: "secret123" })).toBe(false);
        expect(canSubmit({ email: "a@b.c", password: "" })).toBe(false);
        expect(canSubmit({ email: "", password: "" })).toBe(false);
      });

      test("While the Email value contains a character that is not whitespace and the Password value is not empty, the Submit button is enabled.", () => {
        expect(canSubmit({ email: " a ", password: "x" })).toBe(true);
        expect(canSubmit({ email: "a@b.c", password: " " })).toBe(true);
      });
    });
  });
});
