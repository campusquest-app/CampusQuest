import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { createUserProfile, updateProfile } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { createProfileSchema, readJson, updateProfileSchema } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "profile:create", limit: 5, windowMs: 60_000 });
    const input = await readJson(request, createProfileSchema);
    const profile = await createUserProfile(auth.userClient, auth.user, input);
    return ok(profile, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "profile:update", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, updateProfileSchema);
    const profile = await updateProfile(auth.userClient, auth.user.id, input);
    return ok(profile);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

