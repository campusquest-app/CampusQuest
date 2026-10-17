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
 * Reads the unused cq_basic_access row if callers still need it.
 * For You and other 1.0 surfaces must not consult this.
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
