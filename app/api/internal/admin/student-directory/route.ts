import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { listHiddenUserIds } from "@/lib/server/qaTestAccount";
import { createAdminClient } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { deriveClassStanding, classStandingLabel } from "@/lib/onboarding/graduationYear";
import { normalizeCommunityIds, normalizeInterestIds } from "@/lib/onboarding/taxonomy";

type AuthUserLite = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
};

async function listAuthUsers(admin: ReturnType<typeof createAdminClient>, max = 2000): Promise<AuthUserLite[]> {
  const perPage = 100;
  const pages = Math.max(1, Math.ceil(max / perPage));
  const users: AuthUserLite[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const user of data?.users ?? []) {
      users.push({
        id: user.id,
        email: user.email ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
        created_at: user.created_at ?? null,
      });
    }
    if ((data?.users ?? []).length < perPage) break;
  }
  return users.slice(0, max);
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:student-directory",
      limit: 30,
      windowMs: 60_000,
    });

    const admin = createAdminClient();
    const url = new URL(request.url);
    const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 25) || 25));

    const graduationYear = url.searchParams.get("graduationYear");
    const classStanding = url.searchParams.get("classStanding");
    const interest = url.searchParams.get("interest");
    const community = url.searchParams.get("community");
    const role = url.searchParams.get("role");
    const verified = url.searchParams.get("verified"); // yes | no
    const onboardingComplete = url.searchParams.get("onboardingComplete"); // yes | no

    const authUsers = await listAuthUsers(admin, 2000);
    const authMap = new Map(authUsers.map((u) => [u.id, u]));
    const hiddenIds = await listHiddenUserIds(admin);

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select(
        "id, username, display_name, role, class_year, student_status, institution_id, onboarding_completed, onboarding_completed_at, onboarding_version, last_active_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    let profileRows: Array<Record<string, unknown>> = [];
    if (profilesError) {
      if (/student_status|institution_id|onboarding_version/i.test(profilesError.message)) {
        throw new ApiError(
          500,
          "Onboarding demographics migration is required. Apply supabase/migrations/20260818220000_onboarding_demographics_v2.sql.",
          "SCHEMA_MIGRATION_REQUIRED",
        );
      }
      throw profilesError;
    }
    profileRows = (profiles ?? []) as Array<Record<string, unknown>>;

    const ids = profileRows.map((p) => p.id as string).filter((id) => !hiddenIds.has(id));
    const prefsMap = new Map<string, { interests: string[]; communities: string[] }>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data: prefs } = await admin
        .from("user_onboarding_preferences")
        .select("user_id, interests, communities")
        .in("user_id", chunk);
      for (const row of prefs ?? []) {
        prefsMap.set(row.user_id as string, {
          interests: normalizeInterestIds((row.interests as string[] | null) ?? []),
          communities: normalizeCommunityIds((row.communities as string[] | null) ?? []),
        });
      }
    }

    const { data: safetyRows } = await admin
      .from("user_account_safety")
      .select("user_id, status")
      .in("user_id", ids.slice(0, 1000));
    const safetyMap = new Map((safetyRows ?? []).map((r) => [r.user_id as string, r.status as string]));

    let rows = profileRows
      .filter((p) => !hiddenIds.has(p.id as string))
      .map((p) => {
        const authUser = authMap.get(p.id as string);
        const prefs = prefsMap.get(p.id as string) ?? { interests: [], communities: [] };
        const standing = deriveClassStanding(p.class_year as number | null);
        const emailConfirmed = Boolean(authUser?.email_confirmed_at);
        return {
          id: p.id as string,
          username: (p.username as string | null) ?? null,
          displayName: (p.display_name as string | null) ?? null,
          email: authUser?.email ?? null,
          accountStatus: safetyMap.get(p.id as string) ?? "active",
          emailVerified: emailConfirmed,
          role: (p.role as string | null) ?? "student",
          graduationYear: (p.class_year as number | null) ?? null,
          classStanding: standing,
          classStandingLabel: classStandingLabel(standing),
          studentStatus: (p.student_status as string | null) ?? null,
          institutionId: (p.institution_id as string | null) ?? null,
          interests: prefs.interests,
          communities: prefs.communities,
          onboardingCompleted: Boolean(p.onboarding_completed),
          onboardingCompletedAt: (p.onboarding_completed_at as string | null) ?? null,
          onboardingVersion: (p.onboarding_version as number | null) ?? null,
          signupDate: (p.created_at as string | null) ?? authUser?.created_at ?? null,
          lastActiveAt: (p.last_active_at as string | null) ?? authUser?.last_sign_in_at ?? null,
        };
      });

    if (query) {
      rows = rows.filter((r) =>
        [r.username, r.displayName, r.email].some((v) => (v ?? "").toLowerCase().includes(query)),
      );
    }
    if (graduationYear) {
      const y = Number(graduationYear);
      rows = rows.filter((r) => r.graduationYear === y);
    }
    if (classStanding) {
      rows = rows.filter((r) => r.classStanding === classStanding);
    }
    if (interest) {
      rows = rows.filter((r) => r.interests.includes(interest));
    }
    if (community) {
      rows = rows.filter((r) => r.communities.includes(community));
    }
    if (role) {
      rows = rows.filter((r) => r.role === role);
    }
    if (verified === "yes") rows = rows.filter((r) => r.emailVerified);
    if (verified === "no") rows = rows.filter((r) => !r.emailVerified);
    if (onboardingComplete === "yes") rows = rows.filter((r) => r.onboardingCompleted);
    if (onboardingComplete === "no") rows = rows.filter((r) => !r.onboardingCompleted);

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    return ok({
      students: pageRows,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error) {
    return fail(error);
  }
}
