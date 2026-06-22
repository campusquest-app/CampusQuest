"use client";

import type { ReactNode } from "react";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

export function AppRootProviders({ children }: { children: ReactNode }) {
  return <AppErrorBoundary>{children}</AppErrorBoundary>;
}
