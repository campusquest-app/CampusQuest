import { createAdminClient } from "@/lib/server/supabase";
import { ApiError } from "@/lib/server/http";

export const LANDING_LEAD_STATUSES = ["new", "in_progress", "resolved", "spam"] as const;
export type LandingLeadStatus = (typeof LANDING_LEAD_STATUSES)[number];

export const LANDING_CONTACT_STATUSES = ["new", "in_progress", "resolved", "spam"] as const;
export type LandingContactStatus = (typeof LANDING_CONTACT_STATUSES)[number];

export type LandingPageLeadRow = {
  id: string;
  email: string;
  interest_type: string | null;
  name: string | null;
  campus: string | null;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  status: LandingLeadStatus;
  created_at: string;
  updated_at: string;
};

export type LandingContactRow = {
  id: string;
  name: string | null;
  email: string;
  reason: string;
  message: string;
  source: string | null;
  status: LandingContactStatus;
  created_at: string;
  updated_at: string;
};

function isLeadStatus(value: string): value is LandingLeadStatus {
  return (LANDING_LEAD_STATUSES as readonly string[]).includes(value);
}

function isContactStatus(value: string): value is LandingContactStatus {
  return (LANDING_CONTACT_STATUSES as readonly string[]).includes(value);
}

export async function listLandingLeads(status?: LandingLeadStatus) {
  const admin = createAdminClient();
  let query = admin
    .from("landing_page_leads")
    .select(
      "id, email, interest_type, name, campus, source, utm_source, utm_medium, utm_campaign, status, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    throw new ApiError(500, "Could not load landing leads.", "LANDING_LEADS_LIST_FAILED");
  }
  return (data ?? []) as LandingPageLeadRow[];
}

export async function updateLandingLeadStatus(id: string, status: string) {
  if (!isLeadStatus(status)) {
    throw new ApiError(400, "Invalid lead status.", "INVALID_STATUS");
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("landing_page_leads")
    .update({ status })
    .eq("id", id)
    .select("id, status, updated_at")
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "Could not update lead status.", "LANDING_LEAD_UPDATE_FAILED");
  }
  if (!data) {
    throw new ApiError(404, "Lead not found.", "LANDING_LEAD_NOT_FOUND");
  }
  return data as { id: string; status: LandingLeadStatus; updated_at: string };
}

export async function listLandingContacts(status?: LandingContactStatus) {
  const admin = createAdminClient();
  let query = admin
    .from("landing_contact_submissions")
    .select("id, name, email, reason, message, source, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    throw new ApiError(500, "Could not load contact submissions.", "LANDING_CONTACTS_LIST_FAILED");
  }
  return (data ?? []) as LandingContactRow[];
}

export async function updateLandingContactStatus(id: string, status: string) {
  if (!isContactStatus(status)) {
    throw new ApiError(400, "Invalid contact status.", "INVALID_STATUS");
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("landing_contact_submissions")
    .update({ status })
    .eq("id", id)
    .select("id, status, updated_at")
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "Could not update contact status.", "LANDING_CONTACT_UPDATE_FAILED");
  }
  if (!data) {
    throw new ApiError(404, "Contact submission not found.", "LANDING_CONTACT_NOT_FOUND");
  }
  return data as { id: string; status: LandingContactStatus; updated_at: string };
}
