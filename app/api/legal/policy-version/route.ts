import { ZodError } from "zod";
import { isAdminEmail } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { activatePolicyVersion, getActivePolicyVersion } from "@/lib/server/services";
import { createAdminClient } from "@/lib/server/supabase";
import { legalPolicyVersionSchema, readJson } from "@/lib/server/validation";

function assertLegalAdminKey(request: Request) {
  const expected = process.env.LEGAL_POLICY_ADMIN_KEY;
  if (!expected) {
    throw new ApiError(500, "Missing LEGAL_POLICY_ADMIN_KEY for legal policy route.", "LEGAL_POLICY_ADMIN_KEY_MISSING");
  }
  const provided = request.headers.get("x-legal-policy-admin-key");
  if (!provided || provided !== expected) {
    throw new ApiError(403, "Forbidden.", "FORBIDDEN");
  }
}

function assertLegalPolicyAdminEmailHeader(request: Request) {
  const adminEmail = request.headers.get("x-admin-email")?.trim().toLowerCase();
  if (!adminEmail || !isAdminEmail(adminEmail)) {
    throw new ApiError(403, "Forbidden.", "FORBIDDEN");
  }
}

export async function GET(request: Request) {
  try {
    assertLegalAdminKey(request);
    assertLegalPolicyAdminEmailHeader(request);
    const admin = createAdminClient();
    const version = await getActivePolicyVersion(admin);
    return ok({ version });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertLegalAdminKey(request);
    assertLegalPolicyAdminEmailHeader(request);
    const input = await readJson(request, legalPolicyVersionSchema);
    const result = await activatePolicyVersion({ version: input.version });
    return ok(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
