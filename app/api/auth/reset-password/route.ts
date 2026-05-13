import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createPublicClient } from "@/lib/server/supabase";
import { authResendConfirmationSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const input = await readJson(request, authResendConfirmationSchema);
    const supabase = createPublicClient();
    const { error } = await supabase.auth.resetPasswordForEmail(input.email);
    if (error) {
      throw new ApiError(400, error.message, "RESET_PASSWORD_FAILED");
    }
    return ok({ sent: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

