"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import {
  MARKETPLACE_BUSINESS_OFFERINGS,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_CATEGORY_LABELS,
  type MarketplaceBusinessOffering,
  type MarketplaceCategory,
} from "@/lib/marketplace/policy";
import { createStudentBusinessRequest, uploadMarketplaceImage } from "@/lib/client/marketplaceClient";

const OFFERING_LABELS: Record<MarketplaceBusinessOffering, string> = {
  products: "Products",
  services: "Services",
  both: "Both",
};

export function MarketCreateBusinessSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  useRegisterImmersiveScreen(true);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [offering, setOffering] = useState<MarketplaceBusinessOffering>("products");
  const [category, setCategory] = useState<MarketplaceCategory>("clothing");
  const [bio, setBio] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!confirmed) {
      setError("Confirm this is a student-owned business.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const logoUrl = logoFile ? await uploadMarketplaceImage(logoFile, logoFile.name || "logo.jpg") : null;
      await createStudentBusinessRequest({
        name: name.trim(),
        handle: handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""),
        category,
        offering,
        bio: bio.trim(),
        logoUrl,
        instagramUrl: instagramUrl.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
        confirmStudentOwned: true,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create business.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cq-composer-overlay" role="dialog" aria-modal="true" aria-label="Start a Student Business">
      <div className="cq-composer-shell cq-market-composer">
        <div className="cq-create-sheet-head">
          <h2 className="cq-create-sheet-title">Start a Student Business</h2>
          <button type="button" className="cq-create-sheet-close" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="cq-market-sheet-copy">Step {step} of 8 · Free Student Business profile</p>

        {step === 1 ? (
          <>
            <label className="cq-market-label" htmlFor="cq-biz-name">Business name</label>
            <input id="cq-biz-name" className="cq-market-input" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
            <label className="cq-market-label" htmlFor="cq-biz-handle">Handle</label>
            <input id="cq-biz-handle" className="cq-market-input" value={handle} maxLength={24} placeholder="rhodyvintage" onChange={(event) => setHandle(event.target.value)} />
          </>
        ) : null}
        {step === 2 ? (
          <div className="cq-create-sheet-actions">
            {MARKETPLACE_BUSINESS_OFFERINGS.map((value) => (
              <button key={value} type="button" className={`cq-create-action${offering === value ? " cq-market-reason--active" : ""}`} onClick={() => setOffering(value)}>
                <span className="cq-create-action-title">{OFFERING_LABELS[value]}</span>
              </button>
            ))}
          </div>
        ) : null}
        {step === 3 ? (
          <select className="cq-market-input" value={category} onChange={(event) => setCategory(event.target.value as MarketplaceCategory)}>
            {MARKETPLACE_CATEGORIES.filter((item) => item !== "free").map((item) => (
              <option key={item} value={item}>{MARKETPLACE_CATEGORY_LABELS[item]}</option>
            ))}
          </select>
        ) : null}
        {step === 4 ? (
          <>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)} />
            <label className="cq-market-label" htmlFor="cq-biz-bio">Bio</label>
            <textarea id="cq-biz-bio" className="cq-market-input cq-market-textarea" value={bio} maxLength={400} onChange={(event) => setBio(event.target.value)} />
          </>
        ) : null}
        {step === 5 ? (
          <>
            <label className="cq-market-label" htmlFor="cq-biz-ig">Instagram (optional)</label>
            <input id="cq-biz-ig" className="cq-market-input" value={instagramUrl} placeholder="https://instagram.com/…" onChange={(event) => setInstagramUrl(event.target.value)} />
            <label className="cq-market-label" htmlFor="cq-biz-web">Website (optional)</label>
            <input id="cq-biz-web" className="cq-market-input" value={websiteUrl} placeholder="https://" onChange={(event) => setWebsiteUrl(event.target.value)} />
          </>
        ) : null}
        {step === 6 ? (
          <p className="cq-market-sheet-copy">You can add your first product or service after the shop is created.</p>
        ) : null}
        {step === 7 ? (
          <label className="cq-market-confirm">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            I confirm this is a student-owned business at URI.
          </label>
        ) : null}
        {step === 8 ? (
          <p className="cq-market-sheet-copy">Create {name || "your shop"} as a free Student-Owned profile. No payment required.</p>
        ) : null}

        {error ? <p className="cq-market-error">{error}</p> : null}
        <div className="cq-market-card-actions">
          {step > 1 ? (
            <button type="button" className="cq-market-btn cq-market-btn--secondary" onClick={() => setStep((value) => value - 1)}>Back</button>
          ) : null}
          {step < 8 ? (
            <button type="button" className="cq-market-btn cq-market-btn--primary" onClick={() => setStep((value) => value + 1)}>Continue</button>
          ) : (
            <button type="button" className="cq-market-btn cq-market-btn--primary" disabled={busy} onClick={() => void submit()}>
              {busy ? "Creating…" : "Create business"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
