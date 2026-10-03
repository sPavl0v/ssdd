import { describe, expect, test } from "vitest";
import { AuthService } from "./auth.ts";
import { type LoginForm, canSubmit } from "./form.ts";

const USERS = { "ann@example.com": "correct-horse" };

/** Submit the form the way the page does: only while the Submit button is enabled. */
function submit(auth: AuthService, form: LoginForm) {
  if (!canSubmit(form)) return null;
  return auth.login(form);
}

describe("Login page integration", () => {
  test("A user fixes invalid input, fails once and then logs in", () => {
    const auth = new AuthService(USERS);
    expect(submit(auth, { email: "ann@example.com", password: "" })).toBeNull();
    expect(submit(auth, { email: "ann.example.com", password: "short" })).toMatchObject({
      ok: false,
      errors: ["Enter a valid email", "Password must be at least 8 characters"],
    });
    expect(submit(auth, { email: "ann@example.com", password: "wrong-pass" })).toMatchObject({ ok: false, form: { email: "ann@example.com", password: "" } });
    const r = submit(auth, { email: "ann@example.com", password: "correct-horse" });
    expect(r).toMatchObject({ ok: true, redirect: "/home" });
    if (r?.ok) expect(auth.isActive(r.session)).toBe(true);
  });
});

describe("Logout integration", () => {
  test("A user logs in, logs out and the session is no longer active", () => {
    const auth = new AuthService(USERS);
    const r = submit(auth, { email: "ann@example.com", password: "correct-horse" });
    if (!r?.ok) throw new Error("login failed");
    expect(auth.logout(r.session)).toEqual({ redirect: "/login" });
    expect(auth.isActive(r.session)).toBe(false);
  });
});
