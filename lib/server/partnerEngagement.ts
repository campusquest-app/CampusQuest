import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Partner analytics. These count profile opens, reward views, and server-authorized pass displays only.
 * None of them is a purchase or a redemption — a student can show a pass and not buy anything.
 */
export const PARTNER_ENGAGEMENT_EVENTS = ["profile_view", "reward_view", "reward_pass_authorized"] as const;

export type PartnerEngagementEvent = (typeof PARTNER_ENGAGEMENT_EVENTS)[number];

/** Events a client may report. `reward_pass_authorized` is only written by the pass route after its own checks. */
export const CLIENT_REPORTABLE_PARTNER_EVENTS = ["profile_view", "reward_view"] as const;

export type ClientReportablePartnerEvent = (typeof CLIENT_REPORTABLE_PARTNER_EVENTS)[number];

export function isClientReportablePartnerEvent(value: unknown): value is ClientReportablePartnerEvent {
  return (CLIENT_REPORTABLE_PARTNER_EVENTS as readonly string[]).includes(value as string);
}

/** Best effort: analytics must never block or fail the student-facing request. */
export async function recordPartnerEngagement(
  admin: Pick<SupabaseClient, "from">,
  event: { userId: string; partnerId: string; eventType: PartnerEngagementEvent },
): Promise<boolean> {
  try {
    const { error } = await admin.from("partner_engagement_events").insert({
      user_id: event.userId,
      partner_id: event.partnerId,
      event_type: event.eventType,
    });
    if (error) {
      console.warn("[cq][partners] engagement event not recorded", { code: error.code, type: event.eventType });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[cq][partners] engagement event not recorded", error instanceof Error ? error.message : error);
    return false;
  }
}
