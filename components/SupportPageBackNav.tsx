"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useCallback, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { canUseSameOriginHistoryBack } from "@/lib/client/sameOriginHistoryBack";

function historyIdx(): number | null {
  if (typeof window === "undefined") return null;
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" ? idx : null;
}

/** Support page back control — same-origin history when valid, otherwise `/`. */
export function SupportPageBackNav() {
  const router = useRouter();

  const handleBack = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (typeof window === "undefined") return;
      if (
        !canUseSameOriginHistoryBack({
          historyLength: window.history.length,
          referrer: document.referrer,
          currentOrigin: window.location.origin,
          historyIdx: historyIdx(),
        })
      ) {
        return;
      }
      event.preventDefault();
      router.back();
    },
    [router],
  );

  return (
    <div className="cq-support-back">
      <Link href="/" onClick={handleBack} aria-label="Go back" className="cq-support-back__btn">
        <ChevronLeft className="cq-support-back__icon" strokeWidth={2.2} aria-hidden />
        <span>Back</span>
      </Link>
    </div>
  );
}
