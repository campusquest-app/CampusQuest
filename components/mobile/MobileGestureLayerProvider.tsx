"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Split contexts so registering/unregistering a detail layer does not re-render
 * every consumer that only needs the stable register APIs — and so bumping the
 * count only re-renders shells that read `detailLayerCount` (tab swipe).
 */

type MobileGestureRegisterContextValue = {
  registerDetailLayer: () => void;
  unregisterDetailLayer: () => void;
};

const MobileGestureRegisterContext = createContext<MobileGestureRegisterContextValue | null>(null);
const MobileGestureCountContext = createContext(0);

export function MobileGestureLayerProvider({ children }: { children: ReactNode }) {
  const [detailLayerCount, setDetailLayerCount] = useState(0);

  const registerDetailLayer = useCallback(() => {
    setDetailLayerCount((count) => count + 1);
  }, []);

  const unregisterDetailLayer = useCallback(() => {
    setDetailLayerCount((count) => Math.max(0, count - 1));
  }, []);

  const registerValue = useMemo(
    () => ({ registerDetailLayer, unregisterDetailLayer }),
    [registerDetailLayer, unregisterDetailLayer],
  );

  return (
    <MobileGestureRegisterContext.Provider value={registerValue}>
      <MobileGestureCountContext.Provider value={detailLayerCount}>{children}</MobileGestureCountContext.Provider>
    </MobileGestureRegisterContext.Provider>
  );
}

export function useMobileGestureLayers(): {
  detailLayerCount: number;
  registerDetailLayer: () => void;
  unregisterDetailLayer: () => void;
} {
  const register = useContext(MobileGestureRegisterContext);
  const detailLayerCount = useContext(MobileGestureCountContext);
  if (!register) {
    return {
      detailLayerCount: 0,
      registerDetailLayer: () => {},
      unregisterDetailLayer: () => {},
    };
  }
  return {
    detailLayerCount,
    registerDetailLayer: register.registerDetailLayer,
    unregisterDetailLayer: register.unregisterDetailLayer,
  };
}

/** Subscribe only to the count — used by tab-swipe shells. */
export function useMobileGestureDetailLayerCount(): number {
  return useContext(MobileGestureCountContext);
}

export function useRegisterMobileDetailLayer(active: boolean) {
  const register = useContext(MobileGestureRegisterContext);
  const registerDetailLayer = register?.registerDetailLayer ?? (() => {});
  const unregisterDetailLayer = register?.unregisterDetailLayer ?? (() => {});

  useEffect(() => {
    if (!active) return undefined;
    registerDetailLayer();
    return () => unregisterDetailLayer();
  }, [active, registerDetailLayer, unregisterDetailLayer]);
}
