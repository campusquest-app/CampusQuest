"use client";

import { eventSourceChipLabel } from "@/lib/eventSources/catalog";

export function EventSourceLabel({
  source,
  className = "text-[10px] font-medium tracking-wide text-white/40",
}: {
  source?: string | null;
  className?: string;
}) {
  const label = eventSourceChipLabel(source);
  if (!label) return null;
  return <span className={className}>{label}</span>;
}
