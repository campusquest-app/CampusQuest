import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { ensurePlayerSetup } from "@/lib/server/playerSetup";
import { createPublicClient } from "@/lib/server/supabase";
import { authLoginSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const input = await readJson(request, authLoginSchema);
    const supabase = createPublicClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error || !data.user || !data.session) {
      throw new ApiError(401, error?.message ?? "Login failed.", "LOGIN_FAILED");
    }

    const player = await ensurePlayerSetup({
      userId: data.user.id,
      email: data.user.email,
      displayName: (data.user.user_metadata?.display_name as string | undefined) ?? undefined,
    });

    return ok({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: data.session,
      profile: player.profile,
      stats: player.stats,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

