"use client";

import { useCallback, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { PartnerCard } from "@/components/partners/PartnerCard";
import { PartnerDetailSheet } from "@/components/partners/PartnerDetailSheet";
import { PartnersNoResults } from "@/components/partners/PartnersNoResults";
import { usePartners, type PartnersLoadState } from "@/lib/client/usePartners";
import { filterPartners, visiblePartners } from "@/lib/partners/partnerStatus";
import type { Partner } from "@/lib/partners/types";

export function PartnersScreen() {
  const { state, reload } = usePartners();
  return <PartnersScreenView state={state} onRetry={reload} />;
}

export function PartnersScreenView({
  state,
  onRetry,
  now,
  initialQuery = "",
}: {
  state: PartnersLoadState;
  onRetry: () => void;
  now?: Date;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const partners = useMemo(() => (state.status === "ready" ? visiblePartners(state.partners) : []), [state]);
  const results = useMemo(() => filterPartners(partners, query), [partners, query]);
  const selected = selectedId ? partners.find((partner) => partner.id === selectedId) ?? null : null;
  const searching = query.trim().length > 0;

  const handleSelect = useCallback((partner: Partner) => setSelectedId(partner.id), []);
  const handleClose = useCallback(() => setSelectedId(null), []);

  return (
    <section className="cq-partners-screen" aria-labelledby="cq-partners-title" aria-busy={state.status === "loading"}>
      <header className="cq-partners-header">
        <h1 id="cq-partners-title" className="cq-events-title">
          CampusQuest Partners
        </h1>
        <p className="cq-events-subtitle">Explore local businesses. Unlock exclusive student rewards.</p>
      </header>

      <div className="cq-partners-search" role="search">
        <Search className="cq-partners-search__icon" aria-hidden strokeWidth={2.2} />
        <label htmlFor="cq-partners-search-input" className="sr-only">
          Search partners
        </label>
        <input
          id="cq-partners-search-input"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Search partners..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="cq-partners-search__input"
        />
        {searching ? (
          <button
            type="button"
            className="cq-partners-search__clear touch-manipulation"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" aria-hidden strokeWidth={2.4} />
          </button>
        ) : null}
      </div>

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
      ) : results.length > 0 ? (
        <>
          <p className="sr-only" aria-live="polite">
            {results.length === 1 ? "1 partner" : `${results.length} partners`}
          </p>
          <div className="cq-partners-list">
            {results.map((partner) => (
              <PartnerCard key={partner.id} partner={partner} onSelect={handleSelect} now={now} />
            ))}
          </div>
          <p className="cq-partners-more">More CampusQuest partners coming soon.</p>
        </>
      ) : (
        <PartnersNoResults searching={searching} />
      )}

      {selected ? <PartnerDetailSheet partner={selected} onClose={handleClose} /> : null}
    </section>
  );
}
