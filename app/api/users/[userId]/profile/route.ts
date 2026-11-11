import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { getUserProfileForViewer } from "@/lib/server/userProfileView";
import { loadLocalBusinessActor } from "@/lib/server/localBusinessAccount";
import { uuidSchema } from "@/lib/server/validation";

export async function GET(
  request: Request,
  context: { params: { userId: string } },
) {
  try {
    const auth = await requireAuthUser(request as Request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "users:profile:view",
      limit: 60,
      windowMs: 60_000,
    });

    const parsed = uuidSchema.safeParse(context.params.userId);
    if (!parsed.success) {
      return fail(new ApiError(400, "Invalid user id.", "VALIDATION_ERROR"));
    }

    const payload = await getUserProfileForViewer({
      userClient: auth.userClient,
      viewerId: auth.user.id,
      targetUserId: parsed.data,
    });
    const businessActor = await loadLocalBusinessActor(auth.userClient, auth.user.id);
    if (businessActor.restricted) {
      const ownBusinessPosts =
        parsed.data === auth.user.id
          ? payload.posts.filter((post) => post.feed_destination === "local_businesses" && post.is_anonymous !== true)
          : [];
      payload.posts = ownBusinessPosts;
      payload.counts.posts = ownBusinessPosts.length;
      payload.counts.friends = null;
      payload.counts.mutualFriends = 0;
      payload.canViewPrivateContent = parsed.data === auth.user.id;
      payload.profile = null;
      payload.stats = null;
      if (parsed.data !== auth.user.id) {
        payload.user.level = 0;
        payload.user.title = null;
        payload.user.guild = null;
        payload.user.classId = null;
        payload.user.starterWeapon = null;
        payload.user.streakDays = 0;
        payload.user.equippedTitleId = null;
        payload.user.bio = null;
      }
    }

    return ok(payload);
  } catch (error) {
    return fail(error);
  }
}
