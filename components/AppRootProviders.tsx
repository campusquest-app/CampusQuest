"use client";

import { useEffect, type ReactNode } from "react";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { listenForNativeAuthLinks } from "@/lib/client/capacitorNative";

export function AppRootProviders({ children }: { children: ReactNode }) {
  useEffect(() => listenForNativeAuthLinks(), []);
  return <AppErrorBoundary>{children}</AppErrorBoundary>;
}
