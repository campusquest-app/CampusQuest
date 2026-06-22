"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { DM_ATTACH_MENU_ITEMS, type DmAttachMenuItem } from "@/lib/client/dmMediaComposer";

export function DmAttachMenuSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (item: DmAttachMenuItem) => void;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const enabledItems = DM_ATTACH_MENU_ITEMS.filter((item) => item.enabled);

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Attach">
      <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 mb-[max(0.75rem,env(safe-area-inset-bottom,0px))] w-full max-w-md px-3">
        <div className="overflow-hidden rounded-2xl border border-white/15 bg-uri-navy/95 shadow-2xl backdrop-blur-md">
          {enabledItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={`flex w-full items-center px-4 py-3.5 text-left text-[15px] font-medium text-white transition hover:bg-white/[0.06] active:bg-white/10 ${
                index < enabledItems.length - 1 ? "border-b border-white/10" : ""
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onClose}
            className="flex w-full items-center justify-center border-t border-white/10 px-4 py-3.5 text-[15px] font-semibold text-white/75 transition hover:bg-white/[0.04] active:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
