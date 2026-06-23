import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { isPasswordRequirementFailure } from "@/lib/passwordRequirements";
import { confirmEmailAndSignIn, logAuthFlow } from "@/lib/server/authBootstrap";
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
    logAuthFlow("signup", "auth_sign_up", {
      ok: !error && Boolean(data.user?.id),
      userId: data.user?.id ?? null,
      hasSession: Boolean(data.session),
      emailConfirmed: Boolean(data.user?.email_confirmed_at ?? data.user?.confirmed_at),
      error: error?.message ?? null,
      code: error?.code ?? null,
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
      logAuthFlow("signup", "profile_setup", {
        userId: data.user.id,
        profileId: player.profile.id,
        username: player.profile.username,
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

    let authUser = data.user;
    let authSession = data.session;
    if (!authSession) {
      const confirmed = await confirmEmailAndSignIn({
        publicClient: supabase,
        userId: data.user.id,
        email: input.email,
        password: input.password,
        route: "signup",
      });
      if (confirmed) {
        authUser = confirmed.user;
        authSession = confirmed.session;
      } else {
        logAuthFlow("signup", "session_unavailable", {
          userId: data.user.id,
          reason: "email_confirmation_pending",
        });
      }
    }

    const torchBearer = authSession
      ? await tryAwardTorchBearerBadge({
          userId: authUser.id,
          user: authUser,
          email: authUser.email,
        })
      : null;

    return ok(
      {
        user: {
          id: authUser.id,
          email: authUser.email,
        },
        session: authSession,
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

