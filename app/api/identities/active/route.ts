import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { readJson } from "@/lib/server/validation";
import { switchActiveIdentitySchema } from "@/lib/identity/schemas";
import { switchActiveIdentity } from "@/lib/server/identities";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "identities:active", limit: 40, windowMs: 60_000 });
    const input = await readJson(request, switchActiveIdentitySchema);
    const payload = await switchActiveIdentity({
      userClient: auth.userClient,
      userId: auth.user.id,
      email: auth.user.email ?? null,
      target: input,
    });
    return ok(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid identity.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
