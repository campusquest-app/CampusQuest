import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { ensurePlayerSetup } from "@/lib/server/playerSetup";
import { createPublicClient } from "@/lib/server/supabase";
import { authSignupSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const input = await readJson(request, authSignupSchema);
    const supabase = createPublicClient();
    const isDev = process.env.NODE_ENV !== "production";

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: input.displayName ? { data: { display_name: input.displayName } } : undefined,
    });
    if (error) {
      throw new ApiError(400, error.message, "SIGNUP_FAILED");
    }
    if (!data.user?.id) {
      throw new ApiError(
        400,
        "We couldn't finish creating your account right now. Please try again in a moment.",
        "SIGNUP_USER_MISSING",
      );
    }

    let player;
    try {
      player = await ensurePlayerSetup({
        userId: data.user.id,
        email: data.user.email,
        displayName: input.displayName,
      });
    } catch (setupError) {
      if (setupError instanceof ApiError) {
        if (isDev) {
          throw new ApiError(
            400,
            `Auth signup succeeded, but profile setup failed (${setupError.code ?? "PROFILE_SETUP_FAILED"}): ${setupError.message}`,
            "SIGNUP_PROFILE_SETUP_FAILED",
          );
        }
        throw new ApiError(
          400,
          "Your account was created, but profile setup is still finishing. Please sign in again shortly.",
          "SIGNUP_PROFILE_SETUP_FAILED",
        );
      }
      throw setupError;
    }

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

