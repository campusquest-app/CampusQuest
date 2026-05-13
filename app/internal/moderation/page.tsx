import { AdminRouteSessionGate } from "@/components/AdminRouteSessionGate";
import { InternalModerationDashboard } from "@/components/InternalModerationDashboard";

export default function InternalModerationPage() {
  return (
    <AdminRouteSessionGate title="Internal Moderation">
      <InternalModerationDashboard />
    </AdminRouteSessionGate>
  );
}
