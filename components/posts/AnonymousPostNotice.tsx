"use client";

import Link from "next/link";
import { CqModalLayer } from "@/components/ui/CqModalLayer";
import { LEGAL_DOC_LINKS } from "@/lib/legal/policy";

export function AnonymousPostNotice({
  open,
  busy,
  onCancel,
  onAccept,
}: {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onAccept: () => void;
}) {
  return (
    <CqModalLayer
      open={open}
      onDismiss={onCancel}
      dismissible={!busy}
      labelledBy="anonymous-post-notice-title"
      placement="dialog"
      panelClassName="cq-anonymous-notice border border-white/15 bg-uri-navy shadow-2xl"
    >
      <header className="cq-modal-header border-b border-white/10 px-5 pb-3 pt-4">
        <h2 id="anonymous-post-notice-title" className="font-display text-lg font-bold text-white">
          Anonymous doesn’t mean unaccountable
        </h2>
      </header>
      <div className="cq-modal-body space-y-3 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-white/90">
        <p>Your name and profile won’t appear on this post. CampusQuest’s authorized moderators can still identify the account responsible.</p>
        <p>Remember the CampusQuest rules:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>No bullying, harassment, hate speech, or threats.</li>
          <li>No sharing someone’s private information.</li>
          <li>No targeting identifiable students with rumors, sexual comments, or accusations.</li>
          <li>No scams, spam, or illegal content.</li>
        </ul>
        <p>
          Violating these rules can result in post removal, suspension, or a permanent account ban. Serious violations may result in an immediate ban.
        </p>
        <p>Keep it funny, honest, and respectful.</p>
        <p>
          <Link href={LEGAL_DOC_LINKS.guidelines} className="font-semibold text-uri-keaney underline">
            Community guidelines
          </Link>
        </p>
      </div>
      <footer className="cq-modal-footer flex gap-2 border-t border-white/10 px-5 py-3">
        <button type="button" className="cq-composer-head-cancel min-h-11 flex-1" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="min-h-11 flex-1 rounded-full bg-uri-keaney px-3 text-sm font-bold text-uri-navy disabled:opacity-60"
          onClick={onAccept}
          disabled={busy}
        >
          {busy ? "Saving…" : "I understand — continue"}
        </button>
      </footer>
    </CqModalLayer>
  );
}
