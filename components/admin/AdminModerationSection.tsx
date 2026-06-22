"use client";

import type { ModerationTabId } from "@/lib/admin/navigation";
import { AppealsModerationCard } from "@/components/AppealsModerationCard";
import { CampusContentModerationCard } from "@/components/CampusContentModerationCard";
import { QuadPostModerationCard } from "@/components/QuadPostModerationCard";
import { ModerationDashboardCard } from "@/components/ModerationDashboardCard";
import { UserSafetyManagementCard } from "@/components/UserSafetyManagementCard";
import { AdminSectionIntro, AdminTabBar } from "@/components/admin/AdminUi";

export function AdminModerationSection({
  activeTab,
  onTabChange,
  initialSafetyQuery,
}: {
  activeTab: ModerationTabId;
  onTabChange: (tab: ModerationTabId) => void;
  initialSafetyQuery?: string;
}) {
  return (
    <div className="space-y-4">
      <AdminSectionIntro
        title="Moderation"
        description="Review reports, manage user safety, and process appeals."
      />
      <AdminTabBar
        active={activeTab}
        onChange={onTabChange}
        tabs={[
          { id: "messages", label: "Message Reports" },
          { id: "content", label: "Content Reports" },
          { id: "safety", label: "User Safety" },
          { id: "appeals", label: "Appeals" },
        ]}
      />
      {activeTab === "messages" ? <ModerationDashboardCard /> : null}
      {activeTab === "content" ? (
        <div className="space-y-4">
          <QuadPostModerationCard />
          <CampusContentModerationCard />
        </div>
      ) : null}
      {activeTab === "safety" ? <UserSafetyManagementCard initialQuery={initialSafetyQuery} /> : null}
      {activeTab === "appeals" ? <AppealsModerationCard /> : null}
    </div>
  );
}
