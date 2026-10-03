import { describe, expect, test } from "vitest";
import { AuthService, LOCK_MS } from "./auth.ts";

const USERS = { "ann@example.com": "correct-horse" };
const ANN = { email: "ann@example.com", password: "correct-horse" };
const WRONG = { email: "ann@example.com", password: "wrong-pass" };
const INCORRECT = "Email or password is incorrect";
const LOCKED = "Too many attempts, try again in 15 minutes";

/** Fail the credentials check `n` times for Ann. */
function fail(auth: AuthService, n: number) {
  for (let i = 0; i < n; i++) auth.login(WRONG);
}

describe("Login page", () => {
  describe("Login form", () => {
    test("The result of a submit comes from the first check that fails, in this order: the Email and Password rules, the Account lock, the credentials.", () => {
      const auth = new AuthService(USERS, () => 0);
      fail(auth, 5);
      expect(auth.login({ email: "ann@example.com", password: "short" })).toMatchObject({ errors: ["Password must be at least 8 characters"] });
      expect(auth.login(WRONG)).toMatchObject({ errors: [LOCKED] });
      expect(new AuthService(USERS).login(WRONG)).toMatchObject({ errors: [INCORRECT] });
    });

    test("The credentials are valid when the Email value is a registered email and the Password value is the password of that email.", () => {
      const auth = new AuthService(USERS);
      expect(auth.login(ANN)).toMatchObject({ ok: true });
      expect(auth.login({ email: "bob@example.com", password: "correct-horse" })).toMatchObject({ ok: false, errors: [INCORRECT] });
      expect(auth.login({ email: "ann@example.com", password: "Correct-horse" })).toMatchObject({ ok: false, errors: [INCORRECT] });
    });

    test("When a submit passes all checks, the app opens /home with a new active session.", () => {
      const auth = new AuthService(USERS);
      const a = auth.login(ANN);
      const b = auth.login(ANN);
      expect(a).toMatchObject({ ok: true, redirect: "/home" });
      if (!a.ok || !b.ok) throw new Error("login failed");
      expect(auth.isActive(a.session)).toBe(true);
      expect(b.session).not.toBe(a.session);
    });

    test('When a submit fails the credentials check, the Error list shows "Email or password is incorrect".', () => {
      expect(new AuthService(USERS).login(WRONG)).toMatchObject({ ok: false, errors: [INCORRECT] });
    });

    test("When a submit fails a check, the Email value does not change.", () => {
      const auth = new AuthService(USERS, () => 0);
      expect(auth.login({ email: "ann.example.com", password: "x" })).toMatchObject({ form: { email: "ann.example.com" } });
      expect(auth.login(WRONG)).toMatchObject({ form: { email: "ann@example.com" } });
      fail(auth, 4);
      expect(auth.login(ANN)).toMatchObject({ errors: [LOCKED], form: { email: "ann@example.com" } });
    });

    test("When a submit fails a check, the Password value becomes empty.", () => {
      const auth = new AuthService(USERS, () => 0);
      expect(auth.login({ email: "ann.example.com", password: "x" })).toMatchObject({ form: { password: "" } });
      expect(auth.login(WRONG)).toMatchObject({ form: { password: "" } });
      fail(auth, 4);
      expect(auth.login(ANN)).toMatchObject({ errors: [LOCKED], form: { password: "" } });
    });

    describe("Error list", () => {
      test("The Error list shows only the errors of the last submit, in this order: the Email error, the Password error, the lock error, the credentials error.", () => {
        const auth = new AuthService(USERS);
        expect(auth.login({ email: "ann.example.com", password: "short" })).toMatchObject({
          errors: ["Enter a valid email", "Password must be at least 8 characters"],
        });
        expect(auth.login(WRONG)).toMatchObject({ errors: [INCORRECT] });
      });
    });
  });

  describe("Account lock", () => {
    test("The failed attempt count of an email is 0 until the first submit with that email that fails the credentials check.", () => {
      const auth = new AuthService(USERS, () => 0);
      auth.login({ email: "ann@example.com", password: "short" });
      fail(auth, 4);
      expect(auth.login(WRONG)).toMatchObject({ errors: [INCORRECT] });
      expect(auth.login(ANN)).toMatchObject({ errors: [LOCKED] });
    });

    test("When a submit fails the credentials check, the failed attempt count of its email increases by 1.", () => {
      const auth = new AuthService(USERS, () => 0);
      fail(auth, 4);
      expect(auth.login(ANN)).toMatchObject({ ok: true });
      fail(auth, 5);
      expect(auth.login(ANN)).toMatchObject({ errors: [LOCKED] });
    });

    test("When a submit passes all checks, the failed attempt count of its email becomes 0.", () => {
      const auth = new AuthService(USERS, () => 0);
      fail(auth, 4);
      auth.login(ANN);
      fail(auth, 4);
      expect(auth.login(ANN)).toMatchObject({ ok: true });
    });

    test("When the failed attempt count of an email becomes 5 or more, the Account lock locks that email until 900000 ms after that submit.", () => {
      let now = 0;
      const auth = new AuthService(USERS, () => now);
      expect(LOCK_MS).toBe(900000);
      fail(auth, 5);
      now = 899999;
      expect(auth.login(ANN)).toMatchObject({ errors: [LOCKED] });
      now = 900000;
      auth.login(WRONG);
      now = 900000 + 899999;
      expect(auth.login(ANN)).toMatchObject({ errors: [LOCKED] });
      now = 900000 + 900000;
      expect(auth.login(ANN)).toMatchObject({ ok: true });
    });

    test('When a submit has an email that is locked, the Error list shows "Too many attempts, try again in 15 minutes".', () => {
      const auth = new AuthService(USERS, () => 0);
      fail(auth, 5);
      expect(auth.login(ANN)).toMatchObject({ ok: false, errors: [LOCKED] });
      expect(auth.login({ email: "bob@example.com", password: "whatever1" })).toMatchObject({ errors: [INCORRECT] });
    });
  });
});

describe("Logout", () => {
  test("When the user logs out, the app ends the active session of the user.", () => {
    const auth = new AuthService(USERS);
    const r = auth.login(ANN);
    if (!r.ok) throw new Error("login failed");
    auth.logout(r.session);
    expect(auth.isActive(r.session)).toBe(false);
  });

  test("When the user logs out, the app opens /login.", () => {
    const auth = new AuthService(USERS);
    const r = auth.login(ANN);
    if (!r.ok) throw new Error("login failed");
    expect(auth.logout(r.session)).toEqual({ redirect: "/login" });
  });
});
