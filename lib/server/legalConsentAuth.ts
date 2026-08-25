import { ApiError } from "@/lib/server/http";
import { AGREEMENT_ERROR_CODES, logAgreementEvent } from "@/lib/server/legalConsentLog";
import { getBearerToken, requireAuthUser } from "@/lib/server/supabase";

export async function requireLegalConsentUser(request: Request, path: string) {
  try {
    getBearerToken(request);
  } catch {
    logAgreementEvent(AGREEMENT_ERROR_CODES.AUTH_MISSING, { path, authenticated: false });
    throw new ApiError(401, "Please sign in to continue.", AGREEMENT_ERROR_CODES.AUTH_MISSING);
  }

  try {
    return await requireAuthUser(request);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      logAgreementEvent(AGREEMENT_ERROR_CODES.AUTH_INVALID, { path, authenticated: false });
      throw new ApiError(401, "Please sign in to continue.", AGREEMENT_ERROR_CODES.AUTH_INVALID);
    }
    throw error;
  }
}
