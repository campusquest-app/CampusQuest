import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { deleteCampusMemory, patchCampusMemory } from "@/lib/server/campusMemories";
import { userHasPlatformAdminAccess, fetchProfileRole } from "@/lib/server/permissions";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";
import { patchCampusMemorySchema, readJson, uuidSchema } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH — owner updates limited fields (e.g. save_to_profile). */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuthUser(request);
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) {
      throw new ApiError(400, "Invalid memory id.", "INVALID_ID");
    }

    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "campus-memories:patch",
      limit: 40,
      windowMs: 60_000,
    });

    const input = await readJson(request, patchCampusMemorySchema);
    const memory = await patchCampusMemory({
      userClient: auth.userClient,
      memoryId: id,
      userId: auth.user.id,
      savedToProfile: input.savedToProfile,
    });

    return ok({ memory });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

/** DELETE — owner or platform admin removes a Memory. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuthUser(request);
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) {
      throw new ApiError(400, "Invalid memory id.", "INVALID_ID");
    }

    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "campus-memories:delete",
      limit: 30,
      windowMs: 60_000,
    });

    try {
      await deleteCampusMemory({
        userClient: auth.userClient,
        memoryId: id,
        userId: auth.user.id,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "CAMPUS_MEMORY_NOT_FOUND") {
        const role = await fetchProfileRole(auth.userClient, auth.user.id, { email: auth.user.email });
        if (userHasPlatformAdminAccess(auth.user, role)) {
          const admin = createAdminClient();
          const { error } = await admin.from("campus_memories").delete().eq("id", id);
          if (error) throw new ApiError(500, "Could not delete Memory.", "CAMPUS_MEMORY_DELETE_FAILED");
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
