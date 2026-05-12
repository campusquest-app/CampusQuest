import { fail, ok, ApiError } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    const { data, error } = await auth.userClient
      .from("user_stats")
      .select("*")
      .eq("user_id", auth.user.id)
      .single();

    if (error || !data) {
      throw new ApiError(404, error?.message ?? "User stats not found.", "STATS_NOT_FOUND");
    }

    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

