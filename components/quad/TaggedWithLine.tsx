"use client";

import { useMemo, useState } from "react";
import { formatWithTaggedLine } from "@/lib/postTags";
import type { FieldNoteTag } from "@/lib/types";

export function TaggedWithLine({
  tags,
  onOpenEntity,
}: {
  tags: FieldNoteTag[];
  onOpenEntity?: (tag: FieldNoteTag) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const structured = useMemo(
    () =>
      tags.filter(
        (t) =>
          (t.tagSource === "composer" || t.tagSource === "photo") &&
          t.status === "approved",
      ),
    [tags],
  );
  const unique = useMemo(() => {
    const seen = new Set<string>();
    const out: FieldNoteTag[] = [];
    for (const t of structured) {
      const key = `${t.entityType}:${t.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  }, [structured]);

  const line = formatWithTaggedLine(unique.map((t) => t.displayLabel));
  if (!line) return null;

  const people = unique.filter((t) => t.entityType === "user");
  const orgs = unique.filter((t) => t.entityType === "organization");
  const events = unique.filter((t) => t.entityType === "event" || t.entityType === "external_event");

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="mt-1 block min-h-[32px] text-left text-[12px] font-medium text-white/60 hover:text-white/80"
      >
        {line}
      </button>
      {sheetOpen ? (
        <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close" onClick={() => setSheetOpen(false)} />
          <div className="relative z-10 max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/15 bg-uri-navy p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-white">Tagged</h2>
              <button type="button" className="min-h-[44px] px-2 text-sm text-white/70" onClick={() => setSheetOpen(false)}>
                Close
              </button>
            </div>
            {(
              [
                ["People", people],
                ["Organizations", orgs],
                ["Events", events],
              ] as const
            ).map(([title, list]) =>
              list.length ? (
                <section key={title} className="mb-4">
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">{title}</h3>
                  <ul className="space-y-1">
                    {list.map((t) => (
                      <li key={`${t.entityType}:${t.entityId}`}>
                        <button
                          type="button"
                          className="flex w-full min-h-[44px] items-center rounded-xl px-2 text-left text-sm text-white hover:bg-white/5"
                          onClick={() => {
                            setSheetOpen(false);
                            onOpenEntity?.(t);
                          }}
                        >
                          {t.displayLabel}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null,
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
