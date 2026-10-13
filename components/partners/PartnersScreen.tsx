"use client";

import { useCallback, useMemo, useState } from "react";
import { Gift, Heart, Lightbulb, Search, X } from "lucide-react";
import { FeaturedDealCard, PartnerCard, type PartnerFavoriteProps } from "@/components/partners/PartnerCard";
import { PartnerDetailSheet } from "@/components/partners/PartnerDetailSheet";
import { PartnersNoResults } from "@/components/partners/PartnersNoResults";
import { StudentRewardPass } from "@/components/partners/StudentRewardPass";
import { SuggestBusinessSheet } from "@/components/partners/SuggestBusinessSheet";
import { reportPartnerView } from "@/lib/client/partnersApi";
import { useLiveClock } from "@/lib/client/useLiveClock";
import { usePartnerFavorites, type PartnerFavoritesStatus } from "@/lib/client/usePartnerFavorites";
import { usePartners, type PartnersLoadState } from "@/lib/client/usePartners";
import {
  applyPerksFilter,
  filterPartners,
  partnerHasLiveReward,
  PERKS_FILTERS,
  visiblePartners,
  type PerksFilterId,
} from "@/lib/partners/partnerStatus";
import type { Partner } from "@/lib/partners/types";

export type PerksFavorites = {
  status: PartnerFavoritesStatus;
  isSaved: (partnerId: string) => boolean;
  isPending: (partnerId: string) => boolean;
  toggle: (partnerId: string) => void;
  message: string | null;
};

const NO_FAVORITES: PerksFavorites = {
  status: "unavailable",
  isSaved: () => false,
  isPending: () => false,
  toggle: () => {},
  message: null,
};

export function PartnersScreen() {
  const { state, reload } = usePartners();
  const now = useLiveClock(30_000);
  const favorites = usePartnerFavorites();
  const perksFavorites = useMemo<PerksFavorites>(
    () => ({
      status: favorites.status,
      isSaved: favorites.isSaved,
      isPending: (id) => favorites.pending.has(id),
      toggle: favorites.toggle,
      message: favorites.message,
    }),
    [favorites.status, favorites.isSaved, favorites.pending, favorites.toggle, favorites.message],
  );
  return (
    <PartnersScreenView
      state={state}
      onRetry={reload}
      now={now}
      favorites={perksFavorites}
      onProfileView={(partner) => reportPartnerView(partner.id, "profile_view")}
      onRewardView={(partner) => reportPartnerView(partner.id, "reward_view")}
    />
  );
}

