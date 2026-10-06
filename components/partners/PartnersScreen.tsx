"use client";

import { useMemo, type ReactNode } from "react";
import { PartnerCard } from "@/components/partners/PartnerCard";
import { PartnersEmptyState } from "@/components/partners/PartnersEmptyState";
import { usePartners, type PartnersLoadState } from "@/lib/client/usePartners";
import { groupPartnersForDisplay, hasVisiblePartners } from "@/lib/partners/partnerStatus";
import type { Partner } from "@/lib/partners/types";

export function PartnersScreen({ onSelectPartner }: { onSelectPartner?: (partner: Partner) => void }) {
  const { state, reload } = usePartners();
  return <PartnersScreenView state={state} onRetry={reload} onSelectPartner={onSelectPartner} />;
}

export function PartnersScreenView({
  state,
  onRetry,
  onSelectPartner,
  now,
}: {
  state: PartnersLoadState;
  onRetry: () => void;
  onSelectPartner?: (partner: Partner) => void;
  now?: Date;
}) {
  const sections = useMemo(
    () => (state.status === "ready" ? groupPartnersForDisplay(state.partners, now) : null),
    [state, now],
  );

  return (
    <section className="cq-partners-screen" aria-labelledby="cq-partners-title" aria-busy={state.status === "loading"}>
      <header className="cq-events-header">
        <h1 id="cq-partners-title" className="cq-events-title">
          CampusQuest Partners
        </h1>
        <p className="cq-events-subtitle">Explore local businesses. Unlock exclusive student rewards.</p>
      </header>

      {state.status === "loading" ? (
        <div className="cq-partners-list" aria-label="Loading partners">
          <div className="cq-partner-card cq-partner-card--skeleton" aria-hidden />
          <div className="cq-partner-card cq-partner-card--skeleton" aria-hidden />
        </div>
      ) : state.status === "error" ? (
        <div className="cq-partners-error" role="alert">
          <p className="cq-partners-error__text">We couldn&apos;t load CampusQuest Partners right now.</p>
          <button type="button" className="cq-partners-error__retry cq-tap-press touch-manipulation" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : sections && hasVisiblePartners(sections) ? (
        <>
          <PartnerSection title="Featured" partners={sections.featured} onSelect={onSelectPartner} />
          <PartnerSection
            title={sections.featured.length > 0 ? "All partners" : undefined}
            partners={sections.active}
            onSelect={onSelectPartner}
          />
          <PartnerSection title="Past offers" partners={sections.expired} state="expired" />
        </>
      ) : (
        <PartnersEmptyState />
      )}
    </section>
  );
}

function PartnerSection({
  title,
  partners,
  state = "active",
  onSelect,
}: {
  title?: ReactNode;
  partners: Partner[];
  state?: "active" | "expired";
  onSelect?: (partner: Partner) => void;
}) {
  if (partners.length === 0) return null;
  return (
    <div className="cq-partners-section">
      {title ? <h2 className="cq-partners-section__title">{title}</h2> : null}
      <div className="cq-partners-list">
        {partners.map((partner) => (
          <PartnerCard key={partner.id} partner={partner} state={state} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
