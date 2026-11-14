/**
 * Partners whose live reward pass is available to any signed-in CampusQuest member
 * (no campus-email verification). Keep this list explicit — other partners stay
 * on verified-student rules.
 */
export const OPEN_MEMBERSHIP_REWARD_PARTNER_IDS = new Set<string>(["international-pocket-cafe"]);

export const OPEN_MEMBERSHIP_REWARD_COPY = "Available to all CampusQuest members";

export function partnerAllowsOpenMembershipRewards(partnerId: string | null | undefined): boolean {
  if (!partnerId) return false;
  return OPEN_MEMBERSHIP_REWARD_PARTNER_IDS.has(partnerId);
}
