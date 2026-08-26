"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, Plus } from "lucide-react";
import { VERIFICATION_STATUS_LABELS, IDENTITY_TYPE_LABELS } from "@/lib/identity/policy";
import type { CampusIdentity, VerificationRequestSummary } from "@/lib/identity/types";
import { AvatarDisplay } from "@/components/AvatarDisplay";

export function SwitchProfileSheet({
  identities,
  currentId,
  pendingRequests,
  onSelect,
  onAdd,
  onClose,
  hideAdd = false,
}: {
  identities: CampusIdentity[];
  currentId: string;
  pendingRequests: VerificationRequestSummary[];
  onSelect: (identity: CampusIdentity) => void;
  onAdd: () => void;
  onClose: () => void;
  hideAdd?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sheet = (
    <div className="cq-identity-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="cq-identity-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Switch Profile"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cq-identity-sheet-handle" aria-hidden />
        <h2 className="cq-identity-sheet-title">Switch Profile</h2>
        <ul className="cq-identity-list">
          {identities.map((identity) => {
            const isCurrent = identity.id === currentId;
            return (
              <li key={`${identity.type}:${identity.id}`}>
                <button type="button" className="cq-identity-row" onClick={() => onSelect(identity)}>
                  <div className="cq-identity-row-avatar">
                    <AvatarDisplay avatar={identity.avatarUrl} size={44} fitParent showProp={false} />
                  </div>
                  <span className="cq-identity-row-copy">
                    <span className="cq-identity-row-name">
                      {identity.displayName}
                      {identity.verified ? <span className="cq-identity-badge" aria-label="Verified">✓</span> : null}
                    </span>
                    <span className="cq-identity-row-meta">
                      {identity.verificationLabel || IDENTITY_TYPE_LABELS[identity.type]}
                    </span>
                  </span>
                  {isCurrent ? (
                    <span className="cq-identity-current">
                      <Check className="h-4 w-4" aria-hidden />
                      Current
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        {pendingRequests.length > 0 ? (
          <div className="cq-identity-pending">
            <p className="cq-identity-pending-label">Manage identities</p>
            {pendingRequests.map((request) => (
              <div key={request.id} className="cq-identity-pending-row">
                <p className="cq-identity-row-name">{request.name}</p>
                <p className="cq-identity-row-meta">
                  {IDENTITY_TYPE_LABELS[request.identityType]} · {VERIFICATION_STATUS_LABELS[request.status]}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {hideAdd ? null : (
          <button type="button" className="cq-identity-add" onClick={onAdd}>
            <Plus className="h-4 w-4" aria-hidden />
            Add Business or Organization
          </button>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return sheet;
  return createPortal(sheet, document.body);
}
