"use client";

import { DrawerSubPanelShell } from "@/components/DrawerSubPanelShell";
import { LEGAL_DOC_LINKS } from "@/lib/legal/policy";

const LINKS = [
  { href: LEGAL_DOC_LINKS.privacy, label: "Privacy Policy" },
  { href: LEGAL_DOC_LINKS.terms, label: "Terms of Service" },
  { href: LEGAL_DOC_LINKS.guidelines, label: "Community Guidelines" },
  { href: LEGAL_DOC_LINKS.dataConsent, label: "Data consent" },
  { href: LEGAL_DOC_LINKS.support, label: "Support" },
] as const;

export function PrivacySupportSettingsPanel({ onBack }: { onBack: () => void }) {
  return (
    <DrawerSubPanelShell title="Privacy, Terms & Support" onBack={onBack} scrollStorageKey="settings-privacy">
      <div className="space-y-3">
        <p className="text-[12px] leading-relaxed text-white/55">
          These open the published CampusQuest pages. Use the browser back button to return to the app.
        </p>
        <ul className="overflow-hidden rounded-2xl border border-white/10">
          {LINKS.map((link) => (
            <li key={link.href} className="border-b border-white/[0.06] last:border-b-0">
              <a href={link.href} className="flex min-h-11 items-center px-3 py-3 text-sm font-semibold text-cyan-100 touch-manipulation">
                {link.label}
              </a>
            </li>
          ))}
          <li>
            <a
              href="mailto:support@campusquestapp.com"
              className="flex min-h-11 items-center px-3 py-3 text-sm font-semibold text-cyan-100 touch-manipulation"
            >
              Email support@campusquestapp.com
            </a>
          </li>
        </ul>
      </div>
    </DrawerSubPanelShell>
  );
}
