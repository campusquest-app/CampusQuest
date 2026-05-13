import { Suspense } from "react";
import { Dashboard } from "@/components/Dashboard";

function DashboardFallback() {
  return (
    <div className="min-h-[30vh] flex flex-col items-center justify-center gap-2 text-sm text-white/60" aria-busy="true">
      <span className="inline-block h-6 w-6 rounded-full border-2 border-uri-keaney/40 border-t-uri-keaney animate-spin" />
      Loading…
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-uri-navy bg-gradient-to-b from-uri-navy from-0% via-[#061e3a] via-40% to-[#041a35] to-100%">
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 sm:py-6 pb-8">
        <Suspense fallback={<DashboardFallback />}>
          <Dashboard />
        </Suspense>
      </main>
    </div>
  );
}
