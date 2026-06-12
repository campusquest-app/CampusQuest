"use client";

import { AdminAuditLogsCard } from "@/components/AdminAuditLogsCard";
import { AdminSectionIntro } from "@/components/admin/AdminUi";

export function AdminAuditSection({ initialSearch }: { initialSearch?: string }) {
  return (
    <div className="space-y-4">
      <AdminSectionIntro
        title="Audit Center"
        description="Search and filter admin actions across moderation, policy, organizations, and sync."
      />
      <AdminAuditLogsCard enhanced initialSearch={initialSearch} />
    </div>
  );
}
