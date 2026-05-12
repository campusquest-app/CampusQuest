import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { listMyProofSubmissions } from "@/lib/server/services";
import { requireAuthUser } from "@/lib/server/supabase";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "proof:submissions", limit: 60, windowMs: 60_000 });

    const url = new URL(request.url);
    const rawLimit = parseIntParam(url.searchParams.get("limit"), DEFAULT_LIMIT);
    const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
    const offset = parseIntParam(url.searchParams.get("offset"), 0);

    const submissions = await listMyProofSubmissions({
      userClient: auth.userClient,
      userId: auth.user.id,
      limit,
      offset,
    });

    return ok({
      submissions,
      pagination: {
        limit,
        offset,
        returned: submissions.length,
      },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return fail(new ApiError(400, "Invalid request.", "INVALID_REQUEST"));
    }
    return fail(error);
  }
}

