import { ZodError } from "zod";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import {
  createAdminQuest,
  duplicateAdminQuest,
  enrichAdminQuestsWithLinkedQr,
  generateQuestQrAdmin,
  getAdminQuestAnalytics,
  listAdminQuestsAdmin,
  setAdminQuestVisibility,
  softDeleteAdminQuest,
  updateAdminQuest,
} from "@/lib/server/adminQuests";
import { enforceRateLimit } from "@/lib/server/security";
import {
  adminQuestDeleteSchema,
  adminQuestVisibilitySchema2,
  createAdminQuestSchema,
  readJson,
  updateAdminQuestSchema,
} from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    await requireAdminUser(request as any);
    const url = new URL(request.url);
    const questId = url.searchParams.get("questId");
    if (questId) {
      const analytics = await getAdminQuestAnalytics(questId);
      return ok({ analytics });
    }
    const quests = await listAdminQuestsAdmin(url.searchParams.get("includeDeleted") === "1");
    const enriched = await enrichAdminQuestsWithLinkedQr(quests);
    const withAnalytics = await Promise.all(
      enriched.map(async ({ quest, linkedQr }) => ({
        quest,
        linkedQr,
        analytics: await getAdminQuestAnalytics(quest.id),
      })),
    );
    return ok({ quests: withAnalytics });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:admin:quests:create", limit: 30, windowMs: 60_000 });
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "duplicate") {
      const questId = url.searchParams.get("questId");
      if (!questId) throw new ApiError(400, "questId required.", "QUEST_ID_REQUIRED");
      const result = await duplicateAdminQuest({
        questId,
        adminUserId: auth.user.id,
        adminEmail: auth.normalizedEmail,
      });
      return ok(result, 201);
    }

    if (action === "generate-qr") {
      const questId = url.searchParams.get("questId");
      if (!questId) throw new ApiError(400, "questId required.", "QUEST_ID_REQUIRED");
      const result = await generateQuestQrAdmin({
        questId,
        createdBy: auth.user.id,
        origin: new URL(request.url).origin,
      });
      return ok(result);
    }

    const input = await readJson(request, createAdminQuestSchema);
    const result = await createAdminQuest({
      input,
      createdBy: auth.user.id,
      createdByEmail: auth.normalizedEmail,
    });
    return ok(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    const url = new URL(request.url);
    const questId = url.searchParams.get("questId");
    if (!questId) throw new ApiError(400, "questId required.", "QUEST_ID_REQUIRED");
    const action = url.searchParams.get("action");

    if (action === "visibility") {
      const input = await readJson(request, adminQuestVisibilitySchema2);
      const quest = await setAdminQuestVisibility({
        questId,
        visibilityStatus: input.visibilityStatus,
        adminUserId: auth.user.id,
        adminEmail: auth.normalizedEmail,
      });
      return ok({ quest });
    }

    const input = await readJson(request, updateAdminQuestSchema);
    const result = await updateAdminQuest({
      questId,
      patch: input,
      adminUserId: auth.user.id,
      adminEmail: auth.normalizedEmail,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    const url = new URL(request.url);
    const questId = url.searchParams.get("questId");
    if (!questId) throw new ApiError(400, "questId required.", "QUEST_ID_REQUIRED");
    const hardDelete = url.searchParams.get("hardDelete") === "1";
    const result = await softDeleteAdminQuest({
      questId,
      hardDelete,
      adminUserId: auth.user.id,
      adminEmail: auth.normalizedEmail,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
