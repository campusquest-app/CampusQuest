import type { ReactNode } from "react";

import { LegalDocumentBackNav } from "@/components/LegalDocumentBackNav";

/** Shared shell for legal/policy pages — back navigation restores onboarding consent when resumed from signup. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-uri-navy">
      <LegalDocumentBackNav />
      <div>{children}</div>
    </div>
  );
}
