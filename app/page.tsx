import { Suspense } from "react";
import { Dashboard } from "@/components/Dashboard";
import { MeSessionProvider } from "@/components/MeSessionProvider";

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
    <div className="flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-cq-app bg-gradient-to-b from-cq-app via-cq-secondary to-cq-card">
      <main className="flex-1 w-full min-w-0 pb-0 pt-0">
        <Suspense fallback={<DashboardFallback />}>
          <MeSessionProvider>
            <Dashboard />
          </MeSessionProvider>
        </Suspense>
      </main>
    </div>
  );
}
