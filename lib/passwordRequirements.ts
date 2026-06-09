export type PasswordRequirementChecks = {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
};

export const PASSWORD_REQUIREMENT_RULES = [
  { key: "uppercase" as const, label: "One uppercase letter" },
  { key: "lowercase" as const, label: "One lowercase letter" },
  { key: "number" as const, label: "One number" },
  { key: "special" as const, label: "One special character" },
] as const;

export function checkPasswordRequirements(password: string): PasswordRequirementChecks {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export function passwordMeetsRequirements(password: string): boolean {
  const checks = checkPasswordRequirements(password);
  return checks.minLength && checks.uppercase && checks.lowercase && checks.number && checks.special;
}

export function isPasswordRequirementFailure(message: string, code?: string): boolean {
  if (code === "PASSWORD_REQUIREMENTS") return true;
  const lower = message.toLowerCase();
  return (
    lower.includes("password") &&
    (lower.includes("requirement") ||
      lower.includes("should contain") ||
      lower.includes("must include") ||
      lower.includes("weak") ||
      lower.includes("at least") ||
      lower.includes("character"))
  );
}
