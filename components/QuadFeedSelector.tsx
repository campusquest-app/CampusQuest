"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { QuadFeedTab } from "@/components/TheQuad";

type FeedOption = { tab: QuadFeedTab; label: string; hint: string };

/** Order: Campus Feed first, then personalization, then dedicated communities. */
const FEED_OPTIONS: FeedOption[] = [
  { tab: "public", label: "Campus Feed", hint: "Everything happening across URI" },
  { tab: "trending", label: "For You", hint: "Trending moments, picked for you" },
  { tab: "friends", label: "Following", hint: "Posts from people you follow" },
  { tab: "student_organizations", label: "Organizations", hint: "Student clubs and campus orgs" },
  { tab: "greek_life", label: "Greek Life", hint: "Fraternity and sorority community" },
  { tab: "athletics", label: "Athletics", hint: "Sports, club sports, and Rams" },
];

/**
 * Premium glassmorphism dropdown anchored under the CampusQuest wordmark.
 * Replaces the permanent "For You | The Quad | Following" tab row.
 */
export function QuadFeedSelector({
  open,
  value,
  anchorRect,
  onSelect,
  onClose,
}: {
  open: boolean;
  value: QuadFeedTab;
  anchorRect: DOMRect | null;
  onSelect: (tab: QuadFeedTab) => void;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  const centerX = anchorRect ? anchorRect.left + anchorRect.width / 2 : 0;
  const top = anchorRect ? anchorRect.bottom + 10 : 0;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="cq-feed-selector-layer" role="presentation">
          <button
            type="button"
            className="cq-feed-selector-backdrop"
            aria-label="Close feed menu"
            onClick={onClose}
          />
          <motion.div
            className="cq-feed-selector-menu"
            role="menu"
            aria-label="Choose feed"
            style={{ top, left: centerX, transformOrigin: "top center" }}
            initial={reduceMotion ? { opacity: 0, x: "-50%" } : { opacity: 0, x: "-50%", y: -8, scale: 0.9 }}
            animate={reduceMotion ? { opacity: 1, x: "-50%" } : { opacity: 1, x: "-50%", y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0, x: "-50%" } : { opacity: 0, x: "-50%", y: -6, scale: 0.95 }}
            transition={
              reduceMotion
                ? { duration: 0.12 }
                : { type: "spring", stiffness: 460, damping: 28, mass: 0.7 }
            }
          >
            {FEED_OPTIONS.map((opt) => {
              const selected = opt.tab === value;
              return (
                <button
                  key={opt.tab}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={`cq-feed-selector-item${selected ? " cq-feed-selector-item--active" : ""}`}
                  onClick={() => {
                    onSelect(opt.tab);
                    onClose();
                  }}
                >
                  <span className="cq-feed-selector-check" aria-hidden>
                    {selected ? <Check className="h-[16px] w-[16px]" strokeWidth={3} /> : null}
                  </span>
                  <span className="cq-feed-selector-text">
                    <span className="cq-feed-selector-label">{opt.label}</span>
                    <span className="cq-feed-selector-hint">{opt.hint}</span>
                  </span>
                </button>
              );
            })}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
