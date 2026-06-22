import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { isPasswordRequirementFailure } from "@/lib/passwordRequirements";
import { ensurePlayerSetup } from "@/lib/server/playerSetup";
import { tryAwardTorchBearerBadge } from "@/lib/server/betaFounders";
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
      const msg = error.message ?? "Sign up failed.";
      if (isPasswordRequirementFailure(msg)) {
        throw new ApiError(400, "Password does not meet requirements.", "PASSWORD_REQUIREMENTS");
      }
      if (msg.toLowerCase().includes("username") || msg.toLowerCase().includes("duplicate")) {
        throw new ApiError(409, "This username is already taken.", "USERNAME_TAKEN");
      }
      throw new ApiError(400, "Unable to create your account. Please try again.", "SIGNUP_FAILED");
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
        username: input.username,
      });
    } catch (setupError) {
      if (setupError instanceof ApiError) {
        const msg = setupError.message ?? "";
        if (msg.toLowerCase().includes("username") || msg.toLowerCase().includes("duplicate")) {
          throw new ApiError(409, "This username is already taken.", "USERNAME_TAKEN");
        }
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

    const torchBearer = data.session
      ? await tryAwardTorchBearerBadge({
          userId: data.user.id,
          user: data.user,
          email: data.user.email,
        })
      : null;

    return ok(
      {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        session: data.session,
        profile: player.profile,
        stats: player.stats,
        torchBearer,
      },
      201,
    );
  } catch (error) {
    if (error instanceof ZodError) {
      const passwordIssue = error.issues.find((issue) => issue.path[0] === "password");
      if (passwordIssue?.message === "PASSWORD_REQUIREMENTS") {
        return fail(new ApiError(400, "Password does not meet requirements.", "PASSWORD_REQUIREMENTS"));
      }
      return fail(new ApiError(400, "Please check your information and try again.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

