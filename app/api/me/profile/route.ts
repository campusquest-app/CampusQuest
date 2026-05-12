import { fail, ok, ApiError } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    const { data, error } = await auth.userClient
      .from("profiles")
      .select("*")
      .eq("id", auth.user.id)
      .single();

    if (error || !data) {
      throw new ApiError(404, error?.message ?? "Profile not found.", "PROFILE_NOT_FOUND");
    }

    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

