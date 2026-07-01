import { Suspense } from "react";
import { Dashboard } from "@/components/Dashboard";
import { MeSessionProvider } from "@/components/MeSessionProvider";

function DashboardFallback() {
  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-3 bg-uri-navy"
      aria-busy="true"
      aria-label="Loading CampusQuest"
    >
      <span className="inline-block h-8 w-8 rounded-full border-2 border-uri-keaney/35 border-t-uri-keaney animate-spin" />
      <p className="text-sm font-medium text-white/70">Entering CampusQuest…</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-cq-app bg-gradient-to-b from-uri-navy-light via-cq-app to-cq-secondary">
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
