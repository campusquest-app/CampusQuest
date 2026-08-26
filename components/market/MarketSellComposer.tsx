"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, X } from "lucide-react";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_CATEGORY_LABELS,
  MARKETPLACE_CONDITIONS,
  MARKETPLACE_CONDITION_LABELS,
  MARKETPLACE_MAX_PHOTOS,
  MARKETPLACE_MEETUP_AREAS,
  MARKETPLACE_MEETUP_LABELS,
  centsToPriceLabel,
  dollarsToCents,
  validateMarketplaceListingCopy,
  type MarketplaceCategory,
  type MarketplaceCondition,
  type MarketplaceListingKind,
  type MarketplaceMeetupArea,
} from "@/lib/marketplace/policy";
import type { MarketplaceBusiness, MarketplaceListing } from "@/lib/marketplace/types";
import {
  createMarketplaceListingRequest,
  updateMarketplaceListingRequest,
  uploadMarketplaceImage,
} from "@/lib/client/marketplaceClient";
import { openVerificationOnboarding } from "@/lib/client/identityStore";

type Draft = {
  listingKind: MarketplaceListingKind;
  title: string;
  description: string;
  price: string;
  startingPrice: boolean;
  category: MarketplaceCategory;
  condition: MarketplaceCondition | null;
  meetupArea: MarketplaceMeetupArea;
  availabilityNote: string;
  businessId: string | null;
  photoFiles: File[];
  existingPhotoUrls: string[];
};

const EMPTY_DRAFT: Draft = {
  listingKind: "item",
  title: "",
  description: "",
  price: "",
  startingPrice: false,
  category: "clothing",
  condition: "like_new",
  meetupArea: "memorial_union",
  availabilityNote: "",
  businessId: null,
  photoFiles: [],
  existingPhotoUrls: [],
};

