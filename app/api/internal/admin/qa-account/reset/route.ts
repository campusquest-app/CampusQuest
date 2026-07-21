import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { ensureQaTestAccount, resetQaOnboardingState } from "@/lib/server/qaTestAccount";
import { enforceRateLimit } from "@/lib/server/security";

/**
 * "Reset QA Onboarding" — ensures the permanent QA test account exists, then
 * restores it to the first sign-up screen without deleting the account.
 * Only ever touches profiles flagged is_test_user = true.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:qa-reset",
      limit: 10,
      windowMs: 60_000,
    });

    const account = await ensureQaTestAccount();
    await resetQaOnboardingState(account.userId);

    return ok({
      email: account.email,
      userId: account.userId,
      created: account.created,
      reset: true,
    });
  } catch (error) {
    return fail(error);
  }
}
