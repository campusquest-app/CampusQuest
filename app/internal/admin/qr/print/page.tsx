import { AdminRouteSessionGate } from "@/components/AdminRouteSessionGate";
import { UriGymOfficialQrPanel } from "@/components/UriGymOfficialQrPanel";
import Link from "next/link";

/** Printable official URI Gym QR (browser print → PDF or poster). */
export default function UriGymQrPrintPage() {
  return (
    <AdminRouteSessionGate title="Print URI Gym QR">
      <main className="min-h-screen bg-uri-navy px-4 py-8 print:bg-white print:py-4">
        <div className="mx-auto max-w-lg space-y-4 print:max-w-none">
          <Link
            href="/internal/admin/qr"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10 print:hidden"
          >
            ← QR Admin
          </Link>
          <UriGymOfficialQrPanel />
          <p className="text-center text-xs text-white/50 print:text-black/60">
            Post at URI Gym · Students scan with CampusQuest CQ Scanner
          </p>
        </div>
      </main>
    </AdminRouteSessionGate>
  );
}
