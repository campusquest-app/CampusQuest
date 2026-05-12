import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/http";

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    throw new ApiError(
      500,
      "Supabase environment variables are missing.",
      "SUPABASE_ENV_MISSING",
    );
  }

  return { url, anonKey, serviceRoleKey };
}

export function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing bearer token.", "UNAUTHORIZED");
  }
  return authHeader.slice("Bearer ".length).trim();
}

export function createUserClient(accessToken: string) {
  const { url, anonKey } = getSupabaseEnv();
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseEnv();
  if (!serviceRoleKey) {
    throw new ApiError(
      500,
      "SUPABASE_SERVICE_ROLE_KEY is required for admin operations.",
      "SUPABASE_SERVICE_ROLE_MISSING",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireAuthUser(request: Request) {
  const token = getBearerToken(request);
  const userClient = createUserClient(token);
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    throw new ApiError(401, "Invalid or expired token.", "UNAUTHORIZED");
  }
  return { user: data.user, userClient, token };
}

