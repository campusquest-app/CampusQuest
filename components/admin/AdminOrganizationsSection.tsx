"use client";

import type { OrganizationsTabId } from "@/lib/admin/navigation";
import { OrganizationCreationRequestsAdminCard } from "@/components/OrganizationCreationRequestsAdminCard";
import { OrganizationModerationCard } from "@/components/OrganizationModerationCard";
import { AdminSectionIntro, AdminTabBar } from "@/components/admin/AdminUi";

export function AdminOrganizationsSection({
  activeTab,
  onTabChange,
  initialOrganizationId,
}: {
  activeTab: OrganizationsTabId;
  onTabChange: (tab: OrganizationsTabId) => void;
  initialOrganizationId?: string;
}) {
  return (
    <div className="space-y-4">
      <AdminSectionIntro
        title="Organizations"
        description="Approve student organization requests and manage ownership controls."
      />
      <AdminTabBar
        active={activeTab}
        onChange={onTabChange}
        tabs={[
          { id: "requests", label: "Pending Requests" },
          { id: "controls", label: "Moderation Controls" },
        ]}
      />
      {activeTab === "requests" ? <OrganizationCreationRequestsAdminCard /> : null}
      {activeTab === "controls" ? (
        <OrganizationModerationCard initialOrganizationId={initialOrganizationId} />
      ) : null}
    </div>
  );
}
