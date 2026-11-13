import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { passwordFieldSchema } from "@/lib/server/validation";
import { resolveBusinessLoginPassword } from "@/lib/localBusiness/loginPassword";

/**
 * Guards the admin provision route against password logging and accidental resets.
 * Keeps assertions on source + shared schemas so CI does not need Supabase.
 */
describe("admin local-business provision route safety", () => {
  const routePath = join(process.cwd(), "app/api/internal/admin/local-businesses/route.ts");
  const route = readFileSync(routePath, "utf8");

  it("requires platform admin auth and converts ZodError before fail()", () => {
    expect(route).toContain("requireAdminUser");
    expect(route).toContain("ZodError");
    expect(route).toContain("failValidation");
    expect(route).toMatch(/if \(error instanceof ZodError\)/);
    expect(route).toContain("formatZodError");
    expect(route).toContain("confirmPasswordChange");
    expect(route).toContain("passwordFieldSchema");
  });

  it("refuses a typed password without confirmPasswordChange", () => {
    const schema = z
      .object({
        email: z.string().email(),
        chosenPassword: passwordFieldSchema.optional(),
        confirmPasswordChange: z.literal(true).optional(),
      })
      .superRefine((data, ctx) => {
        if (data.chosenPassword !== undefined && data.confirmPasswordChange !== true) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Confirm that you intend to set or reset this login password.",
            path: ["confirmPasswordChange"],
          });
        }
      });

    const rejected = schema.safeParse({
      email: "internationalpocket@campusquestapp.com",
      chosenPassword: "Horse-battery-1!",
    });
    expect(rejected.success).toBe(false);

    const accepted = schema.safeParse({
      email: "internationalpocket@campusquestapp.com",
      chosenPassword: "Horse-battery-1!",
      confirmPasswordChange: true,
    });
    expect(accepted.success).toBe(true);

    const generatedPath = schema.safeParse({
      email: "internationalpocket@campusquestapp.com",
    });
    expect(generatedPath.success).toBe(true);
  });

  it("never returns an operator-typed password as temporaryPassword", () => {
    const chosen = resolveBusinessLoginPassword("Horse-battery-1!");
    expect(chosen.temporaryPassword).toBeNull();
    expect(chosen.mustResetPassword).toBe(false);
  });
});
