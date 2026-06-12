"use client";

import { PilotAnalyticsCard } from "@/components/PilotAnalyticsCard";
import { AdminSectionIntro } from "@/components/admin/AdminUi";

export function AdminAnalyticsSection() {
  return (
    <div className="space-y-4">
      <AdminSectionIntro
        title="Analytics"
        description="Pilot growth, engagement, and safety metrics for CampusQuest."
      />
      <PilotAnalyticsCard />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="cq-admin-panel p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Engagement</p>
          <p className="mt-2 text-sm text-white/70">Messages, RSVPs, and daily active users are tracked in Pilot Analytics above.</p>
        </div>
        <div className="cq-admin-panel p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Growth</p>
          <p className="mt-2 text-sm text-white/70">User and organization counts reflect verified pilot campus adoption.</p>
        </div>
        <div className="cq-admin-panel p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Safety</p>
          <p className="mt-2 text-sm text-white/70">Report volume helps prioritize moderation workload.</p>
        </div>
      </div>
    </div>
  );
}
