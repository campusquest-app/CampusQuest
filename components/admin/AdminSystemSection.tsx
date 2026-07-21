"use client";

import Link from "next/link";
import { useState } from "react";
import { BackendDashboardPreview } from "@/components/BackendDashboardPreview";
import { AdminBetaFoundersSection } from "@/components/admin/AdminBetaFoundersSection";
import { AdminQaAccountSection } from "@/components/admin/AdminQaAccountSection";
import { AdminSectionIntro } from "@/components/admin/AdminUi";

export function AdminSystemSection() {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="space-y-4">
      <AdminSectionIntro
        title="System Tools"
        description="Internal utilities and developer previews. Most admins rarely need these."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/internal/admin/qr"
          className="cq-admin-panel block p-4 transition hover:border-uri-keaney/30"
        >
          <p className="font-semibold text-white">CQ QR Codes</p>
          <p className="mt-1 text-xs text-white/55">Manage scan codes, activity links, and print sheets.</p>
        </Link>
        <Link
          href="/internal/moderation"
          className="cq-admin-panel block p-4 transition hover:border-uri-keaney/30"
        >
          <p className="font-semibold text-white">Moderation Workspace</p>
          <p className="mt-1 text-xs text-white/55">Focused moderation view for high-volume review sessions.</p>
        </Link>
      </div>

      <AdminQaAccountSection />

      <AdminBetaFoundersSection />

      <details className="cq-admin-panel group" open={previewOpen} onToggle={(e) => setPreviewOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-white/85 marker:content-none">
          Backend Preview (advanced)
        </summary>
        <div className="border-t border-white/10 p-4 space-y-2">
          <p className="text-xs text-white/50">
            Uses your signed-in admin session against the same APIs as the student app. For rollout checks only.
          </p>
          <BackendDashboardPreview />
        </div>
      </details>
    </div>
  );
}
