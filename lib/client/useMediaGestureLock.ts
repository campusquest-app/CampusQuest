"use client";

import { useCallback, useEffect, useRef } from "react";
import { lockMediaGesture, unlockMediaGesture } from "@/lib/client/mediaGestureLock";

/**
 * Locks global tab-swipe while a pointer gesture that began on media is active.
 * Cleanup is guaranteed on pointer up/cancel, lost capture, and unmount.
 */
export function useMediaGestureLock() {
  const heldRef = useRef(false);

  const release = useCallback(() => {
    if (!heldRef.current) return;
    heldRef.current = false;
    unlockMediaGesture();
  }, []);

  const acquire = useCallback(() => {
    if (heldRef.current) return;
    heldRef.current = true;
    lockMediaGesture();
  }, []);

  useEffect(() => {
    return () => {
      release();
    };
  }, [release]);

  return { acquire, release, isHeld: () => heldRef.current };
}
