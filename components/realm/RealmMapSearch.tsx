"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { fetchPlaceDetails, fetchPlacePredictions, type PlaceSearchResult } from "@/lib/realm/placesSearch";

const DEBOUNCE_MS = 280;

export function RealmMapSearch({
  onSelect,
  disabled = false,
}: {
  onSelect: (place: PlaceSearchResult) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (input: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (!input.trim()) {
      setPredictions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const results = await fetchPlacePredictions(input, controller.signal);
    if (controller.signal.aborted) return;
    setPredictions(results);
    setLoading(false);
    setOpen(results.length > 0);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(query), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleSelect = async (prediction: google.maps.places.AutocompletePrediction) => {
    setQuery(prediction.structured_formatting?.main_text ?? prediction.description);
    setOpen(false);
    setLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const details = await fetchPlaceDetails(prediction.place_id, controller.signal);
    setLoading(false);
    if (!details) return;
    onSelect(details);
  };

  const clear = () => {
    setQuery("");
    setPredictions([]);
    setOpen(false);
  };

  return (
    <div className="cq-realm-map-search" role="search">
      <div className="cq-realm-map-search-field">
        <Search className="cq-realm-map-search-icon" aria-hidden />
        <input
          type="search"
          value={query}
          disabled={disabled}
          placeholder="Search buildings, clubs, events..."
          className="cq-realm-map-search-input"
          aria-label="Search places on the map"
          aria-expanded={open}
          aria-controls="cq-realm-map-search-list"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => predictions.length > 0 && setOpen(true)}
        />
        {query ? (
          <button type="button" onClick={clear} className="cq-realm-map-search-clear" aria-label="Clear search">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {loading ? <p className="cq-realm-map-search-hint" role="status">Searching…</p> : null}
      {open && predictions.length > 0 ? (
        <ul id="cq-realm-map-search-list" className="cq-realm-map-search-results" role="listbox">
          {predictions.map((p) => (
            <li key={p.place_id} role="option">
              <button
                type="button"
                className="cq-realm-map-search-result touch-manipulation"
                onClick={() => void handleSelect(p)}
              >
                <span className="cq-realm-map-search-result-main">
                  {p.structured_formatting?.main_text ?? p.description}
                </span>
                {p.structured_formatting?.secondary_text ? (
                  <span className="cq-realm-map-search-result-sub">{p.structured_formatting.secondary_text}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
