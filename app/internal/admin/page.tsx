import { AdminRouteSessionGate } from "@/components/AdminRouteSessionGate";
import { InternalAdminDashboard } from "@/components/InternalAdminDashboard";

export default function InternalAdminPage() {
  return (
    <AdminRouteSessionGate title="Internal Admin">
      <InternalAdminDashboard />
    </AdminRouteSessionGate>
  );
}
