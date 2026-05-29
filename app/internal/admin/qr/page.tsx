import { AdminRouteSessionGate } from "@/components/AdminRouteSessionGate";
import { QrCodeAdminCard } from "@/components/QrCodeAdminCard";
import Link from "next/link";

export default function QrAdminPage() {
  return (
    <AdminRouteSessionGate title="QR Admin">
      <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-6xl space-y-4">
          <Link
            href="/internal/admin"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10"
          >
            ← Internal Admin
          </Link>
          <QrCodeAdminCard />
        </div>
      </main>
    </AdminRouteSessionGate>
  );
}
