import {
  basicEntitlement,
  unknownBasicEntitlement,
  type BasicEntitlement,
} from "@/lib/basic/entitlement";

const ACCESS_TABLE = "cq_basic_access";

type BasicAccessQuery = {
  from: (table: string) => any;
};

/**
 * Reads the signed-in user's cq_basic_access row with their own Supabase client.
 * RLS allows select of auth.uid() only. This does not use the service role.
 */
export async function loadOwnBasicEntitlement(
  userClient: BasicAccessQuery,
  userId: string,
  now = new Date(),
): Promise<BasicEntitlement> {
  const { data, error } = await userClient
    .from(ACCESS_TABLE)
    .select("starts_at, ends_at, early_access")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return unknownBasicEntitlement();
  return basicEntitlement(data ?? null, now);
}
