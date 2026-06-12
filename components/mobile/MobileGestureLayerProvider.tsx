"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type MobileGestureLayerContextValue = {
  detailLayerCount: number;
  registerDetailLayer: () => void;
  unregisterDetailLayer: () => void;
};

const MobileGestureLayerContext = createContext<MobileGestureLayerContextValue | null>(null);

export function MobileGestureLayerProvider({ children }: { children: ReactNode }) {
  const [detailLayerCount, setDetailLayerCount] = useState(0);

  const registerDetailLayer = useCallback(() => {
    setDetailLayerCount((count) => count + 1);
  }, []);

  const unregisterDetailLayer = useCallback(() => {
    setDetailLayerCount((count) => Math.max(0, count - 1));
  }, []);

  const value = useMemo(
    () => ({ detailLayerCount, registerDetailLayer, unregisterDetailLayer }),
    [detailLayerCount, registerDetailLayer, unregisterDetailLayer],
  );

  return <MobileGestureLayerContext.Provider value={value}>{children}</MobileGestureLayerContext.Provider>;
}

export function useMobileGestureLayers(): MobileGestureLayerContextValue {
  const ctx = useContext(MobileGestureLayerContext);
  if (!ctx) {
    return {
      detailLayerCount: 0,
      registerDetailLayer: () => {},
      unregisterDetailLayer: () => {},
    };
  }
  return ctx;
}

export function useRegisterMobileDetailLayer(active: boolean) {
  const { registerDetailLayer, unregisterDetailLayer } = useMobileGestureLayers();

  useEffect(() => {
    if (!active) return undefined;
    registerDetailLayer();
    return () => unregisterDetailLayer();
  }, [active, registerDetailLayer, unregisterDetailLayer]);
}
