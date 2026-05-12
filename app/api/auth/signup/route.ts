import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { ensurePlayerSetup } from "@/lib/server/playerSetup";
import { createPublicClient } from "@/lib/server/supabase";
import { authSignupSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const input = await readJson(request, authSignupSchema);
    const supabase = createPublicClient();

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: input.displayName ? { data: { display_name: input.displayName } } : undefined,
    });
    if (error || !data.user) {
      throw new ApiError(400, error?.message ?? "Sign up failed.", "SIGNUP_FAILED");
    }

    const player = await ensurePlayerSetup({
      userId: data.user.id,
      email: data.user.email,
      displayName: input.displayName,
    });

    return ok(
      {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        session: data.session,
        profile: player.profile,
        stats: player.stats,
      },
      201,
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

