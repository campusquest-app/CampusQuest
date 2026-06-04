"use client";

import { useEffect, useState } from "react";
import { readMobileViewport } from "@/lib/client/xpRewardAnimation";

const MOBILE_MAX_WIDTH_PX = 767;

/** True when viewport width is below tablet breakpoint (matches Tailwind `md`). */
export function useMobileViewport(): boolean {
  const [mobile, setMobile] = useState(readMobileViewport);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return mobile;
}
