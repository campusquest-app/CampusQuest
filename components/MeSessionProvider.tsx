"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getMeSessionSnapshot, subscribeMeSessionSnapshot, type MeSessionSnapshot } from "@/lib/client/meSessionCache";

type MeSessionContextValue = {
  snapshot: MeSessionSnapshot | null;
};

const MeSessionContext = createContext<MeSessionContextValue>({ snapshot: null });

export function MeSessionProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<MeSessionSnapshot | null>(() => getMeSessionSnapshot());

  useEffect(() => subscribeMeSessionSnapshot(setSnapshot), []);

  const value = useMemo(() => ({ snapshot }), [snapshot]);

  return <MeSessionContext.Provider value={value}>{children}</MeSessionContext.Provider>;
}

export function useMeSession(): MeSessionContextValue {
  return useContext(MeSessionContext);
}
