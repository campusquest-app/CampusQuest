import { listMyNotifications } from "@/lib/server/notifications";
import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { loadLocalBusinessActor } from "@/lib/server/localBusinessAccount";

const BUSINESS_POST_NOTIFICATIONS = new Set([
  "quad_post_like",
  "quad_post_comment",
  "quad_post_tag",
  "quad_post_mention",
  "quad_post_tag_approval",
]);

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "notifications:list", limit: 180, windowMs: 60_000 });
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const result = await listMyNotifications({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    const businessActor = await loadLocalBusinessActor(auth.userClient, auth.user.id);
    if (businessActor.restricted) {
      const postIds = result.notifications
        .filter((item) => item.relatedEntityType === "quad_post" && item.relatedEntityId)
        .map((item) => item.relatedEntityId as string);
      const allowed = new Set<string>();
      if (postIds.length > 0) {
        const { data } = await auth.userClient
          .from("quad_posts")
          .select("id, feed_destination")
          .in("id", postIds);
        for (const row of data ?? []) {
          if (row.feed_destination === "local_businesses") allowed.add(row.id as string);
        }
      }
      const notifications = result.notifications.filter((item) => {
        if (item.type === "campus_announcement") {
          if (item.relatedEntityType === "local_businesses" || item.relatedEntityType === "student_perks") return true;
          return (
            item.relatedEntityType === "quad_post" &&
            item.relatedEntityId != null &&
            allowed.has(item.relatedEntityId)
          );
        }
        return (
          BUSINESS_POST_NOTIFICATIONS.has(item.type) &&
          item.relatedEntityType === "quad_post" &&
          item.relatedEntityId != null &&
          allowed.has(item.relatedEntityId)
        );
      });
      return ok({
        notifications,
        unreadCount: notifications.filter((item) => !item.readAt).length,
      });
    }
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
