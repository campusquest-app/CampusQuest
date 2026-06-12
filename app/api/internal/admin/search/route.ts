import { parseAdminSearchQuery } from "@/lib/admin/searchQuery";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { runAdminGlobalSearch } from "@/lib/server/adminGlobalSearch";
import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:admin:search", limit: 60, windowMs: 60_000 });

    const url = new URL(request.url);
    const raw = (url.searchParams.get("q") ?? "").trim();
    const parsed = parseAdminSearchQuery(raw);

    if (parsed.query.length < 2 && !/^[0-9a-f-]{36}$/i.test(parsed.query)) {
      return ok({
        parsed,
        results: {
          users: [],
          organizations: [],
          events: [],
          reports: [],
          messages: [],
          auditLogs: [],
        },
      });
    }

    const results = await runAdminGlobalSearch({ query: parsed.query, scope: parsed.scope });
    return ok({ parsed, results });
  } catch (error) {
    return fail(error);
  }
}
