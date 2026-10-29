import { auditAnonymousAuthorLookup } from "@/lib/server/anonymousPosts";
import { findAuthUserIdByEmail } from "@/lib/server/authBootstrap";
import { ApiError, fail, ok } from "@/lib/server/http";
import { assertPlatformModerationAdminEmail } from "@/lib/server/moderationAuth";
import { uuidSchema } from "@/lib/server/validation";

/** Authorized moderators only. Ordinary clients cannot call this route. */
export async function GET(request: Request, context: { params: Promise<{ postId: string }> }) {
  try {
    const adminEmail = await assertPlatformModerationAdminEmail(request);
    const { postId } = await context.params;
    const parsed = uuidSchema.safeParse(postId);
    if (!parsed.success) throw new ApiError(400, "Invalid post id.", "INVALID_POST_ID");
    const actorId = await findAuthUserIdByEmail(adminEmail);
    const authorId = await auditAnonymousAuthorLookup({
      actorId,
      actorEmail: adminEmail,
      postId: parsed.data,
    });
    if (!authorId) throw new ApiError(404, "Anonymous author not found.", "ANONYMOUS_AUTHOR_NOT_FOUND");
    return ok({ postId: parsed.data, authorId });
  } catch (error) {
    return fail(error);
  }
}
