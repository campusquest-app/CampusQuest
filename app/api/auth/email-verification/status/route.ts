import { fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import {
  createSupabaseCampusEmailStore,
  getCampusEmailVerificationStatus,
} from "@/lib/server/campusEmailVerification";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "auth:email-verification:status",
      limit: 60,
      windowMs: 60_000,
    });
    const store = createSupabaseCampusEmailStore();
    const status = await getCampusEmailVerificationStatus({
      userId: auth.user.id,
      email: auth.user.email ?? "",
      store,
    });
    return ok(status);
  } catch (error) {
    return fail(error);
  }
}
