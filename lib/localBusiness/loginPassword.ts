import { randomBytes } from "node:crypto";
import { passwordMeetsRequirements } from "@/lib/passwordRequirements";

export type BusinessLoginPassword = {
  password: string;
  mustResetPassword: boolean;
  /** Present only for a generated password. A typed password is never copied here. */
  temporaryPassword: string | null;
};

/**
 * A typed password stays in memory and is not returned. A generated password is
 * returned once so an admin can hand it over, then the account must change it.
 */
export function resolveBusinessLoginPassword(chosenPassword?: string): BusinessLoginPassword {
  if (chosenPassword !== undefined) {
    if (!passwordMeetsRequirements(chosenPassword)) {
      throw new Error("PASSWORD_REQUIREMENTS");
    }
    return { password: chosenPassword, mustResetPassword: false, temporaryPassword: null };
  }
  const password = randomBytes(18).toString("base64url");
  return { password, mustResetPassword: true, temporaryPassword: password };
}
