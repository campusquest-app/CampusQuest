import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { addItemToInventory } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { addInventoryItemSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "inventory:add", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, addInventoryItemSchema);
    const result = await addItemToInventory({
      userClient: auth.userClient,
      userId: auth.user.id,
      itemId: input.itemId,
      quantity: input.quantity,
    });
    return ok(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

