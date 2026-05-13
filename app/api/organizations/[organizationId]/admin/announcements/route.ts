import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createOrganizationAnnouncement } from "@/lib/server/organizationManagement";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { organizationAnnouncementSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: { organizationId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "organizations:admin:announcements:post",
      limit: 15,
      windowMs: 60_000,
    });
    const input = await readJson(request, organizationAnnouncementSchema);
    const announcement = await createOrganizationAnnouncement({
      userClient: auth.userClient as any,
      organizationId: context.params.organizationId,
      userId: auth.user.id,
      title: input.title,
      message: input.message,
    });
    return ok({ announcement }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
