import { type LoginForm, validate } from "./form.ts";

export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export type LoginResult =
  | { ok: true; session: string; redirect: "/home" }
  | { ok: false; errors: string[]; form: LoginForm };

export class AuthService {
  private sessions = new Set<string>();
  private failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    private users: Record<string, string>,
    private now: () => number = Date.now,
  ) {}

  login(form: LoginForm): LoginResult {
    const errors = validate(form);
    if (errors.length) return { ok: false, errors, form: { ...form, password: "" } };
    const f = this.failures.get(form.email);
    if (f && f.lockedUntil > this.now()) {
      return { ok: false, errors: ["Too many attempts, try again in 15 minutes"], form: { ...form, password: "" } };
    }
    if (this.users[form.email] !== form.password) {
      const count = (f?.count ?? 0) + 1;
      this.failures.set(form.email, { count, lockedUntil: count >= MAX_ATTEMPTS ? this.now() + LOCK_MS : 0 });
      return { ok: false, errors: ["Email or password is incorrect"], form: { email: form.email, password: "" } };
    }
    this.failures.delete(form.email);
    const session = `s_${Math.random().toString(36).slice(2)}`;
    this.sessions.add(session);
    return { ok: true, session, redirect: "/home" };
  }

  logout(session: string): { redirect: "/login" } {
    this.sessions.delete(session);
    return { redirect: "/login" };
  }

  isActive(session: string): boolean {
    return this.sessions.has(session);
  }
}
