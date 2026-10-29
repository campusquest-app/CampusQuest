import { ANONYMOUS_NOTICE_VERSION, anonymousNoticeSatisfied } from "@/lib/anonymousPost";
import { acceptAnonymousNotice, readAnonymousNoticeVersion } from "@/lib/server/anonymousPosts";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    const acceptedVersion = await readAnonymousNoticeVersion(auth.user.id);
    return ok({
      requiredVersion: ANONYMOUS_NOTICE_VERSION,
      acceptedVersion,
      accepted: anonymousNoticeSatisfied(acceptedVersion),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:anonymous-notice", limit: 10, windowMs: 60_000 });
    const body = (await request.json().catch(() => null)) as { version?: unknown } | null;
    if (body?.version !== ANONYMOUS_NOTICE_VERSION) {
      throw new ApiError(400, "This anonymity notice is out of date.", "ANONYMOUS_NOTICE_VERSION");
    }
    const saved = await acceptAnonymousNotice(auth.user.id);
    return ok({ accepted: true, version: saved.version });
  } catch (error) {
    return fail(error);
  }
}
