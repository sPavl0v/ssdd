import { describe, expect, test } from "vitest";
import { AuthService, LOCK_MS } from "./auth.ts";

const USERS = { "ann@example.com": "correct-horse" };

describe("auth", () => {
  test("[ssdd:1.c.1@v1#0c4774] valid credentials start a session and redirect to /home", () => {
    const auth = new AuthService(USERS);
    const r = auth.login({ email: "ann@example.com", password: "correct-horse" });
    expect(r).toMatchObject({ ok: true, redirect: "/home" });
    if (r.ok) expect(auth.isActive(r.session)).toBe(true);
  });

  test("[ssdd:1.c.2@v1#9145eb] wrong credentials show an error and keep the email", () => {
    const r = new AuthService(USERS).login({ email: "ann@example.com", password: "wrong-pass" });
    expect(r).toEqual({ ok: false, errors: ["Email or password is incorrect"], form: { email: "ann@example.com", password: "" } });
  });

  test("[ssdd:1.c.3@v1#ddf019] locks the account for 15 minutes after 5 failed attempts", () => {
    let now = 0;
    const auth = new AuthService(USERS, () => now);
    for (let i = 0; i < 5; i++) auth.login({ email: "ann@example.com", password: "wrong-pass" });
    const locked = auth.login({ email: "ann@example.com", password: "correct-horse" });
    expect(locked).toMatchObject({ ok: false, errors: ["Too many attempts, try again in 15 minutes"] });
    now += LOCK_MS + 1;
    expect(auth.login({ email: "ann@example.com", password: "correct-horse" })).toMatchObject({ ok: true });
  });

  test("[ssdd:2.a@v1#157362] logout ends the session and redirects to /login", () => {
    const auth = new AuthService(USERS);
    const r = auth.login({ email: "ann@example.com", password: "correct-horse" });
    if (!r.ok) throw new Error("login failed");
    expect(auth.logout(r.session)).toEqual({ redirect: "/login" });
    expect(auth.isActive(r.session)).toBe(false);
  });
});
