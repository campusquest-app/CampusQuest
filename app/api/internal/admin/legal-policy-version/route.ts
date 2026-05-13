import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { logAdminAuditAction } from "@/lib/server/audit";
import { enforceRateLimit } from "@/lib/server/security";
import { legalPolicyVersionSchema, readJson } from "@/lib/server/validation";

function getLegalPolicyAdminKey() {
  const key = process.env.LEGAL_POLICY_ADMIN_KEY;
  if (!key) {
    throw new ApiError(500, "Legal policy admin key is not configured.", "LEGAL_POLICY_ADMIN_KEY_MISSING");
  }
  return key;
}

async function callLegalPolicyVersionEndpoint(request: Request, init: RequestInit) {
  const url = new URL("/api/legal/policy-version", request.url);
  const response = await fetch(url.toString(), {
    ...init,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({} as { data?: unknown; error?: { message?: string; code?: string } }));
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.message ?? "Legal policy request failed.",
      payload?.error?.code ?? "LEGAL_POLICY_REQUEST_FAILED",
    );
  }
  return payload?.data;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:legal-policy-version:get", limit: 30, windowMs: 60_000 });
    const data = await callLegalPolicyVersionEndpoint(request, {
      method: "GET",
      headers: {
        "x-legal-policy-admin-key": getLegalPolicyAdminKey(),
        "x-admin-email": auth.normalizedEmail,
      },
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:legal-policy-version:post", limit: 10, windowMs: 60_000 });
    const input = await readJson(request, legalPolicyVersionSchema);
    const data = await callLegalPolicyVersionEndpoint(request, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-legal-policy-admin-key": getLegalPolicyAdminKey(),
        "x-admin-email": auth.normalizedEmail,
      },
      body: JSON.stringify({ version: input.version }),
    });
    await logAdminAuditAction({
      actionType: "policy_version_changed",
      adminUserId: auth.user.id,
      adminEmail: auth.normalizedEmail,
      reason: `Activated policy version ${input.version}`,
      metadata: { version: input.version },
    });
    return ok(data, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
