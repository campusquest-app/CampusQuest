"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed, patchAuthed } from "@/lib/client/dashboardApi";
import { AdminPanel, AdminSectionIntro, AdminTabBar } from "@/components/admin/AdminUi";

type LandingLeadStatus = "new" | "in_progress" | "resolved" | "spam";
type LandingContactStatus = LandingLeadStatus;

type LandingPageLeadRow = {
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

type LandingContactRow = {
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

type Tab = "leads" | "contacts";
type StatusFilter = "all" | LandingLeadStatus;

const STATUS_OPTIONS: LandingLeadStatus[] = ["new", "in_progress", "resolved", "spam"];

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function AdminLandingSection() {
  const [tab, setTab] = useState<Tab>("leads");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [leads, setLeads] = useState<LandingPageLeadRow[]>([]);
  const [contacts, setContacts] = useState<LandingContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      if (tab === "leads") {
        const data = await fetchAuthed<{ leads: LandingPageLeadRow[] }>(`/api/internal/admin/landing-leads${qs}`);
        setLeads(data.leads ?? []);
      } else {
        const data = await fetchAuthed<{ contacts: LandingContactRow[] }>(
          `/api/internal/admin/landing-contacts${qs}`,
        );
        setContacts(data.contacts ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load landing intake.");
    } finally {
      setLoading(false);
    }
  }, [tab, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateLeadStatus(id: string, status: LandingLeadStatus) {
    setBusyId(id);
    setError(null);
    try {
      await patchAuthed(`/api/internal/admin/landing-leads/${id}`, { status });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not update lead.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateContactStatus(id: string, status: LandingContactStatus) {
    setBusyId(id);
    setError(null);
    try {
      await patchAuthed(`/api/internal/admin/landing-contacts/${id}`, { status });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not update contact.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <AdminSectionIntro
        title="Landing Intake"
        description="Leads and contact messages from the separate CampusQuest marketing site (same Supabase project)."
      />
      <AdminTabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "leads", label: "Landing Leads", badge: leads.filter((l) => l.status === "new").length },
          { id: "contacts", label: "Contact", badge: contacts.filter((c) => c.status === "new").length },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        {(["all", ...STATUS_OPTIONS] as StatusFilter[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`rounded-lg border px-2.5 py-1 text-xs ${
              statusFilter === status
                ? "border-uri-keaney/60 bg-uri-keaney/20 text-white"
                : "border-white/15 bg-white/[0.03] text-white/70 hover:bg-white/10"
            }`}
          >
            {status === "all" ? "All" : status.replace("_", " ")}
          </button>
        ))}
      </div>

      {error ? <p className="text-xs text-rose-200">{error}</p> : null}
      {loading ? <p className="text-sm text-white/60">Loading…</p> : null}

      {!loading && tab === "leads" ? (
        <AdminPanel className="overflow-x-auto">
          {leads.length === 0 ? (
            <p className="p-4 text-sm text-white/55">No landing leads yet.</p>
          ) : (
            <table className="min-w-full text-left text-sm text-white/85">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
                <tr>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Interest</th>
                  <th className="px-3 py-2 font-medium">Source / UTM</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-white/5 align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-white">{lead.email}</div>
                      {lead.name ? <div className="text-xs text-white/45">{lead.name}</div> : null}
                      {lead.campus ? <div className="text-xs text-white/40">{lead.campus}</div> : null}
                    </td>
                    <td className="px-3 py-3">{lead.interest_type ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-white/65">
                      <div>{lead.source ?? "—"}</div>
                      {lead.utm_source || lead.utm_campaign ? (
                        <div className="mt-1 text-white/40">
                          {[lead.utm_source, lead.utm_campaign].filter(Boolean).join(" · ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        className="rounded-md border border-white/15 bg-uri-navy px-2 py-1 text-xs text-white"
                        value={lead.status}
                        disabled={busyId === lead.id}
                        onChange={(event) =>
                          void updateLeadStatus(lead.id, event.target.value as LandingLeadStatus)
                        }
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-xs text-white/50">{formatDate(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminPanel>
      ) : null}

      {!loading && tab === "contacts" ? (
        <AdminPanel className="overflow-x-auto">
          {contacts.length === 0 ? (
            <p className="p-4 text-sm text-white/55">No contact submissions yet.</p>
          ) : (
            <table className="min-w-full text-left text-sm text-white/85">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
                <tr>
                  <th className="px-3 py-2 font-medium">Name / Email</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Message</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-white/5 align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-white">{contact.name || "—"}</div>
                      <div className="text-xs text-white/50">{contact.email}</div>
                    </td>
                    <td className="px-3 py-3 text-xs">{contact.reason}</td>
                    <td className="max-w-md px-3 py-3 text-xs text-white/70 whitespace-pre-wrap">
                      {contact.message}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        className="rounded-md border border-white/15 bg-uri-navy px-2 py-1 text-xs text-white"
                        value={contact.status}
                        disabled={busyId === contact.id}
                        onChange={(event) =>
                          void updateContactStatus(contact.id, event.target.value as LandingContactStatus)
                        }
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-xs text-white/50">{formatDate(contact.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminPanel>
      ) : null}
    </div>
  );
}
