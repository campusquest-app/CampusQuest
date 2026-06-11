import { ApiError } from "@/lib/server/http";

export function assertCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new ApiError(500, "CRON_SECRET is not configured.", "CRON_SECRET_MISSING");
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing bearer token.", "UNAUTHORIZED");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (token !== secret) {
    throw new ApiError(401, "Invalid cron secret.", "UNAUTHORIZED");
  }
}
