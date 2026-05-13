"use client";

import { useEffect, useState } from "react";
import { getSaveStatusSnapshot, subscribeSaveStatus, type SaveStatusSnapshot } from "@/lib/client/gameStateSync";

export function useSaveStatus(): SaveStatusSnapshot {
  const [snap, setSnap] = useState<SaveStatusSnapshot>(() => getSaveStatusSnapshot());
  useEffect(() => subscribeSaveStatus(setSnap), []);
  return snap;
}
