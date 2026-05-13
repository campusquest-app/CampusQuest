import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { ApiError, fail, ok } from "@/lib/server/http";
import {
  listMyOrganizationCreationRequests,
  submitOrganizationCreationRequest,
} from "@/lib/server/organizationCreationRequests";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { organizationCreationRequestSchema, readJson } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:creation-requests:list", limit: 80, windowMs: 60_000 });
    const requests = await listMyOrganizationCreationRequests({
      userClient: auth.userClient as never,
      userId: auth.user.id,
    });
    return ok({ requests });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient as never, auth.user.id);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:creation-requests:submit", limit: 15, windowMs: 60_000 });
    const input = await readJson(request, organizationCreationRequestSchema);
    const result = await submitOrganizationCreationRequest({
      userClient: auth.userClient as never,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      emailConfirmedAt: (auth.user as { email_confirmed_at?: string | null }).email_confirmed_at ?? null,
      confirmedAt: (auth.user as { confirmed_at?: string | null }).confirmed_at ?? null,
      input: {
        requestedName: input.requestedName,
        requestedCategory: input.requestedCategory,
        description: input.description,
        contactLink: input.contactLink && String(input.contactLink).trim() ? String(input.contactLink).trim() : null,
        logoUrl: input.logoUrl && String(input.logoUrl).trim() ? String(input.logoUrl).trim() : null,
      },
    });
    return ok(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
