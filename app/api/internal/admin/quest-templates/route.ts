import { requireAdminUser } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { BUILTIN_QUEST_TEMPLATES, searchQuestTemplates } from "@/lib/questTemplates";
import { createAdminClient } from "@/lib/server/supabase";
import { createQuestTemplateSchema, readJson } from "@/lib/server/validation";
import { ZodError } from "zod";

export async function GET(request: Request) {
  try {
    await requireAdminUser(request as any);
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const builtin = searchQuestTemplates(q);

    const admin = createAdminClient();
    const { data: custom } = await admin
      .from("quest_templates")
      .select("*")
      .order("usage_count", { ascending: false });

    return ok({
      builtin,
      custom: custom ?? [],
      categories: [
        { id: "academic", label: "Academic", icon: "📚" },
        { id: "social", label: "Social", icon: "👥" },
        { id: "campus", label: "Campus Life", icon: "🏛" },
        { id: "service", label: "Service", icon: "🤝" },
        { id: "location", label: "Location", icon: "📍" },
        { id: "qr", label: "QR Quest", icon: "📷" },
        { id: "special", label: "Boss Battle", icon: "⚔️" },
        { id: "organization", label: "Organization", icon: "🏢" },
      ],
      totalBuiltin: BUILTIN_QUEST_TEMPLATES.length,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    const input = await readJson(request, createQuestTemplateSchema);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("quest_templates")
      .insert({
        name: input.name,
        category: input.category,
        description: input.description ?? "",
        default_xp: input.defaultXp,
        default_difficulty: input.defaultDifficulty,
        default_completion_method: input.defaultCompletionMethod,
        default_quest_type: input.defaultQuestType,
        default_repeat_type: input.defaultRepeatType ?? "one_time",
        default_repeat_limit: input.defaultRepeatLimit ?? "once_per_user",
        default_duration_minutes: input.defaultDurationMinutes ?? null,
        default_requires_qr: input.defaultRequiresQr ?? false,
        default_map_enabled: input.defaultMapEnabled ?? false,
        default_image: input.defaultImage ?? null,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (error) throw new ApiError(400, error.message, "QUEST_TEMPLATE_CREATE_FAILED");
    return ok({ template: data }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
