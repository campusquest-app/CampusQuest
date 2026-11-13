import type { SupabaseClient } from "@supabase/supabase-js";
import { uniquePartnerIds } from "@/lib/partners/communityVisits";

/**
 * Partner analytics. These count profile opens, reward views, Community listing views,
 * and server-authorized pass displays. None of them is a purchase or a redemption.
 */
export const PARTNER_ENGAGEMENT_EVENTS = ["profile_view", "reward_view", "reward_pass_authorized", "business_view", "website_click"] as const;

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

/** One Community visit. A repeated visit id does not add another view for the same business. */
export async function recordBusinessViews(
  admin: Pick<SupabaseClient, "from">,
  event: { userId: string; visitId: string; partnerIds: readonly string[] },
): Promise<boolean> {
  const partnerIds = uniquePartnerIds(event.partnerIds);
  if (partnerIds.length === 0) return true;
  try {
    const { error } = await admin.from("partner_engagement_events").upsert(
      partnerIds.map((partnerId) => ({
        user_id: event.userId,
        partner_id: partnerId,
        event_type: "business_view" as const,
        visit_id: event.visitId,
      })),
      { onConflict: "visit_id,partner_id", ignoreDuplicates: true },
    );
    if (error) {
      console.warn("[cq][partners] community views not recorded", { code: error.code });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[cq][partners] community views not recorded", error instanceof Error ? error.message : error);
    return false;
  }
}

/** One Website button tap. The same click id is a retry and does not add another click. */
export async function recordWebsiteClick(
  admin: Pick<SupabaseClient, "from">,
  event: { userId: string; partnerId: string; clickId: string },
): Promise<boolean> {
  try {
    const { error } = await admin.from("partner_engagement_events").upsert(
      {
        user_id: event.userId,
        partner_id: event.partnerId,
        event_type: "website_click" as const,
        click_id: event.clickId,
      },
      { onConflict: "click_id", ignoreDuplicates: true },
    );
    if (error) {
      console.warn("[cq][partners] website click not recorded", { code: error.code });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[cq][partners] website click not recorded", error instanceof Error ? error.message : error);
    return false;
  }
}
