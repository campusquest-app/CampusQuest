"use client";

import { LegalPolicyVersionCard } from "@/components/LegalPolicyVersionCard";
import { AdminSectionIntro } from "@/components/admin/AdminUi";

export function AdminLegalSection() {
  return (
    <div className="space-y-4">
      <AdminSectionIntro
        title="Legal & Policy"
        description="Manage active policy versions and re-consent requirements."
      />
      <LegalPolicyVersionCard />
    </div>
  );
}