export function MarketSellComposer({
  businesses,
  editing,
  onClose,
  onPublished,
}: {
  businesses: MarketplaceBusiness[];
  editing?: MarketplaceListing | null;
  onClose: () => void;
  onPublished: () => void;
}) {
  useRegisterImmersiveScreen(true);
  const [step, setStep] = useState<"kind" | "businessKind" | "form" | "preview">(editing ? "form" : "kind");
  const [draft, setDraft] = useState<Draft>(() =>
    editing
      ? {
          listingKind: editing.listingKind,
          title: editing.title,
          description: editing.description,
          price: editing.priceCents > 0 ? String(editing.priceCents / 100) : "0",
          startingPrice: editing.startingPrice,
          category: editing.category,
          condition: editing.condition,
          meetupArea: editing.meetupArea,
          availabilityNote: editing.availabilityNote ?? "",
          businessId: editing.businessId,
          photoFiles: [],
          existingPhotoUrls: editing.media.map((item) => item.url),
        }
      : EMPTY_DRAFT,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const verifiedBusinesses = useMemo(
    () =>
      businesses.filter(
        (row) => row.verificationStatus === "verified" && row.isManager && row.status !== "inactive",
      ),
    [businesses],
  );
  const hasVerifiedBusiness = verifiedBusinesses.length > 0;

  const previews = useMemo(() => {
    const fromFiles = draft.photoFiles.map((file) => URL.createObjectURL(file));
    return [...draft.existingPhotoUrls, ...fromFiles];
  }, [draft.existingPhotoUrls, draft.photoFiles]);

  useEffect(() => {
    return () => {
      for (const url of previews) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
    };
  }, [previews]);

  const kindLabel =
    draft.listingKind === "service" ? "Publish Service" : draft.listingKind === "business_post" ? "Publish" : "List Item";

  function setKind(kind: MarketplaceListingKind) {
    setDraft((prev) => ({
      ...prev,
      listingKind: kind,
      startingPrice: kind !== "item",
      condition: kind === "item" ? prev.condition ?? "like_new" : null,
      category: kind === "service" ? "services" : prev.category,
      businessId:
        kind === "item"
          ? null
          : prev.businessId && verifiedBusinesses.some((row) => row.id === prev.businessId)
            ? prev.businessId
            : verifiedBusinesses[0]?.id ?? null,
    }));
    setStep("form");
  }

  function validateForm(): string | null {
    if (previews.length < 1) return "Add at least one photo.";
    if (draft.title.trim().length < 3) return "Add a title.";
    if (draft.listingKind === "item" && !draft.condition) return "Choose a condition.";
    if ((draft.listingKind === "business_post" || draft.listingKind === "service") && !draft.businessId) {
      return "Choose a verified Student Business.";
    }
    return validateMarketplaceListingCopy({
      title: draft.title,
      description: draft.description,
      availabilityNote: draft.availabilityNote,
    });
  }

  async function publish() {
    const problem = validateForm();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const uploaded: string[] = [...draft.existingPhotoUrls];
      for (const file of draft.photoFiles) {
        uploaded.push(await uploadMarketplaceImage(file, file.name || "listing.jpg"));
      }
      const payload = {
        listingKind: draft.listingKind,
        title: draft.title.trim(),
        description: draft.description.trim(),
        priceDollars: draft.category === "free" ? 0 : Number(draft.price) || 0,
        startingPrice: draft.startingPrice || draft.listingKind !== "item",
        category: draft.category,
        condition: draft.listingKind === "item" ? draft.condition : null,
        meetupArea: draft.meetupArea,
        availabilityNote: draft.availabilityNote.trim() || null,
        businessId: draft.businessId,
        photoUrls: uploaded,
      };
      if (editing) {
        await updateMarketplaceListingRequest(editing.id, payload);
      } else {
        await createMarketplaceListingRequest(payload);
      }
      onPublished();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish this listing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cq-composer-overlay" role="dialog" aria-modal="true" aria-label="Sell on The Market">
      <div className="cq-composer-shell cq-market-composer" onClick={(event) => event.stopPropagation()}>
        <div className="cq-create-sheet-head">
          <h2 className="cq-create-sheet-title">{editing ? "Edit listing" : "Sell on The Market"}</h2>
          <button type="button" className="cq-create-sheet-close" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === "kind" ? (
          <div className="cq-create-sheet-actions">
            <p className="cq-market-sheet-copy">What are you listing?</p>
            <button type="button" className="cq-create-action" onClick={() => setKind("item")}>
              <span className="cq-create-action-text">
                <span className="cq-create-action-title">Sell an Item</span>
                <span className="cq-create-action-subtitle">
                  Clothing, furniture, textbooks, electronics, dorm items, and more.
                </span>
              </span>
            </button>
            <button
              type="button"
              className={`cq-create-action${hasVerifiedBusiness ? "" : " cq-create-action--locked"}`}
              onClick={() => {
                if (!hasVerifiedBusiness) {
                  onClose();
                  openVerificationOnboarding("student_business");
                  return;
                }
                setDraft((prev) => ({
                  ...prev,
                  businessId:
                    prev.businessId && verifiedBusinesses.some((row) => row.id === prev.businessId)
                      ? prev.businessId
                      : verifiedBusinesses[0]?.id ?? null,
                }));
                setStep("businessKind");
              }}
            >
              <span className="cq-create-action-text">
                <span className="cq-create-action-title">
                  Business / Service
                  {!hasVerifiedBusiness ? <Lock className="cq-market-lock-icon" aria-hidden /> : null}
                </span>
                <span className="cq-create-action-subtitle">Promote a business, brand, product or service</span>
              </span>
            </button>
          </div>
        ) : null}

        {step === "businessKind" ? (
          <div className="cq-create-sheet-actions">
            <p className="cq-market-sheet-copy">Choose how this should appear.</p>
            {verifiedBusinesses.length > 1 ? (
              <label className="cq-market-label" htmlFor="cq-market-identity">
                Posting as
                <select
                  id="cq-market-identity"
                  className="cq-market-input"
                  value={draft.businessId ?? ""}
                  onChange={(event) => setDraft((prev) => ({ ...prev, businessId: event.target.value || null }))}
                >
                  {verifiedBusinesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="cq-market-sheet-copy">
                Posting as {verifiedBusinesses[0]?.name ?? "your verified Student Business"}.
              </p>
            )}
            <button type="button" className="cq-create-action" onClick={() => setKind("service")}>
              <span className="cq-create-action-text">
                <span className="cq-create-action-title">Service</span>
                <span className="cq-create-action-subtitle">Tutoring, photos, hair, design, and more.</span>
              </span>
            </button>
            <button type="button" className="cq-create-action" onClick={() => setKind("business_post")}>
              <span className="cq-create-action-text">
                <span className="cq-create-action-title">Business Post</span>
                <span className="cq-create-action-subtitle">Drops, promotions, and shop updates.</span>
              </span>
            </button>
            <button type="button" className="cq-market-btn cq-market-btn--secondary" onClick={() => setStep("kind")}>
              Back
            </button>
          </div>
        ) : null}

        {step === "form" ? (
          <form
            className="cq-market-form"
            onSubmit={(event) => {
              event.preventDefault();
              const problem = validateForm();
              if (problem) {
                setError(problem);
                return;
              }
              setError(null);
              setStep("preview");
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []).slice(0, MARKETPLACE_MAX_PHOTOS - draft.existingPhotoUrls.length);
                setDraft((prev) => ({ ...prev, photoFiles: files }));
              }}
            />
            <button type="button" className="cq-market-btn cq-market-btn--secondary" onClick={() => fileRef.current?.click()}>
              Add photos
            </button>
            {previews.length > 0 ? (
              <div className="cq-market-photo-row">
                {previews.map((url) => (
                  <img key={url} src={url} alt="" className="cq-market-photo-thumb" />
                ))}
              </div>
            ) : null}

            <label className="cq-market-label" htmlFor="cq-market-title">
              {draft.listingKind === "service" ? "Service title" : "Title"}
            </label>
            <input id="cq-market-title" className="cq-market-input" value={draft.title} maxLength={80} onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))} />

            <label className="cq-market-label" htmlFor="cq-market-price">
              {draft.listingKind === "item" ? "Price" : "Starting price"}
            </label>
            <input id="cq-market-price" className="cq-market-input" inputMode="decimal" value={draft.price} onChange={(event) => setDraft((prev) => ({ ...prev, price: event.target.value }))} />

            <label className="cq-market-label" htmlFor="cq-market-category">Category</label>
            <select id="cq-market-category" className="cq-market-input" value={draft.category} onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value as MarketplaceCategory }))}>
              {MARKETPLACE_CATEGORIES.map((category) => (
                <option key={category} value={category}>{MARKETPLACE_CATEGORY_LABELS[category]}</option>
              ))}
            </select>

            {draft.listingKind === "item" ? (
              <>
                <label className="cq-market-label" htmlFor="cq-market-condition">Condition</label>
                <select id="cq-market-condition" className="cq-market-input" value={draft.condition ?? "like_new"} onChange={(event) => setDraft((prev) => ({ ...prev, condition: event.target.value as MarketplaceCondition }))}>
                  {MARKETPLACE_CONDITIONS.map((condition) => (
                    <option key={condition} value={condition}>{MARKETPLACE_CONDITION_LABELS[condition]}</option>
                  ))}
                </select>
              </>
            ) : null}

            {draft.listingKind !== "item" && verifiedBusinesses.length > 0 ? (
              <>
                <label className="cq-market-label" htmlFor="cq-market-business">Posting as</label>
                <select
                  id="cq-market-business"
                  className="cq-market-input"
                  value={draft.businessId ?? ""}
                  onChange={(event) => setDraft((prev) => ({ ...prev, businessId: event.target.value || null }))}
                >
                  {verifiedBusinesses.map((business) => (
                    <option key={business.id} value={business.id}>{business.name}</option>
                  ))}
                </select>
              </>
            ) : null}

            <label className="cq-market-label" htmlFor="cq-market-desc">Description</label>
            <textarea id="cq-market-desc" className="cq-market-input cq-market-textarea" value={draft.description} maxLength={2000} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} />

            <label className="cq-market-label" htmlFor="cq-market-meet">Meetup area</label>
            <select id="cq-market-meet" className="cq-market-input" value={draft.meetupArea} onChange={(event) => setDraft((prev) => ({ ...prev, meetupArea: event.target.value as MarketplaceMeetupArea }))}>
              {MARKETPLACE_MEETUP_AREAS.map((area) => (
                <option key={area} value={area}>{MARKETPLACE_MEETUP_LABELS[area]}</option>
              ))}
            </select>

            {draft.listingKind === "service" ? (
              <>
                <label className="cq-market-label" htmlFor="cq-market-avail">Availability / contact preference</label>
                <input id="cq-market-avail" className="cq-market-input" value={draft.availabilityNote} maxLength={200} onChange={(event) => setDraft((prev) => ({ ...prev, availabilityNote: event.target.value }))} />
              </>
            ) : null}

            {error ? <p className="cq-market-error">{error}</p> : null}
            <div className="cq-market-card-actions">
              {!editing ? (
                <button
                  type="button"
                  className="cq-market-btn cq-market-btn--secondary"
                  onClick={() => setStep(draft.listingKind === "item" ? "kind" : "businessKind")}
                >
                  Back
                </button>
              ) : null}
              <button type="submit" className="cq-market-btn cq-market-btn--primary">Preview Listing</button>
            </div>
          </form>
        ) : null}

        {step === "preview" ? (
          <div className="cq-market-form">
            <p className="cq-market-card-title">{draft.title}</p>
            <p className="cq-market-card-price">{centsToPriceLabel(dollarsToCents(Number(draft.price) || 0), draft.startingPrice || draft.listingKind !== "item")}</p>
            <p className="cq-market-card-copy">{draft.description}</p>
            <p className="cq-market-card-meet">📍 {MARKETPLACE_MEETUP_LABELS[draft.meetupArea]}</p>
            {error ? <p className="cq-market-error">{error}</p> : null}
            <div className="cq-market-card-actions">
              <button type="button" className="cq-market-btn cq-market-btn--secondary" onClick={() => setStep("form")}>Back</button>
            <button
              type="button"
              className="cq-market-btn cq-market-btn--primary"
              disabled={busy || (draft.listingKind !== "item" && !draft.businessId)}
              onClick={() => void publish()}
            >
                {busy ? "Publishing…" : kindLabel}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
