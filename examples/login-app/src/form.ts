export interface LoginForm {
  email: string;
  password: string;
}

export const FIELDS = ["email", "password"] as const;

export function canSubmit(form: LoginForm): boolean {
  return form.email.trim() !== "" && form.password !== "";
}

export function validate(form: LoginForm): string[] {
  const errors: string[] = [];
  if (!form.email.includes("@")) errors.push("Enter a valid email");
  if (form.password.length < 8) errors.push("Password must be at least 8 characters");
  return errors;
}
