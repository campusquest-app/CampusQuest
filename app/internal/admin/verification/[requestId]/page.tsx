import { AdminRouteSessionGate } from "@/components/AdminRouteSessionGate";
import { InternalAdminDashboard } from "@/components/InternalAdminDashboard";

export default function VerificationRequestAdminPage({ params }: { params: { requestId: string } }) {
  return (
    <AdminRouteSessionGate title="Verification Request">
      <InternalAdminDashboard initialSection="verification" initialRequestId={params.requestId} />
    </AdminRouteSessionGate>
  );
}
