import { ApiError } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export function hasInternalRepairSecret(request: Request): boolean {
  const token = bearerToken(request);
  if (!token) return false;
  const dedicated = process.env.CQ_INTERNAL_REPAIR_SECRET?.trim();
  const cron = process.env.CRON_SECRET?.trim();
  return Boolean((dedicated && token === dedicated) || (cron && token === cron));
}

/** GitHub Actions / cron: signed secret. Admins: confirmed platform-admin session. */
export async function requireAdminOrInternalRepair(request: Request) {
  if (hasInternalRepairSecret(request)) {
    return { kind: "internal" as const };
  }
  const admin = await requireAdminUser(request);
  return { kind: "admin" as const, admin };
}

export function requireInternalRepairSecret(request: Request) {
  if (hasInternalRepairSecret(request)) return;
  throw new ApiError(401, "Missing or invalid internal repair secret.", "UNAUTHORIZED");
}
