import { Suspense } from "react";
import { Dashboard } from "@/components/Dashboard";
import { LaunchSplashFrame } from "@/components/LaunchSplashFrame";
import { MeSessionProvider } from "@/components/MeSessionProvider";
import { SPLASH_LAUNCH_STATUS } from "@/components/welcome/splashTiming";

function DashboardFallback() {
  return (
    <div className="cq-launch-splash" aria-busy="true" aria-label={SPLASH_LAUNCH_STATUS}>
      <LaunchSplashFrame showSpecks={false} />
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-uri-navy">
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
