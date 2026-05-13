import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createGuild, listGuilds } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { createGuildSchema, readJson } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "guild:list", limit: 60, windowMs: 60_000 });
    const guilds = await listGuilds(auth.userClient);
    return ok({ guilds });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient as any, auth.user.id);
    enforceRateLimit({ userId: auth.user.id, routeKey: "guild:create", limit: 5, windowMs: 60_000 });
    const input = await readJson(request, createGuildSchema);
    const guild = await createGuild({
      userClient: auth.userClient,
      userId: auth.user.id,
      name: input.name,
      description: input.description,
      isPublic: input.isPublic,
    });
    return ok(guild, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