export function PartnersScreenView({
  state,
  onRetry,
  now,
  favorites = NO_FAVORITES,
  initialQuery = "",
  initialFilter = "all",
  initialSavedOnly = false,
  onProfileView,
  onRewardView,
}: {
  state: PartnersLoadState;
  onRetry: () => void;
  now: Date;
  favorites?: PerksFavorites;
  initialQuery?: string;
  initialFilter?: PerksFilterId;
  initialSavedOnly?: boolean;
  onProfileView?: (partner: Partner) => void;
  onRewardView?: (partner: Partner) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<PerksFilterId>(initialFilter);
  const [savedOnly, setSavedOnly] = useState(initialSavedOnly);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [passPartnerId, setPassPartnerId] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const partners = useMemo(() => (state.status === "ready" ? visiblePartners(state.partners) : []), [state]);
  const searched = useMemo(() => filterPartners(partners, query), [partners, query]);
  const filtered = useMemo(() => applyPerksFilter(searched, filter, now), [searched, filter, now]);
  const results = useMemo(
    () => (savedOnly ? filtered.filter((partner) => favorites.isSaved(partner.id)) : filtered),
    [filtered, savedOnly, favorites],
  );
  const searching = query.trim().length > 0;
  const featured = useMemo(
    () =>
      !savedOnly && !searching && (filter === "all" || filter === "deals")
        ? partners.filter((partner) => partnerHasLiveReward(partner, now) && partner.discountValue)
        : [],
    [partners, savedOnly, searching, filter, now],
  );
  const savedCount = useMemo(() => partners.filter((partner) => favorites.isSaved(partner.id)).length, [partners, favorites]);

  const selected = selectedId ? partners.find((partner) => partner.id === selectedId) ?? null : null;
  const passPartner = passPartnerId ? partners.find((partner) => partner.id === passPartnerId) ?? null : null;

  const openDetail = useCallback(
    (partner: Partner) => {
      setSelectedId(partner.id);
      onProfileView?.(partner);
    },
    [onProfileView],
  );
  const openReward = useCallback(
    (partner: Partner) => {
      setPassPartnerId(partner.id);
      onRewardView?.(partner);
    },
    [onRewardView],
  );
  const closeDetail = useCallback(() => setSelectedId(null), []);
  const closePass = useCallback(() => setPassPartnerId(null), []);
  const closeSuggest = useCallback(() => setSuggestOpen(false), []);
  const resetFilters = useCallback(() => {
    setQuery("");
    setFilter("all");
    setSavedOnly(false);
  }, []);

  const favoritesEnabled = favorites.status === "ready";
  const favoriteFor = (partner: Partner): PartnerFavoriteProps | undefined =>
    favorites.status === "unavailable"
      ? undefined
      : {
          saved: favorites.isSaved(partner.id),
          busy: favorites.isPending(partner.id),
          disabled: !favoritesEnabled,
          onToggle: () => favorites.toggle(partner.id),
        };

  const emptyVariant = savedOnly ? "saved" : partners.length === 0 ? "empty" : searching ? "search" : "filter";

  return (
    <section className="cq-perks" aria-labelledby="cq-perks-title" aria-busy={state.status === "loading"}>
      <header className="cq-perks-header">
        <span className="cq-perks-header__icon" aria-hidden>
          <Gift className="h-5 w-5" strokeWidth={2.3} />
        </span>
        <div className="cq-perks-header__text">
          <h1 id="cq-perks-title" className="cq-perks-header__title">
            Student Perks
          </h1>
          <p className="cq-perks-header__subtitle">Discover local favorites. Unlock exclusive student rewards.</p>
        </div>
        {favorites.status !== "unavailable" ? (
          <button
            type="button"
            className={`cq-perks-saved-toggle cq-tap-press touch-manipulation${savedOnly ? " is-active" : ""}`}
            aria-pressed={savedOnly}
            onClick={() => setSavedOnly((value) => !value)}
          >
            <Heart className="h-4 w-4" aria-hidden strokeWidth={2.3} fill={savedOnly ? "currentColor" : "none"} />
            <span>Saved</span>
            {savedCount > 0 ? <span className="cq-perks-saved-toggle__count">{savedCount}</span> : null}
          </button>
        ) : null}
      </header>

      <div className="cq-perks-search" role="search">
        <Search className="cq-perks-search__icon" aria-hidden strokeWidth={2.2} />
        <label htmlFor="cq-perks-search-input" className="sr-only">
          Search businesses, food, and rewards
        </label>
        <input
          id="cq-perks-search-input"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Search businesses, food, and rewards..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={`cq-perks-search__input${searching ? " has-value" : ""}`}
        />
        {searching ? (
          <button
            type="button"
            className="cq-perks-search__clear touch-manipulation"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" aria-hidden strokeWidth={2.4} />
          </button>
        ) : null}
      </div>

      <div className="cq-perks-chips" role="group" aria-label="Filter businesses">
        {PERKS_FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`cq-perks-chip cq-tap-press touch-manipulation${filter === option.id ? " is-active" : ""}`}
            aria-pressed={filter === option.id}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {favorites.message ? (
        <p className="cq-perks-toast" role="alert">
          {favorites.message}
        </p>
      ) : null}

      {state.status === "loading" ? (
        <div className="cq-perks-body" aria-label="Loading businesses">
          <div className="cq-perk-skeleton cq-perk-skeleton--featured" aria-hidden />
          <div className="cq-perk-skeleton cq-perk-skeleton--row" aria-hidden />
          <div className="cq-perk-skeleton cq-perk-skeleton--row" aria-hidden />
        </div>
      ) : state.status === "error" ? (
        <div className="cq-perks-error" role="alert">
          <p className="cq-perks-error__text">We couldn&apos;t load Student Perks right now.</p>
          <button type="button" className="cq-perk-btn cq-perk-btn--secondary cq-tap-press touch-manipulation" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : (
        <div className="cq-perks-body">
          {featured.length > 0 ? (
            <section className="cq-perks-section" aria-labelledby="cq-perks-featured-title">
              <h2 id="cq-perks-featured-title" className="cq-perks-section__title">
                Featured Student Deals
              </h2>
              <div className="cq-perks-featured">
                {featured.map((partner) => (
                  <FeaturedDealCard
                    key={partner.id}
                    partner={partner}
                    now={now}
                    onSelect={openDetail}
                    onViewReward={openReward}
                    favorite={favoriteFor(partner)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="cq-perks-section" aria-labelledby="cq-perks-explore-title">
            <h2 id="cq-perks-explore-title" className="cq-perks-section__title">
              {savedOnly ? "Saved Businesses" : "Explore Local Businesses"}
            </h2>
            <p className="sr-only" aria-live="polite">
              {results.length === 1 ? "1 business" : `${results.length} businesses`}
            </p>
            {results.length > 0 ? (
              <div className="cq-perks-list">
                {results.map((partner) => (
                  <PartnerCard
                    key={partner.id}
                    partner={partner}
                    now={now}
                    onSelect={openDetail}
                    favorite={favoriteFor(partner)}
                  />
                ))}
              </div>
            ) : (
              <PartnersNoResults
                variant={emptyVariant}
                onReset={emptyVariant === "empty" ? undefined : resetFilters}
              />
            )}
          </section>

          <section className="cq-perks-suggest" aria-labelledby="cq-perks-suggest-title">
            <span className="cq-perks-suggest__icon" aria-hidden>
              <Lightbulb className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <h2 id="cq-perks-suggest-title" className="cq-perks-suggest__title">
              Where should we partner next?
            </h2>
            <p className="cq-perks-suggest__text">Tell us which local businesses you&apos;d love to see on CampusQuest.</p>
            <button
              type="button"
              className="cq-perk-btn cq-perk-btn--primary cq-tap-press touch-manipulation"
              onClick={() => setSuggestOpen(true)}
            >
              Suggest a Business
            </button>
          </section>
        </div>
      )}

      {selected ? (
        <PartnerDetailSheet
          partner={selected}
          now={now}
          onClose={closeDetail}
          onViewReward={openReward}
          favorite={favoriteFor(selected)}
        />
      ) : null}
      {passPartner ? <StudentRewardPass partner={passPartner} onClose={closePass} /> : null}
      {suggestOpen ? <SuggestBusinessSheet onClose={closeSuggest} /> : null}
    </section>
  );
}
