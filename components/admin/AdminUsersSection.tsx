"use client";

import { useState } from "react";
import { AdminStudentDirectorySection } from "@/components/admin/AdminStudentDirectorySection";
import { AdminXpManagementSection } from "@/components/admin/AdminXpManagementSection";

export function AdminUsersSection({ initialTab = "directory" }: { initialTab?: "directory" | "xp" }) {
  const [tab, setTab] = useState<"directory" | "xp">(initialTab);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("directory")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
            tab === "directory" ? "bg-uri-keaney text-white" : "border border-white/15 text-white/70"
          }`}
        >
          Student Directory
        </button>
        <button
          type="button"
          onClick={() => setTab("xp")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
            tab === "xp" ? "bg-uri-keaney text-white" : "border border-white/15 text-white/70"
          }`}
        >
          XP Management
        </button>
      </div>
      {tab === "directory" ? <AdminStudentDirectorySection /> : <AdminXpManagementSection />}
    </div>
  );
}
